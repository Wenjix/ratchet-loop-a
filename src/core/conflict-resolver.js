import { bus, worldState } from './world-state.js';

const conflictHistory = [];
let conflictCounter = 0;

export function detectConflicts(agentName, action, params = {}) {
  const conflicts = [
    ...checkBudgetConflicts(agentName, action, params),
    ...checkVendorContention(agentName, action, params),
    ...checkScheduleConflicts(agentName, action, params),
    ...checkVendorTrust(agentName, action, params),
  ];

  for (const conflict of conflicts) {
    conflict.id = `CONFLICT-${String(++conflictCounter).padStart(3, '0')}`;
    conflict.timestamp = Date.now();
    conflict.status = 'unresolved';
    conflict.resolution = null;

    conflictHistory.push(conflict);
    bus.emit('conflict_detected', conflict);

    if (conflict.severity === 'critical') {
      bus.emit('commander_escalation', {
        type: 'conflict',
        conflict,
        message: `CONFLICT: ${conflict.description}`,
        options: conflict.resolutionOptions,
      });
    }
  }

  return conflicts;
}

function checkBudgetConflicts(agentName, action, params) {
  const { category, amount } = params;
  if (!category || amount === undefined) return [];
  const cat = worldState.budget.categories[category];
  if (!cat) return [];

  const projected = cat.spent_this_month + amount;
  if (projected > cat.cap_per_month) {
    return [{
      type: 'budget-cap-breach',
      severity: 'critical',
      agents: [agentName, 'budget'],
      description: `${agentName.toUpperCase()} action "${action}" would push ${category} spend to $${projected} against a $${cat.cap_per_month} cap`,
      resolutionOptions: [
        { id: 'block', label: 'Block — do not commit this mandate', recommended: true },
        { id: 'increase-cap', label: `Increase ${category} cap for this month`, recommended: false },
        { id: 'allow', label: 'Allow — commander override', recommended: false },
      ],
    }];
  }
  return [];
}

function checkVendorContention(agentName, action, params) {
  const { vendor_id } = params;
  if (!vendor_id) return [];
  const active = worldState.mandates.find((m) => m.vendor_id === vendor_id && m.status === 'committed');
  if (active) {
    return [{
      type: 'vendor-contention',
      severity: 'warning',
      agents: [agentName, vendor_id],
      description: `${vendor_id} already has an active mandate (${active.id}) in progress`,
      resolutionOptions: [
        { id: 'queue', label: 'Queue — commit after the active mandate settles', recommended: true },
        { id: 'allow', label: 'Allow — vendor accepts concurrent jobs', recommended: false },
      ],
    }];
  }
  return [];
}

function checkScheduleConflicts(agentName, action, params) {
  const { task_id } = params;
  if (!task_id) return [];
  const duplicate = worldState.mandates.find((m) => m.task_id === task_id && ['pending_approval', 'committed'].includes(m.status));
  if (duplicate) {
    return [{
      type: 'duplicate-task-mandate',
      severity: 'warning',
      agents: [agentName, 'scheduler'],
      description: `Task ${task_id} already has an in-flight mandate (${duplicate.id})`,
      resolutionOptions: [
        { id: 'block', label: 'Block — one mandate per task instance', recommended: true },
        { id: 'allow', label: 'Allow — replace the existing mandate', recommended: false },
      ],
    }];
  }
  return [];
}

function checkVendorTrust(agentName, action, params) {
  const { vendor_id } = params;
  if (!vendor_id) return [];
  const disputed = worldState.mandates.find((m) => m.vendor_id === vendor_id && m.status === 'disputed');
  if (disputed) {
    return [{
      type: 'vendor-unresolved-dispute',
      severity: 'advisory',
      agents: [agentName, 'verification'],
      description: `${vendor_id} has an unresolved dispute (${disputed.id}) — consider holding off on new mandates`,
      resolutionOptions: [
        { id: 'proceed', label: 'Proceed anyway', recommended: false },
        { id: 'wait', label: 'Wait for the dispute to resolve', recommended: true },
      ],
    }];
  }
  return [];
}

export function resolveConflict(conflictId, { resolution, resolvedBy }) {
  const conflict = conflictHistory.find((c) => c.id === conflictId);
  if (!conflict) return null;
  conflict.status = 'resolved';
  conflict.resolution = { chosen: resolution, resolvedBy, timestamp: Date.now() };
  bus.emit('conflict_resolved', conflict);
  return conflict;
}

export function getUnresolvedConflicts() {
  return conflictHistory.filter((c) => c.status === 'unresolved');
}

export function getConflictHistory() {
  return conflictHistory;
}

export function getConflictStats() {
  return {
    total: conflictHistory.length,
    unresolved: conflictHistory.filter((c) => c.status === 'unresolved').length,
    critical: conflictHistory.filter((c) => c.severity === 'critical').length,
    by_type: conflictHistory.reduce((acc, c) => { acc[c.type] = (acc[c.type] || 0) + 1; return acc; }, {}),
    by_agent_pair: conflictHistory.reduce((acc, c) => {
      const pair = [...c.agents].sort().join('↔');
      acc[pair] = (acc[pair] || 0) + 1;
      return acc;
    }, {}),
  };
}
