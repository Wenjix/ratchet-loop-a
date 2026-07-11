import { bus } from './world-state.js';

const cascades = new Map();
let cascadeCounter = 0;

export function startCascade({ trigger, source, metadata = {} }) {
  const id = `CASCADE-${String(++cascadeCounter).padStart(3, '0')}`;
  const cascade = {
    id,
    trigger,
    source,
    rootAction: null,
    actions: [],
    tree: null,
    metrics: {
      depth: 0,
      breadth: 0,
      agents_involved: new Set(),
      started_at: Date.now(),
      completed_at: null,
      convergence: null,
    },
    metadata,
    status: 'active',
  };

  cascades.set(id, cascade);
  bus.emit('cascade_started', { id, trigger, source });
  return cascade;
}

export function addCascadeAction(cascadeId, {
  agent,
  action,
  type,
  parentActionId,
  input,
  result,
  reason,
}) {
  const cascade = cascades.get(cascadeId);
  if (!cascade) return null;

  const actionEntry = {
    id: `${cascadeId}-${String(cascade.actions.length + 1).padStart(2, '0')}`,
    agent,
    action,
    type,
    parentActionId: parentActionId || null,
    input,
    result,
    reason,
    depth: 0,
    timestamp: Date.now(),
    latency_ms: null,
  };

  if (parentActionId) {
    const parent = cascade.actions.find((a) => a.id === parentActionId);
    if (parent) {
      actionEntry.depth = parent.depth + 1;
    }
  }

  if (cascade.actions.length === 0) {
    cascade.rootAction = actionEntry.id;
  }

  cascade.actions.push(actionEntry);
  cascade.metrics.depth = Math.max(cascade.metrics.depth, actionEntry.depth);
  cascade.metrics.breadth = cascade.actions.length;
  cascade.metrics.agents_involved.add(agent);

  bus.emit('cascade_action', { cascadeId, action: actionEntry });
  return actionEntry;
}

export function setCascadeConvergence(cascadeId, { before, after, improvement }) {
  const cascade = cascades.get(cascadeId);
  if (!cascade) return;

  cascade.metrics.convergence = { before, after, improvement };
  cascade.metrics.completed_at = Date.now();
  cascade.status = 'converged';

  bus.emit('cascade_converged', {
    cascadeId,
    convergence: cascade.metrics.convergence,
    duration_ms: cascade.metrics.completed_at - cascade.metrics.started_at,
    depth: cascade.metrics.depth,
    breadth: cascade.metrics.breadth,
    agents: [...cascade.metrics.agents_involved],
  });
}

export function getCascadeTree(cascadeId) {
  const cascade = cascades.get(cascadeId);
  if (!cascade) return null;

  const buildNode = (actionId) => {
    const action = cascade.actions.find((a) => a.id === actionId);
    if (!action) return null;
    const children = cascade.actions
      .filter((a) => a.parentActionId === actionId)
      .map((a) => buildNode(a.id));
    return { ...action, children };
  };

  return {
    id: cascade.id,
    trigger: cascade.trigger,
    status: cascade.status,
    metrics: {
      ...cascade.metrics,
      agents_involved: [...cascade.metrics.agents_involved],
      duration_ms: (cascade.metrics.completed_at || Date.now()) - cascade.metrics.started_at,
    },
    tree: cascade.rootAction ? buildNode(cascade.rootAction) : null,
  };
}

export function getActiveCascade() {
  const active = [...cascades.values()].filter((c) => c.status === 'active');
  return active.length > 0 ? active[active.length - 1] : null;
}

export function getAllCascades() {
  return [...cascades.values()].map((c) => ({
    id: c.id,
    trigger: c.trigger,
    status: c.status,
    action_count: c.actions.length,
    depth: c.metrics.depth,
    agents: [...c.metrics.agents_involved],
    convergence: c.metrics.convergence,
    duration_ms: (c.metrics.completed_at || Date.now()) - c.metrics.started_at,
  }));
}

export function detectClosedLoop(cascadeId) {
  const cascade = cascades.get(cascadeId);
  if (!cascade) return null;

  const agentActions = {};
  const loops = [];

  for (const action of cascade.actions) {
    if (agentActions[action.agent]) {
      loops.push({
        agent: action.agent,
        first_action: agentActions[action.agent],
        loop_action: action,
        loop_depth: action.depth,
        description: `${action.agent.toUpperCase()} acted again at depth ${action.depth} — loop closed`,
      });
    } else {
      agentActions[action.agent] = action;
    }
  }

  return loops.length > 0 ? loops : null;
}
