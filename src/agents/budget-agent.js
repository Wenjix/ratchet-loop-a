import { worldState, recordSpend } from '../core/world-state.js';
import { runAgentLoop } from '../core/agent-loop.js';

const BUDGET_SYSTEM_PROMPT = `You are BUDGET, the household spend-tracking agent in a Ratchet Loop A prototype.

ROLE: Track spend caps per category, flag overspend risk, and answer the principal's questions about what has been spent. You do not commit mandates to vendors or negotiate — that is Sourcing's job.

CONSTRAINTS:
- Never silently raise a category cap. If asked to raise one, say so explicitly and note it requires a Sourcing mandate to actually spend against it.
- If a category is within 10% of its cap, proactively flag it.`;

const BUDGET_TOOLS = [
  { name: 'check_budget', description: 'Check the cap, spend, and remaining budget for a category.', input_schema: { type: 'object', properties: { category: { type: 'string' } }, required: ['category'] } },
  { name: 'record_spend', description: 'Record a settled spend against a category.', input_schema: { type: 'object', properties: { category: { type: 'string' }, amount: { type: 'number' } }, required: ['category', 'amount'] } },
  { name: 'get_all_categories', description: 'List every budget category with cap and current spend.', input_schema: { type: 'object', properties: {} } },
];

export function executeBudgetTool(toolName, toolInput) {
  switch (toolName) {
    case 'check_budget': {
      const cat = worldState.budget.categories[toolInput.category];
      if (!cat) return { success: false, error: `Unknown category: ${toolInput.category}` };
      return { success: true, category: toolInput.category, cap_per_month: cat.cap_per_month, spent_this_month: cat.spent_this_month, remaining: cat.cap_per_month - cat.spent_this_month };
    }
    case 'record_spend': {
      const cat = recordSpend(toolInput.category, toolInput.amount);
      return { success: true, category: toolInput.category, spent_this_month: cat.spent_this_month };
    }
    case 'get_all_categories':
      return { success: true, categories: worldState.budget.categories };
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

export async function callBudgetAgent(userMessage) {
  return runAgentLoop({
    systemPrompt: BUDGET_SYSTEM_PROMPT,
    tools: BUDGET_TOOLS,
    toolExecutor: executeBudgetTool,
    agentName: 'budget',
    userMessage,
    contextBuilder: () => Object.entries(worldState.budget.categories)
      .map(([name, c]) => `${name}: $${c.spent_this_month}/$${c.cap_per_month}`)
      .join('; ') || 'No budget categories configured yet.',
  });
}
