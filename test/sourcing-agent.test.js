// test/sourcing-agent.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { worldState } from '../src/core/world-state.js';
import { registerVendor } from '../src/coordination/vendor-registry.js';
import { getOrCreateDecisionClass, acceptProposal, recordOutcome } from '../src/loop-a/loop-a-engine.js';
import { buildDecisionClassKey } from '../src/loop-a/decision-class.js';
import { executeSourcingTool } from '../src/agents/sourcing-agent.js';

test('get_vendor_quotes returns vendors filtered by task_type', () => {
  worldState.vendors.registry = [];
  registerVendor({ id: 'greenblade', name: 'GreenBlade Lawn Care', task_type: 'lawn_mowing', price_range: [40, 65] });
  const result = executeSourcingTool('get_vendor_quotes', { task_type: 'lawn_mowing' });
  assert.equal(result.vendors.length, 1);
  assert.equal(result.vendors[0].vendor_id, 'greenblade');
});

test('commit_mandate escalates (auto_approved false) when no standing policy exists', () => {
  worldState.mandates = [];
  const result = executeSourcingTool('commit_mandate', { task_id: 't1', task_type: 'lawn_mowing', vendor_id: 'greenblade', amount: 55, scope: 'weekly mow' });
  assert.equal(result.success, true);
  assert.equal(result.auto_approved, false);
  const mandate = worldState.mandates.find((m) => m.id === result.mandate_id);
  assert.equal(mandate.status, 'pending_approval');
});

test('commit_mandate auto-approves and opens escrow once a policy covers the amount', () => {
  const key = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'greenblade', task_type: 'lawn_mowing', amount: 55 });
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  for (const [i, amount] of [50, 55, 52].entries()) {
    recordOutcome(key, { mandateId: `seed${i}`, amount, outcome: 'approved-clean' });
  }
  acceptProposal(key);

  const result = executeSourcingTool('commit_mandate', { task_id: 't2', task_type: 'lawn_mowing', vendor_id: 'greenblade', amount: 55, scope: 'weekly mow' });
  assert.equal(result.auto_approved, true);
  const mandate = worldState.mandates.find((m) => m.id === result.mandate_id);
  assert.equal(mandate.status, 'committed');
});
