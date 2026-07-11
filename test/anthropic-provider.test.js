import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnthropicProvider } from '../src/core/llm/anthropic-provider.js';

function fakeClient(response) {
  const client = { lastParams: null, messages: {} };
  client.messages.create = async (params) => {
    client.lastParams = params;
    return response;
  };
  return client;
}

test('createAnthropicProvider normalizes an end-turn text response and forwards params', async () => {
  const client = fakeClient({ content: [{ type: 'text', text: 'hi there' }], stop_reason: 'end_turn' });
  const provider = createAnthropicProvider({ client });
  const tool = { name: 'check_budget', description: 'checks budget', input_schema: { type: 'object', properties: {} } };
  const result = await provider.createTurn({
    systemPrompt: 'be helpful',
    tools: [tool],
    history: [{ role: 'user', text: 'hello' }],
  });

  assert.deepEqual(result, { text: 'hi there', toolCalls: [], stopReason: 'end_turn' });
  assert.equal(client.lastParams.system, 'be helpful');
  assert.deepEqual(client.lastParams.messages, [{ role: 'user', content: 'hello' }]);
  assert.deepEqual(client.lastParams.tools, [tool]);
});

test('createAnthropicProvider normalizes a tool_use response', async () => {
  const client = fakeClient({
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'check_budget', input: { category: 'lawn_care' } }],
    stop_reason: 'tool_use',
  });
  const provider = createAnthropicProvider({ client });
  const result = await provider.createTurn({ systemPrompt: 'x', tools: [], history: [] });

  assert.deepEqual(result, {
    text: '',
    toolCalls: [{ id: 'toolu_1', name: 'check_budget', input: { category: 'lawn_care' } }],
    stopReason: 'tool_use',
  });
});

test('createAnthropicProvider translates assistant/tool_result history entries to Anthropic message shape', async () => {
  const client = fakeClient({ content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' });
  const provider = createAnthropicProvider({ client });

  await provider.createTurn({
    systemPrompt: 'x',
    tools: [],
    history: [
      { role: 'user', text: 'hello' },
      {
        role: 'assistant',
        text: 'checking now',
        toolCalls: [{ id: 'toolu_1', name: 'check_budget', input: { category: 'lawn_care' } }],
      },
      { role: 'tool_result', results: [{ id: 'toolu_1', name: 'check_budget', output: { success: true, remaining: 45 } }] },
    ],
  });

  assert.deepEqual(client.lastParams.messages, [
    { role: 'user', content: 'hello' },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'checking now' },
        { type: 'tool_use', id: 'toolu_1', name: 'check_budget', input: { category: 'lawn_care' } },
      ],
    },
    {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: JSON.stringify({ success: true, remaining: 45 }) }],
    },
  ]);
});

test('createAnthropicProvider omits the text block for an assistant entry with empty text', async () => {
  const client = fakeClient({ content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' });
  const provider = createAnthropicProvider({ client });

  await provider.createTurn({
    systemPrompt: 'x',
    tools: [],
    history: [
      {
        role: 'assistant',
        text: '',
        toolCalls: [{ id: 'toolu_9', name: 'check_budget', input: {} }],
      },
      { role: 'tool_result', results: [{ id: 'toolu_9', name: 'check_budget', output: { success: true } }] },
    ],
  });

  assert.deepEqual(client.lastParams.messages[0], {
    role: 'assistant',
    content: [{ type: 'tool_use', id: 'toolu_9', name: 'check_budget', input: {} }],
  });
});
