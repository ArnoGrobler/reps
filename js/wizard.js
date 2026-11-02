// Plan setup wizard (full-screen cover): style, goal & level → length & start →
// equipment → time per weekday → (Same Every Day: the daily workout) → review & create.

import { icon } from './icons.js';
import { esc, segmented, switchHtml, stepperHtml, toast } from './ui.js';
import { EXERCISES, EQUIPMENT, EQUIP_ICON, EQUIP_COLOR, EQ, EX, allowedExercises, mainEquip } from './data.js';
import { todayKey, addDays, dow, fmtMonthDay, fmt, weekdayLetters, startOfWeek, fmtMinutes, LOCALE } from './dates.js';
import { getState, update } from './store.js';
import { generatePlan, dailyRoutine, pplCoverage, estimateSeconds, GOALS, LEVELS, LOADS, countExercises } from './generator.js';
import { itemRx, blockFormat } from './views/day.js';
import { editDraftItem, addToDraft } from './views/editor.js';

const STYLES = {
  varied: { label: 'Varied', icon: 'shuffle', desc: 'Different workouts through the week (full body, upper and lower, conditioning). Exercises change every 4 weeks.' },
  same: { label: 'Same Every Day', icon: 'repeat', desc: 'One full-body workout with push, pull and leg moves, repeated on every training day. You pick the exercises.' },
};

const steps = () => (wz.style === 'same'
  ? [['Goal', stepGoal], ['Length', stepLength], ['Equipment', stepEquipment], ['Time', stepTime], ['Workout', stepWorkout], ['Review', stepReview]]
  : [['Goal', stepGoal], ['Length', stepLength], ['Equipment', stepEquipment], ['Time', stepTime], ['Review', stepReview]]);
const stepNo = () => `Step ${wz.step + 1} of ${steps().length}`;
const lastStep = () => steps().length - 1;
const DAY_NAMES = Array.from({ length: 7 }, (_, d) => new Intl.DateTimeFormat(LOCALE, { weekday: 'long' }).format(new Date(2026, 10, 1 + d, 12)));

let wz = null;
let el = null;

function defaults() {
  return {
    step: 0, fromPlan: false, style: 'varied', routine: null, routineSig: '', goal: 'balanced', level: 2, load: 'moderate', weeks: 8, startMode: 'next', customStart: todayKey(),
    equipment: ['bodyweight', 'kettlebell', 'dumbbells'], usual: 30,
    schedule: [0, 30, 30, 0, 30, 0, 45], seed: Math.floor(Math.random() * 1e9), preview: null,
  };
}

export function openWizard({ fromPlan = false } = {}) {
  const s = getState();
  wz = defaults();
  if (s.plan && fromPlan) {
    const p = s.plan;
    Object.assign(wz, {
      fromPlan: true, goal: p.goal, level: p.level, load: p.load || 'moderate', weeks: p.weeks, equipment: [...p.equipment],
      schedule: [...p.schedule], startMode: 'keep', customStart: p.startDate,
    });
    if (p.style === 'same') {
      Object.assign(wz, { style: 'same', usual: Math.max(...p.schedule) || 30, routine: p.routine ? JSON.parse(JSON.stringify(p.routine)) : null });
      if (wz.routine) wz.routineSig = routineSig();   // keep the current routine unless time or equipment change
    }
  }
  el = document.createElement('div');
  el.className = 'cover wizard';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Plan setup');
  document.getElementById('overlays').appendChild(el);
  document.documentElement.style.overflow = 'hidden';
  document.body.classList.add('cover-open');
  render();
}

function close() {
  if (!el) return;
  const node = el;
  el = null; wz = null;
  node.classList.add('out');
  document.documentElement.style.overflow = '';
  document.body.classList.remove('cover-open');
  setTimeout(() => node.remove(), 360);
}

function startDate() {
  const t = todayKey();
  if (wz.startMode === 'keep') return wz.customStart;
  if (wz.startMode === 'today') return t;
  if (wz.startMode === 'tomorrow') return addDays(t, 1);
  if (wz.startMode === 'custom') return wz.customStart;
  const ws = getState().settings.weekStart;
  const sow = startOfWeek(t, ws);
  return sow === t ? t : addDays(sow, 7);
}

function trainingDays() { return wz.schedule.filter((m) => m > 0).length; }
function weeklyMinutes() { return wz.schedule.reduce((a, b) => a + b, 0); }

