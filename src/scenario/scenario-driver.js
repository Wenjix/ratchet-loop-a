import { worldState, scheduleTask, advanceSimTime, updateMandateStatus } from '../core/world-state.js';
import { registerVendor } from '../coordination/vendor-registry.js';
import { openEscrow } from '../coordination/escrow-ledger.js';
import { getOrCreateDecisionClass, acceptProposal, rejectProposal, recordOutcome, resetDecisionClasses } from '../loop-a/loop-a-engine.js';
import { CEILING_BY_TASK_TYPE } from '../loop-a/decision-class.js';
import { executeSourcingTool } from '../agents/sourcing-agent.js';
import { executeVerificationTool } from '../agents/verification-agent.js';
import { createVendorAgent } from '../vendors/vendor-agent.js';
import { VENDOR_ROSTER } from '../vendors/vendors.config.js';
import { CYCLE_COUNT, TASKS } from './scenario.config.js';

function autoApproveMandate() {
  return { decision: 'approve' };
}

function autoAcceptPolicy() {
  return { decision: 'accept' };
}

export function setUpScenario() {
  worldState.vendors.registry = [];
  worldState.mandates = [];
  worldState.tasks.schedule = [];
  worldState.tasks.simTime = 0;
  // Task 19 carry-forward fix (from Task 18's review): also reset loop-a-engine.js's
  // own module-level state so a second/third runScenario() call in the same server
  // process starts completely fresh instead of compounding streaks / misnumbering policies.
  resetDecisionClasses();

  const vendorAgents = {};
  for (const config of VENDOR_ROSTER) {
    registerVendor({ id: config.id, name: config.name, task_type: config.task_type, price_range: config.price_range, reputation: 0.7 });
    vendorAgents[config.id] = createVendorAgent(config);
  }

  for (const task of TASKS) {
    worldState.budget.categories[task.category] = { cap_per_month: task.cap_per_month, spent_this_month: 0 };
    scheduleTask({ id: task.id, task_type: task.task_type, cadence_days: task.cadence_days, last_completed_at: null, next_due_at: 0 });
  }

  return { vendorAgents };
}

export async function runCycle({ task, vendorAgent, mandateApprover = autoApproveMandate, policyApprover = autoAcceptPolicy, onEvent = () => {} }) {
  const amount = vendorAgent.quote();

  const commitResult = executeSourcingTool('commit_mandate', {
    task_id: task.id, task_type: task.task_type, vendor_id: vendorAgent.id, amount, scope: task.scope, category: task.category,
  });
  onEvent({ type: 'mandate_drafted', task_id: task.id, vendor_id: vendorAgent.id, amount, auto_approved: commitResult.auto_approved });

  const mandate = worldState.mandates.find((m) => m.id === commitResult.mandate_id);

  if (!commitResult.auto_approved) {
    const { decision } = await mandateApprover({ mandate });
    onEvent({ type: 'mandate_decision', mandate_id: mandate.id, decision });
    if (decision !== 'approve') {
      updateMandateStatus(mandate.id, 'rejected');
      recordOutcome(mandate.decisionClassKey, { mandateId: mandate.id, amount, outcome: 'rejected' });
      return { mandate, verified: null, skipped: true };
    }
    updateMandateStatus(mandate.id, 'committed');
    openEscrow(mandate.id, amount);
  }

  const attestation = vendorAgent.reportCompletion();
  onEvent({ type: 'job_reported', mandate_id: mandate.id, attestation });

  const verifyResult = executeVerificationTool('verify_completion', { mandate_id: mandate.id, attestation });
  onEvent({ type: 'job_verified', mandate_id: mandate.id, verified: verifyResult.verified });

  // Spend is now recorded by verify_completion itself (verification-agent.js) using the
  // mandate's category, since every real mandate carries one via commit_mandate's schema.
  // Recording it here too would double-count every cycle's spend.

  const dc = getOrCreateDecisionClass(mandate.decisionClassKey, { ceiling: CEILING_BY_TASK_TYPE[task.task_type] || 'escalate' });
  if (dc.pendingProposal) {
    const { decision, cap } = await policyApprover({ decisionClass: dc });
    onEvent({ type: 'policy_decision', key: dc.key, decision, cap: cap ?? dc.pendingProposal.cap });
    if (decision === 'accept') {
      acceptProposal(dc.key, cap ? { cap, humanEdited: true } : {});
    } else {
      rejectProposal(dc.key);
    }
  }

  return { mandate, verified: verifyResult.verified };
}

export async function runScenario({ cycles = CYCLE_COUNT, mandateApprover, policyApprover, onEvent } = {}) {
  const { vendorAgents } = setUpScenario();
  const results = [];

  for (let cycle = 0; cycle < cycles; cycle++) {
    for (const task of TASKS) {
      const vendorAgent = vendorAgents[task.vendor_id];
      const result = await runCycle({ task, vendorAgent, mandateApprover, policyApprover, onEvent });
      results.push({ cycle, task_type: task.task_type, ...result });
    }
    advanceSimTime(7);
  }

  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runScenario({ onEvent: (e) => console.log(JSON.stringify(e)) }).then((results) => {
    console.log(`Scenario complete: ${results.length} cycles run.`);
  });
}
