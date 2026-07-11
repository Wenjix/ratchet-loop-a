// test/verification-agent.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { worldState, pushMandate, updateMandateStatus } from '../src/core/world-state.js';
import { registerVendor, getVendor } from '../src/coordination/vendor-registry.js';
import { openEscrow, getEscrowEntry } from '../src/coordination/escrow-ledger.js';
import { getOrCreateDecisionClass } from '../src/loop-a/loop-a-engine.js';
import { buildDecisionClassKey } from '../src/loop-a/decision-class.js';
import { executeVerificationTool } from '../src/agents/verification-agent.js';

test('verify_completion good releases escrow, settles the mandate, and raises reputation', () => {
  worldState.vendors.registry = [];
  registerVendor({ id: 'freshcart', name: 'FreshCart Grocery', task_type: 'grocery_restock', price_range: [80, 150], reputation: 0.7 });
  const key = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'freshcart', task_type: 'grocery_restock', amount: 90 });
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  const mandate = pushMandate({ id: 'm-good', task_id: 't1', task_type: 'grocery_restock', vendor_id: 'freshcart', amount: 90, scope: 'weekly groceries', decisionClassKey: key });
  updateMandateStatus(mandate.id, 'committed');
  openEscrow(mandate.id, 90);

  const result = executeVerificationTool('verify_completion', { mandate_id: mandate.id, attestation: { self_reported_ok: true, notes: 'all items delivered' } });
  assert.equal(result.verified, 'good');
  assert.equal(worldState.mandates.find((m) => m.id === mandate.id).status, 'settled');
  assert.equal(getEscrowEntry(mandate.id).status, 'released');
  assert.equal(getVendor('freshcart').reputation, 0.75);
});

test('verify_completion bad refunds escrow, disputes the mandate, and lowers reputation', () => {
  const key = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'freshcart', task_type: 'grocery_restock', amount: 95 });
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  const mandate = pushMandate({ id: 'm-bad', task_id: 't2', task_type: 'grocery_restock', vendor_id: 'freshcart', amount: 95, scope: 'weekly groceries', decisionClassKey: key });
  updateMandateStatus(mandate.id, 'committed');
  openEscrow(mandate.id, 95);

  const result = executeVerificationTool('verify_completion', { mandate_id: mandate.id, attestation: { self_reported_ok: false, notes: 'missing three items' } });
  assert.equal(result.verified, 'bad');
  assert.equal(worldState.mandates.find((m) => m.id === mandate.id).status, 'disputed');
  assert.equal(getEscrowEntry(mandate.id).status, 'refunded');
  assert.equal(getVendor('freshcart').reputation, 0.6);
});

test('verify_completion fails cleanly for an unknown mandate', () => {
  const result = executeVerificationTool('verify_completion', { mandate_id: 'nope', attestation: { self_reported_ok: true } });
  assert.equal(result.success, false);
});

test('verify_completion returns a structured error instead of throwing when a committed mandate has no escrow entry', () => {
  // Deviation from the brief (documented in task-15-report.md): a mandate that is 'committed'
  // but has no escrow entry (e.g. openEscrow was never called for it, bypassing the normal
  // approve flow) would, under the brief's literal code, crash uncaught inside
  // releaseEscrow/refundEscrow (escrow-ledger.js throws "No escrow entry for mandate ...").
  // This mirrors the exact bug shape fixed in Task 14 (record_spend/complete_task_cycle) and is
  // fixed here the same way: wrap the mutation block in try/catch and return a structured error.
  const key = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'freshcart', task_type: 'grocery_restock', amount: 100 });
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  const mandate = pushMandate({ id: 'm-no-escrow', task_id: 't3', task_type: 'grocery_restock', vendor_id: 'freshcart', amount: 100, scope: 'weekly groceries', decisionClassKey: key });
  updateMandateStatus(mandate.id, 'committed');
  // Deliberately no openEscrow(mandate.id, ...) call — this mandate has no escrow entry.

  const result = executeVerificationTool('verify_completion', { mandate_id: mandate.id, attestation: { self_reported_ok: true } });
  assert.equal(result.success, false);
  assert.match(result.error, /No escrow entry/);
});

test('verify_completion does not flip mandate status when the escrow call fails', () => {
  const key = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'freshcart', task_type: 'grocery_restock', amount: 100 });
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  const mandate = pushMandate({ id: 'm-status-guard', task_id: 't-status-guard', task_type: 'grocery_restock', vendor_id: 'freshcart', amount: 100, scope: 'weekly groceries', decisionClassKey: key });
  updateMandateStatus(mandate.id, 'committed');
  // Deliberately no openEscrow(mandate.id, ...) call — this mandate has no escrow entry.

  const result = executeVerificationTool('verify_completion', { mandate_id: mandate.id, attestation: { self_reported_ok: true, notes: 'looks fine' } });
  assert.equal(result.success, false);
  assert.equal(worldState.mandates.find((m) => m.id === mandate.id).status, 'committed');
});

test('verify_completion rejects a mandate that is not committed (idempotency guard)', () => {
  const key = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'freshcart', task_type: 'grocery_restock', amount: 100 });
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  const mandate = pushMandate({ id: 'm-not-committed', task_id: 't-not-committed', task_type: 'grocery_restock', vendor_id: 'freshcart', amount: 100, scope: 'weekly groceries', decisionClassKey: key });
  // Left at the default 'pending_approval' status — never committed.

  const result = executeVerificationTool('verify_completion', { mandate_id: mandate.id, attestation: { self_reported_ok: true, notes: 'looks fine' } });
  assert.equal(result.success, false);
  assert.match(result.error, /not committed/);
  assert.equal(worldState.mandates.find((m) => m.id === mandate.id).status, 'pending_approval');
});

test('verify_completion called twice does not double-release escrow or double-apply reputation (idempotency guard)', () => {
  worldState.vendors.registry = [];
  registerVendor({ id: 'freshcart', name: 'FreshCart Grocery', task_type: 'grocery_restock', price_range: [80, 150], reputation: 0.7 });
  const key = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'freshcart', task_type: 'grocery_restock', amount: 90 });
  getOrCreateDecisionClass(key, { ceiling: 'auto' });
  const mandate = pushMandate({ id: 'm-idempotent', task_id: 't-idempotent', task_type: 'grocery_restock', vendor_id: 'freshcart', amount: 90, scope: 'weekly groceries', decisionClassKey: key });
  updateMandateStatus(mandate.id, 'committed');
  openEscrow(mandate.id, 90);

  const first = executeVerificationTool('verify_completion', { mandate_id: mandate.id, attestation: { self_reported_ok: true, notes: 'all items delivered' } });
  assert.equal(first.success, true);
  assert.equal(getVendor('freshcart').reputation, 0.75);

  const second = executeVerificationTool('verify_completion', { mandate_id: mandate.id, attestation: { self_reported_ok: true, notes: 'all items delivered' } });
  assert.equal(second.success, false);
  assert.match(second.error, /not committed/);
  // Reputation must not have been bumped a second time, and the escrow entry must still
  // be in its single 'released' state (not re-released).
  assert.equal(getVendor('freshcart').reputation, 0.75);
  assert.equal(getEscrowEntry(mandate.id).status, 'released');
});
