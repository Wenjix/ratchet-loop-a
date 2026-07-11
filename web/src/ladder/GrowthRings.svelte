<script>
  import { roughen, ellipsePoints } from '../graph/roughen.js';

  let { streak = 0, seed = 'rings' } = $props();

  const CX = 26;
  const CY = 26;
  // Three ring slots — the crystallization threshold; growth past 3 reads as ×N.
  const rings = [12, 17, 22].map((r, i) =>
    roughen(ellipsePoints(CX, CY, r, r * 0.94, { segments: 30 }), {
      seed: `${seed}-ring-${i}`,
      amplitude: 1,
      close: true,
    }),
  );

  const shown = $derived(Math.min(streak, 3));
</script>

<div class="rings">
  <svg viewBox="0 0 52 52" width="52" height="52" aria-hidden="true">
    <circle cx={CX} cy={CY} r="4.5" class="pith" />
    {#each rings as ring, i (i)}
      <path d={ring} class="ring" class:grown={i < shown} class:threshold={i === 2} pathLength="1" />
    {/each}
  </svg>
  <span class="count">streak {streak}{streak > 3 ? ` · ×${streak}` : ''}</span>
</div>

<style>
  .rings {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .pith {
    fill: var(--ink);
    opacity: 0.25;
  }

  /* Each clean approval draws one ring on — wood grows outward, slowly. */
  .ring {
    fill: none;
    stroke: var(--ink);
    stroke-width: 1.2;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    opacity: 0;
    transition:
      stroke-dashoffset var(--dur-grow) var(--ease-calm),
      opacity var(--dur-grow) var(--ease-calm);
  }

  .ring.grown {
    stroke-dashoffset: 0;
    opacity: 0.3;
  }

  .ring.threshold.grown {
    opacity: 0.55;
  }

  .count {
    font-family: var(--font-data);
    font-size: 9.5px;
    color: var(--ink-faint);
  }
</style>
