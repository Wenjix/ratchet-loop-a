<script>
  import { world } from '../state/world.svelte.js';
  import { roughen, quadPoints, linePoints } from '../graph/roughen.js';

  // The formal state machine under the garden, drawn in ink. Its active transition warms
  // when the engine takes it — legend and proof-of-mechanism at once.
  const E = [30, 40];
  const S = [122, 40];
  const A = [214, 40];

  const up1 = roughen(quadPoints(E, [(E[0] + S[0]) / 2, 18], S, 16), { seed: 'leg-up1', amplitude: 0.8 });
  const up2 = roughen(quadPoints(S, [(S[0] + A[0]) / 2, 18], A, 16), { seed: 'leg-up2', amplitude: 0.8 });
  const down = roughen(quadPoints(A, [(A[0] + E[0]) / 2, 74], E, 20), { seed: 'leg-down', amplitude: 0.8 });

  const kind = $derived(world.lastTransition?.kind);
  const at = $derived(world.lastTransition?.at ?? 0);
</script>

<div class="legend" aria-label="Loop A state machine: escalate to surface after three clean approvals, to auto when a human accepts; back to escalate on one bad job">
  <svg viewBox="0 0 244 84" width="244" height="84">
    {#key at}
      <path d={up1} class="edge" class:warm={kind === 'propose'} />
      <path d={up2} class="edge" class:warm={kind === 'accept'} />
      <path d={down} class="edge down" class:warm={kind === 'revoke' || kind === 'reject'} />
    {/key}
    <text x={(E[0] + S[0]) / 2} y="14" class="rule-label">3 clean</text>
    <text x={(S[0] + A[0]) / 2} y="14" class="rule-label">human accepts</text>
    <text x={(A[0] + E[0]) / 2} y="80" class="rule-label down-label">1 bad · instant</text>
    {#each [[E, 'escalate'], [S, 'surface'], [A, 'auto']] as [pos, name] (name)}
      <circle cx={pos[0]} cy={pos[1]} r="4" class="state" />
      <text x={pos[0]} y={pos[1] + 16} class="state-label">{name}</text>
    {/each}
  </svg>
</div>

<style>
  .legend {
    position: absolute;
    left: 16px;
    top: 12px;
    opacity: 0.8;
  }

  @media (max-width: 1180px) {
    .legend {
      display: none;
    }
  }

  .edge {
    fill: none;
    stroke: var(--ink-faint);
    stroke-width: 1.2;
    stroke-linecap: round;
  }

  .edge.down {
    stroke-dasharray: 4 4;
  }

  /* The transition the engine just took warms, then settles back. */
  .edge.warm {
    animation: warm 2.6s var(--ease-calm);
  }

  .edge.down.warm {
    animation: warm-down 2.6s var(--ease-calm);
  }

  @keyframes warm {
    0%,
    100% {
      stroke: var(--ink-faint);
      stroke-width: 1.2;
    }
    25% {
      stroke: var(--indigo);
      stroke-width: 2;
    }
  }

  @keyframes warm-down {
    0%,
    100% {
      stroke: var(--ink-faint);
      stroke-width: 1.2;
    }
    25% {
      stroke: var(--iron);
      stroke-width: 2;
    }
  }

  .state {
    fill: var(--paper-raised);
    stroke: var(--line-strong);
    stroke-width: 1.2;
  }

  .state-label,
  .rule-label {
    font-family: var(--font-data);
    font-size: 9px;
    text-anchor: middle;
    fill: var(--ink-faint);
  }

  .state-label {
    fill: var(--ink-soft);
  }
</style>