/** The routine is rebuilt when anything it depends on changes (edits are kept otherwise). */
function routineSig() {
  return JSON.stringify([wz.goal, wz.level, wz.load, [...wz.equipment].sort(), wz.usual, getState().settings.hidden || []]);
}

function ensureRoutine({ fresh = false } = {}) {
  if (!fresh && wz.routine && wz.routineSig === routineSig()) return;
  if (fresh) wz.seed = Math.floor(Math.random() * 1e9);
  wz.routine = dailyRoutine({ goal: wz.goal, level: wz.level, load: wz.load, equipment: wz.equipment, minutes: wz.usual, seed: wz.seed }, allowedExercises(getState().settings));
  wz.routineSig = routineSig();
}

/** What the exercise editor edits while it is open from the Workout step. */
function draft() {
  return {
    day: wz.routine, equipment: wz.equipment, goal: wz.goal, level: wz.level, load: wz.load,
    onChange: () => { wz.preview = null; render(); },
  };
}

function buildPreview() {
  const s = getState();
  if (wz.style === 'same') ensureRoutine();
  const plan = generatePlan({
    goal: wz.goal, level: wz.level, load: wz.load, weeks: wz.weeks, startDate: startDate(), equipment: wz.equipment, schedule: wz.schedule, seed: wz.seed,
    style: wz.style, routine: wz.style === 'same' ? JSON.parse(JSON.stringify(wz.routine)) : undefined,
  }, allowedExercises(s.settings));
  if (wz.fromPlan && s.plan) {
    // Keep the days that already happened exactly as they were.
    const t = todayKey();
    for (const [k, d] of Object.entries(s.plan.days)) if (k < t && plan.days[k]) plan.days[k] = d;
    plan.id = s.plan.id;
  }
  wz.preview = plan;
}

/* ---------- Render ---------- */

function render() {
  if (!el) return;
  const top = el.scrollTop;
  const sameStep = el.dataset.step === String(wz.step);
  el.dataset.step = wz.step;
  const canNext = wz.step !== 3 || trainingDays() > 0;
  el.innerHTML = `
    <header class="wiz-top">
      ${wz.step === 0
        ? `<button class="icon-btn glass glass-interactive" data-action="wiz-close" aria-label="Cancel">${icon('x')}</button>`
        : `<button class="icon-btn glass glass-interactive" data-action="wiz-back" aria-label="Back">${icon('chevron-left')}</button>`}
      <div class="wiz-dots" aria-label="${stepNo()}">${steps().map((n, i) => `<i class="${i < wz.step ? 'done' : i === wz.step ? 'on' : ''}"></i>`).join('')}</div>
      <span style="width:44px"></span>
    </header>
    <div class="wiz-body ${sameStep ? '' : 'step-in'}">${steps()[wz.step][1]()}</div>
    <footer class="wiz-footer">
      ${wz.step < lastStep()
        ? `<button class="btn lg glass glass-prominent glass-interactive wiz-cta" data-action="wiz-next" ${canNext ? '' : 'disabled'}>Continue ${icon('arrow-right', 'sm')}</button>`
        : `<button class="btn lg glass glass-prominent glass-interactive wiz-cta" data-action="wiz-create">${wz.fromPlan ? 'Update Plan' : 'Create Plan'}</button>`}
    </footer>`;
  if (sameStep) el.scrollTop = top;
}

function stepGoal() {
  return `
    <div class="wiz-head"><div class="eyebrow accent">${stepNo()}</div><h1 class="t-title1 heavy">How do you want to train?</h1>
      <p class="t-callout sec">Pick a plan style, then what you are training for.</p></div>
    <div class="option-stack" role="radiogroup" aria-label="Plan style">
      ${Object.entries(STYLES).map(([k, st]) => `
        <button class="option-card ${wz.style === k ? 'is-on' : ''}" role="radio" aria-checked="${wz.style === k}" data-action="wiz-style" data-style="${k}">
          <div class="option-icon">${icon(st.icon)}</div>
          <div class="grow"><div class="t-headline">${esc(st.label)}</div><div class="t-sub sec">${esc(st.desc)}</div></div>
          <span class="option-check">${icon('check', 'bold')}</span>
        </button>`).join('')}
    </div>
    <div class="section"><div class="section-head"><div class="section-title">Goal</div></div><p class="t-sub sec" style="margin:0">This sets how sets, reps and rest are balanced.</p></div>
    <div class="option-stack" role="radiogroup" aria-label="Goal">
      ${Object.entries(GOALS).map(([k, g]) => `
        <button class="option-card ${wz.goal === k ? 'is-on' : ''}" role="radio" aria-checked="${wz.goal === k}" data-action="wiz-goal" data-goal="${k}">
          <div class="option-icon">${icon(g.icon)}</div>
          <div class="grow"><div class="t-headline">${esc(g.label)}</div><div class="t-sub sec">${esc(g.desc)}</div></div>
          <span class="option-check">${icon('check', 'bold')}</span>
        </button>`).join('')}
    </div>
    <div class="section"><div class="section-head"><div class="section-title">Experience</div></div>
      ${segmented('wiz:level', [{ value: '1', label: 'Beginner' }, { value: '2', label: 'Intermediate' }, { value: '3', label: 'Advanced' }], String(wz.level), 'height:44px')}
      <p class="footnote">${['', 'Simpler movements, fewer sets, more rest.', 'A mix of moves with steady progression.', 'Harder variations, more volume, shorter rests.'][wz.level]}</p>
    </div>`;
}

