<script lang="ts">
  import type {PageData} from './$types';
  import type {TimerState} from '$lib/types';
  import {
    computeRemainingSec,
    computeVisiblePct,
    isDisappeared,
    computeColorSegments,
  } from '$lib/timerMath';

  let {data}: {data: PageData} = $props();

  const BAR_HEIGHT_PX = 20;
  const COLOR_HEX = {green: '#2ecc40', yellow: '#ffdc00', red: '#ff4136'} as const;

  let timer = $state<TimerState | null>(null);
  let now = $state(Date.now());

  $effect(() => {
    const es = new EventSource(`/api/timers/${data.id}/stream`);
    es.addEventListener('snapshot', (e: MessageEvent) => {
      timer = JSON.parse(e.data as string) as TimerState;
    });
    es.addEventListener('deleted', () => {
      timer = null;
    });

    let rafId = requestAnimationFrame(function loop() {
      now = Date.now();
      rafId = requestAnimationFrame(loop);
    });

    return () => {
      es.close();
      cancelAnimationFrame(rafId);
    };
  });

  let remainingSec = $derived(timer ? computeRemainingSec(timer, now) : 0);
  let visiblePct = $derived(timer ? computeVisiblePct(remainingSec, timer.durationSec) : 0);
  let hidden = $derived(!timer || isDisappeared(remainingSec, timer.disappearSec));
  let segments = $derived(timer ? computeColorSegments(timer.durationSec, timer.redZoneSec) : []);
  let erodeFrom = $derived(timer?.erodeFrom ?? 'left');
  let mirror = $derived(timer?.mirror ?? false);
  // mirror flips the whole strip, including which side erodes from
  let effectiveErodeFrom = $derived(mirror ? (erodeFrom === 'left' ? 'right' : 'left') : erodeFrom);
</script>

<div
  class="viewport"
  style:display={hidden ? 'none' : 'block'}
  style:height="{BAR_HEIGHT_PX}px"
  style:width="{visiblePct}%"
  style:left={effectiveErodeFrom === 'right' ? '0' : 'auto'}
  style:right={effectiveErodeFrom === 'left' ? '0' : 'auto'}
>
  <div
    class="track"
    style:height="{BAR_HEIGHT_PX}px"
    style:left={effectiveErodeFrom === 'right' ? '0' : 'auto'}
    style:right={effectiveErodeFrom === 'left' ? '0' : 'auto'}
  >
    {#each segments as segment (segment.color)}
      <div
        class="segment"
        style:background={COLOR_HEX[segment.color]}
        style:left={mirror ? 'auto' : `${segment.startPct}%`}
        style:right={mirror ? `${segment.startPct}%` : 'auto'}
        style:width="{segment.widthPct}%"
      ></div>
    {/each}
  </div>
</div>

<style>
  .viewport {
    position: fixed;
    bottom: 0;
    overflow: hidden;
  }

  .track {
    position: absolute;
    bottom: 0;
    width: 100vw;
  }

  .segment {
    position: absolute;
    top: 0;
    height: 100%;
  }
</style>
