// src/agents/sourcing-agent.js
import { worldState, pushMandate, updateMandateStatus } from '../core/world-state.js';
import { findVendors } from '../coordination/vendor-registry.js';
import { openEscrow } from '../coordination/escrow-ledger.js';
import { buildDecisionClassKey, CEILING_BY_TASK_TYPE } from '../loop-a/decision-class.js';
import { getOrCreateDecisionClass, checkPolicy } from '../loop-a/loop-a-engine.js';
import { startCascade, addCascadeAction } from '../core/cascade-tracker.js';
import { runAgentLoop } from '../core/agent-loop.js';

const SOURCING_SYSTEM_PROMPT = `You are SOURCING, the vendor-discovery and mandate-drafting agent in a Ratchet Loop A prototype.

ROLE: Find vendors for a recurring household task, get quotes, and commit a Cart Mandate (vendor, price, scope). You do not decide whether a mandate needs principal approval — that is determined automatically by the Loop A policy engine when you call commit_mandate.

CONSTRAINTS:
- Only commit a mandate to a vendor that actually serves the requested task_type.
- Prefer the vendor with the best reputation when quotes are otherwise similar.`;

const SOURCING_TOOLS = [
  { name: 'get_vendor_quotes', description: 'Get vendors and price ranges for a task type.', input_schema: { type: 'object', properties: { task_type: { type: 'string' } }, required: ['task_type'] } },
  {
    name: 'commit_mandate',
    description: 'Draft and commit a Cart Mandate for a task instance. Loop A decides whether this auto-executes or requires principal approval.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' }, task_type: { type: 'string' }, vendor_id: { type: 'string' },
        amount: { type: 'number' }, scope: { type: 'string' },
      },
      required: ['task_id', 'task_type', 'vendor_id', 'amount', 'scope'],
    },
  },
];

export function executeSourcingTool(toolName, toolInput) {
  switch (toolName) {
    case 'get_vendor_quotes': {
      const vendors = findVendors(toolInput.task_type);
      return { success: true, vendors: vendors.map((v) => ({ vendor_id: v.id, name: v.name, price_range: v.price_range, reputation: v.reputation })) };
    }
    case 'commit_mandate': {
      const { task_id, task_type, vendor_id, amount, scope } = toolInput;
      const key = buildDecisionClassKey({ agent: 'sourcing', action: 'commit_mandate', counterparty: vendor_id, task_type, amount });
      getOrCreateDecisionClass(key, { ceiling: CEILING_BY_TASK_TYPE[task_type] || 'escalate' });
      const { autoApprove, reason } = checkPolicy(key, amount);

      const cascade = startCascade({ trigger: `commit_mandate: ${task_type} to ${vendor_id}`, source: autoApprove ? 'auto-trigger' : 'principal' });
      const mandate = pushMandate({
        id: `mandate-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        task_id, task_type, vendor_id, amount, scope,
        decisionClassKey: key,
        cascadeId: cascade.id,
      });
      addCascadeAction(cascade.id, { agent: 'sourcing', action: 'commit_mandate', type: 'tool-call', input: toolInput, result: { mandateId: mandate.id, autoApprove } });

      if (autoApprove) {
        updateMandateStatus(mandate.id, 'committed');
        openEscrow(mandate.id, amount);
      }

      return { success: true, mandate_id: mandate.id, auto_approved: autoApprove, reason };
    }
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

export async function callSourcingAgent(userMessage) {
  return runAgentLoop({
    systemPrompt: SOURCING_SYSTEM_PROMPT,
    tools: SOURCING_TOOLS,
    toolExecutor: executeSourcingTool,
    agentName: 'sourcing',
    userMessage,
    contextBuilder: () => `${worldState.vendors.registry.length} vendors registered. ${worldState.mandates.filter((m) => m.status === 'pending_approval').length} mandates awaiting approval.`,
  });
}
