<script>
  import { pathFor } from './layout.js';
  import { toneFor } from '../theme/agent-tones.js';

  let { flow } = $props();

  const edge = $derived(pathFor(flow.from, flow.to));
  const dur = $derived(flow.duration ?? 4000);
  const tone = $derived(flow.type === 'cascade' ? 'var(--iron)' : toneFor({ agent: flow.from, color: flow.color }));
</script>

{#if edge}
  <g class="flow" class:cascade={flow.type === 'cascade'} style:--mote-dur="{dur}ms">
    <path d={edge.d} class="trail" style:stroke={tone} />
    <g class="mote">
      <animateMotion dur="{dur}ms" path={edge.d} fill="freeze" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.4 0 0.2 1" />
      <circle r="9" class="soft" style:fill={tone} />
      <circle r="5" class="mid" style:fill={tone} />
      <circle r="2.5" class="core" style:fill={tone} />
    </g>
    {#if flow.label}
      <text class="whisper" x={edge.tagPoint[0]} y={edge.tagPoint[1] + 20}>{flow.label}</text>
    {/if}
  </g>
{/if}

<style>
  .flow {
    animation: envelope var(--mote-dur) var(--ease-calm) forwards;
  }

  /* Steam, not traffic: swell in over the first stretch, thin away at the end. */
  @keyframes envelope {
    0% {
      opacity: 0;
    }
    15% {
      opacity: 1;
    }
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  .trail {
    fill: none;
    stroke-width: 1;
    opacity: 0.09;
  }

  .cascade .trail {
    opacity: 0.16;
  }

  .soft {
    opacity: 0.08;
    filter: blur(3px);
  }

  .mid {
    opacity: 0.18;
  }

  .core {
    opacity: 0.55;
  }

  .whisper {
    font-family: var(--font-data);
    font-size: 9.5px;
    text-anchor: middle;
    fill: var(--ink-faint);
    opacity: 0.75;
    stroke: var(--paper);
    stroke-width: 3;
    paint-order: stroke;
  }

  @media (prefers-reduced-motion: reduce) {
    .flow {
      animation: none;
      opacity: 0.6;
    }
  }
</style>
