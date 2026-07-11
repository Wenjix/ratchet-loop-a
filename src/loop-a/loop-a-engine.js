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

export function _getDecisionClassesMap() {
  return decisionClasses;
}
