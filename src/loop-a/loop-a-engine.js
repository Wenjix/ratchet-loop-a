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

export function recordOutcome(key, { mandateId, amount, outcome }) {
  const dc = decisionClasses.get(key);
  if (!dc) throw new Error(`Unknown decision class: ${key}`);

  dc.history.push({ timestamp: Date.now(), outcome, amount, mandateId });

  if (outcome === 'approved-clean') {
    dc.streak += 1;
    maybeProposeCrystallization(dc);
  }

  bus.emit('decision_class_updated', dc);
  return dc;
}

function maybeProposeCrystallization(dc) {
  if (dc.pendingProposal) return;
  if (dc.policy && !dc.policy.revoked) return;
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

export function _getDecisionClassesMap() {
  return decisionClasses;
}
