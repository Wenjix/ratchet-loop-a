import test from 'node:test';
import assert from 'node:assert/strict';
import { bus } from '../src/core/world-state.js';
import { formatDecisionForUI, getActiveFlows } from '../src/core/interpretability.js';

test('formatDecisionForUI formats a tool-call decision with agent color and tool label', () => {
  const formatted = formatDecisionForUI({
    id: 'dec-1', agent: 'budget', type: 'tool-call', action: 'check_budget',
    reason: 'principal asked for a status update', timestamp: '2026-01-01T00:00:00.000Z',
    input: { category: 'lawn_care' }, result: { success: true },
  });
  assert.equal(formatted.color, '#F59E0B');
  assert.equal(formatted.summary, 'Checked budget');
});

test('formatDecisionForUI marks a failed tool call as BLOCKED', () => {
  const formatted = formatDecisionForUI({
    id: 'dec-2', agent: 'sourcing', type: 'tool-call', action: 'commit_mandate',
    timestamp: '2026-01-01T00:00:00.000Z', result: { success: false },
  });
  assert.match(formatted.summary, /\[BLOCKED\]$/);
});

test('formatDecisionForUI formats an inter-agent-request', () => {
  const formatted = formatDecisionForUI({
    id: 'dec-3', agent: 'sourcing', type: 'inter-agent-request', action: 'inspect the last mow',
    timestamp: '2026-01-01T00:00:00.000Z', data: { to: 'verification' },
  });
  assert.equal(formatted.summary, '→ VERIFICATION: inspect the last mow');
});

test('an inter-agent-request decision_logged event produces a non-cross-principal flow', () => {
  bus.emit('decision_logged', {
    id: 'dec-4', agent: 'sourcing', type: 'inter-agent-request', action: 'inspect the mow',
    timestamp: '2026-01-01T00:00:00.000Z', data: { to: 'verification' },
  });
  const flow = getActiveFlows().find((f) => f.from === 'sourcing' && f.to === 'verification');
  assert.ok(flow);
  assert.equal(flow.crossPrincipal, false);
});

test('mandate_created produces a cross-principal flow to the vendor', () => {
  bus.emit('mandate_created', { id: 'm1', vendor_id: 'greenblade' });
  const flow = getActiveFlows().find((f) => f.id === 'flow-mandate-m1');
  assert.ok(flow);
  assert.equal(flow.crossPrincipal, true);
  assert.equal(flow.to, 'greenblade');
});
