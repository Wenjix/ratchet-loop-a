// test/scenario-driver.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPolicyLedger, getDecisionClass } from '../src/loop-a/loop-a-engine.js';
import { buildDecisionClassKey } from '../src/loop-a/decision-class.js';
import { runScenario } from '../src/scenario/scenario-driver.js';
import { worldState, updateMandateStatus } from '../src/core/world-state.js';
import { openEscrow } from '../src/coordination/escrow-ledger.js';

test('the full 9-cycle seeded scenario demonstrates all three Loop A arcs', async () => {
  const events = [];
  await runScenario({ onEvent: (e) => events.push(e) });

  const lawnKey = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'greenblade', task_type: 'lawn_mowing', amount: 50 });
  const groceryKey = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'freshcart', task_type: 'grocery_restock', amount: 90 });
  const plumbingKey = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'quickfix', task_type: 'plumbing_repair', amount: 200 });

  const lawn = getDecisionClass(lawnKey);
  assert.equal(lawn.status, 'auto');
  assert.ok(lawn.policy);
  assert.equal(lawn.policy.revoked, false);

  const grocery = getDecisionClass(groceryKey);
  assert.equal(grocery.status, 'auto');
  assert.ok(grocery.policy);
  assert.equal(grocery.policy.revoked, false);
  assert.equal(grocery.policy.id, 'POLICY-003');

  const plumbing = getDecisionClass(plumbingKey);
  assert.equal(plumbing.status, 'escalate');
  assert.equal(plumbing.policy, null);
  assert.equal(plumbing.streak, 9);

  const badVerification = events.find((e) => e.type === 'job_verified' && e.verified === 'bad');
  assert.ok(badVerification);

  const acceptedPolicies = events.filter((e) => e.type === 'policy_decision' && e.decision === 'accept').length;
  assert.equal(acceptedPolicies, 3);
});

test('the Policy Ledger lists FreshCart with a non-empty history basis after re-crystallization', () => {
  const ledger = getPolicyLedger();
  const grocery = ledger.find((e) => e.key.includes('freshcart'));
  assert.ok(grocery.policy.basis.length > 0);
});

test('runScenario emits lifecycle events and stamps cycle/week on every task event', async () => {
  const events = [];
  await runScenario({ cycles: 2, onEvent: (e) => events.push(e) });

  assert.equal(events[0].type, 'scenario_started');
  assert.equal(events[0].cycles, 2);
  assert.equal(events.at(-1).type, 'scenario_completed');

  const cycleStarts = events.filter((e) => e.type === 'cycle_started');
  assert.deepEqual(cycleStarts.map((s) => s.week), [1, 2]);

  // Every week closes with a cycle_completed marking the inter-week pause (the UI's
  // debrief window), emitted after that week's task events.
  const cycleCompletes = events.filter((e) => e.type === 'cycle_completed');
  assert.deepEqual(cycleCompletes.map((c) => c.week), [1, 2]);
  const firstCompleteIndex = events.findIndex((e) => e.type === 'cycle_completed');
  const secondStartIndex = events.findIndex((e) => e.type === 'cycle_started' && e.week === 2);
  assert.ok(firstCompleteIndex < secondStartIndex, 'week 1 must complete before week 2 starts');

  const lifecycle = new Set(['scenario_started', 'cycle_started', 'cycle_completed', 'scenario_completed']);
  const taskEvents = events.filter((e) => !lifecycle.has(e.type));
  assert.ok(taskEvents.length > 0);
  for (const e of taskEvents) {
    assert.ok(Number.isInteger(e.cycle), `event ${e.type} missing cycle`);
    assert.equal(e.week, e.cycle + 1);
  }
});

test('runScenario awaits async onEvent handlers so a paced emitter can slow the run', async () => {
  const order = [];
  await runScenario({
    cycles: 1,
    onEvent: async (e) => {
      order.push(`start:${e.type}`);
      await new Promise((resolve) => setTimeout(resolve, 1));
      order.push(`end:${e.type}`);
    },
  });

  // If the driver awaits each handler, starts and ends strictly alternate; if it fires
  // and forgets, several starts pile up before their ends.
  for (let i = 0; i < order.length; i += 2) {
    assert.ok(order[i].startsWith('start:'), `expected start at ${i}, got ${order[i]}`);
    assert.equal(order[i + 1], order[i].replace('start:', 'end:'));
  }
});

test('a human decision from the inbox during the approval window is respected — no double commit/escrow', async () => {
  // Reproduces the live-demo race: an escalated mandate is approved through the API
  // while the scenario's delayed auto-approver is still waiting. The driver must not
  // commit it a second time (which would open a duplicate escrow entry).
  const humanApprover = async ({ mandate }) => {
    // Simulate what POST /api/mandates/:id/approve does, mid-window.
    updateMandateStatus(mandate.id, 'committed');
    openEscrow(mandate.id, mandate.amount);
    return { decision: 'approve' };
  };
  await runScenario({ cycles: 1, mandateApprover: humanApprover });

  for (const mandate of worldState.mandates) {
    const escrowEntries = worldState.escrow.entries.filter((e) => e.mandateId === mandate.id);
    assert.equal(escrowEntries.length, 1, `mandate ${mandate.id} should hold exactly one escrow entry, found ${escrowEntries.length}`);
  }
});

test('runScenario pacing.stepMs and approverDelayMs slow the run to a watchable pace', async () => {
  const events = [];
  const t0 = Date.now();
  // Cycle 1 escalates all three mandates (no policies exist yet), so approverDelayMs
  // applies three times on top of a stepMs sleep after every emitted event.
  await runScenario({ cycles: 1, pacing: { stepMs: 5 }, approverDelayMs: 20, onEvent: (e) => events.push(e) });
  const elapsed = Date.now() - t0;

  const expectedMinimum = events.length * 4 + 3 * 20;
  assert.ok(
    elapsed >= expectedMinimum,
    `expected a paced run to take at least ${expectedMinimum}ms for ${events.length} events, finished in ${elapsed}ms`,
  );
});
