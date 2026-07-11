import {
  captionForScenarioEvent,
  captionForPolicyEvent,
  captionForClassUpdate,
  captionForPrincipalAction,
  resetCaptions,
} from '../story/captions.js';
import { parseClassKey } from '../ladder/class-key.js';

// The single source of truth for the page. Every SSE frame lands in applyEvent; every
// component renders from `world`. Transient visuals (motes, breaths, the hush) are data
// rows here — never imperative animation calls — so live runs and reconnects replay the
// same way.
export const world = $state({
  mode: 'idle', // 'idle' | 'running'
  connected: false,
  week: 0,
  totalWeeks: 9,
  budget: {},
  mandates: [],
  vendors: [],
  classes: {}, // key → decision class (+ everRevoked, lastChange — client-side annotations)
  feed: [], // decision log for the rail, newest first, capped
  flows: [], // active coordination flows, each with expiresAt
  agentActivity: {}, // agent name → { at, note } — seal breath + work annotation
  humanActions: {}, // mandate_id | class key → ts of a real inbox decision (principal_action)
  lastStamp: null, // { at, byHand, decision } — the principal's hanko press at the gate
  verdicts: {}, // mandate_id → 'good' | 'bad' (drives verification exhale)
  weekLog: {}, // task_type → this week's outcomes, reset at each cycle_started
  debrief: null, // { week, totalWeeks, entries } — shown during the inter-week pause
  caption: null, // { serifLine, monoLine, tone, priority, until }
  captionQueue: [],
  lastTransition: null, // { kind: 'propose' | 'accept' | 'reject' | 'revoke', at } — warms the legend
  hush: false, // true during the de-ratchet stillness
  endCard: null, // { cycles, results } once a run completes
  lastError: null,
});

const FEED_CAP = 50;
const DEFAULT_FLOW_DURATION = 4000;
const HUSH_HOLD_MS = 5600;

function upsertById(list, item, key = 'id') {
  const index = list.findIndex((entry) => entry[key] === item[key]);
  if (index === -1) list.push(item);
  else list[index] = item;
}

function classFor(key) {
  if (!world.classes[key]) {
    world.classes[key] = {
      key,
      ceiling: 'auto',
      status: 'escalate',
      streak: 0,
      cooldownRemaining: 0,
      history: [],
      pendingProposal: null,
      policy: null,
      everRevoked: false,
      lastChange: 0,
    };
  }
  return world.classes[key];
}

function pushFlow(flow) {
  world.flows.push({
    duration: DEFAULT_FLOW_DURATION,
    ...flow,
    expiresAt: Date.now() + (flow.duration ?? DEFAULT_FLOW_DURATION),
  });
}

export function resetForRun() {
  world.week = 0;
  world.budget = {};
  world.mandates = [];
  world.vendors = [];
  world.classes = {};
  world.feed = [];
  world.flows = [];
  world.agentActivity = {};
  world.humanActions = {};
  world.lastStamp = null;
  world.verdicts = {};
  world.weekLog = {};
  world.debrief = null;
  world.caption = null;
  world.captionQueue = [];
  world.lastTransition = null;
  world.hush = false;
  world.endCard = null;
  world.lastError = null;
}

// Merges GET /api/state — only while idle. During a run the SSE stream is the sole source
// of truth (a snapshot fetched mid-run would be ahead of the paced event playback).
export function hydrate(snapshot) {
  if (world.mode !== 'idle') return;
  world.budget = snapshot.budget?.categories ?? {};
  world.mandates = snapshot.mandates ?? [];
  world.vendors = snapshot.vendors ?? [];
  world.feed = (snapshot.decisionFeed ?? []).slice().reverse().slice(0, FEED_CAP);
  world.classes = {};
  for (const [key, dc] of Object.entries(snapshot.decisionClasses ?? {})) {
    world.classes[key] = { ...dc, everRevoked: Boolean(dc.policy?.revoked), lastChange: 0 };
  }
  world.flows = (snapshot.activeFlows ?? [])
    .filter((flow) => !flow.label?.startsWith('Mandate →'))
    .map((flow) => ({
      ...flow,
      expiresAt: (flow.createdAt ?? Date.now()) + (flow.duration ?? DEFAULT_FLOW_DURATION),
    }));
}