function stepLength() {
  const start = startDate();
  const end = addDays(start, wz.weeks * 7 - 1);
  return `
    <div class="wiz-head"><div class="eyebrow accent">${stepNo()}</div><h1 class="t-title1 heavy">How long is the plan?</h1>
      <p class="t-callout sec">${wz.style === 'same' ? 'The same workout repeats for the whole plan. You can change it any time.' : 'Plans run in 4-week blocks. Every 4th week is lighter so you recover.'}</p></div>
    <div class="card big-number">
      <button class="icon-btn big-step" data-action="step" data-id="wiz:weeks" data-dir="-1" aria-label="Fewer weeks" ${wz.weeks <= 1 ? 'disabled' : ''}>${icon('minus')}</button>
      <div><div class="huge rounded">${wz.weeks}</div><div class="t-headline sec">week${wz.weeks === 1 ? '' : 's'}</div></div>
      <button class="icon-btn big-step" data-action="step" data-id="wiz:weeks" data-dir="1" aria-label="More weeks" ${wz.weeks >= 24 ? 'disabled' : ''}>${icon('plus')}</button>
    </div>
    <div class="chips" style="justify-content:center">${[4, 6, 8, 12].map((n) => `<button class="chip ${wz.weeks === n ? 'is-on' : ''}" data-action="wiz-weeks" data-weeks="${n}">${n} weeks</button>`).join('')}</div>
    <div class="section"><div class="section-head"><div class="section-title">Start</div></div>
      <div class="list">
        ${(wz.fromPlan ? [['keep', 'Keep current start', fmtMonthDay(wz.customStart)]] : []).concat([
          ['today', 'Today', fmtMonthDay(todayKey())],
          ['tomorrow', 'Tomorrow', fmtMonthDay(addDays(todayKey(), 1))],
          ['next', 'Start of next week', fmtMonthDay((() => { const m = wz.startMode; wz.startMode = 'next'; const v = startDate(); wz.startMode = m; return v; })())],
          ['custom', 'Pick a date', ''],
        ]).map(([k, label, sub]) => `<button class="row" data-action="wiz-start" data-mode="${k}" role="radio" aria-checked="${wz.startMode === k}">
          <div class="grow"><div class="title">${esc(label)}</div>${sub ? `<div class="subtitle">${esc(sub)}</div>` : ''}</div>
          ${wz.startMode === k ? `<span class="accent">${icon('check', 'bold')}</span>` : ''}</button>`).join('')}
        ${wz.startMode === 'custom' ? `<div class="row"><input type="date" id="wiz-date" class="field" value="${wz.customStart}" min="${addDays(todayKey(), -60)}" aria-label="Start date"></div>` : ''}
      </div>
      <p class="footnote">${esc(fmt(start, { weekday: 'short', month: 'short', day: 'numeric' }))} – ${esc(fmt(end, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }))}</p>
    </div>`;
}

