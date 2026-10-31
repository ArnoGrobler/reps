// Workout mode.
// Timed: get-ready countdown → work (rep counter or countdown) → rest → … hands-free.
// Own pace: one set at a time, tap Next. Finishing marks the day complete.
// The session survives minimising (bottom accessory) and page reloads (resumes paused).

import { icon } from './icons.js';
import { esc, alertDialog, openSheet, closeSheet, toast } from './ui.js';
import { EX, EQUIP_ICON, mainEquip } from './data.js';
import { fmtDuration, fmtMinutes, relativeLabel, todayKey } from './dates.js';
import { getState, update, getDay, loadSession, saveSession } from './store.js';
import { flatten, countExercises, estimateSeconds } from './generator.js';
import { exerciseView } from './views/library.js';
import * as cue from './audio.js';

let S = null;        // active session
let el = null;       // cover element while visible
let loopId = 0;
let intervalId = 0;

const settings = () => getState().settings;
const now = () => Date.now();

/* ---------- Session lifecycle ---------- */

export async function startWorkout(key) {
  if (S && S.key !== key && S.phase !== 'select' && S.phase !== 'done') {
    const v = await alertDialog({
      title: 'A workout is in progress',
      message: `You have “${S.title}” going. Open it, or end it and start this one?`,
      actions: [{ label: 'Open Current', value: 'open', style: 'filled' }, { label: 'End & Start New', value: 'new', style: 'danger' }, { label: 'Cancel', value: null, style: 'gray' }],
    });
    if (v === 'open') { show(); return; }
    if (v !== 'new') return;
    clearSession();
  }
  if (S && S.key === key && S.phase !== 'done') { show(); return; }
  const day = getDay(key);
  if (!day || day.type !== 'workout') return;
  S = { key, title: day.title, phase: 'select', mode: null, steps: [], i: 0, paused: false, activeMs: 0, startedAt: 0 };
  show();
}

function begin(mode) {
  const day = getDay(S.key);
  cue.unlock();
  const all = flatten(day, EX);
  S.mode = mode;
  S.effortShort = day.effortShort || '';
  S.steps = mode === 'timed' ? all : all.filter((s) => s.kind === 'work');
  S.i = 0;
  S.startedAt = now();
  S.lastTick = now();
  S.activeMs = 0;
  S.paused = false;
  if (!S.steps.length) { toast('This workout has no exercises yet', { iconName: 'info' }); return; }
  if (settings().wakeLock) cue.keepAwake(true);
  if (mode === 'timed') {
    S.phase = 'ready';
    startPhase(now(), true);
  } else {
    S.phase = 'run';
    announceWork(S.steps[0], true);
  }
  persist();
  render();
  startLoop();
}

function finish(early = false) {
  const day = getDay(S.key);
  const work = S.steps.slice(0, early ? S.i : S.steps.length).filter((s) => s.kind === 'work');
  const reps = work.reduce((n, s) => n + (s.mode === 'reps' ? (s.reps || 0) * (s.perSide ? 2 : 1) : 0), 0);
  const sets = work.filter((s) => s.blockKind === 'main' || s.blockKind === 'finisher').length;
  S.phase = 'done';
  S.summary = { durationSec: Math.round(S.activeMs / 1000), reps, sets, exercises: countExercises(day) };
  update((s) => {
    s.log[S.key] = { completed: true, at: now(), mode: S.mode, durationSec: S.summary.durationSec, sets, reps };
  });
  stopLoop();
  cue.keepAwake(false);
  if (settings().sound) cue.doneChime();
  if (settings().voice) cue.say('Workout complete. Great work.');
  if (settings().haptics) cue.haptic([20, 60, 20]);
  saveSession(null);
  if (!el) show(); else render();
  renderAccessory();
}

function clearSession() {
  stopLoop();
  cue.stopSpeech();
  cue.keepAwake(false);
  S = null;
  saveSession(null);
  renderAccessory();
}

/** Before switching profile: pause and save the session under its own profile, then clear it from screen. */
export function suspendForSwitch() {
  if (S && S.phase !== 'select' && S.phase !== 'done') {
    if (!S.paused) {
      S.paused = true;
      if (S.mode === 'timed') S.remainingMs = Math.max(0, S.phaseEndsAt - now());
    }
    persist();
  }
  stopLoop();
  cue.stopSpeech();
  cue.keepAwake(false);
  if (el) {
    el.remove();
    el = null;
    document.documentElement.style.overflow = '';
    document.body.classList.remove('cover-open');
  }
  S = null;
  renderAccessory();
}

