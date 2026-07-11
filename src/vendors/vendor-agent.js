// src/vendors/vendor-agent.js
import { runAgentLoop } from '../core/agent-loop.js';

export function createVendorAgent({ id, name, task_type, quoteSequence, attestationSequence }) {
  let quoteIndex = 0;
  let attestationIndex = 0;

  const VENDOR_SYSTEM_PROMPT = `You are ${name.toUpperCase()}, a ${task_type.replace(/_/g, ' ')} vendor agent transacting with a household's Sourcing agent in a Ratchet Loop A prototype. You are an independent principal with your own pricing and interests, not a subordinate of the household. Be brief and professional.`;

  function quote() {
    const price = quoteSequence[quoteIndex % quoteSequence.length];
    quoteIndex += 1;
    return price;
  }

  function reportCompletion() {
    const attestation = attestationSequence[attestationIndex % attestationSequence.length];
    attestationIndex += 1;
    return attestation;
  }

  async function chat(userMessage) {
    return runAgentLoop({
      systemPrompt: VENDOR_SYSTEM_PROMPT,
      tools: [],
      toolExecutor: () => ({ success: true }),
      agentName: id,
      userMessage,
      contextBuilder: () => `You serve ${task_type}.`,
    });
  }

  return { id, name, task_type, quote, reportCompletion, chat };
}
