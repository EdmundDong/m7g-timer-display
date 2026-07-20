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

  const BAR_THICKNESS_PX = 20;
  const FADE_SECONDS = 2;
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
  let mirror = $derived(timer?.mirror ?? false);
  let position = $derived(timer?.position ?? 'bottom');

  // top/bottom bars run left<->right (horizontal); left/right bars run top<->bottom (vertical).
  let orientation = $derived(
    position === 'left' || position === 'right' ? 'vertical' : 'horizontal',
  );
  let startEdge = $derived(orientation === 'horizontal' ? 'left' : 'top');
  let endEdge = $derived(orientation === 'horizontal' ? 'right' : 'bottom');
  // mirror flips the whole strip: which edge it erodes from, and (below) which side is
  // green vs red - but never which screen edge it's anchored to (`position` controls that).
  // baseline (mirror=false) erodes from startEdge, remaining chunk anchored at endEdge.
  let anchorEdge = $derived(mirror ? startEdge : endEdge);
  let otherMainEdge = $derived(mirror ? endEdge : startEdge);
  // the color track always starts (green) at the eroding edge and ends (red) at the anchor
  // edge, so the visible colors stay correct as time erodes away - whichever direction that is.
  let segmentEdge = $derived(otherMainEdge);
  let segmentOtherEdge = $derived(anchorEdge);

  let viewportStyle = $derived(
    [
      'position:fixed',
      `${position}:0`,
      'overflow:hidden',
      `opacity:${hidden ? 0 : 1}`,
      `transition:opacity ${FADE_SECONDS}s linear`,
      orientation === 'horizontal'
        ? `height:${BAR_THICKNESS_PX}px;width:${visiblePct}%`
        : `width:${BAR_THICKNESS_PX}px;height:${visiblePct}%`,
      `${anchorEdge}:0`,
      `${otherMainEdge}:auto`,
    ].join(';'),
  );

  let trackStyle = $derived(
    [
      'position:absolute',
      `${position}:0`,
      orientation === 'horizontal'
        ? `height:${BAR_THICKNESS_PX}px;width:100vw`
        : `width:${BAR_THICKNESS_PX}px;height:100vh`,
      `${anchorEdge}:0`,
      `${otherMainEdge}:auto`,
    ].join(';'),
  );

  function segmentStyle(startPct: number, widthPct: number, color: keyof typeof COLOR_HEX) {
    return [
      'position:absolute',
      `background:${COLOR_HEX[color]}`,
      orientation === 'horizontal' ? 'top:0;height:100%' : 'left:0;width:100%',
      `${segmentEdge}:${startPct}%`,
      `${segmentOtherEdge}:auto`,
      orientation === 'horizontal' ? `width:${widthPct}%` : `height:${widthPct}%`,
    ].join(';');
  }
</script>

<div style={viewportStyle}>
  <div style={trackStyle}>
    {#each segments as segment (segment.color)}
      <div style={segmentStyle(segment.startPct, segment.widthPct, segment.color)}></div>
    {/each}
  </div>
</div>