export function pruneExpired() {
  const now = Date.now();
  if (world.flows.some((flow) => flow.expiresAt <= now)) {
    world.flows = world.flows.filter((flow) => flow.expiresAt > now);
  }
  if (world.caption && world.caption.until <= now) {
    const next = world.captionQueue.shift();
    world.caption = next ? { ...next, id: ++captionId, until: now + (next.holdMs ?? 4500) } : null;
  }
}

let captionId = 0;

// A quiet queue: milestones preempt, routine observations wait their turn and are
// dropped rather than stacked when the narrator is busy.
function queueCaption(caption) {
  if (!caption) return;
  const now = Date.now();
  const current = world.caption;
  if (!current || current.until <= now || (caption.priority ?? 1) > (current.priority ?? 1)) {
    world.caption = { ...caption, id: ++captionId, until: now + (caption.holdMs ?? 4500) };
    return;
  }
  if ((caption.priority ?? 1) >= 2 && world.captionQueue.length < 2) {
    world.captionQueue.push(caption);
  }
}

export function applyEvent(type, payload) {
  switch (type) {
    case 'decision': {
      world.feed.unshift(payload);
      if (world.feed.length > FEED_CAP) world.feed.length = FEED_CAP;
      if (payload.agent) noteActivity(payload.agent, null);
      break;
    }
    case 'coordination_flow':
      // The server announces mandate flows at draft time (sourcing → vendor), which would
      // erase the human step. Those are skipped and re-choreographed here: escalated
      // mandates detour through the principal and only cross the gate once decided.
      if (payload.label?.startsWith('Mandate →')) break;
      pushFlow(payload);
      break;
    case 'mandate_created':
    case 'mandate_updated':
      upsertById(world.mandates, payload);
      break;
    case 'vendor_registered':
      upsertById(world.vendors, payload);
      break;
    case 'decision_class_created':
    case 'decision_class_updated': {
      const prev = world.classes[payload.key];
      const dc = {
        ...payload,
        everRevoked: prev?.everRevoked || Boolean(payload.policy?.revoked),
        lastChange: Date.now(),
      };
      world.classes[payload.key] = dc;
      queueCaption(captionForClassUpdate(dc, world));
      break;
    }
    case 'policy_proposed': {
      const dc = classFor(payload.key);
      dc.pendingProposal = payload.proposal;
      dc.lastChange = Date.now();
      world.lastTransition = { kind: 'propose', at: Date.now() };
      notePolicy(payload.key, 'proposed', `policy proposed · cap $${payload.proposal?.cap}`);
      // A proposal is a question for the human — it travels to the principal too.
      pushFlow({
        id: `flow-proposal-${payload.key}-${dc.streak}`,
        from: 'sourcing',
        to: 'principal',
        type: 'request',
        label: 'policy proposed',
        color: 'var(--indigo)',
        crossPrincipal: false,
        duration: 2600,
      });
      queueCaption(captionForPolicyEvent(type, payload, world, dc));
      break;
    }
    case 'policy_accepted': {
      const dc = classFor(payload.key);
      // The mend caption needs to know this class was broken before the policy lands.
      queueCaption(captionForPolicyEvent(type, payload, world, dc));
      notePolicy(
        payload.key,
        dc.everRevoked ? 'restored' : 'accepted',
        dc.everRevoked ? `${payload.policy?.id} restored — the seam stays gold` : `${payload.policy?.id} accepted`,
      );
      dc.policy = payload.policy;
      dc.status = 'auto';
      dc.pendingProposal = null;
      dc.lastChange = Date.now();
      world.lastTransition = { kind: 'accept', at: Date.now() };
      break;
    }
    case 'policy_rejected': {
      const dc = classFor(payload.key);
      dc.pendingProposal = null;
      dc.streak = 0;
      dc.lastChange = Date.now();
      world.lastTransition = { kind: 'reject', at: Date.now() };
      notePolicy(payload.key, 'declined', 'policy declined · streak reset');
      queueCaption(captionForPolicyEvent(type, payload, world, dc));
      break;
    }
    case 'policy_revoked': {
      const dc = classFor(payload.key);
      dc.policy = payload.policy;
      dc.status = 'escalate';
      dc.pendingProposal = null;
      dc.everRevoked = true;
      dc.lastChange = Date.now();
      world.lastTransition = { kind: 'revoke', at: Date.now() };
      notePolicy(payload.key, 'revoked', `${payload.policy?.id ?? 'policy'} revoked — dormant 2 weeks`);
      beginHush();
      queueCaption(captionForPolicyEvent(type, payload, world, dc));
      break;
    }
    case 'vendor_updated':
      upsertById(world.vendors, payload);
      break;
    case 'budget_updated': {
      const cat = world.budget[payload.category];
      if (cat) cat.spent_this_month = payload.spent_this_month;
      else world.budget[payload.category] = { spent_this_month: payload.spent_this_month };
      noteActivity('budget', `${payload.category.replaceAll('_', ' ')} · $${payload.spent_this_month} mtd`);
      break;
    }
    case 'principal_action': {
      // A real human decided from the inbox — distinct from the demo's simulated principal.
      world.humanActions[payload.mandate_id ?? payload.key] = Date.now();
      if (payload.mandate_id) {
        const mandate = world.mandates.find((m) => m.id === payload.mandate_id);
        const entry = mandate && world.weekLog[mandate.task_type];
        if (entry) entry.byHand = true;
      }
      if (payload.kind === 'mandate_approve') pushCommitFlow(payload.mandate_id, 'hand');
      world.lastStamp = {
        at: Date.now(),
        byHand: true,
        decision: payload.kind === 'mandate_approve' || payload.kind === 'policy_accept' ? 'approved' : 'declined',
      };
      queueCaption(captionForPrincipalAction(payload));
      break;
    }
    case 'scenario_event':
      applyScenarioEvent(payload);
      break;
    case 'scenario_error':
      world.lastError = payload?.message ?? 'The run hit an error.';
      world.mode = 'idle';
      break;
    default:
      break;
  }
}

