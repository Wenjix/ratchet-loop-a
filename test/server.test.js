import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiRouter } from '../src/server/api.js';
import { worldState, pushMandate, updateMandateStatus } from '../src/core/world-state.js';
import { getOrCreateDecisionClass } from '../src/loop-a/loop-a-engine.js';
import { buildDecisionClassKey } from '../src/loop-a/decision-class.js';
import { registerVendor, updateReputation } from '../src/coordination/vendor-registry.js';
import { bus } from '../src/core/world-state.js';

// Each test creates its own router (and therefore its own set of bus listeners); track
// them here so afterEach can dispose them and avoid stacking listeners on the shared
// module-level `bus` singleton across this file's many tests.
const activeRouters = [];

function startTestServer() {
  const app = express();
  app.use(express.json());
  const apiRouter = createApiRouter();
  activeRouters.push(apiRouter);
  app.use('/api', apiRouter);
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

afterEach(() => {
  while (activeRouters.length) activeRouters.pop().dispose();
});

test('GET /api/state returns budget, mandates, and policy ledger', async () => {
  const server = await startTestServer();
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/api/state`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok('budget' in body);
    assert.ok('policyLedger' in body);
  } finally {
    server.close();
  }
});

test('POST /api/mandates/:id/approve commits a pending mandate and opens escrow', async () => {
  const server = await startTestServer();
  const port = server.address().port;
  try {
    const key = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'greenblade', task_type: 'lawn_mowing', amount: 55 });
    getOrCreateDecisionClass(key, { ceiling: 'auto' });
    const mandate = pushMandate({ id: 'srv-m1', task_id: 't1', task_type: 'lawn_mowing', vendor_id: 'greenblade', amount: 55, scope: 'weekly mow', decisionClassKey: key });

    const res = await fetch(`http://localhost:${port}/api/mandates/${mandate.id}/approve`, { method: 'POST' });
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(worldState.mandates.find((m) => m.id === mandate.id).status, 'committed');
  } finally {
    server.close();
  }
});

test('POST /api/mandates/:id/approve returns 404 for an unknown mandate', async () => {
  const server = await startTestServer();
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/api/mandates/nope/approve`, { method: 'POST' });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('POST /api/mandates/:id/approve returns a structured 400 for a mandate that is not pending approval (double-approve guard)', async () => {
  const server = await startTestServer();
  const port = server.address().port;
  try {
    const key = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'greenblade', task_type: 'lawn_mowing', amount: 55 });
    getOrCreateDecisionClass(key, { ceiling: 'auto' });
    const mandate = pushMandate({ id: 'srv-double-approve', task_id: 't-double-approve', task_type: 'lawn_mowing', vendor_id: 'greenblade', amount: 55, scope: 'weekly mow', decisionClassKey: key });

    const first = await fetch(`http://localhost:${port}/api/mandates/${mandate.id}/approve`, { method: 'POST' });
    assert.equal(first.status, 200);

    const second = await fetch(`http://localhost:${port}/api/mandates/${mandate.id}/approve`, { method: 'POST' });
    assert.equal(second.status, 400);
    const body = await second.json();
    assert.ok(body.error);
    // Only one escrow entry should exist for this mandate — the duplicate approve must
    // not have opened a second one.
    assert.equal(worldState.escrow.entries.filter((e) => e.mandateId === mandate.id).length, 1);
  } finally {
    server.close();
  }
});

test('POST /api/mandates/:id/reject returns a structured 400 when the mandate has no valid decisionClassKey', async () => {
  const server = await startTestServer();
  const port = server.address().port;
  try {
    const mandate = pushMandate({ id: 'srv-reject-bad', task_id: 't-reject', task_type: 'lawn_mowing', vendor_id: 'greenblade', amount: 50, scope: 'weekly mow', decisionClassKey: 'nonexistent:key:that:was:never:created' });
    const res = await fetch(`http://localhost:${port}/api/mandates/${mandate.id}/reject`, { method: 'POST' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  } finally {
    server.close();
  }
});

test('POST /api/mandates/:id/reject returns a structured 400 for a mandate that is not pending approval (double-reject guard)', async () => {
  const server = await startTestServer();
  const port = server.address().port;
  try {
    const key = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'greenblade', task_type: 'lawn_mowing', amount: 55 });
    getOrCreateDecisionClass(key, { ceiling: 'auto' });
    const mandate = pushMandate({ id: 'srv-double-reject', task_id: 't-double-reject', task_type: 'lawn_mowing', vendor_id: 'greenblade', amount: 55, scope: 'weekly mow', decisionClassKey: key });

    const first = await fetch(`http://localhost:${port}/api/mandates/${mandate.id}/reject`, { method: 'POST' });
    assert.equal(first.status, 200);

    const second = await fetch(`http://localhost:${port}/api/mandates/${mandate.id}/reject`, { method: 'POST' });
    assert.equal(second.status, 400);
    const body = await second.json();
    assert.ok(body.error);
  } finally {
    server.close();
  }
});

