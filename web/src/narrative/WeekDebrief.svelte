<script>
  import { world } from '../state/world.svelte.js';
  import { displayName } from '../ladder/class-key.js';
  import Hint from './Hint.svelte';

  // The chapter break: during the pause between weeks, a quiet recap of what each
  // vendor did and what it meant for trust. Clears itself when the next week begins.
  function vendorName(id) {
    return world.vendors.find((v) => v.id === id)?.name ?? id;
  }

  function pathTaken(entry) {
    if (entry.auto) return 'auto-committed';
    if (entry.decision === 'approve') return entry.byHand ? 'escalated → approved by hand' : 'escalated → approved';
    if (entry.decision) return 'escalated → declined';
    return 'escalated';
  }

  const VERDICT_TIP =
    'The completion oracle: Verification rules on every job before money settles. Clean → escrow released, reputation +0.05, streak +1. Bad → refunded, reputation −0.15, instant revocation. In this demo the verdict comes from a seeded vendor attestation so the arc is reproducible — in production this seam is where real evidence (receipts, photos, human spot-checks) plugs in.';
</script>

{#if world.debrief}
  {#key world.debrief.week}
    <article class="debrief" aria-label="Week {world.debrief.week} in review">
      <p class="label">Week {world.debrief.week} of {world.debrief.totalWeeks} · in review</p>
      <ul>
        {#each world.debrief.entries as entry (entry.taskType)}
          <li>
            <span
              class="mark"
              class:bad={entry.verified === 'bad'}
              class:declined={!entry.auto && entry.decision && entry.decision !== 'approve'}
              aria-hidden="true"
            ></span>
            <div class="row">
              <p class="vendor">
                {vendorName(entry.vendorId)}
                <span class="task data">{displayName(entry.taskType)} · ${entry.amount}</span>
              </p>
              <p class="what data">
                {pathTaken(entry)}{#if entry.verified}&nbsp;·
                  <Hint tip={VERDICT_TIP}>{entry.verified === 'good' ? 'verified clean' : 'bad delivery'}</Hint>{/if}
              </p>
              {#if entry.policyNote}
                <p class="policy data" data-kind={entry.policyNote.kind}>{entry.policyNote.text}</p>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </article>
  {/key}
{/if}

<style>
  .debrief {
    position: absolute;
    left: 0;
    right: 0;
    top: 44%;
    transform: translateY(-50%);
    margin: 0 auto;
    width: fit-content;
    min-width: 380px;
    max-width: 480px;
    background: var(--paper-raised);
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    padding: 16px 22px 14px;
    animation: ink 900ms var(--ease-calm);
  }

  @keyframes ink {
    from {
      opacity: 0;
      filter: blur(2px);
    }
    to {
      opacity: 1;
      filter: blur(0);
    }
  }

  .label {
    margin-bottom: 10px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .mark {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-top: 6px;
    background: var(--moss);
  }

  .mark.bad {
    background: var(--iron);
  }

  .mark.declined {
    background: var(--clay);
  }

  .vendor {
    font-family: var(--font-narrative);
    font-size: 14.5px;
    color: var(--ink);
  }

  .task {
    color: var(--ink-faint);
    font-size: 10px;
    margin-left: 6px;
  }

  .what {
    color: var(--ink-soft);
    font-size: 11px;
    margin-top: 1px;
  }

  .policy {
    font-size: 11px;
    margin-top: 2px;
    color: var(--indigo);
  }

  .policy[data-kind='revoked'] {
    color: var(--iron);
  }

  .policy[data-kind='restored'] {
    color: var(--gold);
  }

  .policy[data-kind='declined'] {
    color: var(--clay);
  }
</style>
