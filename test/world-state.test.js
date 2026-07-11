import test from 'node:test';
import assert from 'node:assert/strict';
import { bus, worldState, recordSpend, addVendorToRegistry, scheduleTask, advanceSimTime, completeTaskCycle, pushMandate, updateMandateStatus, pushAlert } from '../src/core/world-state.js';

test('recordSpend increases category spend and emits budget_updated', () => {
  worldState.budget.categories.lawn_care = { cap_per_month: 250, spent_this_month: 0 };
  let emitted = null;
  bus.once('budget_updated', (e) => { emitted = e; });
  recordSpend('lawn_care', 55);
  assert.equal(worldState.budget.categories.lawn_care.spent_this_month, 55);
  assert.deepEqual(emitted, { category: 'lawn_care', spent_this_month: 55 });
  assert.ok(worldState.freshness.budget > 0);
});

test('addVendorToRegistry appends to worldState.vendors.registry and emits vendor_registered', () => {
  worldState.vendors.registry = [];
  let emitted = null;
  bus.once('vendor_registered', (v) => { emitted = v; });
  const vendor = { id: 'greenblade', name: 'GreenBlade Lawn Care', task_type: 'lawn_mowing', reputation: 0.7, price_range: [40, 65] };
  addVendorToRegistry(vendor);
  assert.deepEqual(worldState.vendors.registry, [vendor]);
  assert.deepEqual(emitted, vendor);
});

test('scheduleTask appends to worldState.tasks.schedule and emits task_scheduled', () => {
  worldState.tasks.schedule = [];
  let emitted = null;
  bus.once('task_scheduled', (t) => { emitted = t; });
  const task = { id: 't1', task_type: 'lawn_mowing', cadence_days: 7, last_completed_at: null, next_due_at: 0 };
  scheduleTask(task);
  assert.deepEqual(worldState.tasks.schedule, [task]);
  assert.deepEqual(emitted, task);
});

test('advanceSimTime increments the simulated clock and emits sim_time_advanced', () => {
  worldState.tasks.simTime = 0;
  let emitted = null;
  bus.once('sim_time_advanced', (t) => { emitted = t; });
  const simTime = advanceSimTime(7);
  assert.equal(simTime, 7);
  assert.equal(worldState.tasks.simTime, 7);
  assert.equal(emitted, 7);
});

test('completeTaskCycle advances last_completed_at/next_due_at against simTime', () => {
  worldState.tasks.simTime = 14;
  worldState.tasks.schedule = [{ id: 't1', task_type: 'lawn_mowing', cadence_days: 7, last_completed_at: null, next_due_at: 14 }];
  const task = completeTaskCycle('t1');
  assert.equal(task.last_completed_at, 14);
  assert.equal(task.next_due_at, 21);
});

test('pushMandate appends to worldState.mandates with status pending_approval and emits mandate_created', () => {
  worldState.mandates = [];
  let emitted = null;
  bus.once('mandate_created', (m) => { emitted = m; });
  const mandate = pushMandate({ id: 'm1', task_id: 't1', task_type: 'lawn_mowing', vendor_id: 'greenblade', amount: 55, scope: 'weekly mow', decisionClassKey: 'k1', cascadeId: 'CASCADE-001' });
  assert.equal(mandate.status, 'pending_approval');
  assert.equal(worldState.mandates.length, 1);
  assert.deepEqual(emitted, mandate);
});

test('updateMandateStatus mutates status and merges extra fields, emits mandate_updated', () => {
  worldState.mandates = [{ id: 'm1', status: 'pending_approval' }];
  let emitted = null;
  bus.once('mandate_updated', (m) => { emitted = m; });
  const updated = updateMandateStatus('m1', 'committed', { committedAt: 123 });
  assert.equal(updated.status, 'committed');
  assert.equal(updated.committedAt, 123);
  assert.equal(worldState.mandates[0].status, 'committed');
  assert.deepEqual(emitted, updated);
});

test('pushAlert prepends to worldState.alerts with id/timestamp and emits alert', () => {
  worldState.alerts = [];
  let emitted = null;
  bus.once('alert', (a) => { emitted = a; });
  const alert = pushAlert({ from: 'budget', priority: 'WARNING', message: 'over cap' });
  assert.equal(worldState.alerts.length, 1);
  assert.ok(alert.id.startsWith('alert-'));
  assert.equal(alert.acknowledged, false);
  assert.deepEqual(emitted, alert);
});
