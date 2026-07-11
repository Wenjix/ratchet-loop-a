<script>
  import { world } from '../state/world.svelte.js';
  import { parseClassKey, classOrder, stageOf, displayName } from './class-key.js';
  import GrowthStalk from './GrowthStalk.svelte';
  import GrowthRings from './GrowthRings.svelte';
  import PolicyChip from './PolicyChip.svelte';
  import Hint from '../narrative/Hint.svelte';

  const KEY_TIP =
    'agent : action : counterparty : task type : amount band — trust attaches to this whole tuple, never to the vendor alone.';
  const STAGE_TIP =
    'escalate — every job asks a human first · surface — a policy is proposed, a human decides once · auto — commits without asking, while under the cap.';
  const DORMANT_TIP = 'After a revocation, clean weeks pay down dormancy first; only then can streaks regrow.';

  const beds = $derived(Object.values(world.classes).sort(classOrder));

  function vendorName(counterparty) {
    return world.vendors.find((v) => v.id === counterparty)?.name ?? counterparty;
  }

  const STAGES = ['auto', 'surface', 'escalate'];
</script>

<section class="panel" aria-label="Trust garden">
  <h2 class="label">Trust garden</h2>
  {#if beds.length === 0}
    <p class="empty">Nothing planted yet. Every decision class begins at escalate.</p>
  {/if}
  {#each beds as dc (dc.key)}
    {@const parts = parseClassKey(dc.key)}
    {@const stage = stageOf(dc)}
    {@const bonsai = dc.ceiling === 'escalate'}
    <article class="bed" class:dormant={dc.cooldownRemaining > 0}>
      <header>
        <h3>{vendorName(parts.counterparty)}</h3>
        <span class="band data">{displayName(parts.taskType)} · ${parts.band}</span>
      </header>
      <p class="key data"><Hint tip={KEY_TIP}>{dc.key}</Hint></p>

      <div class="vignette">
        <GrowthStalk
          {stage}
          {bonsai}
          dormant={dc.cooldownRemaining > 0}
          tone={`var(--agent-sourcing)`}
          seed={parts.counterparty}
        />
        <div class="stages data" role="presentation">
          <Hint tip={STAGE_TIP}>
            {#each STAGES as s (s)}
              <span class="stage" class:current={s === stage} class:locked={bonsai && s !== 'escalate'}>
                {s}
              </span>
            {/each}
          </Hint>
          {#if bonsai}
            <span class="ceiling">ceiling: escalate</span>
          {/if}
        </div>
        <GrowthRings streak={dc.streak} seed={parts.counterparty} />
      </div>

      {#if dc.cooldownRemaining > 0}
        <p class="dormancy data"><Hint tip={DORMANT_TIP}>dormant · {dc.cooldownRemaining} remaining</Hint></p>
      {/if}
      {#if dc.policy}
        <PolicyChip policy={dc.policy} everRevoked={dc.everRevoked} />
      {/if}
      {#if dc.pendingProposal}
        <p class="proposal data">proposed · cap ${dc.pendingProposal.cap} — see inbox</p>
      {/if}
    </article>
  {/each}
</section>

<style>
  h2 {
    margin-bottom: 8px;
  }

  .empty {
    color: var(--ink-faint);
    font-size: 14px;
  }

  .bed {
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--paper-raised);
    padding: 10px 12px;
    margin-bottom: 8px;
    transition:
      filter 1s var(--ease-calm),
      opacity 1s var(--ease-calm);
  }

  /* Dormancy: the bed rests — desaturated, a little dimmer, never hidden. */
  .bed.dormant {
    filter: saturate(0.35);
    opacity: 0.88;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }

  h3 {
    font-size: 15px;
    font-weight: 500;
  }

  .band {
    color: var(--ink-soft);
    white-space: nowrap;
  }

  .key {
    color: var(--ink-faint);
    font-size: 10px;
    overflow-wrap: anywhere;
    margin: 3px 0 4px;
  }

  .vignette {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 8px;
  }

  .stages {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding-bottom: 16px;
    font-size: 11px;
  }

  .stages :global(.hint) {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .stage {
    color: var(--ink-faint);
    transition: color var(--dur-settle) var(--ease-calm);
  }

  .stage.current {
    color: var(--ink);
  }

  .stage.locked {
    opacity: 0.55;
  }

  .ceiling {
    color: var(--clay);
    font-size: 9.5px;
    margin-top: 2px;
  }

  .dormancy {
    color: var(--ink-soft);
    margin-top: 4px;
  }

  .proposal {
    color: var(--indigo);
    margin-top: 6px;
  }
</style>
