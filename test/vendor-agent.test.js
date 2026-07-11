// test/vendor-agent.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVendorAgent } from '../src/vendors/vendor-agent.js';

test('quote() cycles through the configured sequence in order', () => {
  const vendor = createVendorAgent({ id: 'test-vendor', name: 'Test Vendor', task_type: 'lawn_mowing', quoteSequence: [10, 20, 30], attestationSequence: [{ self_reported_ok: true, notes: 'ok' }] });
  assert.equal(vendor.quote(), 10);
  assert.equal(vendor.quote(), 20);
  assert.equal(vendor.quote(), 30);
  assert.equal(vendor.quote(), 10);
});

test('reportCompletion() cycles through the configured attestation sequence', () => {
  const vendor = createVendorAgent({
    id: 'test-vendor-2', name: 'Test Vendor 2', task_type: 'grocery_restock',
    quoteSequence: [50],
    attestationSequence: [{ self_reported_ok: true, notes: 'good' }, { self_reported_ok: false, notes: 'bad' }],
  });
  assert.equal(vendor.reportCompletion().self_reported_ok, true);
  assert.equal(vendor.reportCompletion().self_reported_ok, false);
  assert.equal(vendor.reportCompletion().self_reported_ok, true);
});
