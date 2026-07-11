import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProviderName, getDefaultProvider } from '../src/core/llm/index.js';

function withEnv(overrides, fn) {
  const prior = {};
  for (const key of Object.keys(overrides)) prior[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
}

test('resolveProviderName defaults to anthropic when LLM_PROVIDER is unset', () => {
  withEnv({ LLM_PROVIDER: undefined }, () => {
    assert.equal(resolveProviderName(), 'anthropic');
  });
});

test('resolveProviderName is case-insensitive', () => {
  withEnv({ LLM_PROVIDER: 'OpenAI' }, () => {
    assert.equal(resolveProviderName(), 'openai');
  });
});

test('resolveProviderName throws on an unknown provider name', () => {
  withEnv({ LLM_PROVIDER: 'llama' }, () => {
    assert.throws(() => resolveProviderName(), /Unknown LLM_PROVIDER/);
  });
});

test('getDefaultProvider returns the anthropic provider without a key, and does not throw', () => {
  withEnv({ LLM_PROVIDER: undefined, ANTHROPIC_API_KEY: undefined }, () => {
    const provider = getDefaultProvider();
    assert.equal(provider.name, 'anthropic');
  });
});

test('getDefaultProvider returns the openai provider when selected with a placeholder key present', () => {
  withEnv({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test-placeholder-not-a-real-key' }, () => {
    const provider = getDefaultProvider();
    assert.equal(provider.name, 'openai');
  });
});
