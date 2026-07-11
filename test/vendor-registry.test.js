import test from 'node:test';
import assert from 'node:assert/strict';
import { worldState } from '../src/core/world-state.js';
import { registerVendor, findVendors, getVendor, updateReputation } from '../src/coordination/vendor-registry.js';

test('registerVendor defaults reputation to 0.7 when not given', () => {
  worldState.vendors.registry = [];
  const v = registerVendor({ id: 'greenblade', name: 'GreenBlade Lawn Care', task_type: 'lawn_mowing', price_range: [40, 65] });
  assert.equal(v.reputation, 0.7);
});

test('findVendors filters by task_type', () => {
  registerVendor({ id: 'freshcart', name: 'FreshCart Grocery', task_type: 'grocery_restock', price_range: [80, 150] });
  const lawnVendors = findVendors('lawn_mowing');
  assert.equal(lawnVendors.length, 1);
  assert.equal(lawnVendors[0].id, 'greenblade');
});

test('getVendor returns null for an unknown id', () => {
  assert.equal(getVendor('nope'), null);
});

test('updateReputation clamps to [0, 1] and rounds to 2 decimals', () => {
  const raised = updateReputation('greenblade', 0.05);
  assert.equal(raised.reputation, 0.75);
  updateReputation('greenblade', 10);
  assert.equal(getVendor('greenblade').reputation, 1);
  updateReputation('greenblade', -10);
  assert.equal(getVendor('greenblade').reputation, 0);
});

test('updateReputation throws for an unknown vendor', () => {
  assert.throws(() => updateReputation('nope', 0.1), /Unknown vendor/);
});
