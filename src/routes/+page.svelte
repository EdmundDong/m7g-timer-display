<script lang="ts">
  import type {PageData} from './$types';
  import type {Position, TimerState} from '$lib/types';
  import {computeRemainingSec, formatMMSS} from '$lib/timerMath';
  import {readJson, type ErrorBody} from '$lib/http';

  let {data}: {data: PageData} = $props();

  // SSR value seeds initial state; SSE stream takes over from here.
  // svelte-ignore state_referenced_locally
  let timers = $state<TimerState[]>(data.timers);
  let now = $state(Date.now());

  let name = $state('');
  let durationSec = $state(60);
  let showAdvanced = $state(false);
  let redZoneSec = $state<number | ''>('');
  let disappearSec = $state<number | ''>('');
  let position = $state<Position>('bottom');
  let mirror = $state(false);
  let createError = $state('');

  let editingId = $state<string | null>(null);
  let editFields = $state({
    name: '',
    durationSec: 0,
    redZoneSec: 0,
    disappearSec: 0,
    position: 'bottom',
    mirror: false,
  });
  let editError = $state('');

  $effect(() => {
    const es = new EventSource('/api/timers/stream');
    es.addEventListener('snapshot', (e: MessageEvent) => {
      timers = JSON.parse(e.data as string) as TimerState[];
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

  async function createTimer(e: Event) {
    e.preventDefault();
    createError = '';
    const body: Record<string, unknown> = {name, durationSec};
    if (redZoneSec !== '') body.redZoneSec = redZoneSec;
    if (disappearSec !== '') body.disappearSec = disappearSec;
    if (showAdvanced) {
      body.position = position;
      body.mirror = mirror;
    }
    const res = await fetch('/api/timers', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      createError = (await readJson<ErrorBody>(res)).error;
      return;
    }
    name = '';
    durationSec = 60;
    redZoneSec = '';
    disappearSec = '';
    position = 'bottom';
    mirror = false;
  }

  async function action(id: string, action: 'start' | 'pause' | 'resume' | 'reset') {
    await fetch(`/api/timers/${id}/${action}`, {method: 'POST'});
  }

  async function adjustMinute(id: string, direction: 'add' | 'remove') {
    await fetch(`/api/timers/${id}/${direction}-minute`, {method: 'POST'});
  }

  async function deleteTimer(id: string) {
    await fetch(`/api/timers/${id}`, {method: 'DELETE'});
  }

  function beginEdit(t: TimerState) {
    editingId = t.id;
    editError = '';
    editFields = {
      name: t.name,
      durationSec: t.durationSec,
      redZoneSec: t.redZoneSec,
      disappearSec: t.disappearSec,
      position: t.position,
      mirror: t.mirror,
    };
  }

  function cancelEdit() {
    editingId = null;
  }

  async function saveEdit(id: string) {
    editError = '';
    const res = await fetch(`/api/timers/${id}`, {
      method: 'PATCH',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(editFields),
    });
    if (!res.ok) {
      editError = (await readJson<ErrorBody>(res)).error;
      return;
    }
    editingId = null;
  }

  function sourceUrl(id: string) {
    const origin = typeof location !== 'undefined' ? location.origin : '';
    return `${origin}/source/${id}`;
  }

  async function copyUrl(id: string) {
    await navigator.clipboard.writeText(sourceUrl(id));
  }

  const statusColor: Record<TimerState['status'], string> = {
    idle: '#888',
    running: '#2ecc40',
    paused: '#ffb000',
    ended: '#ff4136',
  };
</script>

<div class="console-shell">
  <header class="page-header">
    <h1>Timer Console</h1>
    <span class="count">{timers.length} timer{timers.length === 1 ? '' : 's'}</span>
  </header>

  <form onsubmit={createTimer} class="create-form">
    <input placeholder="Timer name (blank = auto-named)" bind:value={name} />
    <input type="number" min="1" placeholder="Duration (sec)" bind:value={durationSec} required />
    <button type="button" class="ghost" onclick={() => (showAdvanced = !showAdvanced)}>
      {showAdvanced ? 'Hide' : 'Show'} advanced
    </button>
    <button type="submit" class="primary">Create timer</button>

    {#if showAdvanced}
      <div class="advanced">
        <label>
          Red zone (sec, default 10)
          <input type="number" min="0" bind:value={redZoneSec} placeholder="10" />
        </label>
        <label>
          Disappear at (sec, default 10)
          <input type="number" min="0" bind:value={disappearSec} placeholder="10" />
        </label>
        <label>
          Position
          <select bind:value={position}>
            <option value="top">top</option>
            <option value="bottom">bottom</option>
            <option value="left">left</option>
            <option value="right">right</option>
          </select>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={mirror} />
          Mirror
        </label>
      </div>
    {/if}
    {#if createError}<p class="error">{createError}</p>{/if}
  </form>

  <ul class="timer-list">
    {#each timers as t (t.id)}
      {@const remaining = computeRemainingSec(t, now)}
      {@const elapsed = t.durationSec - remaining}
      <li class="timer-row">
        <div class="timer-main">
          <span class="badge" style:background={statusColor[t.status]}>{t.status}</span>
          <strong class="name">{t.name}</strong>
          <div class="times">
            <span class="readout">{formatMMSS(remaining)}</span>
            <span class="times-label">remaining</span>
            <span class="elapsed">{formatMMSS(elapsed)} elapsed of {formatMMSS(t.durationSec)}</span
            >
          </div>
        </div>

        <div class="controls">
          {#if t.status === 'idle' || t.status === 'ended'}
            <button class="primary" onclick={() => action(t.id, 'start')}>Start</button>
          {/if}
          {#if t.status === 'running'}
            <button onclick={() => action(t.id, 'pause')}>Pause</button>
          {/if}
          {#if t.status === 'paused'}
            <button class="primary" onclick={() => action(t.id, 'resume')}>Resume</button>
          {/if}
          <button class="ghost" onclick={() => action(t.id, 'reset')}>Reset</button>

          <span class="divider"></span>

          <button
            class="ghost"
            title="Remove a minute"
            disabled={remaining <= 60}
            onclick={() => adjustMinute(t.id, 'remove')}>−1:00</button
          >
          <button class="ghost" title="Add a minute" onclick={() => adjustMinute(t.id, 'add')}
            >+1:00</button
          >

          <span class="divider"></span>

          <button class="ghost" onclick={() => beginEdit(t)}>Settings</button>
          <button class="danger" onclick={() => deleteTimer(t.id)}>Delete</button>
        </div>

        <div class="source-url">
          <input readonly value={sourceUrl(t.id)} onclick={(e) => e.currentTarget.select()} />
          <button class="ghost" onclick={() => copyUrl(t.id)}>Copy</button>
        </div>

        {#if editingId === t.id}
          <div class="edit-panel">
            <label>
              Name
              <input bind:value={editFields.name} placeholder="Blank = auto-named" />
            </label>
            <label>
              Duration (sec)
              <input type="number" min="1" bind:value={editFields.durationSec} />
            </label>
            <label>
              Red zone (sec)
              <input type="number" min="0" bind:value={editFields.redZoneSec} />
            </label>
            <label>
              Disappear at (sec)
              <input type="number" min="0" bind:value={editFields.disappearSec} />
            </label>
            <label>
              Position
              <select bind:value={editFields.position}>
                <option value="top">top</option>
                <option value="bottom">bottom</option>
                <option value="left">left</option>
                <option value="right">right</option>
              </select>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={editFields.mirror} />
              Mirror
            </label>
            <div class="edit-actions">
              <button class="primary" onclick={() => saveEdit(t.id)}>Save</button>
              <button class="ghost" onclick={cancelEdit}>Cancel</button>
            </div>
            {#if editError}<p class="error">{editError}</p>{/if}
          </div>
        {/if}
      </li>
    {/each}
    {#if timers.length === 0}
      <li class="empty-state">No timers yet — create one above.</li>
    {/if}
  </ul>
</div>

<style>
  .console-shell {
    min-height: 100vh;
    background: #16171a;
    color: #e8e8e8;
    font-family:
      system-ui,
      -apple-system,
      'Segoe UI',
      sans-serif;
    padding: 2rem;
    box-sizing: border-box;
  }

  .page-header {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .page-header h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .count {
    color: #888;
    font-size: 0.9rem;
  }

  button {
    font: inherit;
    border-radius: 5px;
    border: 1px solid #3a3a3f;
    background: #26272b;
    color: #e8e8e8;
    padding: 0.4rem 0.75rem;
    cursor: pointer;
    transition: background-color 0.1s ease;
  }

  button:hover:not(:disabled) {
    background: #333438;
  }

  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  button.primary {
    background: #2f6fed;
    border-color: #2f6fed;
    color: white;
    font-weight: 600;
  }

  button.primary:hover:not(:disabled) {
    background: #4b82f0;
  }

  button.danger {
    border-color: #5a2a27;
    color: #ff8983;
  }

  button.danger:hover:not(:disabled) {
    background: #3a201f;
  }

  button.ghost {
    background: transparent;
  }

  input,
  select {
    font: inherit;
    background: #1e1f22;
    border: 1px solid #3a3a3f;
    border-radius: 5px;
    color: #e8e8e8;
    padding: 0.4rem 0.6rem;
  }

  input:focus,
  select:focus {
    outline: 2px solid #2f6fed;
    outline-offset: -1px;
  }

  .create-form {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
    margin-bottom: 2rem;
    background: #1c1d20;
    border: 1px solid #2a2b2f;
    border-radius: 8px;
    padding: 1rem;
  }

  .advanced {
    display: flex;
    gap: 1.25rem;
    flex-wrap: wrap;
    width: 100%;
    padding-top: 0.75rem;
    margin-top: 0.25rem;
    border-top: 1px solid #2a2b2f;
  }

  .advanced label,
  .edit-panel label {
    display: flex;
    flex-direction: column;
    font-size: 0.8rem;
    color: #aaa;
    gap: 0.3rem;
  }

  .checkbox-label {
    flex-direction: row !important;
    align-items: center;
    gap: 0.4rem !important;
  }

  .timer-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    max-width: 60rem;
  }

  .timer-row {
    background: #1c1d20;
    border: 1px solid #2a2b2f;
    border-radius: 8px;
    padding: 0.85rem 1rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
  }

  .timer-main {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1 1 16rem;
    min-width: 16rem;
  }

  .badge {
    border-radius: 4px;
    padding: 0.15rem 0.55rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #111;
    font-weight: 700;
  }

  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .times {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    margin-left: auto;
  }

  .readout {
    font-variant-numeric: tabular-nums;
    font-size: 1.2rem;
    font-weight: 700;
  }

  .times-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #777;
  }

  .elapsed {
    font-size: 0.75rem;
    color: #999;
    font-variant-numeric: tabular-nums;
    margin-top: 0.1rem;
  }

  .controls {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .divider {
    width: 1px;
    height: 1.4rem;
    background: #333;
    margin: 0 0.15rem;
  }

  .source-url {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    width: 100%;
  }

  .source-url input {
    flex: 1;
    font-size: 0.8rem;
    color: #999;
  }

  .edit-panel {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    background: #232427;
    padding: 0.85rem;
    border-radius: 6px;
    align-items: flex-end;
  }

  .edit-actions {
    display: flex;
    gap: 0.4rem;
    margin-left: auto;
  }

  .empty-state {
    color: #777;
    padding: 2rem 0;
    text-align: center;
  }

  .error {
    color: #ff6b64;
    width: 100%;
    margin: 0;
    font-size: 0.85rem;
  }
</style>
