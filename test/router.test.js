import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAgent } from '../src/core/router.js';

test('detectAgent matches an explicit agent name at the start with confidence explicit', () => {
  const r = detectAgent('sourcing, get a quote for lawn care');
  assert.equal(r.name, 'sourcing');
  assert.equal(r.confidence, 'explicit');
});

test('detectAgent matches an agent name mentioned anywhere with confidence mentioned', () => {
  const r = detectAgent('can you ask verification to check the last job');
  assert.equal(r.name, 'verification');
  assert.equal(r.confidence, 'mentioned');
});

test('detectAgent falls back to keyword scoring when no agent name appears', () => {
  const r = detectAgent('how much have we spent this month on the cap');
  assert.equal(r.name, 'budget');
  assert.equal(r.confidence, 'keyword');
});

test('detectAgent routes status/report language to broadcast', () => {
  const r = detectAgent('give me a status report');
  assert.equal(r.name, 'broadcast');
  assert.equal(r.confidence, 'special');
});

test('detectAgent falls back to budget when nothing matches', () => {
  const r = detectAgent('hello there');
  assert.equal(r.name, 'budget');
  assert.equal(r.confidence, 'fallback');
});
