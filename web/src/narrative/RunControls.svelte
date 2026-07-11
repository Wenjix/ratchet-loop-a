<script>
  import { world } from '../state/world.svelte.js';

  // cycleDelayMs is the inter-week pause — long enough to read the week's debrief.
  const PACES = {
    relaxed: { stepMs: 1200, cycleDelayMs: 6500, approverDelayMs: 1800 },
    standard: { stepMs: 800, cycleDelayMs: 4500, approverDelayMs: 1200 },
    brisk: { stepMs: 400, cycleDelayMs: 2200, approverDelayMs: 600 },
  };

  let pace = $state('standard');
  let note = $state(null);

  const running = $derived(world.mode === 'running');

  async function begin() {
    note = null;
    try {
      const res = await fetch('/api/scenario/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(PACES[pace]),
      });
      if (res.status === 409) note = 'A run is already under way.';
      else if (!res.ok) note = 'The run could not start.';
    } catch {
      note = 'The server is not reachable.';
    }
  }

  async function stop() {
    try {
      await fetch('/api/scenario/stop', { method: 'POST' });
    } catch {
      note = 'The server is not reachable.';
    }
  }
</script>

<div class="controls">
  <span class="dot" class:connected={world.connected} title={world.connected ? 'Connected' : 'Reconnecting…'}></span>
  <label class="label" for="pace">Pace</label>
  <select id="pace" class="data" bind:value={pace} disabled={running}>
    <option value="relaxed">relaxed</option>
    <option value="standard">standard</option>
    <option value="brisk">brisk</option>
  </select>
  {#if running}
    <button class="tag" onclick={stop}>Stop</button>
  {:else}
    <button class="tag primary" onclick={begin}>▶ Begin the nine weeks</button>
  {/if}
</div>
{#if note}
  <p class="note data">{note}</p>
{/if}

<style>
  .controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--clay);
    transition: background var(--dur-settle) var(--ease-calm);
  }

  .dot.connected {
    background: var(--moss);
  }

  select {
    border: 1px solid var(--line);
    background: var(--paper-raised);
    color: var(--ink);
    padding: 5px 8px;
    border-radius: 4px;
  }

  .tag {
    font-family: var(--font-data);
    font-size: 12px;
    padding: 7px 14px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper-raised);
    color: var(--ink);
    transition: background var(--dur-settle) var(--ease-calm);
  }

  .tag.primary {
    border-color: var(--indigo);
    color: var(--indigo);
  }

  .tag:hover {
    background: var(--paper-deep);
  }

  .note {
    margin-top: 4px;
    color: var(--ink-soft);
    text-align: right;
  }
</style>
