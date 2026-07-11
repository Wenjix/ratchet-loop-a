import { worldState, completeTaskCycle } from '../core/world-state.js';
import { runAgentLoop } from '../core/agent-loop.js';

const SCHEDULER_SYSTEM_PROMPT = `You are SCHEDULER, the household task-cadence agent in a Ratchet Loop A prototype.

ROLE: Track recurring household tasks (lawn mowing, grocery restock, plumbing checks) and tell the principal or Sourcing when a task is due. You do not source vendors or spend money — you only track timing.`;

const SCHEDULER_TOOLS = [
  { name: 'get_schedule', description: 'List every tracked recurring task.', input_schema: { type: 'object', properties: {} } },
  { name: 'check_due', description: 'List tasks whose next_due_at has arrived.', input_schema: { type: 'object', properties: {} } },
  { name: 'complete_task_cycle', description: 'Mark a task instance complete and roll its next due date forward.', input_schema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] } },
];

export function executeSchedulerTool(toolName, toolInput) {
  switch (toolName) {
    case 'get_schedule':
      return { success: true, schedule: worldState.tasks.schedule };
    case 'check_due': {
      const due = worldState.tasks.schedule.filter((t) => t.next_due_at <= worldState.tasks.simTime);
      return { success: true, due, simTime: worldState.tasks.simTime };
    }
    case 'complete_task_cycle': {
      try {
        const task = completeTaskCycle(toolInput.task_id);
        return { success: true, task };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

export async function callSchedulerAgent(userMessage) {
  return runAgentLoop({
    systemPrompt: SCHEDULER_SYSTEM_PROMPT,
    tools: SCHEDULER_TOOLS,
    toolExecutor: executeSchedulerTool,
    agentName: 'scheduler',
    userMessage,
    contextBuilder: () => `Sim day ${worldState.tasks.simTime}. Tracking ${worldState.tasks.schedule.length} recurring tasks.`,
  });
}
