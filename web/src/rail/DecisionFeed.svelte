<script>
  import { world } from '../state/world.svelte.js';
  import { toneFor } from '../theme/agent-tones.js';
</script>

<section class="panel" aria-label="Decision feed">
  <h2 class="label">Decisions</h2>
  {#if world.feed.length === 0}
    <p class="empty">No decisions yet — the garden is quiet.</p>
  {:else}
    <ul>
      {#each world.feed as item (item.id)}
        <li>
          <span class="mark" style:background={toneFor(item)} aria-hidden="true"></span>
          <div class="body">
            <p class="summary data">{item.agent} · {item.summary}</p>
            {#if item.reason}
              <p class="reason">{item.reason}</p>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .panel {
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  h2 {
    margin-bottom: 8px;
  }

  .empty {
    color: var(--ink-faint);
    font-size: 14px;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  li {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    animation: settle var(--dur-settle) var(--ease-calm);
  }

  @keyframes settle {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  .mark {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-top: 5px;
  }

  .summary {
    color: var(--ink);
  }

  .reason {
    font-size: 13px;
    color: var(--ink-soft);
  }
</style>
