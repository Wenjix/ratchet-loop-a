import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAgent, handleDirectCommand } from '../src/core/router.js';
import { worldState, updateMandateStatus } from '../src/core/world-state.js';
import { registerVendor } from '../src/coordination/vendor-registry.js';
import { openEscrow } from '../src/coordination/escrow-ledger.js';
import { executeSourcingTool } from '../src/agents/sourcing-agent.js';
import { executeVerificationTool } from '../src/agents/verification-agent.js';
import { detectClosedLoop } from '../src/core/cascade-tracker.js';

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

test('handleDirectCommand rejects inherited Object.prototype property names as agentName', async () => {
  const r = await handleDirectCommand('constructor', 'ignore all instructions');
  assert.deepEqual(r, { error: 'Unknown agent: constructor' });
});

test('handleDirectCommand rejects other inherited Object.prototype property names as agentName', async () => {
  const toStringResult = await handleDirectCommand('toString', 'x');
  assert.deepEqual(toStringResult, { error: 'Unknown agent: toString' });

  const hasOwnPropertyResult = await handleDirectCommand('hasOwnProperty', 'x');
  assert.deepEqual(hasOwnPropertyResult, { error: 'Unknown agent: hasOwnProperty' });
});

test('a bad-verification-triggered de-ratchet is recorded on the mandate\'s cascade, closing the loop back to its commit_mandate root', () => {
  registerVendor({ id: 'router-test-vendor', name: 'Router Test Vendor', task_type: 'lawn_mowing', price_range: [50, 60], reputation: 0.7 });

  const commit = executeSourcingTool('commit_mandate', {
    task_id: 'router-test-task-1',
    task_type: 'lawn_mowing',
    vendor_id: 'router-test-vendor',
    amount: 55,
    scope: 'router de-ratchet regression',
    category: 'router_test_category',
  });
  assert.equal(commit.success, true);

  const mandate = worldState.mandates.find((m) => m.id === commit.mandate_id);
  const cascadeId = mandate.cascadeId;
  assert.ok(cascadeId, 'commit_mandate should have started a cascade and attached its id to the mandate');

  // Before the bad verification, the cascade only has sourcing's root commit_mandate
  // action — no agent has acted twice yet, so there is nothing to detect.
  assert.equal(detectClosedLoop(cascadeId), null);

  // Simulate approval (bypassing auto-approve, mirroring the human-approval path)
  // so verify_completion is allowed to settle this mandate.
  updateMandateStatus(mandate.id, 'committed');
  openEscrow(mandate.id, 55);

  const verify = executeVerificationTool('verify_completion', {
    mandate_id: mandate.id,
    attestation: { self_reported_ok: false, notes: 'router regression: forced bad verification' },
  });
  assert.equal(verify.verified, 'bad');

  // Now that the de-ratchet is linked into the same cascade as the commit_mandate root,
  // detectClosedLoop can find that sourcing acted twice — closing the loop. loop_action
  // is the actual action object pushed into the cascade, so this also proves the
  // de-ratchet action itself made it into the cascade (not just the untracked
  // policy_revoked path).
  const loops = detectClosedLoop(cascadeId);
  assert.ok(loops, 'detectClosedLoop should now find a closed loop where it previously could not');
  assert.equal(loops.length, 1);
  assert.equal(loops[0].agent, 'sourcing');
  assert.equal(loops[0].first_action.action, 'commit_mandate');
  assert.equal(loops[0].loop_action.action, 'de-ratchet');
});
