import test from 'node:test';
import assert from 'node:assert/strict';
import { getOrCreateDecisionClass, checkPolicy, recordOutcome, acceptProposal, rejectProposal, getPolicyLedger, getAllDecisionClasses, resetDecisionClasses } from '../src/loop-a/loop-a-engine.js';

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
  const key = 'sourcing:commit_mandate:acceptcheck:lawn_mowing:0-75';
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  recordOutcome(key, { mandateId: 'ac1', amount: 45, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'ac2', amount: 50, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'ac3', amount: 55, outcome: 'approved-clean' });
  const policy = acceptProposal(key);
  assert.match(policy.id, /^POLICY-\d{3}$/);
  assert.equal(policy.cap, 60.5);
  assert.equal(policy.revoked, false);
  const dc = getOrCreateDecisionClass(key);
  assert.equal(dc.status, 'auto');
  assert.equal(dc.pendingProposal, null);
});

test('checkPolicy now auto-approves amounts within the accepted cap and escalates above it', () => {
  const key = 'sourcing:commit_mandate:capauto:lawn_mowing:0-75';
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  recordOutcome(key, { mandateId: 'ca1', amount: 45, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'ca2', amount: 50, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'ca3', amount: 55, outcome: 'approved-clean' });
  acceptProposal(key);
  assert.equal(checkPolicy(key, 58).autoApprove, true);
  assert.equal(checkPolicy(key, 65).autoApprove, false);
});

test('checkPolicy auto-approves an amount exactly equal to the policy cap', () => {
  const key = 'sourcing:commit_mandate:capbound:lawn_mowing:0-75';
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  recordOutcome(key, { mandateId: 'cb1', amount: 45, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'cb2', amount: 50, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'cb3', amount: 55, outcome: 'approved-clean' });
  const policy = acceptProposal(key);
  assert.equal(checkPolicy(key, policy.cap).autoApprove, true);
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
  const key = 'sourcing:commit_mandate:deratchettest:grocery_restock:75-175';
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  recordOutcome(key, { mandateId: 'dr1', amount: 90, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'dr2', amount: 100, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'dr3', amount: 95, outcome: 'approved-clean' });
  acceptProposal(key);
  const dc = recordOutcome(key, { mandateId: 'dr-bad', amount: 105, outcome: 'approved-then-failed' });
  assert.equal(dc.status, 'escalate');
  assert.equal(dc.streak, 0);
  assert.equal(dc.cooldownRemaining, 2);
  assert.equal(dc.policy.revoked, true);
  assert.ok(dc.policy.revokedAt);
});

test('an overridden outcome de-ratchets an active policy and starts the cooldown', () => {
  const key = 'sourcing:commit_mandate:overriddentest:grocery_restock:75-175';
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  recordOutcome(key, { mandateId: 'ov1', amount: 90, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'ov2', amount: 100, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'ov3', amount: 95, outcome: 'approved-clean' });
  acceptProposal(key);
  const dc = recordOutcome(key, { mandateId: 'ov-bad', amount: 105, outcome: 'overridden' });
  assert.equal(dc.status, 'escalate');
  assert.equal(dc.streak, 0);
  assert.equal(dc.cooldownRemaining, 2);
  assert.equal(dc.policy.revoked, true);
  assert.ok(dc.policy.revokedAt);
});

test('checkPolicy escalates again once a policy is revoked', () => {
  const key = 'sourcing:commit_mandate:revokedcheck:grocery_restock:75-175';
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  recordOutcome(key, { mandateId: 'rv1', amount: 90, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'rv2', amount: 100, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'rv3', amount: 95, outcome: 'approved-clean' });
  acceptProposal(key);
  recordOutcome(key, { mandateId: 'rv-bad', amount: 105, outcome: 'approved-then-failed' });
  assert.equal(checkPolicy(key, 90).autoApprove, false);
});

test('cooldown absorbs clean outcomes before streak resumes, then re-crystallizes', () => {
  const key = 'sourcing:commit_mandate:cooldowntest:grocery_restock:75-175';
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  recordOutcome(key, { mandateId: 'cd1', amount: 90, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'cd2', amount: 100, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'cd3', amount: 95, outcome: 'approved-clean' });
  acceptProposal(key);
  recordOutcome(key, { mandateId: 'cd-bad', amount: 105, outcome: 'approved-then-failed' });

  let dc = recordOutcome(key, { mandateId: 'cd-cool1', amount: 90, outcome: 'approved-clean' });
  assert.equal(dc.cooldownRemaining, 1);
  assert.equal(dc.streak, 0);
  dc = recordOutcome(key, { mandateId: 'cd-cool2', amount: 90, outcome: 'approved-clean' });
  assert.equal(dc.cooldownRemaining, 0);
  assert.equal(dc.streak, 0);
  dc = recordOutcome(key, { mandateId: 'cd-cool3', amount: 90, outcome: 'approved-clean' });
  assert.equal(dc.streak, 1);
  recordOutcome(key, { mandateId: 'cd-cool4', amount: 95, outcome: 'approved-clean' });
  dc = recordOutcome(key, { mandateId: 'cd-cool5', amount: 92, outcome: 'approved-clean' });
  assert.equal(dc.streak, 3);
  assert.ok(dc.pendingProposal);
});

