import { bus, worldState } from '../core/world-state.js';

export function openEscrow(mandateId, amount) {
  const entry = { mandateId, amount, status: 'held', openedAt: Date.now(), closedAt: null };
  worldState.escrow.entries.push(entry);
  bus.emit('escrow_opened', entry);
  return entry;
}

function findEntry(mandateId) {
  const entry = worldState.escrow.entries.find((e) => e.mandateId === mandateId);
  if (!entry) throw new Error(`No escrow entry for mandate ${mandateId}`);
  return entry;
}

export function releaseEscrow(mandateId) {
  const entry = findEntry(mandateId);
  // Defense-in-depth: only a 'held' entry can be released. Route-level and agent-level
  // guards should already prevent a second call from reaching here, but this stops a
  // closed entry (already 'released' or 'refunded') from being silently re-transitioned.
  if (entry.status !== 'held') {
    throw new Error(`Escrow entry for mandate ${mandateId} is not held (status: ${entry.status})`);
  }
  entry.status = 'released';
  entry.closedAt = Date.now();
  bus.emit('escrow_released', entry);
  return entry;
}

export function refundEscrow(mandateId) {
  const entry = findEntry(mandateId);
  if (entry.status !== 'held') {
    throw new Error(`Escrow entry for mandate ${mandateId} is not held (status: ${entry.status})`);
  }
  entry.status = 'refunded';
  entry.closedAt = Date.now();
  bus.emit('escrow_refunded', entry);
  return entry;
}

export function getEscrowEntry(mandateId) {
  return worldState.escrow.entries.find((e) => e.mandateId === mandateId) || null;
}

export function getLedger() {
  return worldState.escrow.entries;
}
