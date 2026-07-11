import Anthropic from '@anthropic-ai/sdk';
import { bus, pushAlert } from './world-state.js';
import { detectConflicts } from './conflict-resolver.js';

let defaultClient = null;
function getDefaultClient() {
  if (!defaultClient) defaultClient = new Anthropic();
  return defaultClient;
}

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

export async function runAgentLoop({ systemPrompt, tools, toolExecutor, agentName, userMessage, contextBuilder, client }) {
  const activeClient = client || getDefaultClient();
  const context = contextBuilder();
  const messages = [{ role: 'user', content: `[WORLD STATE] ${context}\n\n[PRINCIPAL] ${userMessage}` }];

  const pending = getPendingRequests(agentName);
  if (pending.length > 0) {
    const requestSummary = pending.map((r) =>
      `[REQUEST FROM ${r.from.toUpperCase()}] Action: ${r.action}. Reason: ${r.reason}. Params: ${JSON.stringify(r.params)}`
    ).join('\n');
    messages[0].content += `\n\n[PENDING REQUESTS FROM OTHER AGENTS]\n${requestSummary}`;
  }

  let truncated = true;
  const result = { speech: '', actions: [], toolResults: [], reasoning: [], interAgentRequests: [] };
  let turns = 0;

  while (turns < MAX_TOOL_TURNS) {
    turns++;

    const response = await activeClient.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      tools: [
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
      ],
      messages,
    });

    const toolUseBlocks = [];
    const toolResultMessages = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        result.speech += block.text;
        result.reasoning.push({ turn: turns, type: 'speech', content: block.text });
      } else if (block.type === 'tool_use') {
        toolUseBlocks.push(block);
      }
    }

    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
      truncated = false;
      break;
    }

    for (const block of toolUseBlocks) {
      let toolResult;

      if (block.name === 'request_agent_help') {
        const req = sendAgentRequest({
          from: agentName,
          to: block.input.target_agent,
          action: block.input.action,
          params: block.input.params || {},
          reason: block.input.reason,
          priority: block.input.priority || 'normal',
        });
        result.interAgentRequests.push(req);
        toolResult = { success: true, request_id: req.id, status: 'Request sent. Will be handled by the router.' };
      } else {
        const conflicts = detectConflicts(agentName, block.name, block.input);
        if (conflicts.some((c) => c.severity === 'critical')) {
          toolResult = {
            success: false,
            blocked_by_conflict: true,
            conflicts: conflicts.filter((c) => c.severity === 'critical'),
            message: 'Action blocked due to critical conflict. Principal decision required.',
          };
        } else {
          toolResult = toolExecutor(block.name, block.input);
        }
      }

      logDecision({
        agent: agentName,
        type: 'tool-call',
        action: block.name,
        input: block.input,
        result: toolResult,
        reason: result.speech,
      });

      result.actions.push({ tool: block.name, input: block.input });
      result.toolResults.push(toolResult);

      toolResultMessages.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(toolResult) });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResultMessages });
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
