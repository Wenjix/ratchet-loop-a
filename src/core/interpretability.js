import { bus } from './world-state.js';

const AGENT_COLORS = {
  budget: '#F59E0B',
  scheduler: '#8B5CF6',
  sourcing: '#06B6D4',
  verification: '#22C55E',
  router: '#9CA3AF',
  system: '#6B7280',
};

const TYPE_ICONS = {
  'tool-call': 'wrench',
  'inter-agent-request': 'arrow-right',
  'inter-agent-response': 'check',
  routing: 'compass',
  cascade: 'refresh',
  broadcast: 'broadcast',
  error: 'alert-triangle',
  speech: 'message',
};

const TOOL_LABELS = {
  check_budget: 'Checked budget',
  record_spend: 'Recorded spend',
  get_schedule: 'Checked schedule',
  mark_task_due: 'Marked task due',
  get_vendor_quotes: 'Requested vendor quotes',
  commit_mandate: 'Committed mandate',
  verify_completion: 'Verified job completion',
  request_agent_help: 'Requested help from another agent',
};

export function formatDecisionForUI(decision) {
  let summary;
  switch (decision.type) {
    case 'tool-call':
      summary = formatToolCall(decision);
      break;
    case 'inter-agent-request':
      summary = `→ ${decision.data?.to?.toUpperCase()}: ${decision.action}`;
      break;
    default:
      summary = decision.action;
  }

  return {
    id: decision.id,
    agent: decision.agent,
    color: AGENT_COLORS[decision.agent] || '#6B7280',
    icon: TYPE_ICONS[decision.type] || 'circle',
    summary,
    reason: decision.reason ? truncate(decision.reason, 60) : null,
    timestamp: decision.timestamp,
    details: { fullAction: decision.action, fullReason: decision.reason, input: decision.input, result: decision.result },
  };
}

function formatToolCall(decision) {
  const label = TOOL_LABELS[decision.action] || decision.action;
  const success = decision.result?.success !== false;
  return `${label}${success ? '' : ' [BLOCKED]'}`;
}

function truncate(str, len) {
  return str.length > len ? `${str.slice(0, len - 3)}...` : str;
}

const activeFlows = [];

function pushFlow(flow) {
  activeFlows.push(flow);
  bus.emit('coordination_flow', flow);
  const timer = setTimeout(() => {
    const idx = activeFlows.indexOf(flow);
    if (idx !== -1) {
      activeFlows.splice(idx, 1);
      bus.emit('coordination_flow_ended', flow.id);
    }
  }, flow.duration);
  timer.unref();
}

bus.on('decision_logged', (decision) => {
  if (decision.type !== 'inter-agent-request') return;
  pushFlow({
    id: `flow-${Date.now()}`,
    from: decision.agent,
    to: decision.data?.to,
    type: 'request',
    label: truncate(decision.action, 30),
    color: getFlowColor(decision.agent),
    crossPrincipal: false,
    duration: 5000,
    createdAt: Date.now(),
  });
});

bus.on('mandate_created', (mandate) => {
  pushFlow({
    id: `flow-mandate-${mandate.id}`,
    from: 'sourcing',
    to: mandate.vendor_id,
    type: 'cross-principal',
    label: `Mandate → ${mandate.vendor_id}`,
    color: getFlowColor('sourcing'),
    crossPrincipal: true,
    duration: 4000,
    createdAt: Date.now(),
  });
});

bus.on('policy_revoked', () => {
  pushFlow({
    id: `flow-revoke-${Date.now()}`,
    from: 'verification',
    to: 'sourcing',
    type: 'cascade',
    label: 'Bad job → policy revoked',
    color: getFlowColor('verification'),
    crossPrincipal: false,
    duration: 4000,
    createdAt: Date.now(),
  });
});

function getFlowColor(agent) {
  return AGENT_COLORS[agent] || '#9CA3AF';
}

export function getActiveFlows() {
  return activeFlows.filter((f) => Date.now() - f.createdAt < f.duration);
}