export function restoreSession() {
  const saved = loadSession();
  if (!saved || !saved.steps?.length || saved.phase === 'done' || saved.phase === 'select') return;
  if (!getDay(saved.key)) { saveSession(null); return; }
  S = { ...saved, paused: true, lastTick: now() };
  if (S.remainingMs == null) S.remainingMs = 0;
  renderAccessory();
}

function persist() {
  if (!S || S.phase === 'select' || S.phase === 'done') return;
  const remainingMs = S.paused ? S.remainingMs : Math.max(0, (S.phaseEndsAt || now()) - now());
  saveSession({ ...S, remainingMs });
}

/* ---------- Timed engine ---------- */

function phaseLength(st) {
  if (S.phase === 'ready') return settings().getReady;
  return st.kind === 'rest' ? st.sec : st.workSec;
}

function startPhase(at, withCues) {
  const st = S.steps[S.i];
  S.phaseStart = at;
  S.phaseEndsAt = at + phaseLength(st) * 1000;
  S.lastSecond = null;
  S.lastRep = 0;
  S.halfCued = false;
  if (!withCues) return;
  const set = settings();
  if (set.haptics) cue.haptic(15);
  if (S.phase === 'ready') {
    if (set.voice) cue.say(`Get ready. First up: ${spokenRx(S.steps[0])}`);
  } else if (st.kind === 'work') {
    if (set.sound) cue.goBeep();
    announceWork(st);
  } else if (set.voice) {
    const next = S.steps[st.next];
    const prevWork = S.steps.slice(0, S.i).reverse().find((x) => x.kind === 'work');
    const same = next && prevWork && next.exId === prevWork.exId;
    if (st.active) cue.say(`${st.label}. ${st.sec} seconds.`);
    else if (st.label === 'Transition') cue.say(next ? `Next: ${next.name}.` : 'Last one done.');
    else cue.say(`Rest ${st.sec} seconds.${next ? (same ? '' : ` Next: ${next.name}.`) : ''}`);
  }
}

function announceWork(st, first = false) {
  if (!settings().voice || !st) return;
  const prev = S.steps.slice(0, S.i).reverse().find((x) => x.kind === 'work');
  if (!first && prev && prev.exId === st.exId) cue.say(`${st.circuit ? 'Round' : 'Set'} ${st.set}. ${amountText(st)}.`);
  else cue.say(spokenRx(st));
}

function amountText(st) {
  const side = st.perSide ? ' each side' : '';
  return st.mode === 'time' ? `${st.duration} seconds${side}` : `${st.reps} reps${side}`;
}
const spokenRx = (st) => `${st.name}. ${amountText(st)}.`;

function advance(at, withCues = true) {
  if (S.phase === 'ready') {
    S.phase = 'run';
    S.i = 0;
  } else {
    S.i++;
    if (S.i >= S.steps.length) { finish(); return false; }
  }
  startPhase(at, withCues);
  return true;
}

function tick() {
  if (!S || S.phase === 'select' || S.phase === 'done') return;
  const t = now();
  if (!S.paused) S.activeMs += t - (S.lastTick || t);
  S.lastTick = t;
  if (S.mode !== 'timed') { if (S.pacedEndsAt && !S.paused && t >= S.pacedEndsAt) pacedTimerDone(); live(); return; }
  if (S.paused) { live(); return; }

  // Catch up if the page was in the background
  let changed = false;
  while (S && S.phase !== 'done' && t >= S.phaseEndsAt) {
    const behind = t - S.phaseEndsAt > 1500;
    if (!advance(S.phaseEndsAt, !behind)) return;
    changed = true;
  }
  if (!S) return;
  if (changed) { persist(); render(); renderAccessory(); return; }

  const set = settings();
  const st = S.steps[S.i];
  const remaining = (S.phaseEndsAt - t) / 1000;
  const sec = Math.ceil(remaining);
  if (sec !== S.lastSecond) {
    S.lastSecond = sec;
    if (sec <= 3 && sec >= 1 && set.sound) cue.countBeep();
  }
  if (S.phase === 'run' && st.kind === 'work') {
    if (st.mode === 'reps') {
      const rep = currentRep(st, t);
      if (rep.total > S.lastRep) {
        S.lastRep = rep.total;
        if (set.sound && set.repTick && rep.total > 1) cue.tick();
        if (st.perSide && rep.total === st.reps + 1 && set.voice) cue.say('Switch sides');
      }
    } else if (st.perSide && !S.halfCued && t - S.phaseStart >= st.workSec * 500) {
      S.halfCued = true;
      if (set.voice) cue.say('Switch sides');
      if (set.haptics) cue.haptic(15);
    }
  }
  live();
}

