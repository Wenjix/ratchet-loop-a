// Decision-class keys look like: sourcing:commit_mandate:greenblade:lawn_mowing:0-75
const TASK_ORDER = ['lawn_mowing', 'grocery_restock', 'plumbing_repair'];

export function parseClassKey(key = '') {
  const [agent, action, counterparty, taskType, band] = key.split(':');
  return { agent, action, counterparty, taskType, band };
}

export function classOrder(a, b) {
  const rank = (dc) => {
    const index = TASK_ORDER.indexOf(parseClassKey(dc.key).taskType);
    return index === -1 ? TASK_ORDER.length : index;
  };
  return rank(a) - rank(b);
}

// The engine stores only 'escalate' and 'auto'; the SURFACE stage is the in-between
// moment when a crystallization proposal is on the table.
export function stageOf(dc) {
  if (dc.status === 'auto' && dc.policy && !dc.policy.revoked) return 'auto';
  if (dc.pendingProposal) return 'surface';
  return 'escalate';
}

export function displayName(text = '') {
  return text.replaceAll('_', ' ');
}
