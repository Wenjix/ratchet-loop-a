import { worldState } from './world-state.js';

export function scoreRoutingConfidence(transcript, matchResult) {
  const { name, confidence: matchType } = matchResult;

  const baseScores = {
    explicit: 0.98,
    mentioned: 0.90,
    keyword: 0.65,
    special: 0.85,
    fallback: 0.30,
  };

  let score = baseScores[matchType] || 0.5;

  const wordCount = transcript.split(/\s+/).length;
  if (wordCount < 8) score = Math.min(1.0, score + 0.05);
  if (wordCount > 30) score = Math.max(0.1, score - 0.1);

  if (matchType === 'keyword') {
    const agentKeywordCounts = countAgentKeywords(transcript);
    const topTwo = Object.values(agentKeywordCounts).sort((a, b) => b - a);
    if (topTwo.length >= 2 && topTwo[0] === topTwo[1]) {
      score *= 0.7;
    }
  }

  return {
    score: Math.round(score * 100) / 100,
    level: score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low',
    matchType,
    agent: name,
    explanation: buildRoutingExplanation(matchType, name, score),
  };
}

function countAgentKeywords(transcript) {
  const lower = transcript.toLowerCase();
  const agentKeywords = {
    budget: ['budget', 'spend', 'cap', 'overspend', 'cost'],
    scheduler: ['schedule', 'due', 'cadence', 'recurring', 'when'],
    sourcing: ['vendor', 'quote', 'source', 'hire', 'negotiate', 'mandate'],
    verification: ['verify', 'proof', 'attestation', 'inspect', 'confirm'],
  };

  const counts = {};
  for (const [agent, keywords] of Object.entries(agentKeywords)) {
    counts[agent] = keywords.filter((kw) => lower.includes(kw)).length;
  }
  return counts;
}

function buildRoutingExplanation(matchType, agent, score) {
  switch (matchType) {
    case 'explicit': return `Principal directly addressed ${agent.toUpperCase()}`;
    case 'mentioned': return `${agent.toUpperCase()} mentioned in command`;
    case 'keyword': return `Domain keywords matched ${agent.toUpperCase()} (${Math.round(score * 100)}% confidence)`;
    case 'special': return 'Special command detected';
    case 'fallback': return `No clear match — defaulted to ${agent.toUpperCase()}. Principal may want to clarify.`;
    default: return `Routed to ${agent.toUpperCase()}`;
  }
}

export function scoreDataConfidence(agentName) {
  const now = Date.now();
  const factors = [];

  if (worldState.freshness.budget !== 0) {
    const budgetAge = now - (worldState.freshness.budget || 0);
    factors.push({ name: 'budget', score: Math.max(0, 1 - budgetAge / (10 * 60 * 1000)), weight: agentName === 'budget' ? 3 : 1 });
  }

  if (worldState.freshness.vendors !== 0) {
    const vendorAge = now - (worldState.freshness.vendors || 0);
    factors.push({ name: 'vendor_reputation', score: Math.max(0, 1 - vendorAge / (10 * 60 * 1000)), weight: agentName === 'sourcing' ? 3 : 1 });
  }

  if (worldState.freshness.tasks !== 0) {
    const taskAge = now - (worldState.freshness.tasks || 0);
    factors.push({ name: 'task_schedule', score: Math.max(0, 1 - taskAge / (10 * 60 * 1000)), weight: agentName === 'scheduler' ? 3 : 1 });
  }

  if (worldState.freshness.mandates !== 0) {
    const mandateAge = now - (worldState.freshness.mandates || 0);
    factors.push({ name: 'mandate_status', score: Math.max(0, 1 - mandateAge / (5 * 60 * 1000)), weight: agentName === 'verification' ? 3 : 1 });
  }

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const weightedScore = totalWeight > 0 ? factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight : 1.0;

  return {
    score: Math.round(weightedScore * 100) / 100,
    level: weightedScore >= 0.7 ? 'high' : weightedScore >= 0.4 ? 'medium' : 'low',
    factors,
    stale_sources: factors.filter((f) => f.score < 0.3).map((f) => f.name),
  };
}

export function scoreActionConfidence(agentResponse) {
  let score = 0.7;

  const hedgeWords = ['maybe', 'possibly', 'uncertain', 'might', 'could be', 'not sure', 'unclear'];
  const speech = (agentResponse.speech || '').toLowerCase();
  const hedgeCount = hedgeWords.filter((w) => speech.includes(w)).length;
  score -= hedgeCount * 0.1;

  const strongWords = ['recommend', 'must', 'critical', 'immediately', 'confirmed', 'verified'];
  const strongCount = strongWords.filter((w) => speech.includes(w)).length;
  score += strongCount * 0.05;

  if (agentResponse.toolResults?.length > 0) {
    const successRate = agentResponse.toolResults.filter((r) => r.success !== false).length / agentResponse.toolResults.length;
    score = score * 0.6 + successRate * 0.4;
  }

  if (agentResponse.toolResults?.some((r) => r.blocked_by_conflict)) {
    score *= 0.4;
  }

  score = Math.max(0, Math.min(1, score));

  return {
    score: Math.round(score * 100) / 100,
    level: score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low',
    hedge_count: hedgeCount,
  };
}

export function getCompositeConfidence(routingConf, dataConf, actionConf) {
  const composite = routingConf.score * 0.3 + dataConf.score * 0.3 + actionConf.score * 0.4;

  return {
    score: Math.round(composite * 100) / 100,
    level: composite >= 0.75 ? 'high' : composite >= 0.45 ? 'medium' : 'low',
    breakdown: { routing: routingConf, data: dataConf, action: actionConf },
    recommendation: composite < 0.45
      ? 'Principal review recommended — confidence is low'
      : composite < 0.75
        ? 'Proceeding with moderate confidence'
        : 'High confidence — Auto-executing',
  };
}

const confidenceHistory = [];

export function recordConfidence(agentName, composite) {
  confidenceHistory.push({ agent: agentName, timestamp: Date.now(), ...composite });
  if (confidenceHistory.length > 50) confidenceHistory.shift();
  return confidenceHistory[confidenceHistory.length - 1];
}

export function getConfidenceHistory(agentName) {
  return agentName ? confidenceHistory.filter((c) => c.agent === agentName) : confidenceHistory;
}