function currentRep(st, t = now()) {
  const sides = st.perSide ? 2 : 1;
  const total = Math.max(1, st.reps * sides);
  const elapsed = S.paused ? (S.phaseEndsAt - S.phaseStart) - S.remainingMs : t - S.phaseStart;
  const per = (st.workSec * 1000) / total;
  const n = Math.min(total, Math.floor(elapsed / per) + 1);
  return { total: n, inSide: ((n - 1) % st.reps) + 1, side: st.perSide ? (n > st.reps ? 'Right side' : 'Left side') : '' };
}

function startLoop() {
  stopLoop();
  const frame = () => { tick(); loopId = requestAnimationFrame(frame); };
  loopId = requestAnimationFrame(frame);
  intervalId = setInterval(tick, 250);
}
function stopLoop() {
  cancelAnimationFrame(loopId);
  clearInterval(intervalId);
  loopId = intervalId = 0;
}

/* ---------- Controls ---------- */

function togglePause() {
  if (!S || S.phase === 'select' || S.phase === 'done') return;
  cue.unlock();
  if (S.paused) {
    S.paused = false;
    S.lastTick = now();
    if (S.mode === 'timed') {
      S.phaseEndsAt = now() + S.remainingMs;
      S.phaseStart = S.phaseEndsAt - phaseLength(S.steps[S.i] || {}) * 1000;
    }
    if (S.pacedRemaining != null) { S.pacedEndsAt = now() + S.pacedRemaining; S.pacedRemaining = null; }
    if (settings().wakeLock) cue.keepAwake(true);
    if (!loopId) startLoop();
  } else {
    S.paused = true;
    if (S.mode === 'timed') S.remainingMs = Math.max(0, S.phaseEndsAt - now());
    if (S.pacedEndsAt) { S.pacedRemaining = Math.max(0, S.pacedEndsAt - now()); S.pacedEndsAt = null; }
    cue.stopSpeech();
  }
  persist();
  render();
  renderAccessory();
}

function next() {
  if (!S) return;
  cue.unlock();
  if (S.mode === 'timed') {
    const wasPaused = S.paused;
    if (!advance(now())) return;
    if (wasPaused) { S.paused = false; S.lastTick = now(); }
  } else {
    S.pacedEndsAt = null; S.pacedRemaining = null;
    if (S.i >= S.steps.length - 1) { finish(); return; }
    S.i++;
    announceWork(S.steps[S.i]);
    if (settings().haptics) cue.haptic(12);
  }
  persist();
  render();
  renderAccessory();
}

function prev() {
  if (!S) return;
  if (S.mode === 'timed') {
    if (S.phase === 'ready') return;
    let j = S.i;
    const curWork = S.steps[j].kind === 'work';
    // Restart the current set if it has been running, otherwise go back one set
    const running = now() - S.phaseStart > 3000;
    if (!(curWork && running)) {
      j--;
      while (j > 0 && S.steps[j].kind !== 'work') j--;
      j = Math.max(0, j);
    }
    S.i = j;
    S.phase = 'run';
    startPhase(now(), true);
    if (S.paused) { S.paused = false; S.lastTick = now(); }
  } else {
    S.pacedEndsAt = null; S.pacedRemaining = null;
    S.i = Math.max(0, S.i - 1);
  }
  persist();
  render();
}

function addRest(sec) {
  if (!S || S.mode !== 'timed') return;
  if (S.paused) S.remainingMs += sec * 1000; else S.phaseEndsAt += sec * 1000;
  S.phaseStart += 0;
  persist();
  live();
}

function startPacedTimer() {
  const st = S.steps[S.i];
  cue.unlock();
  S.pacedTotal = st.workSec * 1000;
  S.pacedEndsAt = now() + S.pacedTotal;
  S.pacedRemaining = null;
  S.pacedHalf = false;
  if (settings().sound) cue.goBeep();
  render();
}

function pacedTimerDone() {
  S.pacedEndsAt = null;
  if (settings().sound) cue.goBeep();
  if (settings().haptics) cue.haptic([15, 40, 15]);
  render();
}

