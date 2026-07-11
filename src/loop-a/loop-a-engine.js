import { bus, worldState } from '../core/world-state.js';

const decisionClasses = new Map();

function defaultState(key, ceiling) {
  return {
    key,
    ceiling,
    status: 'escalate',
    streak: 0,
    cooldownRemaining: 0,
    history: [],
    pendingProposal: null,
    policy: null,
  };
}

export function getOrCreateDecisionClass(key, { ceiling = 'auto' } = {}) {
  if (!decisionClasses.has(key)) {
    const dc = defaultState(key, ceiling);
    decisionClasses.set(key, dc);
    worldState.policies.decisionClasses[key] = dc;
    bus.emit('decision_class_created', dc);
  }
  return decisionClasses.get(key);
}

export function checkPolicy(key, amount) {
  const dc = decisionClasses.get(key);
  if (!dc) return { autoApprove: false, policy: null, reason: 'no decision class on file — escalate' };
  if (dc.status !== 'auto' || !dc.policy || dc.policy.revoked) {
    return { autoApprove: false, policy: dc.policy, reason: `status is ${dc.status}` };
  }
  if (amount > dc.policy.cap) {
    return { autoApprove: false, policy: dc.policy, reason: `amount $${amount} exceeds policy cap $${dc.policy.cap}` };
  }
  return { autoApprove: true, policy: dc.policy, reason: `covered by policy ${dc.policy.id}` };
}

const CRYSTALLIZE_THRESHOLD = 3;

const DERATCHET_COOLDOWN = 2;

export function recordOutcome(key, { mandateId, amount, outcome }) {
  const dc = decisionClasses.get(key);
  if (!dc) throw new Error(`Unknown decision class: ${key}`);

  dc.history.push({ timestamp: Date.now(), outcome, amount, mandateId });

  if (outcome === 'approved-clean') {
    if (dc.cooldownRemaining > 0) {
      dc.cooldownRemaining -= 1;
    } else {
      dc.streak += 1;
      maybeProposeCrystallization(dc);
    }
  } else if (outcome === 'approved-then-failed' || outcome === 'overridden') {
    deRatchet(dc);
  }

  bus.emit('decision_class_updated', dc);
  return dc;
}

function deRatchet(dc) {
  if (dc.policy) {
    dc.policy.revoked = true;
    dc.policy.revokedAt = Date.now();
  }
  dc.status = 'escalate';
  dc.streak = 0;
  dc.cooldownRemaining = DERATCHET_COOLDOWN;
  dc.pendingProposal = null;
  bus.emit('policy_revoked', { key: dc.key, policy: dc.policy });
}

function maybeProposeCrystallization(dc) {
  if (dc.pendingProposal) return;
  if (dc.policy && !dc.policy.revoked) return;
  if (dc.ceiling === 'escalate') return;
  if (dc.streak < CRYSTALLIZE_THRESHOLD) return;

  const recentAmounts = dc.history.slice(-CRYSTALLIZE_THRESHOLD).map((h) => h.amount);
  const cap = Math.round(Math.max(...recentAmounts) * 1.1 * 100) / 100;

  dc.pendingProposal = {
    cap,
    proposedAt: Date.now(),
    basis: dc.history.slice(-CRYSTALLIZE_THRESHOLD).map((h) => h.mandateId),
  };
  bus.emit('policy_proposed', { key: dc.key, proposal: dc.pendingProposal });
}

let policyCounter = 0;

export function acceptProposal(key, { cap, humanEdited = false } = {}) {
  const dc = decisionClasses.get(key);
  if (!dc || !dc.pendingProposal) throw new Error(`No pending proposal for ${key}`);

  const finalCap = cap ?? dc.pendingProposal.cap;
  dc.policy = {
    id: `POLICY-${String(++policyCounter).padStart(3, '0')}`,
    cap: finalCap,
    createdAt: Date.now(),
    basis: dc.pendingProposal.basis,
    humanEdited: humanEdited || cap !== undefined,
    revoked: false,
    revokedAt: null,
  };
  dc.status = 'auto';
  dc.pendingProposal = null;
  bus.emit('policy_accepted', { key, policy: dc.policy });
  return dc.policy;
}

export function rejectProposal(key) {
  const dc = decisionClasses.get(key);
  if (!dc || !dc.pendingProposal) throw new Error(`No pending proposal for ${key}`);
  dc.pendingProposal = null;
  dc.streak = 0;
  bus.emit('policy_rejected', { key: dc.key });
  return dc;
}

export function getDecisionClass(key) {
  return decisionClasses.get(key) || null;
}

export function getAllDecisionClasses() {
  return [...decisionClasses.values()];
}

export function getPolicyLedger() {
  return getAllDecisionClasses()
    .filter((dc) => dc.policy || dc.pendingProposal)
    .map((dc) => ({
      key: dc.key,
      status: dc.status,
      ceiling: dc.ceiling,
      policy: dc.policy,
      pendingProposal: dc.pendingProposal,
    }));
}

export function _getDecisionClassesMap() {
  return decisionClasses;
}

// Deviation from brief (Task 19 carry-forward from Task 18's review): setUpScenario()
// only reset worldState, not this module's own state (decisionClasses Map / policyCounter).
// Calling runScenario() more than once in the same process would compound streaks across
// runs and misnumber policy IDs. This export lets the scenario driver start every run
// completely fresh.
export function resetDecisionClasses() {
  decisionClasses.clear();
  policyCounter = 0;
  worldState.policies.decisionClasses = {};
}
