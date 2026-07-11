<script>
  import { roughen, jitter, toPath, ellipsePoints, mulberry32 } from './roughen.js';
  import { ENSO, GATE } from './layout.js';

  // The enso's mouth (the gate) opens at 3 o'clock; the ring is the stillest thing on
  // screen — it never animates.
  const GAP = 0.09;
  const arc = ellipsePoints(ENSO.cx, ENSO.cy, ENSO.rx, ENSO.ry, {
    startAngle: GAP,
    endAngle: Math.PI * 2 - GAP,
    segments: 96,
  });
  const stroke = toPath(jitter(arc, { seed: 'enso', amplitude: 2.6 }));
  const echo = toPath(jitter(arc, { seed: 'enso-echo', amplitude: 2.0 }));
  const wash = roughen(ellipsePoints(ENSO.cx, ENSO.cy, ENSO.rx - 8, ENSO.ry - 8, { segments: 64 }), {
    seed: 'wash',
    amplitude: 1.5,
    close: true,
  });

  // Grass at the fence line — short moss ticks along the lower outside of the ring.
  const rand = mulberry32(7);
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const angle = Math.PI * (0.25 + (0.5 * i) / 10) + (rand() - 0.5) * 0.06;
    const bx = ENSO.cx + Math.cos(angle) * (ENSO.rx + 4);
    const by = ENSO.cy + Math.sin(angle) * (ENSO.ry + 4);
    const length = 7 + rand() * 6;
    return `M ${bx.toFixed(1)} ${by.toFixed(1)} l ${(Math.cos(angle) * length).toFixed(1)} ${(Math.sin(angle) * length).toFixed(1)}`;
  }).join(' ');
</script>

<g>
  <title>The household trust boundary. Everything inside shares one principal; every interaction with a vendor crosses the gate — the opening at the right.</title>
  <path d={wash} class="wash" />
  <path d={echo} class="echo" />
  <path d={stroke} class="ring" />
  <path d={ticks} class="grass" />
  <text class="label" x={GATE[0] - 118} y={GATE[1] - 46}>household</text>
  <rect class="hanko" x={GATE[0] - 132} y={GATE[1] - 55} width="9" height="9" rx="2" />
</g>

<style>
  .wash {
    fill: var(--paper-deep);
    opacity: 0.45;
  }

  .ring {
    fill: none;
    stroke: var(--line-strong);
    stroke-width: 2.4;
    stroke-linecap: round;
  }

  .echo {
    fill: none;
    stroke: var(--line-strong);
    stroke-width: 1;
    opacity: 0.3;
    transform: translate(1px, 0.8px);
  }

  .grass {
    fill: none;
    stroke: var(--moss);
    stroke-width: 1.4;
    stroke-linecap: round;
    opacity: 0.3;
  }

  .label {
    font-family: var(--font-data);
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    fill: var(--ink-faint);
  }

  .hanko {
    fill: var(--clay);
    opacity: 0.75;
  }
</style>
