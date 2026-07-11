<script>
  // A quiet paper card for hands-on explorers: hover or focus to read, nothing demands it.
  // The card is portaled to <body> and fixed-positioned so scroll containers (the rail has
  // overflow-y: auto) can never clip or scroll it.
  let { tip } = $props();

  let anchor = $state(null);
  let coords = $state(null); // { x, y } — viewport coordinates, card sits above the anchor

  const CARD_MAX_WIDTH = 300;

  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function show() {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    // Near the viewport top there is no room above the anchor — open downward instead.
    const below = rect.top < 150;
    coords = {
      x: Math.max(8, Math.min(rect.left, window.innerWidth - CARD_MAX_WIDTH - 12)),
      y: below ? rect.bottom + 7 : rect.top - 7,
      below,
    };
  }

  function hide() {
    coords = null;
  }
</script>

<span class="hint" tabindex="0" role="note" bind:this={anchor} onmouseenter={show} onmouseleave={hide} onfocus={show} onblur={hide}>
  <slot />
</span>

{#if coords}
  <span class="card" class:below={coords.below} use:portal style:left="{coords.x}px" style:top="{coords.y}px">{tip}</span>
{/if}

<style>
  .hint {
    cursor: help;
    border-bottom: 1px dotted var(--ink-faint);
  }

  .card {
    position: fixed;
    transform: translateY(-100%);
    z-index: 40;
    display: block;
    width: max-content;
    max-width: 300px;
    background: var(--paper-raised);
    border: 1px solid var(--line-strong);
    border-radius: 5px;
    padding: 7px 10px;
    font-family: var(--font-data);
    font-size: 10.5px;
    line-height: 1.5;
    color: var(--ink-soft);
    box-shadow: 0 2px 8px rgba(44, 40, 35, 0.08);
    animation: appear var(--dur-settle) var(--ease-calm);
    pointer-events: none;
  }

  @keyframes appear {
    from {
      opacity: 0;
      transform: translateY(calc(-100% + 2px));
    }
    to {
      opacity: 1;
      transform: translateY(-100%);
    }
  }

  .card.below {
    transform: none;
    animation-name: appear-below;
  }

  @keyframes appear-below {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