function stepEquipment() {
  return `
    <div class="wiz-head"><div class="eyebrow accent">${stepNo()}</div><h1 class="t-title1 heavy">What equipment do you have?</h1>
      <p class="t-callout sec">Small gear only. Bodyweight moves are always included.</p></div>
    <div class="equip-grid">
      ${EQUIPMENT.map((q) => {
        const on = wz.equipment.includes(q.id);
        const locked = q.id === 'bodyweight';
        const n = EXERCISES.filter((e) => e.equipment.includes(q.id)).length;
        return `<button class="equip-option ${on ? 'is-on' : ''}" data-action="wiz-equip" data-equip="${q.id}" aria-pressed="${on}" ${locked ? 'aria-disabled="true"' : ''}>
          <div class="equip-badge" style="background:${EQUIP_COLOR[q.id]}">${icon(EQUIP_ICON[q.id] || 'dumbbell')}</div>
          <div class="t-headline">${esc(q.name)}</div>
          <div class="t-foot sec">${locked ? 'Always included' : `${n} exercises`}</div>
          <span class="option-check">${icon('check', 'bold')}</span>
        </button>`;
      }).join('')}
    </div>
    ${wz.equipment.some((q) => q === 'kettlebell' || q === 'dumbbells') ? `
    <div class="section"><div class="section-head"><div class="section-title">How heavy are your weights?</div></div>
      <div class="option-stack" role="radiogroup">
        ${Object.entries(LOADS).map(([k, l]) => `<button class="option-card compact ${wz.load === k ? 'is-on' : ''}" role="radio" aria-checked="${wz.load === k}" data-action="wiz-load" data-load="${k}">
          <div class="grow"><div class="t-headline">${esc(l.label)}</div><div class="t-sub sec">${esc(l.desc)}</div></div>
          <span class="option-check">${icon('check', 'bold')}</span></button>`).join('')}
      </div>
      <p class="footnote">This sets your rep ranges. Light weights still build muscle when sets are taken close to failure, so Reps uses higher reps for them.</p>
    </div>` : ''}`;
}

function stepTime() {
  const ws = getState().settings.weekStart;
  const order = Array.from({ length: 7 }, (_, i) => (i + ws) % 7);
  const same = wz.style === 'same';
  const backToBack = wz.schedule.some((m, d) => m > 0 && wz.schedule[(d + 1) % 7] > 0);
  return `
    <div class="wiz-head"><div class="eyebrow accent">${stepNo()}</div><h1 class="t-title1 heavy">How long can you train?</h1>
      <p class="t-callout sec">${same ? 'One length for every workout, since it is the same workout each time. Turn a day off to make it a rest day.' : 'Set a usual length, then adjust each day. Turn a day off to make it a rest day.'}</p></div>
    <div class="section"><div class="section-head"><div class="section-title">${same ? 'Workout length' : 'Usual length'}</div></div>
      <div class="chips">${[10, 15, 20, 30, 45, 60].map((m) => `<button class="chip ${wz.usual === m ? 'is-on' : ''}" data-action="wiz-usual" data-min="${m}">${m} min</button>`).join('')}</div>
    </div>
    <div class="section"><div class="section-head"><div class="section-title">Each day</div><span class="t-foot sec">${trainingDays()} workouts · ${fmtMinutes(weeklyMinutes() * 60)} a week</span></div>
      <div class="list">
        ${order.map((d) => {
          const m = wz.schedule[d];
          return `<div class="row day-row ${m ? '' : 'is-rest'}">
            ${switchHtml(`wiz:day:${d}`, m > 0, `${DAY_NAMES[d]} workout`)}
            <div class="grow"><div class="title">${esc(DAY_NAMES[d])}</div><div class="subtitle">${m ? `${m} minutes` : 'Rest day'}</div></div>
            ${m && !same ? stepperHtml(`wiz:min:${d}`, { canDec: m > 5, canInc: m < 120, label: `${DAY_NAMES[d]} minutes` }) : ''}
          </div>`;
        }).join('')}
      </div>
      ${trainingDays() === 0 ? '<p class="footnote" style="color:var(--red)">Turn on at least one day.</p>' : trainingDays() === 1 ? '<p class="footnote">The American College of Sports Medicine recommends at least 2 strength sessions a week. One still helps, and you can add a day later.</p>' : ''}
      ${same && backToBack ? '<p class="footnote">Back-to-back days work the same muscles again within a day. The ACSM suggests about 48 hours before training them hard again, so on this plan each set stops with 2–3 reps left in the tank.</p>' : ''}
    </div>`;
}

