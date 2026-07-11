import test from 'node:test';
import assert from 'node:assert/strict';
import { getOrCreateDecisionClass, checkPolicy, recordOutcome, acceptProposal, rejectProposal, getPolicyLedger } from '../src/loop-a/loop-a-engine.js';

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

test('recordOutcome increments streak on approved-clean and proposes at threshold 3', () => {
  const key = 'sourcing:commit_mandate:greenblade:lawn_mowing:0-75';
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  let dc = recordOutcome(key, { mandateId: 'm1', amount: 45, outcome: 'approved-clean' });
  assert.equal(dc.streak, 1);
  assert.equal(dc.pendingProposal, null);
  dc = recordOutcome(key, { mandateId: 'm2', amount: 50, outcome: 'approved-clean' });
  assert.equal(dc.streak, 2);
  assert.equal(dc.pendingProposal, null);
  dc = recordOutcome(key, { mandateId: 'm3', amount: 55, outcome: 'approved-clean' });
  assert.equal(dc.streak, 3);
  assert.ok(dc.pendingProposal);
  assert.equal(dc.pendingProposal.cap, 60.5);
  assert.deepEqual(dc.pendingProposal.basis, ['m1', 'm2', 'm3']);
});

test('acceptProposal creates a policy, sets status to auto, and clears the proposal', () => {
  const key = 'sourcing:commit_mandate:greenblade:lawn_mowing:0-75';
  const policy = acceptProposal(key);
  assert.match(policy.id, /^POLICY-\d{3}$/);
  assert.equal(policy.cap, 60.5);
  assert.equal(policy.revoked, false);
  const dc = getOrCreateDecisionClass(key);
  assert.equal(dc.status, 'auto');
  assert.equal(dc.pendingProposal, null);
});

test('checkPolicy now auto-approves amounts within the accepted cap and escalates above it', () => {
  const key = 'sourcing:commit_mandate:greenblade:lawn_mowing:0-75';
  assert.equal(checkPolicy(key, 58).autoApprove, true);
  assert.equal(checkPolicy(key, 65).autoApprove, false);
});

test('acceptProposal with an explicit cap marks the policy human-edited', () => {
  const key = 'sourcing:commit_mandate:freshcart:grocery_restock:75-175';
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  for (const [i, amount] of [90, 100, 95].entries()) {
    recordOutcome(key, { mandateId: `g${i}`, amount, outcome: 'approved-clean' });
  }
  const policy = acceptProposal(key, { cap: 120, humanEdited: true });
  assert.equal(policy.cap, 120);
  assert.equal(policy.humanEdited, true);
});

test('a decision class pinned at ceiling escalate never proposes regardless of streak', () => {
  const key = 'sourcing:commit_mandate:quickfix:plumbing_repair:175-450';
  getOrCreateDecisionClass(key, { ceiling: 'escalate' });
  let dc;
  for (const [i, amount] of [200, 220, 210, 250, 230].entries()) {
    dc = recordOutcome(key, { mandateId: `p${i}`, amount, outcome: 'approved-clean' });
  }
  assert.equal(dc.streak, 5);
  assert.equal(dc.pendingProposal, null);
  assert.equal(dc.status, 'escalate');
});

test('a verified-bad outcome revokes an active policy and starts the cooldown', () => {
  const key = 'sourcing:commit_mandate:parkview:hvac_service:75-175';
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  for (const [i, amount] of [90, 100, 95].entries()) {
    recordOutcome(key, { mandateId: `f${i}`, amount, outcome: 'approved-clean' });
  }
  const policy = acceptProposal(key);
  assert.equal(policy.revoked, false);

  const dc = recordOutcome(key, { mandateId: 'f-bad', amount: 105, outcome: 'approved-then-failed' });
  assert.equal(dc.status, 'escalate');
  assert.equal(dc.streak, 0);
  assert.equal(dc.cooldownRemaining, 2);
  assert.equal(dc.policy.revoked, true);
  assert.ok(dc.policy.revokedAt);
});

test('checkPolicy escalates again once a policy is revoked', () => {
  const key = 'sourcing:commit_mandate:parkview:hvac_service:75-175';
  assert.equal(checkPolicy(key, 90).autoApprove, false);
});

test('cooldown absorbs clean outcomes before streak resumes, then re-crystallizes', () => {
  const key = 'sourcing:commit_mandate:parkview:hvac_service:75-175';
  let dc = recordOutcome(key, { mandateId: 'f-cool1', amount: 90, outcome: 'approved-clean' });
  assert.equal(dc.cooldownRemaining, 1);
  assert.equal(dc.streak, 0);
  dc = recordOutcome(key, { mandateId: 'f-cool2', amount: 90, outcome: 'approved-clean' });
  assert.equal(dc.cooldownRemaining, 0);
  assert.equal(dc.streak, 0);
  dc = recordOutcome(key, { mandateId: 'f-cool3', amount: 90, outcome: 'approved-clean' });
  assert.equal(dc.streak, 1);
  recordOutcome(key, { mandateId: 'f-cool4', amount: 95, outcome: 'approved-clean' });
  dc = recordOutcome(key, { mandateId: 'f-cool5', amount: 92, outcome: 'approved-clean' });
  assert.equal(dc.streak, 3);
  assert.ok(dc.pendingProposal);
});

test('rejectProposal clears the pending proposal and resets streak', () => {
  const key = 'sourcing:commit_mandate:parkview:hvac_service:75-175';
  const dc = rejectProposal(key);
  assert.equal(dc.pendingProposal, null);
  assert.equal(dc.streak, 0);
});

test('getPolicyLedger lists classes with a policy or pending proposal', () => {
  const ledger = getPolicyLedger();
  const greenblade = ledger.find((e) => e.key === 'sourcing:commit_mandate:greenblade:lawn_mowing:0-75');
  assert.ok(greenblade);
  assert.equal(greenblade.policy.id, 'POLICY-001');
});