async function endWorkout() {
  if (!S) return;
  if (S.phase === 'select' || S.phase === 'done') { hide(true); return; }
  const wasPaused = S.paused;
  if (!wasPaused) togglePause();
  const v = await alertDialog({
    title: 'End workout?',
    message: 'Save it as complete, or discard this session. Discarding keeps the day unchecked.',
    actions: [{ label: 'Save as Complete', value: 'save', style: 'filled' }, { label: 'Discard', value: 'discard', style: 'danger' }, { label: 'Keep Going', value: 'keep', style: 'gray' }],
  });
  if (v === 'save') finish(true);
  else if (v === 'discard') { clearSession(); hide(true); }
  else if (!wasPaused) togglePause();
}

/* ---------- Cover ---------- */

function show() {
  if (!el) {
    el = document.createElement('div');
    el.className = 'cover plain player';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Workout');
    document.getElementById('overlays').appendChild(el);
    document.documentElement.style.overflow = 'hidden';
    document.body.classList.add('cover-open');
  }
  render();
  renderAccessory();
  if (S && S.phase !== 'select' && S.phase !== 'done' && !loopId && !S.paused) startLoop();
}

function hide(clear = false) {
  if (!el) return;
  const node = el;
  el = null;
  node.classList.add('out');
  document.documentElement.style.overflow = '';
  document.body.classList.remove('cover-open');
  setTimeout(() => node.remove(), 360);
  if (clear && S && (S.phase === 'select' || S.phase === 'done')) S = null;
  renderAccessory();
}

function progress() {
  if (!S.steps.length) return 0;
  if (S.phase === 'ready') return 0;
  const workIdx = S.steps.slice(0, S.i + 1).filter((x) => x.kind === 'work').length - (S.steps[S.i]?.kind === 'work' ? 1 : 0);
  const total = S.steps.filter((x) => x.kind === 'work').length;
  return workIdx / total;
}

function render() {
  if (!el || !S) return;
  const phaseClass = S.phase === 'select' ? 'select' : S.phase === 'done' ? 'done' : S.phase === 'ready' ? 'ready' : S.steps[S.i]?.kind === 'rest' ? 'rest' : 'work';
  el.dataset.phase = phaseClass;
  el.classList.toggle('is-paused', !!S.paused);
  if (S.phase === 'select') el.innerHTML = selectView();
  else if (S.phase === 'done') el.innerHTML = doneView();
  else el.innerHTML = runView(phaseClass);
  fit();
  live();
}

/** Size the timer ring (or the own-pace number) to the space left, so Up Next and the controls never get pushed off screen. */
function fit() {
  const main = el?.querySelector('.pl-main');
  const flex = main?.querySelector('.pl-ring-wrap, .pl-target');
  if (!main || !flex) return;
  const gap = parseFloat(getComputedStyle(main).rowGap) || 0;
  const pad = parseFloat(getComputedStyle(main).paddingTop) + parseFloat(getComputedStyle(main).paddingBottom);
  const kids = [...main.children];
  const others = kids.filter((k) => k !== flex).reduce((h, k) => h + k.offsetHeight, 0);
  const avail = main.clientHeight - pad - others - gap * (kids.length - 1) - 16;
  const width = main.clientWidth - 40;
  if (flex.classList.contains('pl-ring-wrap')) {
    main.style.setProperty('--ring', `${Math.floor(Math.max(120, Math.min(avail, width * 0.8, 320)))}px`);
  } else {
    const extra = flex.offsetHeight - (flex.querySelector('.pl-big')?.offsetHeight || 0);
    main.style.setProperty('--target-font', `${Math.floor(Math.max(56, Math.min((avail - extra) * 0.92, width * 0.36, 150)))}px`);
  }
}

window.addEventListener('resize', () => { if (el && S && S.phase !== 'select' && S.phase !== 'done') fit(); });

function topBar() {
  const work = S.steps.filter((x) => x.kind === 'work');
  const cur = S.steps[S.i];
  const exNo = S.phase === 'ready' ? 0 : (cur?.kind === 'work' ? cur : S.steps[cur?.next] || cur)?.exerciseNo || 0;
  const exTotal = work[0]?.exerciseTotal || 0;
  return `<header class="pl-top">
    <button class="icon-btn glass glass-interactive" data-action="pl-min" aria-label="Minimise workout">${icon('chevron-down')}</button>
    <div class="pl-head-mid">
      <div class="pl-bar"><i data-pl-progress style="width:${Math.round(progress() * 100)}%"></i></div>
      <div class="pl-head-label"><span>${exNo ? `Exercise ${exNo} of ${exTotal}` : esc(S.title)}</span><span class="num" data-pl-elapsed>${fmtDuration(S.activeMs / 1000)}</span></div>
    </div>
    <button class="toolbar-pill glass glass-interactive" data-action="pl-end">End</button>
  </header>`;
}

