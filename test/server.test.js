import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiRouter } from '../src/server/api.js';
import { worldState, pushMandate } from '../src/core/world-state.js';
import { getOrCreateDecisionClass } from '../src/loop-a/loop-a-engine.js';
import { buildDecisionClassKey } from '../src/loop-a/decision-class.js';

function startTestServer() {
  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter());
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

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

test('POST /api/mandates/:id/override returns a structured 400 when no escrow entry exists', async () => {
  const server = await startTestServer();
  const port = server.address().port;
  try {
    const key = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: 'greenblade', task_type: 'lawn_mowing', amount: 55 });
    getOrCreateDecisionClass(key, { ceiling: 'auto' });
    const mandate = pushMandate({ id: 'srv-override-noescrow', task_id: 't-override', task_type: 'lawn_mowing', vendor_id: 'greenblade', amount: 55, scope: 'weekly mow', decisionClassKey: key });
    // Deliberately no openEscrow call — this mandate was never committed into escrow.
    const res = await fetch(`http://localhost:${port}/api/mandates/${mandate.id}/override`, { method: 'POST' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  } finally {
    server.close();
  }
});
