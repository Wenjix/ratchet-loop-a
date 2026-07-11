import test from 'node:test';
import assert from 'node:assert/strict';
import { worldState, bus } from '../src/core/world-state.js';
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

test('updateReputation emits vendor_updated on the bus with the updated vendor', () => {
  worldState.vendors.registry = [];
  registerVendor({ id: 'rep-vendor', name: 'Rep Vendor', task_type: 'lawn_mowing', price_range: [40, 60] });
  const seen = [];
  const handler = (v) => seen.push(v);
  bus.on('vendor_updated', handler);
  try {
    updateReputation('rep-vendor', 0.05);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].id, 'rep-vendor');
    assert.equal(seen[0].reputation, 0.75);
  } finally {
    bus.off('vendor_updated', handler);
  }
});
