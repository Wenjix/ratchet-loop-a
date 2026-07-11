// Fixed, choreographed layout — a narrative demo needs identical framing every run, so
// there is no force simulation. All geometry (including the hand-drawn wobble) is
// computed once at module load.
import { jitter, toPath, linePoints, quadPoints } from './roughen.js';

export const VIEW = { width: 1600, height: 900 };

// The household garden sits inside the enso; vendors wait beyond the fence.
export const ENSO = { cx: 500, cy: 450, rx: 360, ry: 330 };
// The enso's open mouth is the gate — every cross-principal path passes through it.
export const GATE = [ENSO.cx + ENSO.rx, ENSO.cy]; // (860, 450)

export const NODES = {
  budget: { x: 420, y: 250, kind: 'agent', label: 'budget', glyph: 'B' },
  scheduler: { x: 400, y: 640, kind: 'agent', label: 'scheduler', glyph: 'S' },
  sourcing: { x: 690, y: 430, kind: 'agent', label: 'sourcing', glyph: 'So' },
  verification: { x: 560, y: 660, kind: 'agent', label: 'verification', glyph: 'V' },
  // The human sits ON the boundary at 12 o'clock — the authority the fence answers to.
  // Escalated mandates detour here before they may cross the gate; policy-covered ones don't.
  principal: { x: 500, y: 120, kind: 'principal', label: 'principal' },
  greenblade: { x: 1250, y: 220, kind: 'vendor' },
  freshcart: { x: 1250, y: 450, kind: 'vendor' },
  quickfix: { x: 1250, y: 680, kind: 'vendor' },
};

const pathCache = new Map();

function sampledPointsFor(from, to) {
  const a = NODES[from];
  const b = NODES[to];
  if (!a || !b) return null;

  // Only vendor-facing paths cross the boundary; agent↔agent and agent↔principal
  // stay inside the garden.
  const crossesBoundary = (a.kind === 'vendor') !== (b.kind === 'vendor');
  if (!crossesBoundary) {
    // Internal garden path: a gentle arc between two household points.
    const midX = (a.x + b.x) / 2 + (b.y - a.y) * 0.18;
    const midY = (a.y + b.y) / 2 - (b.x - a.x) * 0.18;
    return { points: quadPoints([a.x, a.y], [midX, midY], [b.x, b.y], 28), gateFraction: null };
  }

  // Cross-principal: route through the gate so every external interaction visibly
  // crosses one threshold. Two quadratic legs, inside → gate → outside.
  const inside = a.kind !== 'vendor' ? a : b;
  const outside = a.kind !== 'vendor' ? b : a;
  const legIn = quadPoints(
    [inside.x, inside.y],
    [(inside.x + GATE[0]) / 2 + 20, (inside.y + GATE[1]) / 2],
    GATE,
    20,
  );
  const legOut = quadPoints(
    GATE,
    [(GATE[0] + outside.x) / 2, (GATE[1] + outside.y) / 2 + (outside.y - GATE[1]) * 0.15],
    [outside.x, outside.y],
    20,
  );
  let points = [...legIn, ...legOut.slice(1)];
  let gateIndex = legIn.length - 1;
  if (a !== inside) {
    points = points.slice().reverse();
    gateIndex = points.length - 1 - gateIndex;
  }
  return { points, gateFraction: gateIndex / (points.length - 1) };
}

// Returns { d, gateFraction } for a from→to edge, or null when either endpoint is
// unknown (e.g. router decisions) — callers skip rendering those flows.
export function pathFor(from, to) {
  const key = `${from}->${to}`;
  if (pathCache.has(key)) return pathCache.get(key);
  const sampled = sampledPointsFor(from, to);
  const entry = sampled
    ? {
        d: toPath(jitter(sampled.points, { seed: key, amplitude: 1.6 })),
        gateFraction: sampled.gateFraction,
        mid: sampled.points[Math.floor(sampled.points.length / 2)],
        // Label anchor past the gate — tags read outside the fence, clear of the nodes.
        tagPoint: sampled.points[Math.floor((sampled.points.length - 1) * 0.68)],
      }
    : null;
  pathCache.set(key, entry);
  return entry;
}

export function edgeFor(classKey, counterparty) {
  return pathFor('sourcing', counterparty);
}

// A short soil line under the garden — one of the few purely decorative strokes.
export const SOIL_LINE = toPath(jitter(linePoints([180, 815], [830, 815], 24), { seed: 'soil', amplitude: 2.4 }));
