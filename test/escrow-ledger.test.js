import test from 'node:test';
import assert from 'node:assert/strict';
import { worldState } from '../src/core/world-state.js';
import { openEscrow, releaseEscrow, refundEscrow, getEscrowEntry, getLedger } from '../src/coordination/escrow-ledger.js';

test('openEscrow creates a held entry', () => {
  worldState.escrow.entries = [];
  const entry = openEscrow('m1', 55);
  assert.equal(entry.status, 'held');
  assert.equal(entry.amount, 55);
  assert.equal(getEscrowEntry('m1'), entry);
});

test('releaseEscrow transitions held to released', () => {
  const entry = releaseEscrow('m1');
  assert.equal(entry.status, 'released');
  assert.ok(entry.closedAt);
});

test('refundEscrow transitions held to refunded', () => {
  openEscrow('m2', 90);
  const entry = refundEscrow('m2');
  assert.equal(entry.status, 'refunded');
});

test('releaseEscrow throws for an unknown mandate', () => {
  assert.throws(() => releaseEscrow('unknown'), /No escrow entry/);
});

test('getLedger returns all entries', () => {
  assert.equal(getLedger().length, 2);
});

test('releaseEscrow throws when the entry is already released (defense-in-depth)', () => {
  // 'm1' was already released by the 'releaseEscrow transitions held to released' test above.
  assert.throws(() => releaseEscrow('m1'), /not held/);
});

test('refundEscrow throws when the entry is already refunded (defense-in-depth)', () => {
  // 'm2' was already refunded by the 'refundEscrow transitions held to refunded' test above.
  assert.throws(() => refundEscrow('m2'), /not held/);
});

test('refundEscrow throws when the entry was released rather than refunded', () => {
  openEscrow('m3', 40);
  releaseEscrow('m3');
  assert.throws(() => refundEscrow('m3'), /not held/);
});
