import { Router } from 'express';
import { worldState, updateMandateStatus, bus } from '../core/world-state.js';
import { openEscrow, refundEscrow } from '../coordination/escrow-ledger.js';
import { getPolicyLedger, acceptProposal, rejectProposal, recordOutcome } from '../loop-a/loop-a-engine.js';
import { getDecisionLog } from '../core/agent-loop.js';
import { formatDecisionForUI, getActiveFlows } from '../core/interpretability.js';
import { handleVoiceCommand, handleDirectCommand } from '../core/router.js';
import { runScenario } from '../scenario/scenario-driver.js';

// Sentinel thrown from the scenario's onEvent to unwind a cancelled run; the /scenario/run
// route catches it and broadcasts scenario_stopped instead of scenario_error.
class ScenarioCancelled extends Error {}

export function createApiRouter() {
  const router = Router();
  const sseClients = new Set();
  let activeRun = null;

  function broadcast(type, payload) {
    const message = `data: ${JSON.stringify({ type, payload })}\n\n`;
    for (const res of sseClients) res.write(message);
  }

  // Track listeners attached to the shared module-level `bus` singleton so they can be
  // removed via dispose(). Without this, each createApiRouter() call (e.g. once per test
  // in test/server.test.js) stacks another set of listeners on `bus` forever.
  const busListeners = [
    ['decision_logged', (d) => broadcast('decision', formatDecisionForUI(d))],
    ['mandate_created', (m) => broadcast('mandate_created', m)],
    ['mandate_updated', (m) => broadcast('mandate_updated', m)],
    ['decision_class_updated', (dc) => broadcast('decision_class_updated', dc)],
    ['policy_proposed', (p) => broadcast('policy_proposed', p)],
    ['policy_accepted', (p) => broadcast('policy_accepted', p)],
    ['policy_rejected', (p) => broadcast('policy_rejected', p)],
    ['policy_revoked', (p) => broadcast('policy_revoked', p)],
    ['coordination_flow', (f) => broadcast('coordination_flow', f)],
    ['vendor_updated', (v) => broadcast('vendor_updated', v)],
    // A scenario run re-registers vendors and re-creates decision classes after the UI has
    // already hydrated; without these two bridges a connected page only learns about them
    // at the first reputation change / first recorded outcome.
    ['vendor_registered', (v) => broadcast('vendor_registered', v)],
    ['decision_class_created', (dc) => broadcast('decision_class_created', dc)],
    ['budget_updated', (b) => broadcast('budget_updated', b)],
  ];
  for (const [event, handler] of busListeners) bus.on(event, handler);

  router.get('/state', (req, res) => {
    res.json({
      budget: worldState.budget,
      mandates: worldState.mandates,
      vendors: worldState.vendors.registry,
      policyLedger: getPolicyLedger(),
      // getPolicyLedger() omits classes that have neither a policy nor a pending proposal,
      // so early-cycle streaks would be invisible to a freshly hydrated page without the
      // raw decision-class map.
      decisionClasses: worldState.policies.decisionClasses,
      simTime: worldState.tasks.simTime,
      decisionFeed: getDecisionLog().map(formatDecisionForUI),
      activeFlows: getActiveFlows(),
    });
  });

  router.get('/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  });

  router.post('/mandates/:id/approve', (req, res) => {
    const mandate = worldState.mandates.find((m) => m.id === req.params.id);
    if (!mandate) return res.status(404).json({ error: 'Unknown mandate' });
    // Idempotency guard: only a mandate still awaiting approval can be approved. Without
    // this, two rapid/duplicate requests for the same mandate id both pass and both open
    // escrow, leaving two 'held' entries for one mandate.
    if (mandate.status !== 'pending_approval') {
      return res.status(400).json({ error: `Mandate ${mandate.id} is not pending approval (status: ${mandate.status})` });
    }
    updateMandateStatus(mandate.id, 'committed');
    openEscrow(mandate.id, mandate.amount);
    // The inbox routes are the only paths where a real human decided — announce it so the
    // UI can distinguish a by-hand decision from the demo's simulated principal.
    broadcast('principal_action', { kind: 'mandate_approve', mandate_id: mandate.id });
    res.json({ success: true });
  });

  router.post('/mandates/:id/reject', (req, res) => {
    const mandate = worldState.mandates.find((m) => m.id === req.params.id);
    if (!mandate) return res.status(404).json({ error: 'Unknown mandate' });
    if (mandate.status !== 'pending_approval') {
      return res.status(400).json({ error: `Mandate ${mandate.id} is not pending approval (status: ${mandate.status})` });
    }
    try {
      updateMandateStatus(mandate.id, 'rejected');
      recordOutcome(mandate.decisionClassKey, { mandateId: mandate.id, amount: mandate.amount, outcome: 'rejected' });
      broadcast('principal_action', { kind: 'mandate_reject', mandate_id: mandate.id });
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/mandates/:id/override', (req, res) => {
    const mandate = worldState.mandates.find((m) => m.id === req.params.id);
    if (!mandate) return res.status(404).json({ error: 'Unknown mandate' });
    // Override reverses a mandate that was already auto-executed (committed) and holds
    // escrow — that's the only status reversal makes sense from (see the spec's "manual
    // override on an auto-executed action" language). Without this guard, two rapid
    // override requests would both pass and both try to reverse the same mandate.
    if (mandate.status !== 'committed') {
      return res.status(400).json({ error: `Mandate ${mandate.id} is not committed (status: ${mandate.status})` });
    }
    try {
      // Escrow refund runs first, inside the same try/catch, before the mandate status is
      // durably flipped — same ordering-bug class fixed in verification-agent.js's
      // verify_completion. If refundEscrow throws, the mandate stays in its prior status
      // instead of being left in an inconsistent "rejected but not refunded" state.
      refundEscrow(mandate.id);
      updateMandateStatus(mandate.id, 'rejected');
      recordOutcome(mandate.decisionClassKey, { mandateId: mandate.id, amount: mandate.amount, outcome: 'overridden' });
      broadcast('principal_action', { kind: 'mandate_override', mandate_id: mandate.id });
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/policies/:key/accept', (req, res) => {
    try {
      const key = decodeURIComponent(req.params.key);
      const policy = acceptProposal(key, req.body || {});
      broadcast('principal_action', { kind: 'policy_accept', key });
      res.json({ success: true, policy });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/policies/:key/reject', (req, res) => {
    try {
      const key = decodeURIComponent(req.params.key);
      rejectProposal(key);
      broadcast('principal_action', { kind: 'policy_reject', key });
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Deviation from brief (Task 19 carry-forward from Task 17's review): wrapped in
  // try/catch. handleDirectCommand's agent.call(message) has no try/catch of its own
  // (router.js is not modified for this), and Express 4 does not catch rejections from
  // async route handlers — an unguarded throw here would be an unhandled promise
  // rejection that crashes the whole process, not just this one request. Guard belongs
  // at this HTTP request/response boundary. handleVoiceCommand already catches its own
  // errors internally and returns a structured response, so this also safely covers
  // that path without changing its behavior.
  router.post('/command', async (req, res) => {
    const { agentName, message } = req.body || {};
    try {
      const result = agentName ? await handleDirectCommand(agentName, message) : await handleVoiceCommand(message);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/scenario/run', (req, res) => {
    if (activeRun) return res.status(409).json({ error: 'A scenario run is already in progress' });
    const { stepMs = 800, cycleDelayMs = 4500, approverDelayMs = 1200 } = req.body || {};
    const run = { cancelled: false };
    activeRun = run;
    res.json({ success: true, started: true });
    runScenario({
      pacing: { stepMs, cycleDelayMs },
      approverDelayMs,
      onEvent: (e) => {
        if (run.cancelled) throw new ScenarioCancelled('Scenario run stopped');
        broadcast('scenario_event', e);
      },
    })
      .catch((error) => {
        if (error instanceof ScenarioCancelled) broadcast('scenario_event', { type: 'scenario_stopped' });
        else broadcast('scenario_error', { message: error.message });
      })
      .finally(() => {
        if (activeRun === run) activeRun = null;
      });
  });

  router.post('/scenario/stop', (req, res) => {
    if (!activeRun) return res.json({ success: true, stopped: false });
    activeRun.cancelled = true;
    res.json({ success: true, stopped: true });
  });

  // router is an Express middleware function; attaching .dispose to it (rather than
  // changing the return shape to { router, dispose }) keeps `app.use('/api',
  // createApiRouter())` in src/server/index.js working unmodified.
  router.dispose = () => {
    for (const [event, handler] of busListeners) bus.off(event, handler);
    for (const res of sseClients) res.end();
    sseClients.clear();
  };

  return router;
}
