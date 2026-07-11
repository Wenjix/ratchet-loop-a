import { callBudgetAgent } from '../agents/budget-agent.js';
import { callSchedulerAgent } from '../agents/scheduler-agent.js';
import { callSourcingAgent } from '../agents/sourcing-agent.js';
import { callVerificationAgent } from '../agents/verification-agent.js';
import { bus, pushAlert } from './world-state.js';
import { getDecisionLog, getPendingRequests, resolveAgentRequest, logDecision } from './agent-loop.js';
import { scoreRoutingConfidence, recordConfidence } from './confidence-engine.js';

const agents = {
  budget: { call: callBudgetAgent, keywords: ['spend', 'cap', 'overspend', 'cost'], description: 'Spend tracking' },
  scheduler: { call: callSchedulerAgent, keywords: ['schedule', 'due', 'cadence', 'recurring', 'when'], description: 'Task cadence' },
  sourcing: { call: callSourcingAgent, keywords: ['vendor', 'quote', 'source', 'hire', 'negotiate', 'mandate'], description: 'Vendor sourcing' },
  verification: { call: callVerificationAgent, keywords: ['verify', 'proof', 'attestation', 'inspect', 'confirm'], description: 'Completion verification' },
};

export function detectAgent(transcript) {
  const lower = transcript.toLowerCase().trim();

  for (const [name] of Object.entries(agents)) {
    if (lower.startsWith(name)) return { name, agent: agents[name], confidence: 'explicit' };
  }
  for (const [name] of Object.entries(agents)) {
    if (lower.includes(name)) return { name, agent: agents[name], confidence: 'mentioned' };
  }

  const scores = {};
  for (const [name, agent] of Object.entries(agents)) {
    scores[name] = agent.keywords.filter((kw) => lower.includes(kw)).length;
  }
  const bestMatch = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (bestMatch[1] > 0) return { name: bestMatch[0], agent: agents[bestMatch[0]], confidence: 'keyword' };

  if (lower.includes('sitrep') || lower.includes('status') || lower.includes('report')) {
    return { name: 'broadcast', agent: null, confidence: 'special' };
  }

  return { name: 'budget', agent: agents.budget, confidence: 'fallback' };
}