function selectView() {
  const day = getDay(S.key);
  const est = Math.round((day.estSec || estimateSeconds(day, EX)) / 60);
  const main = day.blocks.filter((b) => b.items.length);
  return `<div class="pl-select">
    <header class="pl-top">
      <button class="icon-btn glass glass-interactive" data-action="pl-close" aria-label="Close">${icon('x')}</button>
      <span></span><span style="width:44px"></span>
    </header>
    <div class="pl-select-head">
      <div class="eyebrow accent">${esc(relativeLabel(S.key))}</div>
      <h1 class="pl-title balance">${esc(day.title)}</h1>
      <div class="hero-meta" style="justify-content:center"><span>${icon('clock')} ${est} min</span><span>${icon('list')} ${countExercises(day)} exercises</span></div>
    </div>
    <div class="mode-buttons">
      <button class="mode-btn primary" data-action="pl-mode" data-mode="timed">
        <span class="mode-icon">${icon('timer')}</span>
        <span class="mode-label">Timed</span>
        <span class="mode-sub">Countdown for every set and rest. Hands-free with voice cues.</span>
      </button>
      <button class="mode-btn" data-action="pl-mode" data-mode="paced">
        <span class="mode-icon">${icon('hand')}</span>
        <span class="mode-label">Own Pace</span>
        <span class="mode-sub">One set at a time. Tap Next when you are ready.</span>
      </button>
    </div>
    <div class="pl-outline">
      ${main.map((b) => `<div class="pl-outline-block"><div class="eyebrow">${esc(b.name)}${b.format === 'circuit' && b.rounds > 1 ? ` · ${b.rounds} rounds` : ''}</div>
        ${b.items.map((it) => `<div class="pl-outline-item"><span class="truncate">${esc(EX[it.exId]?.name || it.exId)}</span><span class="sec num">${b.format === 'circuit' ? '' : `${it.sets} × `}${it.mode === 'time' ? `${it.duration}s` : it.reps}${EX[it.exId]?.perSide ? '/side' : ''}</span></div>`).join('')}
      </div>`).join('')}
    </div>
  </div>`;
}

function runView(phase) {
  const st = S.steps[S.i];
  const timed = S.mode === 'timed';
  if (!timed) return pacedView(st);
  const isReady = S.phase === 'ready';
  const work = isReady ? S.steps[0] : st.kind === 'work' ? st : S.steps[st.next];
  const label = isReady ? 'Get Ready' : st.kind === 'rest' ? (st.label || 'Rest') : st.ramp ? 'Ramp-Up' : 'Work';
  const name = isReady ? 'Get Ready' : st.kind === 'rest' ? (st.active ? st.label : st.label === 'Transition' && work ? work.name : 'Rest') : st.name;
  const sub = isReady ? 'Your workout starts in'
    : st.kind === 'rest' ? (work ? `Next: ${work.name}` : 'Last one done')
    : st.ramp ? 'Light ramp-up set: about half effort'
    : st.sets > 1 ? `${setLabel(st)} · ${st.block}` : st.block;
  const nextUp = upNext();
  const size = 280;
  const r = (size - 18) / 2;
  const c = 2 * Math.PI * r;
  return `<div class="pl-run">
    ${topBar()}
    <main class="pl-main">
      <div class="pl-phase"><span>${esc(label)}</span>${S.paused ? '<span class="pl-paused">Paused</span>' : ''}</div>
      <h1 class="pl-name balance">${esc(name)}</h1>
      <div class="pl-sub">${esc(sub)}</div>
      ${effortLine(st, isReady)}
      <div class="pl-ring-wrap">
        <svg class="pl-ring" viewBox="0 0 ${size} ${size}" aria-hidden="true">
          <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="pl-ring-track"/>
          <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="pl-ring-val" data-pl-ring data-c="${c.toFixed(2)}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="0"/>
        </svg>
        <div class="pl-ring-center">
          <div class="pl-big rounded num" data-pl-big>0</div>
          <div class="pl-small" data-pl-small></div>
          <div class="pl-side" data-pl-side></div>
        </div>
      </div>
      ${!isReady && st.kind === 'work' ? `<button class="toolbar-pill glass glass-interactive pl-howto" data-action="pl-howto" data-ex="${st.exId}">${icon('circle-play', 'sm')} How to</button>`
        : st?.kind === 'rest' ? `<div class="pl-rest-actions"><button class="toolbar-pill glass glass-interactive" data-action="pl-add" data-sec="15">+15 s</button>${work ? `<button class="toolbar-pill glass glass-interactive" data-action="pl-howto" data-ex="${work.exId}">${icon('circle-play', 'sm')} Preview</button>` : ''}</div>` : '<div style="height:44px"></div>'}
      ${nextUp}
    </main>
    <footer class="pl-controls">
      <button class="pl-btn glass glass-interactive" data-action="pl-prev" aria-label="Previous">${icon('skip-back')}</button>
      <button class="pl-btn big glass glass-prominent glass-interactive" data-action="pl-pause" aria-label="${S.paused ? 'Resume' : 'Pause'}">${icon(S.paused ? 'play' : 'pause', 'lg')}</button>
      <button class="pl-btn glass glass-interactive" data-action="pl-next" aria-label="Skip to next">${icon('skip-forward')}</button>
    </footer>
  </div>`;
}

