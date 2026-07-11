import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();

export const worldState = {
  budget: {
    categories: {},
  },
  vendors: {
    registry: [],
  },
  tasks: {
    schedule: [],
    active: [],
    simTime: 0,
  },
  policies: {
    decisionClasses: {},
  },
  mandates: [],
  escrow: {
    entries: [],
  },
  alerts: [],
  freshness: {
    budget: 0,
    vendors: 0,
    tasks: 0,
    mandates: 0,
  },
};

export function recordSpend(category, amount) {
  const cat = worldState.budget.categories[category];
  if (!cat) throw new Error(`Unknown budget category: ${category}`);
  cat.spent_this_month += amount;
  worldState.freshness.budget = Date.now();
  bus.emit('budget_updated', { category, spent_this_month: cat.spent_this_month });
  return cat;
}

export function addVendorToRegistry(vendor) {
  worldState.vendors.registry.push(vendor);
  worldState.freshness.vendors = Date.now();
  bus.emit('vendor_registered', vendor);
  return vendor;
}

export function scheduleTask(task) {
  worldState.tasks.schedule.push(task);
  worldState.freshness.tasks = Date.now();
  bus.emit('task_scheduled', task);
  return task;
}

export function advanceSimTime(days) {
  worldState.tasks.simTime += days;
  worldState.freshness.tasks = Date.now();
  bus.emit('sim_time_advanced', worldState.tasks.simTime);
  return worldState.tasks.simTime;
}

export function completeTaskCycle(taskId) {
  const task = worldState.tasks.schedule.find((t) => t.id === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  task.last_completed_at = worldState.tasks.simTime;
  task.next_due_at = worldState.tasks.simTime + task.cadence_days;
  worldState.freshness.tasks = Date.now();
  bus.emit('task_scheduled', task);
  return task;
}

export function pushMandate(mandate) {
  const full = { status: 'pending_approval', createdAt: Date.now(), ...mandate };
  worldState.mandates.push(full);
  worldState.freshness.mandates = Date.now();
  bus.emit('mandate_created', full);
  return full;
}

export function updateMandateStatus(mandateId, status, extra = {}) {
  const mandate = worldState.mandates.find((m) => m.id === mandateId);
  if (!mandate) throw new Error(`Unknown mandate: ${mandateId}`);
  Object.assign(mandate, { status, ...extra });
  worldState.freshness.mandates = Date.now();
  bus.emit('mandate_updated', mandate);
  return mandate;
}

export function pushAlert(alert) {
  const full = {
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    acknowledged: false,
    ...alert,
  };
  worldState.alerts.unshift(full);
  bus.emit('alert', full);
  return full;
}
