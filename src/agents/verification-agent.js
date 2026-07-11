// src/agents/verification-agent.js
import { worldState, updateMandateStatus, recordSpend } from '../core/world-state.js';
import { releaseEscrow, refundEscrow } from '../coordination/escrow-ledger.js';
import { updateReputation } from '../coordination/vendor-registry.js';
import { recordOutcome } from '../loop-a/loop-a-engine.js';
import { addCascadeAction, setCascadeConvergence } from '../core/cascade-tracker.js';
import { runAgentLoop } from '../core/agent-loop.js';

const VERIFICATION_SYSTEM_PROMPT = `You are VERIFICATION, the completion-oracle agent in a Ratchet Loop A prototype.

ROLE: When a vendor reports a job done, check their completion attestation and rule whether the job was actually done well. Your ruling settles or disputes the escrow, updates vendor reputation, and feeds Loop A's crystallization/de-ratchet logic — you are the mechanism that makes trust earned rather than assumed.

CONSTRAINTS:
- Rule strictly from the attestation you are given. Do not assume a job is good just because a mandate was auto-approved.`;

const VERIFICATION_TOOLS = [
  {
    name: 'verify_completion',
    description: 'Rule on a vendor completion attestation for a mandate.',
    input_schema: {
      type: 'object',
      properties: {
        mandate_id: { type: 'string' },
        attestation: { type: 'object', properties: { self_reported_ok: { type: 'boolean' }, notes: { type: 'string' } } },
      },
      required: ['mandate_id', 'attestation'],
    },
  },
];

export function executeVerificationTool(toolName, toolInput) {
  switch (toolName) {
    case 'verify_completion': {
      const { mandate_id, attestation } = toolInput;
      const mandate = worldState.mandates.find((m) => m.id === mandate_id);
      if (!mandate) return { success: false, error: `Unknown mandate: ${mandate_id}` };

      // Idempotency guard: verify_completion may only settle a mandate that is still
      // 'committed'. Without this, a duplicate call (retried request, duplicate LLM tool
      // call) would re-run releaseEscrow/refundEscrow, re-apply updateReputation, and
      // re-call recordOutcome for the same real-world completion, double-counting toward
      // Loop A's streak and inflating vendor reputation.
      if (mandate.status !== 'committed') {
        return { success: false, error: `Mandate ${mandate_id} is not committed (status: ${mandate.status})` };
      }

      const verified = attestation?.self_reported_ok ? 'good' : 'bad';

      // Deviation from the brief (see task-15-report.md): a mandate that exists but was never
      // committed through commit_mandate — so openEscrow was never called for it — would pass the
      // !mandate guard above and then crash uncaught inside releaseEscrow/refundEscrow
      // (escrow-ledger.js throws "No escrow entry for mandate ..." when no entry exists). This is
      // the same bug shape fixed in Task 14 (record_spend/complete_task_cycle): wrap the
      // throwing calls and return a structured error instead of letting the throw escape.
      try {
        if (verified === 'good') {
          releaseEscrow(mandate_id);
          updateMandateStatus(mandate_id, 'settled');
          updateReputation(mandate.vendor_id, 0.05);
          // Settlement is the sole place spend should be recorded against a budget category.
          // Mandates created outside commit_mandate's schema (e.g. hand-built in tests) may
          // carry no category — skip recording rather than throwing "Unknown budget category"
          // and aborting an otherwise-successful verification.
          if (mandate.category) {
            recordSpend(mandate.category, mandate.amount);
          }
        } else {
          refundEscrow(mandate_id);
          updateMandateStatus(mandate_id, 'disputed');
          updateReputation(mandate.vendor_id, -0.15);
        }
      } catch (error) {
        return { success: false, error: error.message };
      }

      const outcome = verified === 'good' ? 'approved-clean' : 'approved-then-failed';
      recordOutcome(mandate.decisionClassKey, { mandateId: mandate_id, amount: mandate.amount, outcome });

      if (mandate.cascadeId) {
        addCascadeAction(mandate.cascadeId, { agent: 'verification', action: 'verify_completion', type: 'tool-call', input: toolInput, result: { verified } });
        setCascadeConvergence(mandate.cascadeId, {
          before: { status: 'pending' },
          after: { status: verified === 'good' ? 'settled' : 'disputed' },
          improvement: verified === 'good' ? 'settled cleanly' : 'flagged and refunded',
        });
      }

      return { success: true, mandate_id, verified };
    }
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

export async function callVerificationAgent(userMessage) {
  return runAgentLoop({
    systemPrompt: VERIFICATION_SYSTEM_PROMPT,
    tools: VERIFICATION_TOOLS,
    toolExecutor: executeVerificationTool,
    agentName: 'verification',
    userMessage,
    contextBuilder: () => `${worldState.mandates.filter((m) => m.status === 'committed').length} mandates awaiting verification.`,
  });
}
