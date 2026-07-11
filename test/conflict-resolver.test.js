import test from 'node:test';
import assert from 'node:assert/strict';
import { worldState } from '../src/core/world-state.js';
import { detectConflicts, resolveConflict, getUnresolvedConflicts, getConflictStats } from '../src/core/conflict-resolver.js';

test('detectConflicts flags a critical budget-cap breach', () => {
  worldState.budget.categories.lawn_care = { cap_per_month: 100, spent_this_month: 80 };
  worldState.mandates = [];
  const conflicts = detectConflicts('sourcing', 'commit_mandate', { category: 'lawn_care', amount: 30, vendor_id: 'greenblade', task_id: 't1', task_type: 'lawn_mowing' });
  const budgetConflict = conflicts.find((c) => c.type === 'budget-cap-breach');
  assert.equal(budgetConflict.severity, 'critical');
});

test('detectConflicts flags a warning when a vendor already has an active mandate', () => {
  worldState.budget.categories.grocery = { cap_per_month: 500, spent_this_month: 0 };
  worldState.mandates = [{ id: 'm0', vendor_id: 'freshcart', status: 'committed' }];
  const conflicts = detectConflicts('sourcing', 'commit_mandate', { category: 'grocery', amount: 90, vendor_id: 'freshcart', task_id: 't2', task_type: 'grocery_restock' });
  const vendorConflict = conflicts.find((c) => c.type === 'vendor-contention');
  assert.equal(vendorConflict.severity, 'warning');
});

test('detectConflicts flags a warning for a duplicate mandate on the same task instance', () => {
  worldState.budget.categories.plumbing = { cap_per_month: 1000, spent_this_month: 0 };
  worldState.mandates = [{ id: 'm0', task_id: 't3', vendor_id: 'quickfix', status: 'pending_approval' }];
  const conflicts = detectConflicts('sourcing', 'commit_mandate', { category: 'plumbing', amount: 200, vendor_id: 'quickfix', task_id: 't3', task_type: 'plumbing_repair' });
  const dupeConflict = conflicts.find((c) => c.type === 'duplicate-task-mandate');
  assert.equal(dupeConflict.severity, 'warning');
});

test('detectConflicts flags an advisory when the vendor has an unresolved dispute', () => {
  worldState.budget.categories.lawn_care = { cap_per_month: 500, spent_this_month: 0 };
  worldState.mandates = [{ id: 'm0', task_id: 'old', vendor_id: 'greenblade', status: 'disputed' }];
  const conflicts = detectConflicts('sourcing', 'commit_mandate', { category: 'lawn_care', amount: 50, vendor_id: 'greenblade', task_id: 't4', task_type: 'lawn_mowing' });
  const disputeConflict = conflicts.find((c) => c.type === 'vendor-unresolved-dispute');
  assert.equal(disputeConflict.severity, 'advisory');
});

test('resolveConflict marks a conflict resolved and getUnresolvedConflicts excludes it', () => {
  worldState.budget.categories.lawn_care = { cap_per_month: 100, spent_this_month: 90 };
  worldState.mandates = [];
  const [conflict] = detectConflicts('sourcing', 'commit_mandate', { category: 'lawn_care', amount: 30, vendor_id: 'greenblade', task_id: 't5', task_type: 'lawn_mowing' });
  resolveConflict(conflict.id, { resolution: 'block', resolvedBy: 'commander' });
  assert.equal(getUnresolvedConflicts().find((c) => c.id === conflict.id), undefined);
});

test('getConflictStats tallies totals by type and severity', () => {
  const stats = getConflictStats();
  assert.ok(stats.total >= 5);
  assert.ok('budget-cap-breach' in stats.by_type);
});
