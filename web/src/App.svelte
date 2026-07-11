<script>
  import { world } from './state/world.svelte.js';
  import CycleCounter from './narrative/CycleCounter.svelte';
  import RunControls from './narrative/RunControls.svelte';
  import CoordinationGraph from './graph/CoordinationGraph.svelte';
  import CaptionBar from './narrative/CaptionBar.svelte';
  import EndCard from './narrative/EndCard.svelte';
  import ThesisCard from './narrative/ThesisCard.svelte';
  import WeekDebrief from './narrative/WeekDebrief.svelte';
  import LoopLegend from './narrative/LoopLegend.svelte';
  import TrustGarden from './ladder/TrustGarden.svelte';
  import ApprovalInbox from './rail/ApprovalInbox.svelte';
  import DecisionFeed from './rail/DecisionFeed.svelte';
</script>

<div class="shell" data-hush={world.hush || undefined}>
  <header>
    <div class="wordmark">
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
        <path
          d="M16 3.5 A12.5 12.5 0 1 0 27.5 11"
          fill="none"
          stroke="var(--ink)"
          stroke-width="3"
          stroke-linecap="round"
        />
      </svg>
      <div>
        <h1>Ratchet — Loop A</h1>
        <p class="tagline">a household that learns what to trust</p>
      </div>
    </div>
    <CycleCounter />
    <RunControls />
  </header>

  <main>
    <section class="stage" aria-label="The garden">
      <CoordinationGraph />
      <LoopLegend />
      <CaptionBar />
      <WeekDebrief />
      <ThesisCard />
      <EndCard />
      {#if world.lastError}
        <p class="footnote data">{world.lastError}</p>
      {/if}
    </section>

    <aside class="rail">
      <TrustGarden />
      <ApprovalInbox />
      <DecisionFeed />
    </aside>
  </main>
</div>

<style>
  .shell {
    height: 100%;
    display: flex;
    flex-direction: column;
    max-width: 1480px;
    margin: 0 auto;
    padding: 18px 24px 24px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--line);
  }

  .wordmark {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  h1 {
    font-size: 19px;
    font-weight: 500;
    letter-spacing: 0.01em;
  }

  .tagline {
    font-size: 12.5px;
    color: var(--ink-soft);
  }

  main {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: 22px;
    padding-top: 18px;
  }

  .stage {
    position: relative;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: color-mix(in srgb, var(--paper-deep) 25%, var(--paper));
    min-height: 420px;
    overflow: hidden;
    /* Recovery from the hush is even slower than its arrival — light returning. */
    transition: filter 8s var(--ease-calm);
  }

  /* The hush: a cloud passes over the whole field. Felt before it is read. */
  .shell[data-hush] .stage {
    filter: saturate(0.82) brightness(0.97);
    transition: filter 1.2s var(--ease-calm);
  }

  .footnote {
    position: absolute;
    bottom: 12px;
    color: var(--ink-soft);
  }

  .rail {
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-right: 2px;
  }

  @media (max-width: 980px) {
    main {
      grid-template-columns: 1fr;
    }

    .rail {
      overflow-y: visible;
    }
  }
</style>
