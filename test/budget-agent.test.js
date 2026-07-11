import test from 'node:test';
import assert from 'node:assert/strict';
import { worldState } from '../src/core/world-state.js';
import { executeBudgetTool } from '../src/agents/budget-agent.js';

test('check_budget returns remaining for a known category', () => {
  worldState.budget.categories.lawn_care = { cap_per_month: 250, spent_this_month: 60 };
  const result = executeBudgetTool('check_budget', { category: 'lawn_care' });
  assert.equal(result.remaining, 190);
});

test('check_budget fails for an unknown category', () => {
  const result = executeBudgetTool('check_budget', { category: 'nope' });
  assert.equal(result.success, false);
});

test('record_spend updates spent_this_month', () => {
  const result = executeBudgetTool('record_spend', { category: 'lawn_care', amount: 55 });
  assert.equal(result.spent_this_month, 115);
});

test('get_all_categories returns the full category map', () => {
  const result = executeBudgetTool('get_all_categories', {});
  assert.ok('lawn_care' in result.categories);
});
