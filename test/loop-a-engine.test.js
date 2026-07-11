import test from 'node:test';
import assert from 'node:assert/strict';
import { getOrCreateDecisionClass, checkPolicy } from '../src/loop-a/loop-a-engine.js';

test('getOrCreateDecisionClass creates a class defaulting to escalate with no policy', () => {
  const dc = getOrCreateDecisionClass('sourcing:commit_mandate:greenblade:lawn_mowing:0-75', { ceiling: 'auto' });
  assert.equal(dc.status, 'escalate');
  assert.equal(dc.streak, 0);
  assert.equal(dc.policy, null);
});

test('getOrCreateDecisionClass returns the same instance on repeat calls', () => {
  const a = getOrCreateDecisionClass('sourcing:commit_mandate:freshcart:grocery_restock:75-175', { ceiling: 'auto' });
  const b = getOrCreateDecisionClass('sourcing:commit_mandate:freshcart:grocery_restock:75-175');
  assert.equal(a, b);
});

test('checkPolicy on a class with no policy always requires escalation', () => {
  getOrCreateDecisionClass('sourcing:commit_mandate:quickfix:plumbing_repair:175-450', { ceiling: 'escalate' });
  const result = checkPolicy('sourcing:commit_mandate:quickfix:plumbing_repair:175-450', 200);
  assert.equal(result.autoApprove, false);
});

test('checkPolicy on an unknown key escalates rather than throwing', () => {
  const result = checkPolicy('never:seen:key:x:0-75', 10);
  assert.equal(result.autoApprove, false);
  assert.match(result.reason, /no decision class on file/);
});
