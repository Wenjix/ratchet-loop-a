<script>
  import { roughen, jitter, toPath, linePoints } from '../graph/roughen.js';

  // stage: 'escalate' | 'surface' | 'auto' — seedling, budding sprout, open bloom.
  let { stage, tone = 'var(--moss)', bonsai = false, dormant = false, seed = 'stalk' } = $props();

  const W = 96;
  const H = 116;
  const SOIL_Y = H - 14;

  const soil = roughen(linePoints([6, SOIL_Y], [W - 6, SOIL_Y], 10), { seed: `${seed}-soil`, amplitude: 1.6 });
  // The full stem, drawn once; growth is a stroke-dashoffset reveal from the soil up.
  const stem = toPath(
    jitter(
      [
        [W / 2, SOIL_Y],
        [W / 2 - 2, SOIL_Y - 24],
        [W / 2 + 3, SOIL_Y - 48],
        [W / 2 - 1, SOIL_Y - 68],
        [W / 2 + 1, SOIL_Y - 84],
      ],
      { seed: `${seed}-stem`, amplitude: 1.4 },
    ),
  );
  const leafLeft = roughen(
    [
      [W / 2, SOIL_Y - 16],
      [W / 2 - 10, SOIL_Y - 22],
      [W / 2 - 15, SOIL_Y - 18],
    ],
    { seed: `${seed}-leafL`, amplitude: 1 },
  );
  const leafRight = roughen(
    [
      [W / 2, SOIL_Y - 22],
      [W / 2 + 10, SOIL_Y - 28],
      [W / 2 + 15, SOIL_Y - 24],
    ],
    { seed: `${seed}-leafR`, amplitude: 1 },
  );

  const BUD = [W / 2 + 1, SOIL_Y - 52];
  const BLOOM = [W / 2 + 1, SOIL_Y - 84];

  // Five petals around the bloom point.
  const petals = Array.from({ length: 5 }, (_, i) => {
    const angle = -Math.PI / 2 + (i - 2) * ((Math.PI * 2) / 5);
    const tipX = BLOOM[0] + Math.cos(angle) * 13;
    const tipY = BLOOM[1] + Math.sin(angle) * 13;
    return roughen(
      [
        [BLOOM[0], BLOOM[1]],
        [(BLOOM[0] + tipX) / 2 + 4 * Math.sin(angle), (BLOOM[1] + tipY) / 2 - 4 * Math.cos(angle)],
        [tipX, tipY],
        [(BLOOM[0] + tipX) / 2 - 4 * Math.sin(angle), (BLOOM[1] + tipY) / 2 + 4 * Math.cos(angle)],
      ],
      { seed: `${seed}-petal-${i}`, amplitude: 0.8, close: true },
    );
  });

  // How much of the stem is revealed per stage; a bonsai is wired short forever.
  const reveal = $derived(bonsai ? 0.36 : stage === 'auto' ? 1 : stage === 'surface' ? 0.62 : 0.3);
</script>

<svg viewBox="0 0 {W} {H}" width={W} height={H} class:dormant aria-hidden="true">
  <g class="vignette">
    {#if bonsai}
      <path d="M {W / 2 - 16} {SOIL_Y} h 32 l -4 10 h -24 Z" class="pot" />
    {/if}
    <path d={soil} class="soil" />
    <path d={stem} class="stem" pathLength="1" style:stroke-dashoffset={1 - reveal} />
    <path d={leafLeft} class="leaf" />
    <path d={leafRight} class="leaf" />
    {#if bonsai}
      <path d="M {W / 2 - 8} {SOIL_Y - 30} q 8 4 16 0" class="binding" />
    {:else}
      <circle cx={BUD[0]} cy={BUD[1]} r="3.4" class="bud" class:visible={stage !== 'escalate'} />
      <g class="bloom" class:open={stage === 'auto'} style="transform-origin: {BLOOM[0]}px {BLOOM[1]}px">
        {#each petals as petal, i (i)}
          <path d={petal} style:fill={tone} />
        {/each}
        <circle cx={BLOOM[0]} cy={BLOOM[1]} r="2.6" class="heart" />
      </g>
    {/if}
  </g>
</svg>

<style>
  svg {
    flex: none;
    transition: filter 1s var(--ease-calm);
  }

  svg.dormant .vignette {
    transform: rotate(-2deg);
    transform-origin: 50% 100%;
  }

  .vignette {
    transition: transform 1.6s var(--ease-calm);
  }

  .soil {
    fill: none;
    stroke: var(--line-strong);
    stroke-width: 1.6;
    stroke-linecap: round;
  }

  .pot {
    fill: var(--paper-deep);
    stroke: var(--line-strong);
    stroke-width: 1.2;
  }

  .stem {
    fill: none;
    stroke: var(--ink-soft);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-dasharray: 1;
    transition: stroke-dashoffset var(--dur-grow) var(--ease-calm);
  }

  .leaf {
    fill: none;
    stroke: var(--moss);
    stroke-width: 1.3;
    stroke-linecap: round;
  }

  .binding {
    fill: none;
    stroke: var(--clay);
    stroke-width: 1.8;
    stroke-linecap: round;
  }

  .bud {
    fill: var(--moss);
    opacity: 0;
    transition: opacity var(--dur-grow) var(--ease-calm);
  }

  .bud.visible {
    opacity: 0.85;
  }

  .bloom {
    opacity: 0;
    transform: scale(0.2);
    transition:
      opacity 1.2s var(--ease-calm),
      transform 1.2s var(--ease-calm);
  }

  .bloom.open {
    opacity: 1;
    transform: scale(1);
  }

  .bloom path {
    opacity: 0.5;
    stroke: var(--ink-soft);
    stroke-width: 0.7;
  }

  .heart {
    fill: var(--ink-soft);
  }
</style>
