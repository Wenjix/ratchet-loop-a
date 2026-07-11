import { Router } from 'express';
import { worldState, updateMandateStatus, bus } from '../core/world-state.js';
import { openEscrow, refundEscrow } from '../coordination/escrow-ledger.js';
import { getPolicyLedger, acceptProposal, rejectProposal, recordOutcome } from '../loop-a/loop-a-engine.js';
import { getDecisionLog } from '../core/agent-loop.js';
import { formatDecisionForUI, getActiveFlows } from '../core/interpretability.js';
import { handleVoiceCommand, handleDirectCommand } from '../core/router.js';
import { runScenario } from '../scenario/scenario-driver.js';

export function createApiRouter() {
  const router = Router();
  const sseClients = new Set();

  function broadcast(type, payload) {
    const message = `data: ${JSON.stringify({ type, payload })}\n\n`;
    for (const res of sseClients) res.write(message);
  }

  bus.on('decision_logged', (d) => broadcast('decision', formatDecisionForUI(d)));
  bus.on('mandate_created', (m) => broadcast('mandate_created', m));
  bus.on('mandate_updated', (m) => broadcast('mandate_updated', m));
  bus.on('decision_class_updated', (dc) => broadcast('decision_class_updated', dc));
  bus.on('policy_proposed', (p) => broadcast('policy_proposed', p));
  bus.on('policy_accepted', (p) => broadcast('policy_accepted', p));
  bus.on('policy_rejected', (p) => broadcast('policy_rejected', p));
  bus.on('policy_revoked', (p) => broadcast('policy_revoked', p));
  bus.on('coordination_flow', (f) => broadcast('coordination_flow', f));

  router.get('/state', (req, res) => {
    res.json({
      budget: worldState.budget,
      mandates: worldState.mandates,
      vendors: worldState.vendors.registry,
      policyLedger: getPolicyLedger(),
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
    updateMandateStatus(mandate.id, 'committed');
    openEscrow(mandate.id, mandate.amount);
    res.json({ success: true });
  });

  router.post('/mandates/:id/reject', (req, res) => {
    const mandate = worldState.mandates.find((m) => m.id === req.params.id);
    if (!mandate) return res.status(404).json({ error: 'Unknown mandate' });
    try {
      updateMandateStatus(mandate.id, 'rejected');
      recordOutcome(mandate.decisionClassKey, { mandateId: mandate.id, amount: mandate.amount, outcome: 'rejected' });
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/mandates/:id/override', (req, res) => {
    const mandate = worldState.mandates.find((m) => m.id === req.params.id);
    if (!mandate) return res.status(404).json({ error: 'Unknown mandate' });
    try {
      updateMandateStatus(mandate.id, 'rejected');
      refundEscrow(mandate.id);
      recordOutcome(mandate.decisionClassKey, { mandateId: mandate.id, amount: mandate.amount, outcome: 'overridden' });
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/policies/:key/accept', (req, res) => {
    try {
      const policy = acceptProposal(decodeURIComponent(req.params.key), req.body || {});
      res.json({ success: true, policy });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/policies/:key/reject', (req, res) => {
    try {
      rejectProposal(decodeURIComponent(req.params.key));
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
    res.json({ success: true, started: true });
    runScenario({ onEvent: (e) => broadcast('scenario_event', e) }).catch((error) => broadcast('scenario_error', { message: error.message }));
  });

  return router;
}
