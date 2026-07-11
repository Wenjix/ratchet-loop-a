import { createAnthropicProvider } from './anthropic-provider.js';
import { createOpenAIProvider } from './openai-provider.js';

export function resolveProviderName() {
  const name = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
  if (name !== 'anthropic' && name !== 'openai') {
    throw new Error(`Unknown LLM_PROVIDER "${name}" — expected "anthropic" or "openai".`);
  }
  return name;
}

export function getDefaultProvider() {
  const name = resolveProviderName();
  return name === 'openai' ? createOpenAIProvider() : createAnthropicProvider();
}
