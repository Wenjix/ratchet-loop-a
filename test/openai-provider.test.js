import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIProvider } from '../src/core/llm/openai-provider.js';

function fakeClient(response) {
  const client = { lastParams: null, chat: { completions: {} } };
  client.chat.completions.create = async (params) => {
    client.lastParams = params;
    return response;
  };
  return client;
}

test('createOpenAIProvider normalizes a plain stop response and forwards params', async () => {
  const client = fakeClient({
    choices: [{ message: { content: 'hi there', tool_calls: undefined }, finish_reason: 'stop' }],
  });
  const provider = createOpenAIProvider({ client });
  const tool = { name: 'check_budget', description: 'checks budget', input_schema: { type: 'object', properties: {} } };
  const result = await provider.createTurn({
    systemPrompt: 'be helpful',
    tools: [tool],
    history: [{ role: 'user', text: 'hello' }],
  });

  assert.deepEqual(result, { text: 'hi there', toolCalls: [], stopReason: 'end_turn' });
  assert.deepEqual(client.lastParams.messages[0], { role: 'system', content: 'be helpful' });
  assert.deepEqual(client.lastParams.messages[1], { role: 'user', content: 'hello' });
  assert.deepEqual(client.lastParams.tools, [
    { type: 'function', function: { name: 'check_budget', description: 'checks budget', parameters: tool.input_schema } },
  ]);
});

test('createOpenAIProvider normalizes a tool_calls response, parsing arguments as JSON', async () => {
  const client = fakeClient({
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'check_budget', arguments: JSON.stringify({ category: 'lawn_care' }) } },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
  });
  const provider = createOpenAIProvider({ client });
  const result = await provider.createTurn({ systemPrompt: 'x', tools: [], history: [] });

  assert.deepEqual(result, {
    text: '',
    toolCalls: [{ id: 'call_1', name: 'check_budget', input: { category: 'lawn_care' } }],
    stopReason: 'tool_use',
  });
});

test('createOpenAIProvider translates an assistant entry with toolCalls to OpenAI message shape', async () => {
  const client = fakeClient({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] });
  const provider = createOpenAIProvider({ client });

  await provider.createTurn({
    systemPrompt: 'x',
    tools: [],
    history: [
      {
        role: 'assistant',
        text: 'checking now',
        toolCalls: [{ id: 'call_1', name: 'check_budget', input: { category: 'lawn_care' } }],
      },
    ],
  });

  assert.deepEqual(client.lastParams.messages[1], {
    role: 'assistant',
    content: 'checking now',
    tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'check_budget', arguments: JSON.stringify({ category: 'lawn_care' }) } }],
  });
});

test('createOpenAIProvider expands a tool_result entry with multiple results into one tool message per result', async () => {
  const client = fakeClient({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] });
  const provider = createOpenAIProvider({ client });

  await provider.createTurn({
    systemPrompt: 'x',
    tools: [],
    history: [
      {
        role: 'tool_result',
        results: [
          { id: 'call_1', name: 'check_budget', output: { success: true, remaining: 45 } },
          { id: 'call_2', name: 'check_schedule', output: { success: true, slots: 3 } },
        ],
      },
    ],
  });

  const toolMessages = client.lastParams.messages.filter((m) => m.role === 'tool');
  assert.equal(toolMessages.length, 2);
  assert.deepEqual(toolMessages[0], { role: 'tool', tool_call_id: 'call_1', content: JSON.stringify({ success: true, remaining: 45 }) });
  assert.deepEqual(toolMessages[1], { role: 'tool', tool_call_id: 'call_2', content: JSON.stringify({ success: true, slots: 3 }) });
});