function noteActivity(agent, note) {
  world.agentActivity[agent] = { at: Date.now(), note };
}

// Annotate this week's log with a policy movement, keyed by the class's task type.
function notePolicy(key, kind, text) {
  const entry = world.weekLog[parseClassKey(key).taskType];
  if (entry) entry.policyNote = { kind, text };
}

// The approved mandate finally crosses the gate: principal → vendor.
function pushCommitFlow(mandateId, source) {
  const mandate = world.mandates.find((m) => m.id === mandateId);
  if (!mandate) return;
  pushFlow({
    id: `flow-commit-${mandateId}-${source}`,
    from: 'principal',
    to: mandate.vendor_id,
    type: 'cross-principal',
    label: `mandate → ${mandate.vendor_id}`,
    crossPrincipal: true,
    duration: 4000,
  });
}

// The seeded scenario never runs the LLM agent loop, so no `decision` frames arrive from
// the backend during a demo run. The story beats in scenario_event are the decisions —
// synthesize feed rows from them so the rail narrates the run.
function pushFeed(entry) {
  world.feed.unshift(entry);
  if (world.feed.length > FEED_CAP) world.feed.length = FEED_CAP;
}

function vendorLabel(id) {
  return world.vendors.find((v) => v.id === id)?.name ?? id;
}

function feedFromScenarioEvent(event) {
  const id = `${event.type}-${event.mandate_id ?? event.task_id ?? event.key ?? ''}-w${event.week ?? 0}`;
  switch (event.type) {
    case 'mandate_drafted':
      return {
        id,
        agent: 'sourcing',
        summary: `Drafted mandate — ${vendorLabel(event.vendor_id)}, $${event.amount}`,
        reason: event.auto_approved ? 'Covered by a standing policy — committed without asking.' : 'Escalated to the principal for approval.',
      };
    case 'mandate_decision':
      return {
        id,
        agent: 'system',
        summary: `Mandate ${event.decision === 'approve' ? 'approved' : event.decision.replaceAll('_', ' ')}`,
        reason: null,
      };
    case 'job_reported':
      return {
        id,
        agent: 'system',
        summary: 'Vendor reported the job complete',
        reason: event.attestation?.notes ?? null,
      };
    case 'job_verified':
      return {
        id,
        agent: 'verification',
        summary: event.verified === 'good' ? 'Verified — clean' : 'Verified — problems found',
        reason: null,
      };
    case 'policy_decision':
      return {
        id,
        agent: 'system',
        summary: `Standing policy ${event.decision}ed — cap $${event.cap}`,
        reason: null,
      };
    default:
      return null;
  }
}

