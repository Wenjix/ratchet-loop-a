<script>
  import { CRACK_PATH, CRACK_BOX } from '../graph/kintsugi.js';

  // A glazed ceramic garden marker hung on the stalk. Its whole life happens here:
  // it settles onto its nail when a policy takes; it cracks (in place — broken things
  // remain) when revoked; the same fracture fills with gold when trust is re-earned.
  let { policy, everRevoked = false } = $props();

  const revoked = $derived(Boolean(policy.revoked));
  const mended = $derived(everRevoked && !revoked);
</script>

<div class="chip" class:revoked class:mended>
  <span class="text" class:struck={revoked}>
    {policy.id} · cap ${policy.cap}
    {#if policy.humanEdited}<span class="brush" title="cap edited by the principal">✎</span>{/if}
  </span>
  {#if mended}
    <span class="footnote">mended — the seam stays gold</span>
  {/if}
  {#if revoked || mended}
    <svg class="fracture" viewBox="0 0 {CRACK_BOX.width} {CRACK_BOX.height}" preserveAspectRatio="none" aria-hidden="true">
      {#if mended}
        <path d={CRACK_PATH} class="seam-edge" pathLength="1" />
        <path d={CRACK_PATH} class="seam" pathLength="1" />
      {:else}
        <path d={CRACK_PATH} class="crack" pathLength="1" />
      {/if}
    </svg>
  {/if}
</div>

<style>
  .chip {
    position: relative;
    display: block;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--paper-raised);
    padding: 7px 10px;
    margin-top: 7px;
    animation: settle var(--dur-settle) var(--ease-calm);
    transition: background 1.4s var(--ease-calm);
    overflow: hidden;
  }

  /* Hung on a nail: it arrives and settles 4px downward. No pop, no glow. */
  @keyframes settle {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  .chip.revoked {
    background: var(--paper-deep);
  }

  .chip.mended {
    border-color: color-mix(in srgb, var(--gold) 45%, var(--line));
  }

  .text {
    font-family: var(--font-data);
    font-size: 11.5px;
    color: var(--ink);
    transition: color 1.4s var(--ease-calm);
  }

  .text.struck {
    text-decoration: line-through;
    color: var(--ink-faint);
  }

  .brush {
    color: var(--clay);
    margin-left: 4px;
  }

  .footnote {
    display: block;
    font-family: var(--font-data);
    font-size: 9.5px;
    color: var(--gold);
    margin-top: 2px;
  }

  .fracture {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  /* The break draws itself across the glaze — slow, quiet, unmissable. */
  .crack {
    fill: none;
    stroke: var(--ink);
    stroke-width: 1.2;
    stroke-linecap: round;
    opacity: 0.8;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: draw 1.4s var(--ease-calm) 0.6s forwards;
  }

  /* The same path, re-stroked in gold at re-crystallization. */
  .seam {
    fill: none;
    stroke: var(--gold);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: draw var(--dur-seam) var(--ease-calm) forwards;
  }

  .seam-edge {
    fill: none;
    stroke: var(--gold-light);
    stroke-width: 3;
    stroke-linecap: round;
    opacity: 0;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: draw var(--dur-seam) var(--ease-calm) forwards, edgein var(--dur-seam) var(--ease-calm) forwards;
  }

  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }

  @keyframes edgein {
    to {
      opacity: 0.35;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .crack,
    .seam,
    .seam-edge {
      animation-duration: 0.01ms;
      animation-delay: 0ms;
    }
  }
</style>