export async function handleVoiceCommand(transcript) {
  const startTime = Date.now();
  const { name, agent, confidence } = detectAgent(transcript);
  const routingConfidence = scoreRoutingConfidence(transcript, { name, confidence });
  recordConfidence(name, routingConfidence);

  logDecision({ agent: 'router', type: 'routing', action: `Routed "${transcript.slice(0, 50)}..." → ${name.toUpperCase()}`, reason: routingConfidence.explanation });

  try {
    if (name === 'broadcast') {
      const result = await handleBroadcast(transcript);
      return {
        agent: 'all', confidence, routingConfidence,
        speech: result.map((r) => `${r.agent?.toUpperCase()}: ${r.speech}`).join('\n'),
        actions: result.flatMap((r) => r.actions || []),
        toolResults: result.flatMap((r) => r.toolResults || []),
        latency_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    const result = await agent.call(transcript);
    const response = {
      agent: name, confidence, routingConfidence,
      speech: result.speech, actions: result.actions, toolResults: result.toolResults,
      reasoning: result.reasoning || [], interAgentRequests: result.interAgentRequests || [],
      latency_ms: Date.now() - startTime, timestamp: new Date().toISOString(),
    };

    if (result.interAgentRequests?.length > 0) {
      await processInterAgentRequests(result.interAgentRequests);
    }

    bus.emit('command_complete', response);
    return response;
  } catch (error) {
    logDecision({ agent: 'router', type: 'error', action: `Agent ${name} failed`, reason: error.message });
    pushAlert({ from: name, priority: 'WARNING', message: `Agent error: ${error.message}` });
    return { agent: name, confidence, speech: `${name.toUpperCase()} encountered an issue. ${error.message}`, actions: [], toolResults: [], error: error.message, timestamp: new Date().toISOString() };
  }
}

async function processInterAgentRequests(requests) {
  for (const request of requests) {
    const targetAgent = agents[request.to];
    if (!targetAgent) continue;

    logDecision({ agent: 'router', type: 'inter-agent-routing', action: `Processing request: ${request.from} → ${request.to}: ${request.action}`, reason: request.reason });

    try {
      const prompt = `[INTER-AGENT REQUEST from ${request.from.toUpperCase()}] ${request.action}. Reason: ${request.reason}. Params: ${JSON.stringify(request.params)}. Please execute this request and report results.`;
      const result = await targetAgent.call(prompt);
      resolveAgentRequest(request.id, { summary: result.speech, actions: result.actions, success: !result.toolResults?.some((r) => r.success === false) });
      if (result.interAgentRequests?.length > 0) {
        await processInterAgentRequests(result.interAgentRequests);
      }
    } catch (error) {
      resolveAgentRequest(request.id, { summary: `Failed: ${error.message}`, success: false });
    }
  }
}

export async function handleBroadcast(message) {
  logDecision({ agent: 'router', type: 'broadcast', action: `Broadcasting to all agents: "${message.slice(0, 40)}..."`, reason: 'Principal requested status from all agents' });
  const results = await Promise.allSettled(
    Object.entries(agents).map(async ([name, agent]) => ({ agent: name, ...(await agent.call(message)) }))
  );
  return results.map((r) => (r.status === 'fulfilled' ? r.value : { agent: 'unknown', speech: `Error: ${r.reason?.message}`, actions: [] }));
}

export async function generateSitRep() {
  return handleBroadcast('Give a 1-sentence status report. Include your most critical concern if any.');
}

export async function handleDirectCommand(agentName, message) {
  if (!Object.prototype.hasOwnProperty.call(agents, agentName)) return { error: `Unknown agent: ${agentName}` };
  const agent = agents[agentName];
  if (!agent) return { error: `Unknown agent: ${agentName}` };
  logDecision({ agent: 'router', type: 'direct-command', action: `Direct command to ${agentName}: "${message.slice(0, 40)}..."`, reason: 'Principal interacted with agent panel directly' });
  return agent.call(message);
}

// Deviation from brief: wrapped in try/catch. bus.emit() invokes this listener
// synchronously but does not await or catch its returned promise — an unguarded
// throw from callBudgetAgent (e.g. a transient Claude API error) would become an
// unhandled promise rejection with no caller to catch it, which crashes the
// process on modern Node by default. Same defect shape as the uncaught-throw
// pattern fixed in Tasks 14/15 (an unguarded call into a function that can throw,
// reachable from LLM-adjacent/runtime failures), just surfacing here as a
// fire-and-forget event listener instead of a tool executor. Failure is reported
// the same way handleVoiceCommand's own catch block reports agent failures:
// logDecision + pushAlert, rather than propagating.
bus.on('policy_revoked', async ({ key, policy }) => {
  logDecision({ agent: 'router', type: 'cascade', action: 'Policy revoked → notifying Budget for category review', reason: `Standing policy for ${key} was revoked after a failed verification` });
  try {
    await callBudgetAgent(`[AUTO-TRIGGER: policy_revoked] The standing policy for decision class "${key}" was just revoked (cap was $${policy?.cap}). Review whether this category needs a closer look.`);
  } catch (error) {
    logDecision({ agent: 'router', type: 'error', action: 'Cascade hook failed: policy_revoked → Budget', reason: error.message });
    pushAlert({ from: 'router', priority: 'WARNING', message: `Cascade hook failed (policy_revoked → budget): ${error.message}` });
  }
});

const responseLog = [];
bus.on('agent_response', (response) => {
  responseLog.push(response);
  if (responseLog.length > 50) responseLog.shift();
});

export function getResponseLog() {
  return responseLog;
}

export { getDecisionLog };