function upNext() {
  // The next work step that is a different set/exercise from what's on screen now
  const st = S.steps[S.i];
  let j = S.phase === 'ready' ? 0 : S.i + 1;
  if (st?.kind === 'rest' && S.phase !== 'ready') j = (st.next ?? S.i) + 1;
  let target = null;
  for (; j < S.steps.length; j++) if (S.steps[j].kind === 'work') { target = S.steps[j]; break; }
  if (!target) return `<div class="pl-next"><div class="eyebrow">Up Next</div><div class="pl-next-row"><span class="pl-next-icon done">${icon('flag')}</span><div class="grow"><div class="t-headline">Finish</div><div class="t-foot sec">Last set of the workout</div></div></div></div>`;
  const ex = EX[target.exId];
  return `<div class="pl-next"><div class="eyebrow">Up Next</div>
    <div class="pl-next-row"><span class="pl-next-icon">${icon(EQUIP_ICON[mainEquip(ex)] || 'dumbbell')}</span>
      <div class="grow" style="min-width:0"><div class="t-headline truncate">${esc(target.name)}</div>
      <div class="t-foot sec">${esc(setLabel(target))} · ${esc(amountShort(target))}</div></div></div></div>`;
}

function effortLine(st, isReady) {
  if (isReady || !st || st.kind !== 'work' || st.ramp || !S.effortShort) return '';
  if (st.blockKind !== 'main' && st.blockKind !== 'finisher') return '';
  return `<div class="pl-effort">${icon('gauge', 'xs')} ${esc(S.effortShort)}</div>`;
}

const setLabel = (st) => (st.sets > 1 ? `${st.circuit ? 'Round' : 'Set'} ${st.set} of ${st.sets}` : st.block);
const amountShort = (st) => `${st.mode === 'time' ? `${st.duration} s` : `${st.reps} reps`}${st.perSide ? ' / side' : ''}`;

