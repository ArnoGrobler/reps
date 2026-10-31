// Calendar tab: months scroll vertically. Planned workouts are tinted, completed
// days (workouts and rest days) get a check, missed workouts a hollow ring.

import { icon } from '../icons.js';
import { esc } from '../ui.js';
import { todayKey, monthKey, addMonths, daysInMonth, dow, fmt, weekdayLetters, fmtLong } from '../dates.js';
import { planRange, dayStatus, getDay } from '../store.js';

let scrolledOnce = false;

export function renderCalendar(s) {
  const today = todayKey();
  const r = planRange(s);
  const logKeys = Object.keys(s.log).sort();
  let first = monthKey(today);
  let last = addMonths(monthKey(today), 3);
  if (r) {
    if (monthKey(r.start) < first) first = monthKey(r.start);
    if (monthKey(r.end) > last) last = monthKey(r.end);
  }
  if (logKeys[0] && monthKey(logKeys[0]) < first) first = monthKey(logKeys[0]);
  first = addMonths(first, -1);
  last = addMonths(last, 1);

  const months = [];
  for (let m = first; m <= last; m = addMonths(m, 1)) months.push(m);
  const letters = weekdayLetters(s.settings.weekStart);

  return {
    title: 'Calendar',
    trailing: `<button class="toolbar-pill glass glass-interactive" data-action="cal-today">Today</button>`,
    body: `
      <div class="page-head">
        <h1 class="t-large" style="margin:0">Calendar</h1>
        <div class="cal-legend">
          <span><i class="lg-done">${icon('check', 'bold')}</i>Done</span>
          <span><i class="lg-plan"></i>Workout</span>
          <span><i class="lg-rest">${icon('moon')}</i>Rest</span>
          <span><i class="lg-miss"></i>Missed</span>
        </div>
      </div>
      <div class="cal-weekdays" aria-hidden="true">${letters.map((l) => `<span>${esc(l)}</span>`).join('')}</div>
      ${months.map((m) => monthHtml(s, m, today)).join('')}
      ${s.plan ? '' : `<div class="card empty">${icon('calendar-days')}<div class="t-headline">No plan yet</div><p class="t-sub sec" style="margin:0">Create a plan and your workouts will appear here.</p><button class="btn btn-filled" data-action="open-wizard">Create My Plan</button></div>`}
    `,
    mount() {
      if (!scrolledOnce) { scrolledOnce = true; scrollToMonth(monthKey(today), false); }
    },
  };
}

function monthHtml(s, m, today) {
  const firstKey = `${m}-01`;
  const offset = (dow(firstKey) - s.settings.weekStart + 7) % 7;
  const n = daysInMonth(m);
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<span class="cal-cell blank"></span>');
  for (let d = 1; d <= n; d++) {
    const key = `${m}-${String(d).padStart(2, '0')}`;
    const st = dayStatus(key, s, today);
    const day = getDay(key, s);
    let mark = '';
    if (st === 'done' || st === 'rest-done') mark = `<span class="cal-mark done">${icon('check', 'bold')}</span>`;
    else if (st === 'planned') mark = '<span class="cal-mark plan"></span>';
    else if (st === 'rest') mark = `<span class="cal-mark rest">${icon('moon')}</span>`;
    else if (st === 'rest-missed') mark = `<span class="cal-mark rest dim">${icon('moon')}</span>`;
    else if (st === 'missed') mark = '<span class="cal-mark miss"></span>';
    const label = `${fmtLong(key)}${day ? ` — ${day.type === 'rest' ? 'Rest day' : day.title}` : ''}${st.includes('done') ? ', completed' : ''}`;
    cells.push(`<button class="cal-cell st-${st} ${day?.type === 'workout' ? 'is-workout' : ''} ${key === today ? 'is-today' : ''} ${key < today ? 'is-past' : ''}"
      data-action="open-day" data-key="${key}" aria-label="${esc(label)}">
      <span class="cal-num">${d}</span>${mark}
    </button>`);
  }
  const [y] = m.split('-');
  return `<section class="cal-month" id="m-${m}">
    <h2 class="cal-month-title">${esc(fmt(firstKey, { month: 'long' }))} <span>${y}</span></h2>
    <div class="cal-grid">${cells.join('')}</div>
  </section>`;
}

export function scrollToMonth(m, smooth = true) {
  requestAnimationFrame(() => {
    const el = document.getElementById(`m-${m}`);
    if (!el) return;
    const head = document.querySelector('.cal-weekdays');
    const offset = head ? (parseFloat(getComputedStyle(head).top) || 0) + head.offsetHeight + 6 : 60;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  });
}

export const actions = {
  'cal-today': () => scrollToMonth(monthKey(todayKey())),
};
