// The quiet narrator. Captions do the explaining so the visuals can stay understated —
// nature-documentary register, never exclamatory. tone: ambient | milestone | somber | mend.
import { parseClassKey, displayName } from '../ladder/class-key.js';

let seen = new Set();

export function resetCaptions() {
  seen = new Set();
}

function once(key, caption) {
  if (seen.has(key)) return null;
  seen.add(key);
  return caption;
}

function vendorName(world, id) {
  return world.vendors.find((v) => v.id === id)?.name ?? id;
}

export function captionForScenarioEvent(event, world) {
  switch (event.type) {
    case 'scenario_started':
      return {
        serifLine:
          'A household wakes. Four agents tend its errands; three vendors wait beyond the fence. Every decision, for now, passes through human hands.',
        monoLine: `${event.cycles} weeks · 3 decision classes · trust starts at escalate`,
        tone: 'milestone',
        priority: 3,
        holdMs: 7000,
      };
    case 'mandate_drafted': {
      const vendor = vendorName(world, event.vendor_id);
      if (event.auto_approved) {
        return once(`auto-${event.vendor_id}`, {
          serifLine: `Sourcing commits to ${vendor} under the standing policy — no asking needed.`,
          monoLine: `$${event.amount} · auto-approved`,
          tone: 'ambient',
          priority: 2,
          holdMs: 4500,
        });
      }
      return once(`escalated-${event.vendor_id}-w${event.week}`, {
        serifLine: `Sourcing drafts a mandate for ${vendor} — it waits for approval.`,
        monoLine: `$${event.amount} · escalated`,
        tone: 'ambient',
        priority: 1,
        holdMs: 3500,
      });
    }
    case 'job_verified':
      if (event.verified === 'bad') {
        return { serifLine: 'A delivery arrives incomplete.', monoLine: `job_verified · bad · week ${event.week}`, tone: 'somber', priority: 3, holdMs: 5000 };
      }
      return once('first-clean', {
        serifLine: 'Verification looks over the work. Clean.',
        monoLine: `job_verified · good`,
        tone: 'ambient',
        priority: 1,
        holdMs: 3500,
      });
    case 'scenario_completed':
      return {
        serifLine: 'The garden tends itself where it has earned the right — and only there.',
        monoLine: `${event.cycles} weeks complete`,
        tone: 'milestone',
        priority: 4,
        holdMs: 10000,
      };
    case 'scenario_stopped':
      return { serifLine: 'The run rests here.', monoLine: 'scenario stopped', tone: 'ambient', priority: 2, holdMs: 4000 };
    default:
      return null;
  }
}

export function captionForPolicyEvent(type, payload, world, dc) {
  const parts = parseClassKey(payload.key ?? '');
  const vendor = vendorName(world, parts.counterparty);
  const task = displayName(parts.taskType ?? '');
  switch (type) {
    case 'policy_proposed':
      return {
        serifLine: `Three clean jobs with ${vendor}. Loop A proposes a standing policy.`,
        monoLine: `proposed cap $${payload.proposal?.cap} · accept, edit, or reject — once, by a human`,
        ruleLine: once('rule-propose', '3 clean approvals → propose a policy · cap = highest recent price × 1.1'),
        tone: 'milestone',
        priority: 3,
        holdMs: 6500,
      };
    case 'policy_accepted':
      if (dc?.everRevoked) {
        return {
          serifLine: `The ${task} run earns its policy back. The repair shows — it is meant to.`,
          monoLine: `${payload.policy?.id} · the seam stays gold`,
          ruleLine: once('rule-mend', 'trust is rebuilt the only way Loop A allows — the same three clean jobs'),
          tone: 'mend',
          priority: 4,
          holdMs: 8000,
        };
      }
      return {
        serifLine: `The policy takes. ${vendor} no longer needs asking, so long as the price stays under the cap.`,
        monoLine: `${payload.policy?.id} · auto ≤ $${payload.policy?.cap}`,
        ruleLine: once('rule-accept', 'auto-executes while ≤ cap · every job still verified · one bad job revokes it — instantly'),
        tone: 'milestone',
        priority: 3,
        holdMs: 6500,
      };
    case 'policy_rejected':
      return {
        serifLine: `The proposal is declined. ${vendor} keeps asking, and the streak begins again.`,
        monoLine: `policy_rejected · streak reset`,
        tone: 'ambient',
        priority: 2,
        holdMs: 5000,
      };
    case 'policy_revoked':
      return {
        serifLine: `The standing policy is set aside. ${vendor} will ask permission again, for a while.`,
        monoLine: `policy_revoked · ${payload.key}`,
        ruleLine: once('rule-revoke', 'one verified-bad job → revoked at once · 2 weeks of dormancy before trust can regrow'),
        tone: 'somber',
        priority: 4,
        holdMs: 8000,
      };
    default:
      return null;
  }
}

export function captionForPrincipalAction(payload) {
  const lines = {
    mandate_approve: 'The principal approves by hand — the job proceeds.',
    mandate_reject: 'The principal declines by hand.',
    mandate_override: 'The principal overrides an auto-executed mandate — by hand.',
    policy_accept: 'The principal grants the standing policy — by hand.',
    policy_reject: 'The principal declines the policy — by hand.',
  };
  if (!lines[payload.kind]) return null;
  return {
    serifLine: lines[payload.kind],
    monoLine: `principal_action · ${payload.kind}`,
    tone: 'milestone',
    priority: 3,
    holdMs: 5000,
  };
}

export function captionForClassUpdate(dc, world) {
  const parts = parseClassKey(dc.key);
  // Foreshadowing — the run is seeded, so the narrator can promise what comes next.
  if (dc.streak === 2 && !dc.policy && dc.ceiling !== 'escalate') {
    return once(`foreshadow-${dc.key}`, {
      serifLine: `Two clean jobs with ${vendorName(world, parts.counterparty)}. One more, and Loop A will propose to stop asking.`,
      monoLine: `streak 2 of 3`,
      tone: 'ambient',
      priority: 2,
      holdMs: 5000,
    });
  }
  if (dc.cooldownRemaining === 2 && dc.streak === 0) {
    return once(`cooldown-${dc.key}`, {
      serifLine: `${vendorName(world, parts.counterparty)} rests. Two quiet weeks must pass before trust regrows.`,
      monoLine: `dormant · ${dc.cooldownRemaining} remaining`,
      ruleLine: once('rule-dormancy', 'clean weeks pay down dormancy first · only then do streaks count again'),
      tone: 'somber',
      priority: 2,
      holdMs: 5500,
    });
  }
  if (dc.ceiling === 'escalate' && dc.streak === 5) {
    return once('bonsai-beat', {
      serifLine:
        'QuickFix has been flawless five times. Plumbing stays escalated anyway — some things are kept close no matter how well they go.',
      monoLine: `ceiling: escalate · trust is per decision class`,
      ruleLine: once('rule-ceiling', 'a ceiling caps how far any class may ratchet — no streak lifts it'),
      tone: 'milestone',
      priority: 2,
      holdMs: 6500,
    });
  }
  return null;
}
