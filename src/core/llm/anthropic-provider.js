import Anthropic from '@anthropic-ai/sdk';

let defaultClient = null;
function getClient() {
  if (!defaultClient) defaultClient = new Anthropic();
  return defaultClient;
}

const DEFAULT_MODEL = 'claude-sonnet-5';

export function createAnthropicProvider({ client } = {}) {
  const activeClient = client || getClient();
  return {
    name: 'anthropic',
    async createTurn({ systemPrompt, tools, history }) {
      const response = await activeClient.messages.create({
        model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: tools.map(toAnthropicTool),
        messages: history.map(toAnthropicMessage),
      });
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const toolCalls = response.content
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id, name: b.name, input: b.input }));
      const stopReason = response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn';
      return { text, toolCalls, stopReason };
    },
  };
}

function toAnthropicTool(tool) {
  return { name: tool.name, description: tool.description, input_schema: tool.input_schema };
}

function toAnthropicMessage(entry) {
  if (entry.role === 'user') return { role: 'user', content: entry.text };
  if (entry.role === 'assistant') {
    const content = [];
    if (entry.text) content.push({ type: 'text', text: entry.text });
    for (const call of entry.toolCalls) {
      content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
    }
    return { role: 'assistant', content };
  }
  if (entry.role === 'tool_result') {
    return {
      role: 'user',
      content: entry.results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: JSON.stringify(r.output) })),
    };
  }
  throw new Error(`Unknown history entry role: ${entry.role}`);
}
