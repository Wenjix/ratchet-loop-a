<script>
  import { world } from '../state/world.svelte.js';
  import { roughen, roundedRectPoints } from './roughen.js';
  import { parseClassKey, displayName } from '../ladder/class-key.js';

  let { id, node } = $props();

  const W = 224;
  const H = 76;
  const x = node.x - W / 2;
  const y = node.y - H / 2;
  const frame = roughen(roundedRectPoints(x, y, W, H, 8), { seed: `vendor-${id}`, amplitude: 1.3, close: true });
  const post = roughen(
    [
      [node.x, y + H],
      [node.x - 1, y + H + 12],
      [node.x + 1, y + H + 26],
    ],
    { seed: `post-${id}`, amplitude: 1 },
  );

  const vendor = $derived(world.vendors.find((v) => v.id === id));
  const dc = $derived(Object.values(world.classes).find((c) => parseClassKey(c.key).counterparty === id));
  const trusted = $derived(Boolean(dc?.policy && !dc.policy.revoked));
  const mended = $derived(Boolean(dc?.everRevoked && trusted));
  const activeMandate = $derived(
    world.mandates.findLast((m) => m.vendor_id === id && ['pending_approval', 'committed'].includes(m.status)),
  );
  const disputed = $derived(world.mandates.findLast((m) => m.vendor_id === id)?.status === 'disputed');

  const REP_LENGTH = 130;
  const reputation = $derived(vendor?.reputation ?? 0);
</script>

<g class="vendor">
  <path d={post} class="post" />
  <path d={frame} class="card" />
  {#if trusted}
    <path d={`M ${x + 14} ${y - 1} H ${x + W - 14}`} class="thread" class:mended aria-hidden="true" />
  {/if}
  <text class="name" x={x + 16} y={y + 26}>{vendor?.name ?? id}</text>
  <text class="task" x={x + 16} y={y + 44}>{displayName(vendor?.task_type ?? '')}</text>
  <path
    d={`M ${x + 16} ${y + 58} H ${x + 16 + REP_LENGTH}`}
    class="rep"
    pathLength="1"
    style:stroke-dashoffset={1 - reputation}
    style:stroke={`color-mix(in srgb, var(--moss) ${Math.round(reputation * 100)}%, var(--clay))`}
  >
    <title>Reputation (0–1): +0.05 per verified-good job, −0.15 per bad one.</title>
  </path>
  <text class="rep-value" x={x + 16 + REP_LENGTH + 10} y={y + 61}>{reputation.toFixed(2)}</text>
  {#if activeMandate}
    <text class="tag" x={x + W - 4} y={y + H + 16}>{activeMandate.status === 'pending_approval' ? 'asking' : 'mandate'}</text>
  {/if}
  {#if disputed}
    {@const tagY = activeMandate ? y + H + 29 : y + H + 16}
    <circle class="inkblot" cx={x + W - 60} cy={tagY - 3.5} r="3.4" />
    <text class="tag disputed" x={x + W - 4} y={tagY}>disputed</text>
  {/if}
</g>

<style>
  .card {
    fill: var(--paper-raised);
    stroke: var(--line-strong);
    stroke-width: 1.2;
  }

  .post {
    fill: none;
    stroke: var(--line-strong);
    stroke-width: 2;
    stroke-linecap: round;
    opacity: 0.7;
  }

  .thread {
    fill: none;
    stroke: var(--indigo);
    stroke-width: 1.4;
    stroke-dasharray: 5 4;
    opacity: 0.7;
    transition: stroke var(--dur-seam) var(--ease-calm);
  }

  .thread.mended {
    stroke: var(--gold);
  }

  .name {
    font-family: var(--font-narrative);
    font-size: 15px;
    fill: var(--ink);
  }

  .task {
    font-family: var(--font-data);
    font-size: 10.5px;
    fill: var(--ink-soft);
  }

  .rep {
    fill: none;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-dasharray: 1;
    transition:
      stroke-dashoffset 1.2s var(--ease-calm),
      stroke 1.2s var(--ease-calm);
  }

  .rep-value {
    font-family: var(--font-data);
    font-size: 9.5px;
    fill: var(--ink-faint);
  }

  .tag {
    font-family: var(--font-data);
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    text-anchor: end;
    fill: var(--ink-soft);
  }

  .tag.disputed {
    fill: var(--iron);
  }

  .inkblot {
    fill: var(--iron);
    opacity: 0.8;
  }
</style>
