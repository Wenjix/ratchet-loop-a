// test/vendors-config.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { VENDOR_ROSTER } from '../src/vendors/vendors.config.js';

test('VENDOR_ROSTER defines exactly the 3 vendors from the fixed demo roster', () => {
  assert.equal(VENDOR_ROSTER.length, 3);
  assert.deepEqual(VENDOR_ROSTER.map((v) => v.id).sort(), ['freshcart', 'greenblade', 'quickfix']);
});

test('every vendor has 9 quotes and 9 attestations, one per demo cycle', () => {
  for (const v of VENDOR_ROSTER) {
    assert.equal(v.quoteSequence.length, 9);
    assert.equal(v.attestationSequence.length, 9);
  }
});

test('FreshCart seeds exactly one bad attestation, at cycle 4 (index 3)', () => {
  const freshcart = VENDOR_ROSTER.find((v) => v.id === 'freshcart');
  const badIndexes = freshcart.attestationSequence.map((a, i) => (a.self_reported_ok ? null : i)).filter((i) => i !== null);
  assert.deepEqual(badIndexes, [3]);
});

test('GreenBlade and QuickFix are seeded all-good', () => {
  for (const id of ['greenblade', 'quickfix']) {
    const vendor = VENDOR_ROSTER.find((v) => v.id === id);
    assert.ok(vendor.attestationSequence.every((a) => a.self_reported_ok));
  }
});
