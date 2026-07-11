<script>
  import { world } from '../state/world.svelte.js';
</script>

{#if world.week > 0}
  <div class="counter" aria-label="Week {world.week} of {world.totalWeeks}">
    <span class="week">Week {world.week}</span>
    <span class="of data">of {world.totalWeeks}</span>
    <div class="segments" aria-hidden="true">
      {#each { length: world.totalWeeks } as _, i (i)}
        <span class="seg" class:filled={i < world.week}></span>
      {/each}
    </div>
  </div>
{/if}

<style>
  .counter {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .week {
    font-family: var(--font-narrative);
    font-size: 18px;
    color: var(--ink);
  }

  .of {
    color: var(--ink-faint);
  }

  .segments {
    display: flex;
    gap: 3px;
    align-self: center;
  }

  .seg {
    width: 14px;
    height: 3px;
    border-radius: 2px;
    background: var(--line);
    transition: background var(--dur-settle) var(--ease-calm);
  }

  .seg.filled {
    background: var(--ink-soft);
  }
</style>
