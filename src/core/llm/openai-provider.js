import OpenAI from 'openai';

let defaultClient = null;
function getClient() {
  if (!defaultClient) defaultClient = new OpenAI();
  return defaultClient;
}

const DEFAULT_MODEL = 'gpt-4o';

export function createOpenAIProvider({ client } = {}) {
  const activeClient = client || getClient();
  return {
    name: 'openai',
    async createTurn({ systemPrompt, tools, history }) {
      const messages = [{ role: 'system', content: systemPrompt }, ...history.flatMap(toOpenAIMessages)];
      const response = await activeClient.chat.completions.create({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        max_tokens: 1024,
        messages,
        tools: tools.map(toOpenAITool),
      });
      const choice = response.choices[0];
      const text = choice.message.content || '';
      const toolCalls = (choice.message.tool_calls || []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments),
      }));
      const stopReason = choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn';
      return { text, toolCalls, stopReason };
    },
  };
}

function toOpenAITool(tool) {
  return { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema } };
}

function toOpenAIMessages(entry) {
  if (entry.role === 'user') return [{ role: 'user', content: entry.text }];
  if (entry.role === 'assistant') {
    const msg = { role: 'assistant', content: entry.text || null };
    if (entry.toolCalls.length > 0) {
      msg.tool_calls = entry.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.input) },
      }));
    }
    return [msg];
  }
  if (entry.role === 'tool_result') {
    return entry.results.map((r) => ({ role: 'tool', tool_call_id: r.id, content: JSON.stringify(r.output) }));
  }
  throw new Error(`Unknown history entry role: ${entry.role}`);
}
