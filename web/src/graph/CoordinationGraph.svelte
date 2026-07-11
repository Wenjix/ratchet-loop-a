<script>
  import { world } from '../state/world.svelte.js';
  import { NODES, GATE, pathFor, VIEW } from './layout.js';
  import { roughen, ellipsePoints } from './roughen.js';
  import TrustBoundary from './TrustBoundary.svelte';
  import AgentNode from './AgentNode.svelte';
  import PrincipalNode from './PrincipalNode.svelte';
  import VendorNode from './VendorNode.svelte';
  import TrustedChannel from './TrustedChannel.svelte';
  import FlowMote from './FlowMote.svelte';

  const agents = Object.entries(NODES).filter(([, n]) => n.kind === 'agent');
  const vendors = Object.entries(NODES).filter(([, n]) => n.kind === 'vendor');

  // Resting garden paths — present only when you look for them.
  const restingEdges = vendors
    .map(([id]) => pathFor('sourcing', id))
    .concat(vendors.map(([id]) => pathFor(id, 'verification')))
    .filter(Boolean);

  const rippleRing = roughen(ellipsePoints(GATE[0], GATE[1], 16, 16, { segments: 24 }), {
    seed: 'ripple',
    amplitude: 1,
    close: true,
  });

  const trustedClasses = $derived(Object.values(world.classes).filter((dc) => dc.policy && !dc.policy.revoked));
  const crossings = $derived(world.flows.filter((f) => f.crossPrincipal && pathFor(f.from, f.to)?.gateFraction != null));
</script>

<svg viewBox="0 0 {VIEW.width} {VIEW.height}" role="img" aria-label="The coordination garden — household agents inside the trust boundary, vendors outside">
  <g class="resting" aria-hidden="true">
    {#each restingEdges as edge, i (i)}
      <path d={edge.d} />
    {/each}
  </g>

  <TrustBoundary />

  {#each trustedClasses as dc (dc.key)}
    <TrustedChannel {dc} />
  {/each}

  {#each world.flows as flow (flow.id)}
    <FlowMote {flow} />
  {/each}

  {#each crossings as flow (`ripple-${flow.id}`)}
    {@const edge = pathFor(flow.from, flow.to)}
    <g
      class="ripple"
      style:--gate-delay="{Math.round(edge.gateFraction * (flow.duration ?? 4000))}ms"
      aria-hidden="true"
    >
      <path d={rippleRing} />
      <path d={rippleRing} class="second" />
    </g>
  {/each}

  {#each agents as [id, node] (id)}
    <AgentNode {id} {node} />
  {/each}

  <PrincipalNode />

  {#each vendors as [id, node] (id)}
    <VendorNode {id} {node} />
  {/each}
</svg>

<style>
  svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .resting path {
    fill: none;
    stroke: var(--ink);
    stroke-width: 1;
    opacity: 0.06;
  }

  /* A stone dropped in a still pond — one gentle acknowledgment per crossing. */
  .ripple path {
    fill: none;
    stroke: var(--line-strong);
    stroke-width: 1.2;
    opacity: 0;
    transform-origin: 860px 450px;
    transform-box: view-box;
    animation: ripple 1.8s ease-out forwards;
    animation-delay: var(--gate-delay, 0ms);
  }

  .ripple path.second {
    animation-delay: calc(var(--gate-delay, 0ms) + 0.25s);
    stroke-width: 0.8;
  }

  @keyframes ripple {
    0% {
      opacity: 0;
      transform: scale(0.4);
    }
    20% {
      opacity: 0.28;
    }
    100% {
      opacity: 0;
      transform: scale(1.7);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ripple path {
      animation: none;
    }
  }

</style>