let hushTimer = null;

function beginHush() {
  world.hush = true;
  clearTimeout(hushTimer);
  hushTimer = setTimeout(() => {
    world.hush = false;
  }, HUSH_HOLD_MS);
}

function applyScenarioEvent(event) {
  const feedEntry = feedFromScenarioEvent(event);
  if (feedEntry) pushFeed(feedEntry);

  switch (event.type) {
    case 'scenario_started':
      resetForRun();
      resetCaptions();
      world.mode = 'running';
      world.totalWeeks = event.cycles ?? 9;
      break;
    case 'cycle_started':
      world.week = event.week;
      world.weekLog = {};
      world.debrief = null;
      break;
    case 'cycle_completed':
      world.debrief = { week: event.week, totalWeeks: event.totalCycles, entries: Object.values(world.weekLog) };
      break;
    case 'task_due_checked':
      noteActivity('scheduler', event.due ? `due · ${(event.task_type ?? '').replaceAll('_', ' ')}` : null);
      break;
    case 'mandate_drafted':
      noteActivity('sourcing', event.auto_approved ? `auto-commit · $${event.amount}` : `escalated · $${event.amount}`);
      if (event.auto_approved) {
        // Policy-covered: no detour — straight through the gate. The missing stop at the
        // principal is the visualization of a standing policy.
        pushFlow({
          id: `flow-auto-${event.task_id}-w${event.week}`,
          from: 'sourcing',
          to: event.vendor_id,
          type: 'cross-principal',
          label: `auto-commit → ${event.vendor_id}`,
          crossPrincipal: true,
          duration: 4000,
        });
      } else if (!world.hush) {
        // Escalated: the mandate is carried to the human first.
        pushFlow({
          id: `flow-ask-${event.task_id}-w${event.week}`,
          from: 'sourcing',
          to: 'principal',
          type: 'request',
          label: 'asks the principal',
          color: 'var(--clay)',
          crossPrincipal: false,
          duration: 2600,
        });
      }
      world.weekLog[event.task_type] = {
        taskType: event.task_type,
        vendorId: event.vendor_id,
        amount: event.amount,
        auto: Boolean(event.auto_approved),
        decision: event.auto_approved ? 'approve' : null,
        verified: null,
        byHand: false,
        policyNote: null,
      };
      break;
    case 'mandate_decision':
      if (world.weekLog[event.task_type]) world.weekLog[event.task_type].decision = event.decision;
      // The simulated principal's stamp; a real inbox decision already stamped via
      // principal_action (the driver defers to it, emitting 'human_rejected' or nothing).
      if (event.decision === 'approve' || event.decision === 'reject') {
        world.lastStamp = { at: Date.now(), byHand: false, decision: event.decision === 'approve' ? 'approved' : 'declined' };
      }
      if (event.decision === 'approve') pushCommitFlow(event.mandate_id, 'sim');
      break;
    case 'policy_decision':
      if (!world.humanActions[event.key]) {
        world.lastStamp = { at: Date.now(), byHand: false, decision: event.decision === 'accept' ? 'approved' : 'declined' };
      }
      break;
    case 'job_reported': {
      // No backend flow exists for the vendor → verification leg; synthesize one so the
      // completion report visibly crosses the boundary back into the garden. During the
      // hush the garden spawns nothing of its own — stillness is the signal.
      const mandate = world.mandates.find((m) => m.id === event.mandate_id);
      if (mandate && !world.hush) {
        pushFlow({
          id: `flow-report-${event.mandate_id}`,
          from: mandate.vendor_id,
          to: 'verification',
          type: 'cross-principal',
          label: 'Completion report',
          crossPrincipal: true,
        });
      }
      break;
    }
    case 'job_verified':
      noteActivity('verification', `verdict · ${event.verified}`);
      if (event.mandate_id) world.verdicts[event.mandate_id] = event.verified;
      if (world.weekLog[event.task_type]) world.weekLog[event.task_type].verified = event.verified;
      break;
    case 'scenario_completed':
      world.endCard = { cycles: event.cycles, results: event.results ?? [] };
      world.debrief = null;
      world.mode = 'idle';
      break;
    case 'scenario_stopped':
      world.debrief = null;
      world.mode = 'idle';
      break;
    default:
      break;
  }

  queueCaption(captionForScenarioEvent(event, world));
}
