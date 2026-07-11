<script>
  import { pathFor } from './layout.js';
  import { parseClassKey } from '../ladder/class-key.js';

  let { dc } = $props();

  const edge = $derived(pathFor('sourcing', parseClassKey(dc.key).counterparty));
</script>

{#if edge}
  <g class="channel">
    <title>A standing policy: Sourcing may commit to this vendor automatically while the price stays under the cap. Every job is still verified.</title>
    <path d={edge.d} class="weave ambient" />
    <path d={edge.d} class="weave fine ambient" />
    {#if dc.everRevoked}
      <path d={edge.d} class="filament ambient" />
    {/if}
    <text class="tag" x={edge.tagPoint[0]} y={edge.tagPoint[1] - 10}>
      {dc.policy.id} · auto ≤ ${dc.policy.cap}
    </text>
  </g>
{/if}

<style>
  /* A standing policy simply exists: a woven thread, drifting slower than steam. */
  .weave {
    fill: none;
    stroke: var(--indigo);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-dasharray: 9 11;
    opacity: 0.3;
    animation: drift 30s linear infinite;
  }

  .weave.fine {
    stroke-width: 0.9;
    stroke-dasharray: 4 16;
    opacity: 0.22;
    animation-duration: 44s;
  }

  /* Mended trust stays visibly mended — a gold filament joins the weave. */
  .filament {
    fill: none;
    stroke: var(--gold);
    stroke-width: 1.1;
    stroke-linecap: round;
    stroke-dasharray: 2 15;
    opacity: 0.75;
    animation: drift 38s linear infinite;
  }

  @keyframes drift {
    to {
      stroke-dashoffset: -200;
    }
  }

  .tag {
    font-family: var(--font-data);
    font-size: 10px;
    text-anchor: middle;
    fill: var(--ink-soft);
    stroke: var(--paper);
    stroke-width: 3;
    paint-order: stroke;
  }

  @media (prefers-reduced-motion: reduce) {
    .weave,
    .filament {
      animation: none;
    }
  }
</style>