/** "Same Every Day": the workout that repeats, with every exercise editable. */
function stepWorkout() {
  ensureRoutine();
  const r = wz.routine;
  const est = Math.round(estimateSeconds({ type: 'workout', blocks: r.blocks }, EX) / 60);
  const cov = pplCoverage(r.blocks, EX);
  const chip = (on, label) => `<span class="tag ${on ? 'ok' : 'miss'}">${icon(on ? 'circle-check' : 'triangle-alert')}${label}</span>`;
  return `
    <div class="wiz-head"><div class="eyebrow accent">${stepNo()}</div><h1 class="t-title1 heavy">Your daily workout</h1>
      <p class="t-callout sec">This exact workout repeats on every training day. Tap an exercise to change sets, reps or rest, or to swap it.</p></div>
    <div class="card routine-summary">
      <div class="chips">${chip(cov.legs, 'Legs')}${chip(cov.push, 'Push')}${chip(cov.pull, 'Pull')}</div>
      <div class="t-sub ${est > wz.usual * 1.15 ? '' : 'sec'}" style="${est > wz.usual * 1.15 ? 'color:var(--red)' : ''}">About ${est} min of your ${wz.usual}</div>
    </div>
    ${r.blocks.map((b) => `
      <section class="section">
        <div class="section-head"><div class="section-title">${esc(b.name)}</div><span class="t-foot sec">${esc(blockFormat(b))}</span></div>
        <div class="list">
          ${b.format === 'circuit' && b.kind !== 'warmup' && b.kind !== 'cooldown' ? `<div class="row"><div class="grow title">${b.pair ? 'Sets' : 'Rounds'}</div>
            <div class="value-stepper"><span class="val rounded">${b.rounds}</span>${stepperHtml(`wiz:rounds:${b.id}`, { canDec: b.rounds > 1, canInc: b.rounds < 10, label: b.pair ? 'sets' : 'rounds' })}</div></div>` : ''}
          ${b.items.map((it) => {
            const ex = EX[it.exId];
            const eq = mainEquip(ex);
            return `<button class="row has-icon" data-action="wiz-ed-item" data-block="${b.id}" data-item="${it.id}">
              <div class="row-icon" style="background:${EQUIP_COLOR[eq]}">${icon(EQUIP_ICON[eq] || 'dumbbell')}</div>
              <div class="grow"><div class="title truncate">${esc(ex?.name || it.exId)}</div><div class="subtitle truncate">${esc(itemRx(it, b))}</div></div>
              ${icon('chevron-right', 'chev')}
            </button>`;
          }).join('')}
          <button class="row has-icon add-row" data-action="wiz-ed-add" data-block="${b.id}">
            <div class="row-icon" style="background:var(--fill-3);color:var(--accent)">${icon('plus')}</div>
            <div class="grow title accent">Add Exercise</div>
          </button>
        </div>
      </section>`).join('')}
    <button class="btn btn-gray block" data-action="wiz-routine-new">${icon('shuffle', 'sm')} Suggest Different Exercises</button>
    <p class="footnote">Suggested from your time, equipment and experience: a leg, push and pull move first, then more as time allows. Changing those steps suggests a new workout.</p>`;
}

function stepReview() {
  if (!wz.preview) buildPreview();
  const p = wz.preview;
  const ws = getState().settings.weekStart;
  const letters = weekdayLetters(ws, 'narrow');
  const order = Array.from({ length: 7 }, (_, i) => (i + ws) % 7);
  const week1 = Array.from({ length: 7 }, (_, i) => addDays(p.startDate, i));
  const s = getState();
  return `
    <div class="wiz-head"><div class="eyebrow accent">${stepNo()}</div><h1 class="t-title1 heavy">${esc(p.name)}</h1>
      <p class="t-callout sec">${esc(fmtMonthDay(p.startDate))} – ${esc(fmtMonthDay(addDays(p.startDate, p.weeks * 7 - 1)))}${p.style === 'same' ? ' · Same every day' : ''} · ${esc(GOALS[p.goal].label)} · ${esc(LEVELS[p.level])}${p.equipment.some((q) => q === 'kettlebell' || q === 'dumbbells') ? ` · ${esc(LOADS[p.load || 'moderate'].label)} weights` : ''}</p></div>
    <div class="card plan-card">
      <div class="chips">${p.equipment.map((q) => `<span class="tag">${icon(EQUIP_ICON[q] || 'dumbbell')}${esc(EQ[q]?.name || q)}</span>`).join('')}</div>
      <div class="sched">${order.map((d, i) => `<div class="sched-day ${p.schedule[d] ? 'on' : ''}"><span>${esc(letters[i])}</span><b class="rounded">${p.schedule[d] || '–'}</b></div>`).join('')}</div>
    </div>
    <div class="section"><div class="section-head"><div class="section-title">Week 1</div>
      ${p.style === 'same' ? '' : `<button class="section-link" data-action="wiz-shuffle">${icon('shuffle', 'xs')} Shuffle</button>`}</div>
      <div class="list">
        ${week1.map((k) => {
          const d = p.days[k];
          const rest = d.type === 'rest';
          return `<div class="row plan-row">
            <div class="date-badge"><span>${esc(fmt(k, { weekday: 'short' }))}</span><b class="rounded">${fmt(k, { day: 'numeric' })}</b></div>
            <div class="grow"><div class="title truncate ${rest ? 'sec' : ''}">${esc(rest ? 'Rest Day' : d.title)}</div>
              <div class="subtitle truncate">${rest ? 'Recover' : `${Math.round(d.estSec / 60)} min · ${countExercises(d)} exercises`}</div></div>
          </div>`;
        }).join('')}
      </div>
      <p class="footnote">You can change any exercise, set or rest after the plan is created.${s.plan && !wz.fromPlan ? ' This replaces your current plan. Your history is kept.' : ''}${wz.fromPlan ? ' Days before today stay as they were.' : ''}</p>
    </div>`;
}

