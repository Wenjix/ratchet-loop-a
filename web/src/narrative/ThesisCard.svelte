<script>
  import { world } from '../state/world.svelte.js';

  // Tell them what they're about to watch; the run itself is the showing; the end card
  // tells them what they saw. Dismisses itself the moment a run begins.
  let dismissed = $state(false);

  const visible = $derived(!dismissed && world.mode === 'idle' && world.week === 0 && !world.endCard);
</script>

{#if visible}
  <article class="thesis">
    <h2>A household that learns what to trust</h2>
    <p>
      This is one household: a single human principal, four agents that act in its name, and a fence around
      everything they may touch. The vendors outside are other principals' agents — hired job by job, paid through
      escrow.
    </p>
    <ul class="cast" aria-label="Who tends this garden">
      <li>
        <span class="mark square" aria-hidden="true"></span>
        <span><strong>The principal</strong> — the human. Approves whatever is escalated, rules on policy
          proposals, and can override anything. Every unearned decision lands here.</span>
      </li>
      <li>
        <span class="mark" style:background="var(--agent-budget)" aria-hidden="true"></span>
        <span><strong>Budget</strong> — holds the monthly caps per category and records every settled dollar.</span>
      </li>
      <li>
        <span class="mark" style:background="var(--agent-scheduler)" aria-hidden="true"></span>
        <span><strong>Scheduler</strong> — keeps the week; flags each task as it falls due.</span>
      </li>
      <li>
        <span class="mark" style:background="var(--agent-sourcing)" aria-hidden="true"></span>
        <span><strong>Sourcing</strong> — picks the vendor, takes the quote, drafts the mandate. The only agent
          that commits money.</span>
      </li>
      <li>
        <span class="mark" style:background="var(--agent-verification)" aria-hidden="true"></span>
        <span><strong>Verification</strong> — the completion oracle: rules good or bad on every finished job
          before escrow settles.</span>
      </li>
    </ul>
    <p>
      <strong>Loop A</strong> is the mechanism between them. Autonomy is earned per
      <span class="data">decision class</span>: three clean approvals crystallize a standing policy with a spending
      cap — and one bad job revokes it, instantly. Trust ratchets both ways.
    </p>
    <ul class="arcs data" aria-label="The three arcs to watch">
      <li><span class="arc">lawn care</span> earns trust and keeps it</li>
      <li><span class="arc">grocery</span> earns it, breaks it, and mends it — the seam stays gold</li>
      <li><span class="arc">plumbing</span> is never granted autonomy at all, by design</li>
    </ul>
    <p class="hint data">▶ Begin the nine weeks — seeded and deterministic; no keys, no cloud.</p>
    <button class="quiet data" onclick={() => (dismissed = true)}>just the garden</button>
  </article>
{/if}

<style>
  .thesis {
    position: absolute;
    inset: 0;
    margin: auto;
    height: fit-content;
    max-height: calc(100% - 32px);
    overflow-y: auto;
    max-width: 600px;
    background: var(--paper-raised);
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    padding: 26px 32px 18px;
    text-align: left;
    animation: ink 1.2s var(--ease-calm);
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

  h2 {
    font-family: var(--font-narrative);
    font-size: 23px;
    font-weight: 500;
    margin-bottom: 12px;
  }

  p {
    font-size: 15px;
    line-height: 1.55;
    color: var(--ink-soft);
    margin-bottom: 10px;
  }

  strong {
    color: var(--ink);
    font-weight: 500;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 12px 0;
    display: flex;
    flex-direction: column;
  }

  /* Who tends this garden — the dramatis personae. */
  .cast {
    gap: 7px;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--ink-soft);
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    padding: 11px 0;
  }

  .cast li {
    display: flex;
    gap: 9px;
    align-items: baseline;
  }

  .cast strong {
    font-weight: 500;
    color: var(--ink);
  }

  .mark {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    transform: translateY(-1px);
  }

  .mark.square {
    border-radius: 2px;
    background: var(--clay);
  }

  .arcs {
    font-size: 11px;
    color: var(--ink-soft);
    gap: 5px;
  }

  .arc {
    color: var(--ink);
  }

  .arcs li::before {
    content: '·';
    margin-right: 8px;
    color: var(--ink-faint);
  }

  .hint {
    color: var(--indigo);
    border-top: 1px solid var(--line);
    padding-top: 12px;
    margin-top: 14px;
  }

  .quiet {
    position: absolute;
    top: 12px;
    right: 14px;
    border: none;
    background: none;
    color: var(--ink-faint);
    font-size: 10px;
    padding: 4px;
  }

  .quiet:hover {
    color: var(--ink-soft);
  }
</style>