function pacedView(st) {
  const isLast = S.i >= S.steps.length - 1;
  const nextSt = S.steps[S.i + 1];
  const nextLabel = isLast ? 'Finish Workout' : nextSt.exId === st.exId ? `Next ${st.circuit ? 'Round' : 'Set'}` : 'Next Exercise';
  const timerOn = !!(S.pacedEndsAt || S.pacedRemaining != null);
  return `<div class="pl-run paced">
    ${topBar()}
    <main class="pl-main">
      <div class="pl-phase"><span>${esc(st.block)}</span>${S.paused ? '<span class="pl-paused">Paused</span>' : ''}</div>
      <h1 class="pl-name balance">${esc(st.name)}</h1>
      ${st.ramp ? '<div class="pl-sub">Light ramp-up set: about half effort</div>' : st.sets > 1 ? `<div class="pl-sub">${esc(setLabel(st))}</div>` : ''}
      ${effortLine(st, false)}
      ${st.atTop && st.set === st.sets ? '<div class="pl-hint">Top of your rep range. Next time, go heavier or pick a harder variation.</div>' : ''}
      <div class="pl-target">
        ${timerOn
          ? `<div class="pl-big rounded num" data-pl-big>0</div><div class="pl-small" data-pl-small>seconds left</div>`
          : `<div class="pl-big rounded num">${st.mode === 'time' ? st.duration : st.reps}</div>
             <div class="pl-small">${st.mode === 'time' ? 'seconds' : 'reps'}${st.perSide ? ' each side' : ''}</div>`}
        ${st.mode === 'time' && !timerOn ? `<button class="btn btn-tinted sm" data-action="pl-timer">${icon('timer', 'xs')} Start Timer</button>` : ''}
      </div>
      <button class="toolbar-pill glass glass-interactive pl-howto" data-action="pl-howto" data-ex="${st.exId}">${icon('circle-play', 'sm')} How to</button>
      ${S.i < S.steps.length - 1 ? upNext() : `<div class="pl-next"><div class="eyebrow">Up Next</div><div class="pl-next-row"><span class="pl-next-icon done">${icon('flag')}</span><div class="grow"><div class="t-headline">Finish</div><div class="t-foot sec">This is your last set</div></div></div></div>`}
    </main>
    <footer class="pl-controls paced">
      <button class="pl-btn glass glass-interactive" data-action="pl-prev" aria-label="Previous set" ${S.i === 0 ? 'disabled' : ''}>${icon('skip-back')}</button>
      <button class="pl-next-btn glass glass-prominent glass-interactive" data-action="pl-next">${esc(nextLabel)} ${icon(isLast ? 'flag' : 'arrow-right', 'sm')}</button>
    </footer>
  </div>`;
}

function doneView() {
  const sm = S.summary || {};
  return `<div class="pl-done">
    <header class="pl-top"><span style="width:44px"></span><span></span><span style="width:44px"></span></header>
    <div class="pl-done-badge">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="pl-done-ring"/></svg>
      <span>${icon('check', 'xl bold')}</span>
    </div>
    <div class="eyebrow" style="color:var(--green)">Workout Complete</div>
    <h1 class="pl-title balance">${esc(S.title)}</h1>
    <div class="pl-stats">
      <div><b class="rounded num">${fmtDuration(sm.durationSec || 0)}</b><span>Time</span></div>
      <div><b class="rounded num">${sm.exercises || 0}</b><span>Exercises</span></div>
      <div><b class="rounded num">${sm.sets || 0}</b><span>Sets</span></div>
      <div><b class="rounded num">${sm.reps || 0}</b><span>Reps</span></div>
    </div>
    <p class="t-callout sec" style="text-align:center;margin:0">${esc(relativeLabel(S.key))} is checked off on your calendar.</p>
    <button class="btn btn-filled lg block" data-action="pl-done" style="max-width:420px">Done</button>
  </div>`;
}

/** Per-frame updates without re-rendering. */
function live() {
  if (!S) return;
  const t = now();
  const elapsedEl = document.querySelector('[data-pl-elapsed]');
  if (elapsedEl) elapsedEl.textContent = fmtDuration(S.activeMs / 1000);
  const accT = document.querySelector('[data-acc-time]');
  if (accT) accT.textContent = accessoryTime();
  if (!el || S.phase === 'select' || S.phase === 'done') return;
  const big = el.querySelector('[data-pl-big]');
  const small = el.querySelector('[data-pl-small]');
  const side = el.querySelector('[data-pl-side]');
  const ring = el.querySelector('[data-pl-ring]');
  const st = S.steps[S.i];

  if (S.mode !== 'timed') {
    if (S.pacedEndsAt || S.pacedRemaining != null) {
      const rem = S.pacedEndsAt ? Math.max(0, S.pacedEndsAt - t) : S.pacedRemaining;
      if (big) big.textContent = Math.ceil(rem / 1000);
      if (st.perSide && small) small.textContent = rem > S.pacedTotal / 2 ? 'Left side' : 'Right side';
    }
    return;
  }
  const len = S.phase === 'ready' ? settings().getReady * 1000 : phaseLength(st) * 1000;
  const rem = S.paused ? S.remainingMs : Math.max(0, S.phaseEndsAt - t);
  const frac = len ? 1 - rem / len : 1;
  if (ring) ring.setAttribute('stroke-dashoffset', (parseFloat(ring.dataset.c) * frac).toFixed(1));
  const secs = Math.ceil(rem / 1000);
  if (S.phase === 'run' && st.kind === 'work' && st.mode === 'reps') {
    const rep = currentRep(st, t);
    if (big) big.textContent = rep.inSide;
    if (small) small.textContent = `of ${st.reps} reps · ${secs}s`;
    if (side) side.textContent = rep.side;
  } else {
    if (big) { big.textContent = secs >= 60 ? fmtDuration(secs) : secs; big.classList.toggle('long', secs >= 60); }
    if (small) small.textContent = S.phase === 'ready' ? 'seconds' : st.kind === 'rest' ? (secs >= 60 ? 'rest' : 'seconds rest') : `of ${st.duration}s${st.perSide ? ' each side' : ''}`;
    if (side) side.textContent = st.kind === 'work' && st.perSide ? (t - S.phaseStart < st.workSec * 500 ? 'Left side' : 'Right side') : '';
  }
  if (big) big.classList.toggle('pulse', secs <= 3 && !(S.phase === 'run' && st.kind === 'work' && st.mode === 'reps'));
}