/* ---------- Events ---------- */

export const actions = {
  'open-wizard': () => openWizard(),
  'wiz-close': () => close(),
  'wiz-back': () => { wz.step = Math.max(0, wz.step - 1); render(); el.scrollTop = 0; },
  'wiz-next': () => { wz.step = Math.min(lastStep(), wz.step + 1); if (wz.step === lastStep()) wz.preview = null; render(); el.scrollTop = 0; },
  'wiz-style': (b) => {
    wz.style = b.dataset.style;
    // One length for every day of a Same Every Day plan
    if (wz.style === 'same') wz.schedule = wz.schedule.map((m) => (m > 0 ? wz.usual : 0));
    render();
  },
  'wiz-ed-item': (b) => editDraftItem(draft(), b.dataset.block, b.dataset.item),
  'wiz-ed-add': (b) => addToDraft(draft(), b.dataset.block),
  'wiz-routine-new': () => { ensureRoutine({ fresh: true }); wz.preview = null; render(); },
  'wiz-goal': (b) => { wz.goal = b.dataset.goal; render(); },
  'wiz-load': (b) => { wz.load = b.dataset.load; render(); },
  'wiz-weeks': (b) => { wz.weeks = +b.dataset.weeks; render(); },
  'wiz-start': (b) => { wz.startMode = b.dataset.mode; render(); },
  'wiz-equip': (b) => {
    const id = b.dataset.equip;
    if (id === 'bodyweight') return;
    wz.equipment = wz.equipment.includes(id) ? wz.equipment.filter((q) => q !== id) : [...wz.equipment, id];
    render();
  },
  'wiz-usual': (b) => {
    wz.usual = +b.dataset.min;
    wz.schedule = wz.schedule.map((m) => (m > 0 ? wz.usual : 0));
    render();
  },
  'wiz-shuffle': () => { wz.seed = Math.floor(Math.random() * 1e9); wz.preview = null; render(); },
  'wiz-create': () => {
    if (!wz.preview) buildPreview();
    const plan = wz.preview;
    const editing = wz.fromPlan;
    update((s) => { s.plan = plan; });
    close();
    document.dispatchEvent(new CustomEvent('reps:plan-created'));
    toast(editing ? 'Plan updated' : 'Plan created', { iconName: 'circle-check' });
  },
};

export function onStep(id, dir) {
  if (!id.startsWith('wiz:') || !wz) return false;
  const [, field, d] = id.split(':');
  if (field === 'weeks') wz.weeks = Math.max(1, Math.min(24, wz.weeks + dir));
  if (field === 'min') wz.schedule[+d] = Math.max(5, Math.min(120, wz.schedule[+d] + dir * 5));
  if (field === 'rounds') {
    const b = wz.routine?.blocks.find((x) => x.id === d);
    if (b) b.rounds = Math.max(1, Math.min(10, b.rounds + dir));
    wz.preview = null;
  }
  render();
  return true;
}

export function onSeg(id, value) {
  if (id !== 'wiz:level' || !wz) return false;
  wz.level = +value;
  render();
  return true;
}

export function onToggle(id) {
  if (!id.startsWith('wiz:day:') || !wz) return false;
  const d = +id.split(':')[2];
  wz.schedule[d] = wz.schedule[d] > 0 ? 0 : (wz.usual || 30);
  render();
  return true;
}

export function onInput(e) {
  if (e.target.id !== 'wiz-date' || !wz) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { wz.customStart = e.target.value; }
  return true;
}

export function onChange(e) {
  if (e.target.id !== 'wiz-date' || !wz) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { wz.customStart = e.target.value; render(); }
  return true;
}

export const wizardOpen = () => !!el;
