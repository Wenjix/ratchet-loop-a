<script>
  import { world } from '../state/world.svelte.js';
</script>

<div class="caption-bar" aria-live="polite">
  {#key world.caption?.id}
    {#if world.caption}
      <div class="caption" data-tone={world.caption.tone}>
        <p class="serif">{world.caption.serifLine}</p>
        {#if world.caption.monoLine}
          <p class="mono">{world.caption.monoLine}</p>
        {/if}
        {#if world.caption.ruleLine}
          <p class="rule">rule · {world.caption.ruleLine}</p>
        {/if}
      </div>
    {/if}
  {/key}
</div>

<style>
  .caption-bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: center;
    padding: 14px 24px 18px;
    pointer-events: none;
    background: linear-gradient(to top, color-mix(in srgb, var(--paper) 88%, transparent), transparent);
  }

  /* Ink absorbing into paper: the line arrives whole, softly. */
  .caption {
    max-width: 68ch;
    text-align: center;
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

  .serif {
    font-family: var(--font-narrative);
    font-size: 19px;
    line-height: 1.45;
    color: var(--ink);
  }

  .caption[data-tone='ambient'] .serif {
    font-size: 17px;
    color: var(--ink-soft);
  }

  .caption[data-tone='somber'] .serif {
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--iron) 55%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 6px;
  }

  .caption[data-tone='mend'] .serif {
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--gold) 70%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 6px;
  }

  .mono {
    font-family: var(--font-data);
    font-size: 11px;
    color: var(--ink-faint);
    margin-top: 4px;
  }

  /* The mechanism, stated once, the moment it first fires — a protocol note in the margin. */
  .rule {
    display: inline-block;
    font-family: var(--font-data);
    font-size: 10.5px;
    color: var(--indigo);
    border: 1px dashed color-mix(in srgb, var(--indigo) 40%, transparent);
    border-radius: 4px;
    padding: 3px 9px;
    margin-top: 7px;
    background: color-mix(in srgb, var(--paper-raised) 70%, transparent);
    animation: ink 900ms var(--ease-calm) 500ms backwards;
  }
</style>