test('POST /api/mandates/:id/override returns a structured 400 when the mandate is not committed', async () => {
  const server = await startTestServer();
  const port = server.address().port;
  try {
    const key = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'greenblade', task_type: 'lawn_mowing', amount: 55 });
    getOrCreateDecisionClass(key, { ceiling: 'auto' });
    const mandate = pushMandate({ id: 'srv-override-not-committed', task_id: 't-override', task_type: 'lawn_mowing', vendor_id: 'greenblade', amount: 55, scope: 'weekly mow', decisionClassKey: key });
    // Deliberately left in 'pending_approval' — override only reverses an already-committed mandate.
    const res = await fetch(`http://localhost:${port}/api/mandates/${mandate.id}/override`, { method: 'POST' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  } finally {
    server.close();
  }
});

test('POST /api/mandates/:id/override returns a structured 400 when a committed mandate has no escrow entry', async () => {
  const server = await startTestServer();
  const port = server.address().port;
  try {
    const key = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'greenblade', task_type: 'lawn_mowing', amount: 55 });
    getOrCreateDecisionClass(key, { ceiling: 'auto' });
    const mandate = pushMandate({ id: 'srv-override-noescrow', task_id: 't-override-noescrow', task_type: 'lawn_mowing', vendor_id: 'greenblade', amount: 55, scope: 'weekly mow', decisionClassKey: key });
    // Committed directly (bypassing the /approve route, which would also open escrow) so
    // the override route's status guard passes and the underlying "no escrow entry" error
    // from escrow-ledger.js surfaces instead.
    updateMandateStatus(mandate.id, 'committed');
    const res = await fetch(`http://localhost:${port}/api/mandates/${mandate.id}/override`, { method: 'POST' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  } finally {
    server.close();
  }
});

test('POST /api/mandates/:id/override reverses a committed mandate and refunds escrow', async () => {
  const server = await startTestServer();
  const port = server.address().port;
  try {
    const key = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'greenblade', task_type: 'lawn_mowing', amount: 55 });
    getOrCreateDecisionClass(key, { ceiling: 'auto' });
    const mandate = pushMandate({ id: 'srv-override-ok', task_id: 't-override-ok', task_type: 'lawn_mowing', vendor_id: 'greenblade', amount: 55, scope: 'weekly mow', decisionClassKey: key });

    const approveRes = await fetch(`http://localhost:${port}/api/mandates/${mandate.id}/approve`, { method: 'POST' });
    assert.equal(approveRes.status, 200);

    const overrideRes = await fetch(`http://localhost:${port}/api/mandates/${mandate.id}/override`, { method: 'POST' });
    assert.equal(overrideRes.status, 200);
    assert.equal(worldState.mandates.find((m) => m.id === mandate.id).status, 'rejected');

    // A second override on the now-'rejected' mandate must be rejected by the status guard.
    const secondOverrideRes = await fetch(`http://localhost:${port}/api/mandates/${mandate.id}/override`, { method: 'POST' });
    assert.equal(secondOverrideRes.status, 400);
  } finally {
    server.close();
  }
});

test('GET /api/state includes decisionClasses and simTime for early-cycle UI hydration', async () => {
  const server = await startTestServer();
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/api/state`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok('decisionClasses' in body, 'state snapshot must expose decisionClasses');
    assert.ok('simTime' in body, 'state snapshot must expose simTime');
  } finally {
    server.close();
  }
});

test('vendor_updated bus events are bridged to the SSE stream', async () => {
  const server = await startTestServer();
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/api/events`);
    const reader = res.body.getReader();
    registerVendor({ id: 'sse-vendor', name: 'SSE Vendor', task_type: 'lawn_mowing', price_range: [40, 60] });
    updateReputation('sse-vendor', 0.05);

    const decoder = new TextDecoder();
    let buffer = '';
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline && !buffer.includes('vendor_updated')) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise((resolve) => setTimeout(() => resolve({ value: undefined, done: true }), Math.max(0, deadline - Date.now()))),
      ]);
      if (chunk.value) buffer += decoder.decode(chunk.value, { stream: true });
      if (chunk.done) break;
    }
    await reader.cancel().catch(() => {});
    assert.ok(buffer.includes('"type":"vendor_updated"'), `SSE stream should carry vendor_updated, got: ${buffer || '(nothing)'}`);
    assert.ok(buffer.includes('sse-vendor'));
  } finally {
    server.close();
  }
});

