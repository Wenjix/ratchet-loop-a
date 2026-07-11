import test from 'node:test';
import assert from 'node:assert/strict';
import { startCascade, addCascadeAction, setCascadeConvergence, getCascadeTree, detectClosedLoop } from '../src/core/cascade-tracker.js';

test('startCascade creates a cascade with a root-less empty action list', () => {
  const c = startCascade({ trigger: 'task_due: lawn_mowing', source: 'auto-trigger' });
  assert.match(c.id, /^CASCADE-\d{3}$/);
  assert.equal(c.status, 'active');
  assert.equal(c.actions.length, 0);
});

test('addCascadeAction sets the first action as root and computes depth from parent', () => {
  const c = startCascade({ trigger: 'task_due: grocery_restock', source: 'auto-trigger' });
  const root = addCascadeAction(c.id, { agent: 'sourcing', action: 'commit_mandate', type: 'tool-call' });
  const child = addCascadeAction(c.id, { agent: 'loop-a', action: 'record_outcome', type: 'cascade', parentActionId: root.id });
  assert.equal(c.rootAction, root.id);
  assert.equal(root.depth, 0);
  assert.equal(child.depth, 1);
});

test('setCascadeConvergence marks the cascade converged with convergence metrics', () => {
  const c = startCascade({ trigger: 'task_due: plumbing_repair', source: 'auto-trigger' });
  setCascadeConvergence(c.id, { before: { pending: 1 }, after: { pending: 0 }, improvement: 'settled' });
  assert.equal(c.status, 'converged');
  assert.equal(c.metrics.convergence.improvement, 'settled');
});

test('getCascadeTree builds a nested tree from the flat action list', () => {
  const c = startCascade({ trigger: 'task_due: lawn_mowing', source: 'auto-trigger' });
  const root = addCascadeAction(c.id, { agent: 'sourcing', action: 'commit_mandate', type: 'tool-call' });
  addCascadeAction(c.id, { agent: 'loop-a', action: 'record_outcome', type: 'cascade', parentActionId: root.id });
  const tree = getCascadeTree(c.id);
  assert.equal(tree.tree.id, root.id);
  assert.equal(tree.tree.children.length, 1);
});

test('detectClosedLoop finds when the same agent acts twice in one cascade', () => {
  const c = startCascade({ trigger: 'task_due: grocery_restock', source: 'auto-trigger' });
  const first = addCascadeAction(c.id, { agent: 'loop-a', action: 'de-ratchet', type: 'cascade' });
  addCascadeAction(c.id, { agent: 'loop-a', action: 'record_outcome', type: 'cascade', parentActionId: first.id });
  const loops = detectClosedLoop(c.id);
  assert.equal(loops.length, 1);
  assert.equal(loops[0].agent, 'loop-a');
});
