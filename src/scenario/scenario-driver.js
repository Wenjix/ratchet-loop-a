import { worldState, scheduleTask, advanceSimTime, updateMandateStatus } from '../core/world-state.js';
import { registerVendor } from '../coordination/vendor-registry.js';
import { openEscrow } from '../coordination/escrow-ledger.js';
import { getOrCreateDecisionClass, acceptProposal, rejectProposal, recordOutcome, resetDecisionClasses } from '../loop-a/loop-a-engine.js';
import { CEILING_BY_TASK_TYPE } from '../loop-a/decision-class.js';
import { executeSourcingTool } from '../agents/sourcing-agent.js';
import { executeVerificationTool } from '../agents/verification-agent.js';
import { executeSchedulerTool } from '../agents/scheduler-agent.js';
import { createVendorAgent } from '../vendors/vendor-agent.js';
import { VENDOR_ROSTER } from '../vendors/vendors.config.js';
import { CYCLE_COUNT, TASKS } from './scenario.config.js';

function autoApproveMandate() {
  return { decision: 'approve' };
}

function autoAcceptPolicy() {
  return { decision: 'accept' };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Holds an approver's answer for delayMs so escalated mandates / pending proposals stay
// visible (e.g. in the dashboard's Approval Inbox) before auto-resolution. delayMs of 0
// returns the approver unwrapped, so tests and `npm run demo` keep their instant pace.
function withApproverDelay(approver, delayMs) {
  if (!delayMs) return approver;
  return async (input) => {
    await sleep(delayMs);
    return approver(input);
  };
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
  // Scheduler check: confirm this task is actually due before Sourcing commits,
  // mirroring the spec's data flow (Scheduler emits task_due, Sourcing reacts).
  // This is a confirmatory check only — on the fixed seeded roster the task is
  // always due on schedule, so it does not gate mandate creation.
  const dueCheck = executeSchedulerTool('check_due', {});
  const isDue = dueCheck.success && dueCheck.due.some((t) => t.id === task.id);
  await onEvent({ type: 'task_due_checked', task_id: task.id, due: isDue });

  const amount = vendorAgent.quote();

  const commitResult = executeSourcingTool('commit_mandate', {
    task_id: task.id, task_type: task.task_type, vendor_id: vendorAgent.id, amount, scope: task.scope, category: task.category,
  });
  await onEvent({ type: 'mandate_drafted', task_id: task.id, vendor_id: vendorAgent.id, amount, auto_approved: commitResult.auto_approved });

  const mandate = worldState.mandates.find((m) => m.id === commitResult.mandate_id);

  if (!commitResult.auto_approved) {
    const { decision } = await mandateApprover({ mandate });
    // A human may have decided from the Approval Inbox while the (paced) approver was
    // waiting — the API route already committed + opened escrow, or rejected. Only act
    // on the approver's answer if the mandate is still awaiting a decision; acting twice
    // would double-open escrow or overwrite the human's call.
    if (mandate.status === 'pending_approval') {
      await onEvent({ type: 'mandate_decision', mandate_id: mandate.id, decision });
      if (decision !== 'approve') {
        updateMandateStatus(mandate.id, 'rejected');
        recordOutcome(mandate.decisionClassKey, { mandateId: mandate.id, amount, outcome: 'rejected' });
        return { mandate, verified: null, skipped: true };
      }
      updateMandateStatus(mandate.id, 'committed');
      openEscrow(mandate.id, amount);
    } else if (mandate.status !== 'committed') {
      // Human rejected (or overrode) it mid-window: the API route already recorded the
      // outcome, so the cycle just skips the job.
      await onEvent({ type: 'mandate_decision', mandate_id: mandate.id, decision: 'human_rejected' });
      return { mandate, verified: null, skipped: true };
    }
  }

  const attestation = vendorAgent.reportCompletion();
  await onEvent({ type: 'job_reported', mandate_id: mandate.id, attestation });

  const verifyResult = executeVerificationTool('verify_completion', { mandate_id: mandate.id, attestation });
  await onEvent({ type: 'job_verified', mandate_id: mandate.id, verified: verifyResult.verified });

  // Spend is now recorded by verify_completion itself (verification-agent.js) using the
  // mandate's category, since every real mandate carries one via commit_mandate's schema.
  // Recording it here too would double-count every cycle's spend.

  // Scheduler bookkeeping: roll this task's next_due_at forward now that the instance
  // is complete. cadence_days (7) matches the 7-day advanceSimTime step used below, so
  // this keeps every task due again exactly at the start of the next cycle.
  const scheduleResult = executeSchedulerTool('complete_task_cycle', { task_id: task.id });
  await onEvent({ type: 'task_cycle_completed', task_id: task.id, success: scheduleResult.success });

  const dc = getOrCreateDecisionClass(mandate.decisionClassKey, { ceiling: CEILING_BY_TASK_TYPE[task.task_type] || 'escalate' });
  if (dc.pendingProposal) {
    const { decision, cap } = await policyApprover({ decisionClass: dc });
    await onEvent({ type: 'policy_decision', key: dc.key, decision, cap: cap ?? dc.pendingProposal.cap });
    if (decision === 'accept') {
      acceptProposal(dc.key, cap ? { cap, humanEdited: true } : {});
    } else {
      rejectProposal(dc.key);
    }
  }

  return { mandate, verified: verifyResult.verified };
}

export async function runScenario({
  cycles = CYCLE_COUNT,
  mandateApprover = autoApproveMandate,
  policyApprover = autoAcceptPolicy,
  onEvent = () => {},
  pacing = {},
  approverDelayMs = 0,
} = {}) {
  const { stepMs = 0, cycleDelayMs = 0 } = pacing;
  // Every event funnels through this paced emitter: the caller's onEvent is awaited (so an
  // async handler — or a cancellation throw — actually pauses the run), then the run rests
  // for stepMs so a dashboard can render each beat.
  const emit = async (event) => {
    await onEvent(event);
    if (stepMs) await sleep(stepMs);
  };
  const pacedMandateApprover = withApproverDelay(mandateApprover, approverDelayMs);
  const pacedPolicyApprover = withApproverDelay(policyApprover, approverDelayMs);

  // scenario_started goes out before the world assembles, so a listening UI resets first
  // and then receives the setup's vendor_registered / decision_class_created broadcasts.
  await emit({ type: 'scenario_started', cycles, tasks: TASKS.map((t) => t.task_type) });

  const { vendorAgents } = setUpScenario();
  const results = [];

  for (let cycle = 0; cycle < cycles; cycle++) {
    await emit({ type: 'cycle_started', cycle, week: cycle + 1, totalCycles: cycles });
    for (const task of TASKS) {
      const vendorAgent = vendorAgents[task.vendor_id];
      const result = await runCycle({
        task,
        vendorAgent,
        mandateApprover: pacedMandateApprover,
        policyApprover: pacedPolicyApprover,
        onEvent: (e) => emit({ cycle, week: cycle + 1, totalCycles: cycles, task_type: task.task_type, ...e }),
      });
      results.push({ cycle, task_type: task.task_type, ...result });
    }
    advanceSimTime(7);
    // The week's closing beat: emitted before the inter-week pause so a UI can hold a
    // debrief on screen for the whole cycleDelayMs window.
    await emit({ type: 'cycle_completed', cycle, week: cycle + 1, totalCycles: cycles });
    if (cycleDelayMs) await sleep(cycleDelayMs);
  }

  await emit({
    type: 'scenario_completed',
    cycles,
    results: results.map(({ cycle, task_type, verified, skipped }) => ({ cycle, task_type, verified, skipped: skipped ?? false })),
  });

  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runScenario({ onEvent: (e) => console.log(JSON.stringify(e)) }).then((results) => {
    console.log(`Scenario complete: ${results.length} cycles run.`);
  });
}
