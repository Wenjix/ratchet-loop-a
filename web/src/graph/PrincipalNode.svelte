<script>
  import { world } from '../state/world.svelte.js';
  import { NODES } from './layout.js';
  import { roughen, roundedRectPoints } from './roughen.js';

  // The human, given a place in the scene: a hanko mark seated on the boundary itself.
  // Escalated work pauses here; the seal glows while a decision is awaited; approvals
  // press the stamp right where the authority lives.
  const node = NODES.principal;
  const S = 40;
  const frame = roughen(roundedRectPoints(node.x - S / 2, node.y - S / 2, S, S, 9), {
    seed: 'principal',
    amplitude: 1.2,
    close: true,
  });

  const awaiting = $derived(
    world.mandates.some((m) => m.status === 'pending_approval') ||
      Object.values(world.classes).some((dc) => dc.pendingProposal),
  );
</script>

<g class="principal">
  <title>The principal — the human this household answers to. Approves whatever is escalated, rules on policy proposals, and can override anything. Escalated work waits here.</title>
  {#if awaiting}
    <rect
      x={node.x - S / 2 - 7}
      y={node.y - S / 2 - 7}
      width={S + 14}
      height={S + 14}
      rx="11"
      class="lantern ambient"
    />
  {/if}
  <path d={frame} class="mark" />
  <rect x={node.x - 8} y={node.y - 8} width="16" height="16" rx="3" class="inner" />
  <text class="name" x={node.x} y={node.y + S / 2 + 20}>principal · human</text>
  {#if awaiting}
    <text class="waiting" x={node.x} y={node.y + S / 2 + 34}>awaiting decision</text>
  {/if}

  {#if world.lastStamp}
    {#key world.lastStamp.at}
      <g transform="translate({node.x + S / 2 + 22}, {node.y - 8}) rotate(-8)">
        <g class="press" class:declined={world.lastStamp.decision === 'declined'}>
          {#if world.lastStamp.byHand}
            <rect x="-15" y="-15" width="30" height="30" rx="6" class="press-ring" />
          {/if}
          <rect x="-11" y="-11" width="22" height="22" rx="4" class="press-seal" />
          <rect x="-6.5" y="-6.5" width="13" height="13" rx="2" class="press-inner" />
        </g>
      </g>
    {/key}
  {/if}
</g>

<style>
  .mark {
    fill: var(--paper-raised);
    stroke: var(--clay);
    stroke-width: 1.6;
  }

  .inner {
    fill: var(--clay);
    opacity: 0.28;
  }

  /* While something waits on the human, the lantern breathes — peripheral, patient. */
  .lantern {
    fill: none;
    stroke: var(--clay);
    stroke-width: 1.2;
    animation: lantern 2.8s var(--ease-calm) infinite;
  }

  @keyframes lantern {
    0%,
    100% {
      opacity: 0.15;
    }
    50% {
      opacity: 0.55;
    }
  }

  .name {
    font-family: var(--font-data);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    text-anchor: middle;
    fill: var(--ink-soft);
  }

  .waiting {
    font-family: var(--font-data);
    font-size: 9.5px;
    text-anchor: middle;
    fill: var(--clay);
  }

  .press {
    animation: press 2.6s var(--ease-calm) forwards;
  }

  @keyframes press {
    0% {
      opacity: 0;
      transform: scale(1.5);
    }
    14% {
      opacity: 0.9;
      transform: scale(1);
    }
    70% {
      opacity: 0.9;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(1);
    }
  }

  .press-seal {
    fill: var(--clay);
    opacity: 0.85;
  }

  .press-inner {
    fill: none;
    stroke: var(--paper-raised);
    stroke-width: 1.4;
  }

  .press-ring {
    fill: none;
    stroke: var(--clay);
    stroke-width: 1.2;
    opacity: 0.7;
  }

  .press.declined .press-seal {
    fill: var(--iron);
  }

  .press.declined .press-ring {
    stroke: var(--iron);
  }

  @media (prefers-reduced-motion: reduce) {
    .lantern {
      animation: none;
      opacity: 0.4;
    }

    .press {
      animation: none;
      opacity: 0.85;
    }
  }
</style>
