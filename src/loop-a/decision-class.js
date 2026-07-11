const TASK_PRICE_BANDS = {
  lawn_mowing: '0-75',
  grocery_restock: '75-175',
  plumbing_repair: '175-450',
};

export const CEILING_BY_TASK_TYPE = {
  lawn_mowing: 'auto',
  grocery_restock: 'auto',
  plumbing_repair: 'escalate',
};

export function amountBand(taskType, amount) {
  const band = TASK_PRICE_BANDS[taskType];
  if (!band) throw new Error(`Unknown task type for pricing: ${taskType}`);
  return band;
}

export function buildDecisionClassKey({ agent, action, counterparty, task_type, amount }) {
  const band = amountBand(task_type, amount);
  return `${agent}:${action}:${counterparty}:${task_type}:${band}`;
}
