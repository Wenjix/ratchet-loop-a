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

const FRESHNESS_SOURCES = [
  { name: 'budget', key: 'budget', maxAgeMs: 10 * 60 * 1000 },
  { name: 'vendor_reputation', key: 'vendors', maxAgeMs: 10 * 60 * 1000 },
  { name: 'task_schedule', key: 'tasks', maxAgeMs: 10 * 60 * 1000 },
  { name: 'mandate_status', key: 'mandates', maxAgeMs: 5 * 60 * 1000 },
];

const PRIMARY_FRESHNESS_KEY = {
  budget: 'budget',
  sourcing: 'vendors',
  scheduler: 'tasks',
  verification: 'mandates',
};

export function scoreDataConfidence(agentName) {
  const now = Date.now();
  const primaryKey = PRIMARY_FRESHNESS_KEY[agentName];
  const factors = [];

  // A source's freshness timestamp defaults to 0 (never touched, see world-state.js).
  // The queried agent's own primary source is always scored — 0 correctly reads as
  // maximally stale, so an agent whose own domain has never been touched gets a low
  // score rather than being silently excluded. Other agents' sources are only scored
  // once they've actually been touched — it's expected they haven't been yet, and
  // that shouldn't be read as staleness.
  for (const source of FRESHNESS_SOURCES) {
    const isPrimary = source.key === primaryKey;
    const timestamp = worldState.freshness[source.key];
    if (timestamp === 0 && !isPrimary) continue;
    const age = now - timestamp;
    factors.push({ name: source.name, score: Math.max(0, 1 - age / source.maxAgeMs), weight: isPrimary ? 3 : 1 });
  }

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const weightedScore = totalWeight > 0 ? factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight : 0.5;

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
