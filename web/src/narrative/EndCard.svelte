<script>
  import { world } from '../state/world.svelte.js';
  import { parseClassKey, stageOf } from '../ladder/class-key.js';
  import GrowthStalk from '../ladder/GrowthStalk.svelte';
  import PolicyChip from '../ladder/PolicyChip.svelte';

  const results = $derived(world.endCard?.results ?? []);
  const classes = $derived(Object.values(world.classes));
  const activePolicies = $derived(classes.filter((dc) => dc.policy && !dc.policy.revoked));
  const revocations = $derived(classes.filter((dc) => dc.everRevoked).length);
  const repairs = $derived(classes.filter((dc) => dc.everRevoked && dc.policy && !dc.policy.revoked).length);

  function classFor(counterparty) {
    return classes.find((dc) => parseClassKey(dc.key).counterparty === counterparty);
  }

  const greenblade = $derived(classFor('greenblade'));
  const freshcart = $derived(classFor('freshcart'));
  const quickfix = $derived(classFor('quickfix'));

  function dismiss() {
    world.endCard = null;
  }
</script>

{#if world.endCard}
  <div class="scrim">
    <article class="card">
      <h2>Nine weeks in the garden.</h2>
      <div class="artifacts">
        {#if greenblade}
          <figure>
            <GrowthStalk stage={stageOf(greenblade)} tone="var(--agent-sourcing)" seed="greenblade" />
            <figcaption>the unbroken bloom</figcaption>
          </figure>
        {/if}
        {#if freshcart?.policy}
          <figure class="emblem">
            <PolicyChip policy={freshcart.policy} everRevoked={freshcart.everRevoked} />
            <figcaption>trust, mended — the seam stays gold</figcaption>
          </figure>
        {/if}
        {#if quickfix}
          <figure>
            <GrowthStalk stage={stageOf(quickfix)} bonsai seed="quickfix" />
            <figcaption>kept close, by design</figcaption>
          </figure>
        {/if}
      </div>
      <p class="ledger">
        {results.length} mandates · {activePolicies.length} standing policies · {revocations}
        {revocations === 1 ? 'revocation' : 'revocations'} · {repairs} {repairs === 1 ? 'repair' : 'repairs'}
      </p>
      <div class="actions">
        <button class="tag" onclick={dismiss}>Return to the garden</button>
      </div>
    </article>
  </div>
{/if}

<style>
  .scrim {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--paper) 55%, transparent);
    backdrop-filter: blur(2px);
    animation: rise 1.5s var(--ease-calm);
  }

  @keyframes rise {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .card {
    background: var(--paper-raised);
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    padding: 28px 36px 24px;
    max-width: 560px;
    text-align: center;
  }

  h2 {
    font-family: var(--font-narrative);
    font-size: 26px;
    font-weight: 500;
    color: var(--ink);
    margin-bottom: 18px;
  }

  .artifacts {
    display: flex;
    justify-content: center;
    align-items: flex-end;
    gap: 26px;
    margin-bottom: 14px;
  }

  figure {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .emblem {
    padding-bottom: 24px;
  }

  figcaption {
    font-family: var(--font-data);
    font-size: 9.5px;
    color: var(--ink-faint);
  }

  .ledger {
    font-family: var(--font-data);
    font-size: 12px;
    color: var(--ink-soft);
    border-top: 1px solid var(--line);
    padding-top: 12px;
  }

  .actions {
    margin-top: 14px;
  }

  .tag {
    font-family: var(--font-data);
    font-size: 12px;
    padding: 7px 14px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .tag:hover {
    background: var(--paper-deep);
  }
</style>
