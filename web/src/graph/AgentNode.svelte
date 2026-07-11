<script>
  import { world } from '../state/world.svelte.js';
  import { roughen, ellipsePoints } from './roughen.js';

  let { id, node } = $props();

  // Same one-line roles the opening card introduces — kept hoverable for reference
  // after the card dismisses.
  const ROLES = {
    budget: 'Budget — holds the monthly caps per category and records every settled dollar.',
    scheduler: 'Scheduler — keeps the week; flags each task as it falls due.',
    sourcing: 'Sourcing — picks the vendor, takes the quote, drafts the mandate. The only agent that commits money.',
    verification: 'Verification — the completion oracle: rules good or bad on every finished job before escrow settles.',
  };

  const R = 34;
  const ring = roughen(ellipsePoints(node.x, node.y, R, R, { segments: 40 }), {
    seed: `agent-${id}`,
    amplitude: 1.4,
    close: true,
  });
  const tone = `var(--agent-${id})`;

  const activity = $derived(world.agentActivity[id]);
</script>

<g class="agent">
  {#if ROLES[id]}
    <title>{ROLES[id]}</title>
  {/if}
  <path d={ring} class="fill" style:fill={tone} />
  {#key activity?.at}
    <path d={ring} class="halo" class:breathe={Boolean(activity)} style:fill={tone} />
  {/key}
  <path d={ring} class="outline" style:stroke={tone} />
  <text class="glyph" x={node.x} y={node.y + 4}>{node.glyph}</text>
  <text class="name" x={node.x} y={node.y + R + 18}>{node.label}</text>
  {#if activity?.note}
    {#key activity.at}
      <text class="doing" x={node.x} y={node.y + R + 33} style:fill={tone}>{activity.note}</text>
    {/key}
  {/if}
</g>

<style>
  .fill {
    opacity: 0.14;
  }

  .halo {
    opacity: 0;
  }

  /* One slow breath per decision — a swell in peripheral vision, never a ping. */
  .halo.breathe {
    animation: breath var(--dur-breath) var(--ease-calm);
  }

  @keyframes breath {
    0% {
      opacity: 0;
    }
    45% {
      opacity: 0.22;
    }
    100% {
      opacity: 0;
    }
  }

  .outline {
    fill: none;
    stroke-width: 1.5;
    stroke-linecap: round;
  }

  .glyph {
    font-family: var(--font-data);
    font-size: 13px;
    font-weight: 500;
    text-anchor: middle;
    fill: var(--ink);
  }

  .name {
    font-family: var(--font-data);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    text-anchor: middle;
    fill: var(--ink-soft);
  }

  /* What the agent is doing right now — ink-fades in, lingers, then evaporates. */
  .doing {
    font-family: var(--font-data);
    font-size: 10px;
    text-anchor: middle;
    stroke: var(--paper);
    stroke-width: 3;
    paint-order: stroke;
    animation: worknote 4.5s var(--ease-calm) forwards;
  }

  @keyframes worknote {
    0% {
      opacity: 0;
    }
    12% {
      opacity: 0.95;
    }
    75% {
      opacity: 0.95;
    }
    100% {
      opacity: 0;
    }
  }
</style>
