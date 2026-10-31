// Plan setup wizard (full-screen cover): goal & level → length & start →
// equipment → time per weekday → review & create.

import { icon } from './icons.js';
import { esc, segmented, switchHtml, stepperHtml, toast } from './ui.js';
import { EXERCISES, EQUIPMENT, EQUIP_ICON, EQUIP_COLOR, EQ, allowedExercises } from './data.js';
import { todayKey, addDays, dow, fmtMonthDay, fmt, weekdayLetters, startOfWeek, fmtMinutes, LOCALE } from './dates.js';
import { getState, update } from './store.js';
import { generatePlan, GOALS, LEVELS, countExercises } from './generator.js';

const STEPS = ['Goal', 'Length', 'Equipment', 'Time', 'Review'];
const DAY_NAMES = Array.from({ length: 7 }, (_, d) => new Intl.DateTimeFormat(LOCALE, { weekday: 'long' }).format(new Date(2026, 10, 1 + d, 12)));

let wz = null;
let el = null;

function defaults() {
  return {
    step: 0, fromPlan: false, goal: 'balanced', level: 2, weeks: 8, startMode: 'next', customStart: todayKey(),
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
      fromPlan: true, goal: p.goal, level: p.level, weeks: p.weeks, equipment: [...p.equipment],
      schedule: [...p.schedule], startMode: 'keep', customStart: p.startDate,
    });
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

function buildPreview() {
  const s = getState();
  const plan = generatePlan({ goal: wz.goal, level: wz.level, weeks: wz.weeks, startDate: startDate(), equipment: wz.equipment, schedule: wz.schedule, seed: wz.seed }, allowedExercises(s.settings));
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
      <div class="wiz-dots" aria-label="Step ${wz.step + 1} of ${STEPS.length}">${STEPS.map((n, i) => `<i class="${i < wz.step ? 'done' : i === wz.step ? 'on' : ''}"></i>`).join('')}</div>
      <span style="width:44px"></span>
    </header>
    <div class="wiz-body ${sameStep ? '' : 'step-in'}">${[stepGoal, stepLength, stepEquipment, stepTime, stepReview][wz.step]()}</div>
    <footer class="wiz-footer">
      ${wz.step < 4
        ? `<button class="btn lg glass glass-prominent glass-interactive wiz-cta" data-action="wiz-next" ${canNext ? '' : 'disabled'}>Continue ${icon('arrow-right', 'sm')}</button>`
        : `<button class="btn lg glass glass-prominent glass-interactive wiz-cta" data-action="wiz-create">${wz.fromPlan ? 'Update Plan' : 'Create Plan'}</button>`}
    </footer>`;
  if (sameStep) el.scrollTop = top;
}

function stepGoal() {
  return `
    <div class="wiz-head"><div class="eyebrow accent">Step 1 of 5</div><h1 class="t-title1 heavy">What are you training for?</h1>
      <p class="t-callout sec">This sets how sets, reps and rest are balanced.</p></div>
    <div class="option-stack" role="radiogroup">
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
    <div class="wiz-head"><div class="eyebrow accent">Step 2 of 5</div><h1 class="t-title1 heavy">How long is the plan?</h1>
      <p class="t-callout sec">Plans run in 4-week blocks. Every 4th week is lighter so you recover.</p></div>
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
    <div class="wiz-head"><div class="eyebrow accent">Step 3 of 5</div><h1 class="t-title1 heavy">What equipment do you have?</h1>
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
    </div>`;
}

function stepTime() {
  const ws = getState().settings.weekStart;
  const order = Array.from({ length: 7 }, (_, i) => (i + ws) % 7);
  return `
    <div class="wiz-head"><div class="eyebrow accent">Step 4 of 5</div><h1 class="t-title1 heavy">How long can you train?</h1>
      <p class="t-callout sec">Set a usual length, then adjust each day. Turn a day off to make it a rest day.</p></div>
    <div class="section"><div class="section-head"><div class="section-title">Usual length</div></div>
      <div class="chips">${[10, 15, 20, 30, 45, 60].map((m) => `<button class="chip ${wz.usual === m ? 'is-on' : ''}" data-action="wiz-usual" data-min="${m}">${m} min</button>`).join('')}</div>
    </div>
    <div class="section"><div class="section-head"><div class="section-title">Each day</div><span class="t-foot sec">${trainingDays()} workouts · ${fmtMinutes(weeklyMinutes() * 60)} a week</span></div>
      <div class="list">
        ${order.map((d) => {
          const m = wz.schedule[d];
          return `<div class="row day-row ${m ? '' : 'is-rest'}">
            ${switchHtml(`wiz:day:${d}`, m > 0, `${DAY_NAMES[d]} workout`)}
            <div class="grow"><div class="title">${esc(DAY_NAMES[d])}</div><div class="subtitle">${m ? `${m} minutes` : 'Rest day'}</div></div>
            ${m ? stepperHtml(`wiz:min:${d}`, { canDec: m > 5, canInc: m < 120, label: `${DAY_NAMES[d]} minutes` }) : ''}
          </div>`;
        }).join('')}
      </div>
      ${trainingDays() === 0 ? '<p class="footnote" style="color:var(--red)">Turn on at least one day.</p>' : ''}
    </div>`;
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
    <div class="wiz-head"><div class="eyebrow accent">Step 5 of 5</div><h1 class="t-title1 heavy">${esc(p.name)}</h1>
      <p class="t-callout sec">${esc(fmtMonthDay(p.startDate))} – ${esc(fmtMonthDay(addDays(p.startDate, p.weeks * 7 - 1)))} · ${esc(GOALS[p.goal].label)} · ${esc(LEVELS[p.level])}</p></div>
    <div class="card plan-card">
      <div class="chips">${p.equipment.map((q) => `<span class="tag">${icon(EQUIP_ICON[q] || 'dumbbell')}${esc(EQ[q]?.name || q)}</span>`).join('')}</div>
      <div class="sched">${order.map((d, i) => `<div class="sched-day ${p.schedule[d] ? 'on' : ''}"><span>${esc(letters[i])}</span><b class="rounded">${p.schedule[d] || '–'}</b></div>`).join('')}</div>
    </div>
    <div class="section"><div class="section-head"><div class="section-title">Week 1</div>
      <button class="section-link" data-action="wiz-shuffle">${icon('shuffle', 'xs')} Shuffle</button></div>
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
  'wiz-next': () => { wz.step = Math.min(4, wz.step + 1); if (wz.step === 4) wz.preview = null; render(); el.scrollTop = 0; },
  'wiz-goal': (b) => { wz.goal = b.dataset.goal; render(); },
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