test('vendor_registered and decision_class_created bus events are bridged to SSE (fresh-run hydration)', async () => {
  const server = await startTestServer();
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/api/events`);
    const reader = res.body.getReader();
    bus.emit('vendor_registered', { id: 'bridge-vendor', name: 'Bridge Vendor' });
    bus.emit('decision_class_created', { key: 'bridge:class:key', status: 'escalate' });

    const decoder = new TextDecoder();
    let buffer = '';
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline && !(buffer.includes('vendor_registered') && buffer.includes('decision_class_created'))) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise((resolve) => setTimeout(() => resolve({ value: undefined, done: true }), Math.max(0, deadline - Date.now()))),
      ]);
      if (chunk.value) buffer += decoder.decode(chunk.value, { stream: true });
      if (chunk.done) break;
    }
    await reader.cancel().catch(() => {});
    assert.ok(buffer.includes('"type":"vendor_registered"'), `SSE should carry vendor_registered, got: ${buffer || '(nothing)'}`);
    assert.ok(buffer.includes('"type":"decision_class_created"'), `SSE should carry decision_class_created, got: ${buffer || '(nothing)'}`);
  } finally {
    server.close();
  }
});

test('budget_updated bus events are bridged to SSE', async () => {
  const server = await startTestServer();
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/api/events`);
    const reader = res.body.getReader();
    bus.emit('budget_updated', { category: 'lawn_care', spent_this_month: 150 });

    const decoder = new TextDecoder();
    let buffer = '';
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline && !buffer.includes('budget_updated')) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise((resolve) => setTimeout(() => resolve({ value: undefined, done: true }), Math.max(0, deadline - Date.now()))),
      ]);
      if (chunk.value) buffer += decoder.decode(chunk.value, { stream: true });
      if (chunk.done) break;
    }
    await reader.cancel().catch(() => {});
    assert.ok(buffer.includes('"type":"budget_updated"'), `SSE should carry budget_updated, got: ${buffer || '(nothing)'}`);
  } finally {
    server.close();
  }
});

test('inbox decisions broadcast a principal_action frame over SSE', async () => {
  const server = await startTestServer();
  const port = server.address().port;
  try {
    const key = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'greenblade', task_type: 'lawn_mowing', amount: 55 });
    getOrCreateDecisionClass(key, { ceiling: 'auto' });
    const mandate = pushMandate({ id: 'srv-principal-action', task_id: 't-pa', task_type: 'lawn_mowing', vendor_id: 'greenblade', amount: 55, scope: 'weekly mow', decisionClassKey: key });

    const res = await fetch(`http://localhost:${port}/api/events`);
    const reader = res.body.getReader();
    const approve = await fetch(`http://localhost:${port}/api/mandates/${mandate.id}/approve`, { method: 'POST' });
    assert.equal(approve.status, 200);

    const decoder = new TextDecoder();
    let buffer = '';
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline && !buffer.includes('principal_action')) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise((resolve) => setTimeout(() => resolve({ value: undefined, done: true }), Math.max(0, deadline - Date.now()))),
      ]);
      if (chunk.value) buffer += decoder.decode(chunk.value, { stream: true });
      if (chunk.done) break;
    }
    await reader.cancel().catch(() => {});
    assert.ok(buffer.includes('"type":"principal_action"'), `SSE should carry principal_action, got: ${buffer || '(nothing)'}`);
    assert.ok(buffer.includes('"kind":"mandate_approve"'));
    assert.ok(buffer.includes('srv-principal-action'));
  } finally {
    server.close();
  }
});

// This test runs a real (LLM-free, seeded) scenario through the API, which resets shared
// world state via setUpScenario — keep it last in this file.
test('POST /api/scenario/run guards against concurrent runs and /stop cancels the active run', async () => {
  const server = await startTestServer();
  const port = server.address().port;
  const jsonPost = (path, body) =>
    fetch(`http://localhost:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    const first = await jsonPost('/api/scenario/run', { stepMs: 30, cycleDelayMs: 0, approverDelayMs: 0 });
    assert.equal(first.status, 200);

    const second = await jsonPost('/api/scenario/run', { stepMs: 30, cycleDelayMs: 0, approverDelayMs: 0 });
    assert.equal(second.status, 409);

    const stop = await fetch(`http://localhost:${port}/api/scenario/stop`, { method: 'POST' });
    assert.equal(stop.status, 200);

    // After cancellation the guard clears, so a fresh (unpaced, near-instant) run is accepted.
    let cleared = false;
    for (let i = 0; i < 20 && !cleared; i++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const retry = await jsonPost('/api/scenario/run', { stepMs: 0, cycleDelayMs: 0, approverDelayMs: 0 });
      if (retry.status === 200) cleared = true;
    }
    assert.ok(cleared, 'run guard should clear after /stop cancels the active run');

    // Let the final unpaced run (milliseconds of work) finish so nothing leaks past this test.
    await new Promise((resolve) => setTimeout(resolve, 500));
  } finally {
    server.close();
  }
});
