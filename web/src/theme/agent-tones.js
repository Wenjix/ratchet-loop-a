// The backend keeps broadcasting its canonical saturated hexes (src/core/interpretability.js).
// The UI never paints with payload colors directly: identity is resolved here — by agent
// name first, by canonical hex second — into the muted washi tones. Unknown agents fall
// back to the raw payload hex so new backend agents still render.
const TONES = {
  budget: 'var(--agent-budget)',
  scheduler: 'var(--agent-scheduler)',
  sourcing: 'var(--agent-sourcing)',
  verification: 'var(--agent-verification)',
  router: 'var(--agent-router)',
  system: 'var(--agent-system)',
};

const CANONICAL_HEX = {
  '#F59E0B': TONES.budget,
  '#8B5CF6': TONES.scheduler,
  '#06B6D4': TONES.sourcing,
  '#22C55E': TONES.verification,
  '#9CA3AF': TONES.router,
  '#6B7280': TONES.system,
};

export function toneFor({ agent, color } = {}) {
  if (agent && TONES[agent]) return TONES[agent];
  if (color && CANONICAL_HEX[color.toUpperCase()]) return CANONICAL_HEX[color.toUpperCase()];
  return color || 'var(--ink-soft)';
}
