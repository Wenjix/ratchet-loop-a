import { bus, pushAlert } from './world-state.js';
import { detectConflicts } from './conflict-resolver.js';
import { getDefaultProvider } from './llm/index.js';

const MAX_TOOL_TURNS = 3;

const decisionLog = [];

export function logDecision(entry) {
  const full = {
    id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  decisionLog.push(full);
  if (decisionLog.length > 100) decisionLog.shift();
  bus.emit('decision_logged', full);
  return full;
}

export function getDecisionLog() {
  return decisionLog;
}

const pendingRequests = [];

export function sendAgentRequest({ from, to, action, params, reason, priority = 'normal' }) {
  const request = {
    id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    from, to, action, params, reason, priority,
    status: 'pending',
    response: null,
  };
  pendingRequests.push(request);
  bus.emit('agent_request', request);
  logDecision({
    agent: from,
    type: 'inter-agent-request',
    action: `Requested ${to.toUpperCase()} to ${action}`,
    reason,
    data: { to, action, params },
  });
  return request;
}

export function resolveAgentRequest(requestId, response) {
  const req = pendingRequests.find((r) => r.id === requestId);
  if (req) {
    req.status = 'resolved';
    req.response = response;
    bus.emit('agent_request_resolved', req);
    logDecision({
      agent: req.to,
      type: 'inter-agent-response',
      action: `Responded to ${req.from.toUpperCase()}: ${req.action}`,
      reason: response.summary || 'Request fulfilled',
      data: response,
    });
  }
  return req;
}

export function getPendingRequests(agentName) {
  return pendingRequests.filter((r) => r.to === agentName && r.status === 'pending');
}

export async function runAgentLoop({ systemPrompt, tools, toolExecutor, agentName, userMessage, contextBuilder, provider }) {
  const activeProvider = provider || getDefaultProvider();
  const context = contextBuilder();
  let seedText = `[WORLD STATE] ${context}\n\n[PRINCIPAL] ${userMessage}`;

  const pending = getPendingRequests(agentName);
  if (pending.length > 0) {
    const requestSummary = pending.map((r) =>
      `[REQUEST FROM ${r.from.toUpperCase()}] Action: ${r.action}. Reason: ${r.reason}. Params: ${JSON.stringify(r.params)}`
    ).join('\n');
    seedText += `\n\n[PENDING REQUESTS FROM OTHER AGENTS]\n${requestSummary}`;
  }

  const history = [{ role: 'user', text: seedText }];

  const allTools = [
    ...tools,
    {
      name: 'request_agent_help',
      description: 'Request another agent to take an action. Use this when you need coordination. The request will be visible to the principal.',
      input_schema: {
        type: 'object',
        properties: {
          target_agent: { type: 'string', enum: ['budget', 'scheduler', 'sourcing', 'verification'], description: 'Agent to request help from' },
          action: { type: 'string', description: 'What you need them to do' },
          reason: { type: 'string', description: 'Why you need this — visible to the principal' },
          params: { type: 'object', description: 'Parameters for the request' },
          priority: { type: 'string', enum: ['normal', 'urgent', 'critical'] },
        },
        required: ['target_agent', 'action', 'reason'],
      },
    },
  ];

  let truncated = true;
  const result = { speech: '', actions: [], toolResults: [], reasoning: [], interAgentRequests: [] };
  let turns = 0;

  while (turns < MAX_TOOL_TURNS) {
    turns++;

    const { text, toolCalls, stopReason } = await activeProvider.createTurn({ systemPrompt, tools: allTools, history });

    if (text) {
      result.speech += text;
      result.reasoning.push({ turn: turns, type: 'speech', content: text });
    }

    if (toolCalls.length === 0 || stopReason === 'end_turn') {
      truncated = false;
      break;
    }

    const results = [];

    for (const call of toolCalls) {
      let toolResult;

      if (call.name === 'request_agent_help') {
        const req = sendAgentRequest({
          from: agentName,
          to: call.input.target_agent,
          action: call.input.action,
          params: call.input.params || {},
          reason: call.input.reason,
          priority: call.input.priority || 'normal',
        });
        result.interAgentRequests.push(req);
        toolResult = { success: true, request_id: req.id, status: 'Request sent. Will be handled by the router.' };
      } else {
        const conflicts = detectConflicts(agentName, call.name, call.input);
        if (conflicts.some((c) => c.severity === 'critical')) {
          toolResult = {
            success: false,
            blocked_by_conflict: true,
            conflicts: conflicts.filter((c) => c.severity === 'critical'),
            message: 'Action blocked due to critical conflict. Principal decision required.',
          };
        } else {
          toolResult = toolExecutor(call.name, call.input);
        }
      }

      logDecision({
        agent: agentName,
        type: 'tool-call',
        action: call.name,
        input: call.input,
        result: toolResult,
        reason: result.speech,
      });

      result.actions.push({ tool: call.name, input: call.input });
      result.toolResults.push(toolResult);

      results.push({ id: call.id, name: call.name, output: toolResult });
    }

    history.push({ role: 'assistant', text, toolCalls });
    history.push({ role: 'tool_result', results });
  }

  result.truncated = truncated;
  if (truncated) {
    // MAX_TOOL_TURNS was hit on a turn that still required tool calls: those tools already
    // ran (real world-state side effects), but the loop exited before Claude produced a
    // final response, so result.speech may be misleading/empty. Surface this in the
    // dashboard's alert stream rather than silently dropping it.
    pushAlert({
      from: agentName,
      priority: 'WARNING',
      message: `${agentName.toUpperCase()} hit the tool-turn limit (${MAX_TOOL_TURNS}) mid-task — its last actions executed but no final response was produced.`,
    });
  }
  const fullResponse = { agent: agentName, ...result, timestamp: new Date().toISOString() };
  bus.emit('agent_response', fullResponse);
  return result;
}
