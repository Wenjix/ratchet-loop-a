// test/scenario-driver.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPolicyLedger, getDecisionClass } from '../src/loop-a/loop-a-engine.js';
import { buildDecisionClassKey } from '../src/loop-a/decision-class.js';
import { runScenario } from '../src/scenario/scenario-driver.js';

test('the full 9-cycle seeded scenario demonstrates all three Loop A arcs', async () => {
  const events = [];
  await runScenario({ onEvent: (e) => events.push(e) });

  const lawnKey = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'greenblade', task_type: 'lawn_mowing', amount: 50 });
  const groceryKey = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'freshcart', task_type: 'grocery_restock', amount: 90 });
  const plumbingKey = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'quickfix', task_type: 'plumbing_repair', amount: 200 });

  const lawn = getDecisionClass(lawnKey);
  assert.equal(lawn.status, 'auto');
  assert.ok(lawn.policy);
  assert.equal(lawn.policy.revoked, false);

  const grocery = getDecisionClass(groceryKey);
  assert.equal(grocery.status, 'auto');
  assert.ok(grocery.policy);
  assert.equal(grocery.policy.revoked, false);
  assert.equal(grocery.policy.id, 'POLICY-003');

  const plumbing = getDecisionClass(plumbingKey);
  assert.equal(plumbing.status, 'escalate');
  assert.equal(plumbing.policy, null);
  assert.equal(plumbing.streak, 9);

  const badVerification = events.find((e) => e.type === 'job_verified' && e.verified === 'bad');
  assert.ok(badVerification);

  const acceptedPolicies = events.filter((e) => e.type === 'policy_decision' && e.decision === 'accept').length;
  assert.equal(acceptedPolicies, 3);
});

test('the Policy Ledger lists FreshCart with a non-empty history basis after re-crystallization', () => {
  const ledger = getPolicyLedger();
  const grocery = ledger.find((e) => e.key.includes('freshcart'));
  assert.ok(grocery.policy.basis.length > 0);
});
