import { addVendorToRegistry, worldState, bus } from '../core/world-state.js';

export function registerVendor(vendor) {
  return addVendorToRegistry({ reputation: 0.7, ...vendor });
}

export function findVendors(taskType) {
  return worldState.vendors.registry.filter((v) => v.task_type === taskType);
}

export function getVendor(id) {
  return worldState.vendors.registry.find((v) => v.id === id) || null;
}

export function updateReputation(id, delta) {
  const vendor = getVendor(id);
  if (!vendor) throw new Error(`Unknown vendor: ${id}`);
  vendor.reputation = Math.max(0, Math.min(1, Math.round((vendor.reputation + delta) * 100) / 100));
  worldState.freshness.vendors = Date.now();
  bus.emit('vendor_updated', vendor);
  return vendor;
}
