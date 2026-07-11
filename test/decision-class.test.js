import test from 'node:test';
import assert from 'node:assert/strict';
import { amountBand, buildDecisionClassKey, CEILING_BY_TASK_TYPE } from '../src/loop-a/decision-class.js';

test('amountBand groups GreenBlade full lawn_mowing price range into one band', () => {
  assert.equal(amountBand('lawn_mowing', 40), amountBand('lawn_mowing', 65));
});

test('amountBand groups FreshCart full grocery_restock price range into one band', () => {
  assert.equal(amountBand('grocery_restock', 80), amountBand('grocery_restock', 150));
});

test('amountBand groups QuickFix full plumbing_repair price range into one band', () => {
  assert.equal(amountBand('plumbing_repair', 150), amountBand('plumbing_repair', 400));
});

test('amountBand differs across task types even at overlapping raw amounts', () => {
  assert.notEqual(amountBand('lawn_mowing', 65), amountBand('grocery_restock', 80));
});

test('amountBand throws on an unconfigured task type', () => {
  assert.throws(() => amountBand('unknown_task', 10), /Unknown task type/);
});

test('buildDecisionClassKey is stable across amounts within the same band', () => {
  const a = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'greenblade', task_type: 'lawn_mowing', amount: 40 });
  const b = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'greenblade', task_type: 'lawn_mowing', amount: 65 });
  assert.equal(a, b);
});

test('buildDecisionClassKey differs across counterparties', () => {
  const greenblade = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'greenblade', task_type: 'lawn_mowing', amount: 50 });
  const otherVendor = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'other-lawn-co', task_type: 'lawn_mowing', amount: 50 });
  assert.notEqual(greenblade, otherVendor);
});

test('CEILING_BY_TASK_TYPE matches the fixed demo roster', () => {
  assert.equal(CEILING_BY_TASK_TYPE.lawn_mowing, 'auto');
  assert.equal(CEILING_BY_TASK_TYPE.grocery_restock, 'auto');
  assert.equal(CEILING_BY_TASK_TYPE.plumbing_repair, 'escalate');
});
