import test from 'node:test';
import assert from 'node:assert/strict';
import { worldState } from '../src/core/world-state.js';
import { scoreRoutingConfidence, scoreDataConfidence, scoreActionConfidence, getCompositeConfidence } from '../src/core/confidence-engine.js';

test('scoreRoutingConfidence scores explicit agent address highest', () => {
  const r = scoreRoutingConfidence('sourcing, get a quote for lawn care', { name: 'sourcing', confidence: 'explicit' });
  assert.equal(r.level, 'high');
  assert.ok(r.score >= 0.9);
});

test('scoreRoutingConfidence penalizes a keyword tie between two agents', () => {
  const r = scoreRoutingConfidence('renew and schedule the vendor budget', { name: 'budget', confidence: 'keyword' });
  assert.ok(r.score < 0.65);
});

test('scoreDataConfidence returns high when the relevant freshness timestamp is recent', () => {
  worldState.freshness.vendors = Date.now();
  const d = scoreDataConfidence('sourcing');
  assert.equal(d.level, 'high');
});

test('scoreDataConfidence returns low when the relevant freshness timestamp is stale', () => {
  worldState.freshness.vendors = Date.now() - 20 * 60 * 1000;
  const d = scoreDataConfidence('sourcing');
  assert.ok(d.stale_sources.includes('vendor_reputation'));
});

test('scoreActionConfidence lowers score for hedging language and blocked conflicts', () => {
  const hedged = scoreActionConfidence({ speech: 'maybe this could be uncertain', toolResults: [] });
  const blocked = scoreActionConfidence({ speech: 'confirmed', toolResults: [{ success: false, blocked_by_conflict: true }] });
  assert.ok(hedged.score < 0.7);
  assert.ok(blocked.score < 0.5);
});

test('getCompositeConfidence blends routing/data/action with documented weights', () => {
  const composite = getCompositeConfidence({ score: 1 }, { score: 1 }, { score: 1 });
  assert.equal(composite.score, 1);
  assert.equal(composite.level, 'high');
  assert.match(composite.recommendation, /Auto-executing/);
});
