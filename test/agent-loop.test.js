import test from 'node:test';
import assert from 'node:assert/strict';
import { worldState } from '../src/core/world-state.js';
import { logDecision, getDecisionLog, sendAgentRequest, resolveAgentRequest, getPendingRequests, runAgentLoop } from '../src/core/agent-loop.js';

function fakeClient(responses) {
  const queue = [...responses];
  return { messages: { create: async () => queue.shift() } };
}

test('logDecision appends an entry with id/timestamp and getDecisionLog returns it', () => {
  const entry = logDecision({ agent: 'budget', type: 'tool-call', action: 'check_budget' });
  assert.ok(entry.id.startsWith('dec-'));
  assert.ok(getDecisionLog().includes(entry));
});

test('sendAgentRequest/resolveAgentRequest/getPendingRequests round-trip', () => {
  const req = sendAgentRequest({ from: 'sourcing', to: 'verification', action: 'inspect', reason: 'confirm quality' });
  assert.equal(getPendingRequests('verification').some((r) => r.id === req.id), true);
  resolveAgentRequest(req.id, { summary: 'looks good', success: true });
  assert.equal(req.status, 'resolved');
  assert.equal(getPendingRequests('verification').some((r) => r.id === req.id), false);
});

test('runAgentLoop returns speech directly when the model calls no tools', async () => {
  const client = fakeClient([{ content: [{ type: 'text', text: 'All clear.' }], stop_reason: 'end_turn' }]);
  const result = await runAgentLoop({
    systemPrompt: 'test', tools: [], toolExecutor: () => ({ success: true }),
    agentName: 'budget', userMessage: 'status?', contextBuilder: () => 'no context', client,
  });
  assert.equal(result.speech, 'All clear.');
  assert.equal(result.actions.length, 0);
});

test('runAgentLoop executes a tool call and continues to a final response', async () => {
  let executed = null;
  const client = fakeClient([
    { content: [{ type: 'tool_use', id: 'toolu_1', name: 'check_budget', input: { category: 'lawn_care' } }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'Budget looks fine.' }], stop_reason: 'end_turn' },
  ]);
  const result = await runAgentLoop({
    systemPrompt: 'test',
    tools: [{ name: 'check_budget', description: 'x', input_schema: { type: 'object', properties: {} } }],
    toolExecutor: (name, input) => { executed = { name, input }; return { success: true, remaining: 45 }; },
    agentName: 'budget', userMessage: 'check the lawn care budget', contextBuilder: () => 'no context', client,
  });
  assert.deepEqual(executed, { name: 'check_budget', input: { category: 'lawn_care' } });
  assert.equal(result.actions.length, 1);
  assert.equal(result.speech, 'Budget looks fine.');
});

test('runAgentLoop blocks tool execution on a critical conflict from detectConflicts', async () => {
  worldState.budget.categories.lawn_care = { cap_per_month: 100, spent_this_month: 90 };
  let executed = false;
  const client = fakeClient([
    { content: [{ type: 'tool_use', id: 'toolu_2', name: 'commit_mandate', input: { category: 'lawn_care', amount: 30, vendor_id: 'greenblade', task_id: 't1', task_type: 'lawn_mowing' } }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' },
  ]);
  const result = await runAgentLoop({
    systemPrompt: 'test',
    tools: [{ name: 'commit_mandate', description: 'x', input_schema: { type: 'object', properties: {} } }],
    toolExecutor: () => { executed = true; return { success: true }; },
    agentName: 'sourcing', userMessage: 'commit the mandate', contextBuilder: () => 'no context', client,
  });
  assert.equal(executed, false);
  assert.equal(result.toolResults[0].blocked_by_conflict, true);
});

test('sendAgentRequest generates distinct ids for two calls in the same millisecond', () => {
  const req1 = sendAgentRequest({ from: 'sourcing', to: 'verification', action: 'inspect a', reason: 'r1' });
  const req2 = sendAgentRequest({ from: 'sourcing', to: 'verification', action: 'inspect b', reason: 'r2' });
  assert.notEqual(req1.id, req2.id);
  resolveAgentRequest(req1.id, { summary: 'a done', success: true });
  resolveAgentRequest(req2.id, { summary: 'b done', success: true });
  assert.equal(req1.status, 'resolved');
  assert.equal(req2.status, 'resolved');
});

test('runAgentLoop routes request_agent_help through sendAgentRequest', async () => {
  const client = fakeClient([
    { content: [{ type: 'tool_use', id: 'toolu_3', name: 'request_agent_help', input: { target_agent: 'verification', action: 'inspect the last mow', reason: 'confirm quality before paying' } }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'requested' }], stop_reason: 'end_turn' },
  ]);
  const result = await runAgentLoop({
    systemPrompt: 'test', tools: [], toolExecutor: () => ({ success: true }),
    agentName: 'sourcing', userMessage: 'ask verification to check the mow', contextBuilder: () => 'no context', client,
  });
  assert.equal(result.interAgentRequests.length, 1);
  assert.equal(getPendingRequests('verification').some((r) => r.action === 'inspect the last mow'), true);
});

test('runAgentLoop sets truncated=true when MAX_TOOL_TURNS is exhausted mid-tool-use', async () => {
  const alwaysToolUse = { content: [{ type: 'tool_use', id: 'toolu_x', name: 'check_budget', input: {} }], stop_reason: 'tool_use' };
  const client = fakeClient([alwaysToolUse, alwaysToolUse, alwaysToolUse]);
  const result = await runAgentLoop({
    systemPrompt: 'test',
    tools: [{ name: 'check_budget', description: 'x', input_schema: { type: 'object', properties: {} } }],
    toolExecutor: () => ({ success: true }),
    agentName: 'budget', userMessage: 'keep going', contextBuilder: () => 'no context', client,
  });
  assert.equal(result.truncated, true);
  assert.equal(result.actions.length, 3);
  assert.equal(worldState.alerts[0].from, 'budget');
  assert.match(worldState.alerts[0].message, /tool-turn limit/);
});

test('runAgentLoop sets truncated=false when the model ends naturally', async () => {
  const client = fakeClient([{ content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' }]);
  const result = await runAgentLoop({
    systemPrompt: 'test', tools: [], toolExecutor: () => ({ success: true }),
    agentName: 'budget', userMessage: 'status?', contextBuilder: () => 'no context', client,
  });
  assert.equal(result.truncated, false);
});
