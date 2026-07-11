<script>
  import { fade } from 'svelte/transition';
  import { world } from '../state/world.svelte.js';
  import { parseClassKey, displayName } from '../ladder/class-key.js';

  let note = $state(null);

  const pendingMandates = $derived(world.mandates.filter((m) => m.status === 'pending_approval'));
  const proposals = $derived(Object.values(world.classes).filter((dc) => dc.pendingProposal));

  function vendorName(id) {
    return world.vendors.find((v) => v.id === id)?.name ?? id;
  }

  // When a card resolves it doesn't vanish — it lingers for a moment, stamped with the
  // principal's seal, then eases away. A real inbox click earns the "by hand" mark.
  let resolvedCards = $state([]);
  let prevMandateIds = [];
  let prevProposalKeys = [];

  function pushResolved(card) {
    resolvedCards.push(card);
    setTimeout(() => {
      resolvedCards = resolvedCards.filter((c) => c.key !== card.key);
    }, 1800);
  }

  $effect(() => {
    const mandateIds = pendingMandates.map((m) => m.id);
    for (const id of prevMandateIds) {
      if (!mandateIds.includes(id)) {
        const mandate = world.mandates.find((m) => m.id === id);
        if (mandate) {
          pushResolved({
            key: `m-${id}-${Date.now()}`,
            hkey: id,
            title: `${vendorName(mandate.vendor_id)} — ${displayName(mandate.task_type)}`,
            amount: `$${mandate.amount}`,
            decision: mandate.status === 'rejected' ? 'declined' : 'approved',
          });
        }
      }
    }
    prevMandateIds = mandateIds;

    const proposalKeys = proposals.map((dc) => dc.key);
    for (const key of prevProposalKeys) {
      if (!proposalKeys.includes(key)) {
        const dc = world.classes[key];
        if (dc) {
          pushResolved({
            key: `p-${key}-${Date.now()}`,
            hkey: key,
            title: `Standing policy — ${displayName(parseClassKey(key).taskType)}`,
            amount: dc.policy && !dc.policy.revoked ? `cap $${dc.policy.cap}` : '',
            decision: dc.policy && !dc.policy.revoked ? 'approved' : 'declined',
          });
        }
      }
    }
    prevProposalKeys = proposalKeys;
  });

  async function act(path) {
    note = null;
    try {
      const res = await fetch(path, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        note = body.error ?? 'That action was not accepted.';
      }
    } catch {
      note = 'The server is not reachable.';
    }
  }
</script>

<section class="panel" aria-label="Approval inbox">
  <h2 class="label">Awaiting approval</h2>
  {#if pendingMandates.length === 0 && proposals.length === 0 && resolvedCards.length === 0}
    <p class="empty">Nothing awaits approval.</p>
  {/if}

  {#each resolvedCards as card (card.key)}
    <!-- byHand reads live: the principal_action frame lands a beat after mandate_updated. -->
    {@const byHand = Boolean(world.humanActions[card.hkey])}
    <article class="card resolved" out:fade={{ duration: 500 }}>
      <p class="what">
        {card.title}
        <span class="data amount">{card.amount}</span>
      </p>
      <span class="stampmark" class:hand={byHand} class:declined={card.decision === 'declined'}>
        {card.decision}{byHand ? ' · by hand' : ''}
      </span>
    </article>
  {/each}

  {#each pendingMandates as mandate (mandate.id)}
    <article class="card">
      <p class="what">
        {vendorName(mandate.vendor_id)} — {displayName(mandate.task_type)}
        <span class="data amount">${mandate.amount}</span>
      </p>
      <p class="scope">{mandate.scope}</p>
      <div class="actions">
        <button class="tag" onclick={() => act(`/api/mandates/${mandate.id}/approve`)}>Approve</button>
        <button class="tag quiet" onclick={() => act(`/api/mandates/${mandate.id}/reject`)}>Reject</button>
      </div>
    </article>
  {/each}

  {#each proposals as dc (dc.key)}
    <article class="card proposal">
      <p class="what">
        Standing policy — {displayName(parseClassKey(dc.key).taskType)}
        <span class="data amount">cap ${dc.pendingProposal.cap}</span>
      </p>
      <p class="scope">After {dc.streak} clean jobs, this class would stop asking first.</p>
      <div class="actions">
        <button class="tag" onclick={() => act(`/api/policies/${encodeURIComponent(dc.key)}/accept`)}>Accept</button>
        <button class="tag quiet" onclick={() => act(`/api/policies/${encodeURIComponent(dc.key)}/reject`)}>Reject</button>
      </div>
    </article>
  {/each}

  {#if note}
    <p class="note data">{note}</p>
  {/if}
</section>

<style>
  h2 {
    margin-bottom: 8px;
  }

  .empty {
    color: var(--ink-faint);
    font-size: 14px;
  }

  .card {
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--paper-raised);
    padding: 10px 12px;
    margin-bottom: 8px;
    animation: appear var(--dur-settle) var(--ease-calm);
  }

  .card.proposal {
    border-style: dashed;
    border-color: var(--indigo);
  }

  @keyframes appear {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  .what {
    font-size: 15px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: baseline;
  }

  .amount {
    color: var(--ink-soft);
    white-space: nowrap;
  }

  .scope {
    font-size: 13px;
    color: var(--ink-soft);
    margin-top: 2px;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .tag {
    font-family: var(--font-data);
    font-size: 11px;
    padding: 4px 10px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--paper);
  }

  .tag.quiet {
    border-color: var(--line);
    color: var(--ink-soft);
  }

  .tag:hover {
    background: var(--paper-deep);
  }

  .note {
    color: var(--iron);
  }

  .card.resolved {
    position: relative;
    opacity: 0.8;
    overflow: hidden;
  }

  /* Reserve room for the seal so it never sits on the figures. */
  .card.resolved .what {
    padding-right: 118px;
  }

  /* The principal's seal, pressed onto the card it decided. */
  .stampmark {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%) rotate(-7deg) scale(1);
    font-family: var(--font-data);
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--clay);
    border: 1.5px solid var(--clay);
    border-radius: 4px;
    padding: 3px 8px;
    background: color-mix(in srgb, var(--paper) 65%, transparent);
    animation: stamp-press var(--dur-settle) var(--ease-calm);
  }

  .stampmark.hand {
    outline: 1.5px solid color-mix(in srgb, var(--clay) 55%, transparent);
    outline-offset: 2.5px;
  }

  .stampmark.declined {
    color: var(--iron);
    border-color: var(--iron);
  }

  .stampmark.declined.hand {
    outline-color: color-mix(in srgb, var(--iron) 55%, transparent);
  }

  @keyframes stamp-press {
    from {
      opacity: 0;
      transform: translateY(-50%) rotate(-7deg) scale(1.35);
    }
    to {
      opacity: 1;
      transform: translateY(-50%) rotate(-7deg) scale(1);
    }
  }
</style>