test('rejectProposal clears the pending proposal and resets streak', () => {
  const key = 'sourcing:commit_mandate:rejecttest:lawn_mowing:0-75';
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  recordOutcome(key, { mandateId: 'rj1', amount: 40, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'rj2', amount: 42, outcome: 'approved-clean' });
  const dcBefore = recordOutcome(key, { mandateId: 'rj3', amount: 44, outcome: 'approved-clean' });
  assert.ok(dcBefore.pendingProposal);

  const dc = rejectProposal(key);
  assert.equal(dc.pendingProposal, null);
  assert.equal(dc.streak, 0);
});

test('getPolicyLedger lists classes with a policy or pending proposal', () => {
  resetDecisionClasses();
  const key = 'sourcing:commit_mandate:ledgertest:lawn_mowing:0-75';
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  recordOutcome(key, { mandateId: 'lg1', amount: 45, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'lg2', amount: 50, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'lg3', amount: 55, outcome: 'approved-clean' });
  acceptProposal(key);

  const ledger = getPolicyLedger();
  const entry = ledger.find((e) => e.key === key);
  assert.ok(entry);
  assert.equal(entry.policy.id, 'POLICY-001');
});

test('resetDecisionClasses clears all decision classes and resets the policy counter', () => {
  const key = 'sourcing:commit_mandate:resettest:lawn_mowing:0-75';
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  recordOutcome(key, { mandateId: 'r1', amount: 40, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'r2', amount: 42, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'r3', amount: 44, outcome: 'approved-clean' });
  assert.ok(getAllDecisionClasses().length > 0);

  resetDecisionClasses();
  assert.deepEqual(getAllDecisionClasses(), []);

  const fresh = getOrCreateDecisionClass(key, { ceiling: 'auto' });
  assert.equal(fresh.status, 'escalate');
  assert.equal(fresh.streak, 0);
  assert.equal(fresh.pendingProposal, null);
  assert.equal(fresh.policy, null);

  recordOutcome(key, { mandateId: 'r4', amount: 40, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'r5', amount: 42, outcome: 'approved-clean' });
  const dc = recordOutcome(key, { mandateId: 'r6', amount: 44, outcome: 'approved-clean' });
  assert.ok(dc.pendingProposal);

  const policy = acceptProposal(key);
  assert.equal(policy.id, 'POLICY-001');
});

test('acceptProposal rejects a non-numeric cap and does not mutate the policy', () => {
  const key = 'sourcing:commit_mandate:capcheck:lawn_mowing:0-75';
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  recordOutcome(key, { mandateId: 'cc1', amount: 40, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'cc2', amount: 42, outcome: 'approved-clean' });
  const dc = recordOutcome(key, { mandateId: 'cc3', amount: 44, outcome: 'approved-clean' });
  assert.ok(dc.pendingProposal);

  assert.throws(() => acceptProposal(key, { cap: 'not-a-number' }));
  const afterInvalid = getOrCreateDecisionClass(key);
  assert.equal(afterInvalid.policy, null);
  assert.ok(afterInvalid.pendingProposal, 'proposal should remain pending after a rejected accept');

  assert.throws(() => acceptProposal(key, { cap: NaN }));
  assert.equal(getOrCreateDecisionClass(key).policy, null);
});

test('checkPolicy escalates on a non-finite amount instead of auto-approving', () => {
  const key = 'sourcing:commit_mandate:nancheck:lawn_mowing:0-75';
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  recordOutcome(key, { mandateId: 'nc1', amount: 40, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'nc2', amount: 42, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'nc3', amount: 44, outcome: 'approved-clean' });
  acceptProposal(key);

  assert.equal(checkPolicy(key, NaN).autoApprove, false);
  assert.equal(checkPolicy(key, undefined).autoApprove, false);
  assert.equal(checkPolicy(key, 'not-a-number').autoApprove, false);
  assert.equal(checkPolicy(key, 40).autoApprove, true);
});

test('a rejected outcome interleaved with clean approvals does not appear in the crystallization basis', () => {
  const key = 'sourcing:commit_mandate:rejectcheck:lawn_mowing:0-75';
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  recordOutcome(key, { mandateId: 'rc1', amount: 40, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'rc2', amount: 42, outcome: 'approved-clean' });
  recordOutcome(key, { mandateId: 'rc-bad', amount: 999, outcome: 'rejected' });
  const dc = recordOutcome(key, { mandateId: 'rc3', amount: 44, outcome: 'approved-clean' });

  assert.ok(dc.pendingProposal);
  assert.deepEqual(dc.pendingProposal.basis, ['rc1', 'rc2', 'rc3']);
  assert.equal(dc.pendingProposal.cap, 48.4);
});
