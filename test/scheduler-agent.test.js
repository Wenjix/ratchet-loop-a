import test from 'node:test';
import assert from 'node:assert/strict';
import { worldState } from '../src/core/world-state.js';
import { executeSchedulerTool } from '../src/agents/scheduler-agent.js';

test('check_due filters tasks by simTime', () => {
  worldState.tasks.simTime = 10;
  worldState.tasks.schedule = [
    { id: 't1', task_type: 'lawn_mowing', cadence_days: 7, next_due_at: 7 },
    { id: 't2', task_type: 'grocery_restock', cadence_days: 7, next_due_at: 20 },
  ];
  const result = executeSchedulerTool('check_due', {});
  assert.equal(result.due.length, 1);
  assert.equal(result.due[0].id, 't1');
});

test('complete_task_cycle rolls next_due_at forward', () => {
  const result = executeSchedulerTool('complete_task_cycle', { task_id: 't1' });
  assert.equal(result.task.next_due_at, 17);
});

test('get_schedule returns the full schedule', () => {
  const result = executeSchedulerTool('get_schedule', {});
  assert.equal(result.schedule.length, 2);
});

test('complete_task_cycle returns a structured error instead of throwing for an unknown task_id', () => {
  const result = executeSchedulerTool('complete_task_cycle', { task_id: 'nonexistent' });
  assert.equal(result.success, false);
  assert.match(result.error, /Unknown task/);
});