/* ---------- Accessory (mini player above the tab bar) ---------- */

function accessoryTime() {
  if (!S || S.phase === 'select' || S.phase === 'done') return '';
  if (S.mode !== 'timed') return fmtDuration(S.activeMs / 1000);
  const rem = S.paused ? S.remainingMs : Math.max(0, S.phaseEndsAt - now());
  return fmtDuration(rem / 1000);
}

export function accessoryHtml() {
  if (!S || el || S.phase === 'select' || S.phase === 'done') return '';
  const st = S.steps[S.i];
  const title = S.phase === 'ready' ? 'Get Ready' : st?.kind === 'rest' ? 'Rest' : st?.name || S.title;
  const sub = S.paused ? 'Paused' : S.mode === 'timed' ? (st?.kind === 'rest' ? 'Resting' : 'Working') : 'Own pace';
  return `<div class="accessory"><div class="accessory-inner glass">
    <button class="acc-open" data-action="pl-open" aria-label="Open workout">
      <span class="acc-icon ${st?.kind === 'rest' ? 'rest' : ''}">${icon(st?.kind === 'rest' ? 'hourglass' : 'dumbbell')}</span>
      <span class="grow" style="min-width:0;text-align:left"><span class="title" style="display:block">${esc(title)}</span><span class="sub">${esc(sub)} · <span class="num" data-acc-time>${accessoryTime()}</span></span></span>
    </button>
    <button class="icon-btn" data-action="pl-pause" aria-label="${S.paused ? 'Resume' : 'Pause'}">${icon(S.paused ? 'play' : 'pause')}</button>
    <button class="icon-btn" data-action="pl-next" aria-label="Next">${icon('skip-forward')}</button>
  </div></div>`;
}

export function renderAccessory() {
  document.dispatchEvent(new CustomEvent('reps:accessory'));
}

export const hasAccessory = () => !!accessoryHtml();
export const hasActiveSession = () => !!S && S.phase !== 'select' && S.phase !== 'done';

/* ---------- Actions ---------- */

export const actions = {
  'start-workout': (b) => { closeSheet(true); startWorkout(b.dataset.key); },
  'pl-mode': (b) => begin(b.dataset.mode),
  'pl-close': () => { hide(true); },
  'pl-min': () => hide(false),
  'pl-open': () => show(),
  'pl-end': () => endWorkout(),
  'pl-pause': () => togglePause(),
  'pl-next': () => next(),
  'pl-prev': () => prev(),
  'pl-add': (b) => addRest(+b.dataset.sec),
  'pl-timer': () => startPacedTimer(),
  'pl-done': () => { hide(true); S = null; renderAccessory(); },
  'pl-howto': (b) => {
    if (S && !S.paused && S.phase !== 'select' && S.phase !== 'done') togglePause();
    openSheet(exerciseView(b.dataset.ex), { detent: 'large' });
  },
};

export function onKey(e) {
  if (!el || !S || S.phase === 'select' || S.phase === 'done') return false;
  if (e.target.closest('input, textarea')) return false;
  if (e.key === ' ') { e.preventDefault(); togglePause(); return true; }
  if (e.key === 'ArrowRight') { next(); return true; }
  if (e.key === 'ArrowLeft') { prev(); return true; }
  return false;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S && !S.paused && S.phase !== 'done' && settings().wakeLock) cue.keepAwake(true);
  if (document.visibilityState === 'hidden') persist();
});

export { todayKey, fmtMinutes };
