// Today tab: week strip, up-next workout, metric widgets, coming up.

import { icon } from '../icons.js';
import { esc, ringSvg } from '../ui.js';
import { EX, EQ, rxText, mainEquip, EQUIP_ICON } from '../data.js';
import { todayKey, addDays, fmt, fmtLong, relativeLabel, weekdayLetters, diffDays, fmtMinutes } from '../dates.js';
import { getDay, isDone, upNext, weekSummary, streaks, planProgress, weekIndexOf, dayStatus, totals } from '../store.js';
import { countExercises, estimateSeconds, FOCUS } from '../generator.js';
import { activityMeta, activityIcon, activityColor } from './activity.js';

export function renderToday(s) {
  const today = todayKey();
  const head = `
    <div class="page-head">
      <div class="eyebrow">${esc(fmtLong(today))}</div>
      <h1 class="t-large" style="margin:0">Today</h1>
    </div>`;

  if (!s.plan) {
    return {
      title: 'Today',
      body: `${head}
      <div class="card hero onboard">
        <div class="onboard-icon">${icon('dumbbell')}</div>
        <div class="hero-title">Build your training plan</div>
        <p class="t-callout sec" style="margin:0">Pick your equipment, how many weeks, and how long you can train each day. Reps writes a week-by-week plan with sets, reps, rest and a demo video for every exercise.</p>
        <button class="btn btn-filled lg block" data-action="open-wizard">Create My Plan</button>
      </div>
      ${widgets(s, today)}`,
    };
  }

  return {
    title: 'Today',
    body: `${head}
      ${weekStrip(s, today)}
      ${upNextCards(s, today)}
      <section class="section">
        <div class="section-head"><div class="section-title">Summary</div></div>
        ${widgets(s, today)}
      </section>
      ${comingUp(s, today)}`,
  };
}

function weekStrip(s, today) {
  const { days } = weekSummary(s, today);
  const letters = weekdayLetters(s.settings.weekStart, 'short');
  return `<div class="card" style="padding:8px 6px">
    <div class="week-strip">
      ${days.map((d, i) => {
        const st = d.status;
        const mark = st === 'done' || st === 'rest-done' ? `<span class="mark done">${icon('circle-check', 'bold')}</span>`
          : st === 'planned' ? '<span class="mark dot"></span>'
          : st === 'rest' || st === 'rest-missed' ? `<span class="mark">${icon('moon')}</span>`
          : st === 'missed' ? '<span class="mark missed"></span>'
          : '<span class="mark"></span>';
        return `<button class="wday ${d.key === today ? 'today' : ''}" data-action="open-day" data-key="${d.key}" aria-label="${esc(fmtLong(d.key))}">
          <span class="d">${esc(letters[i])}</span>
          <span class="n">${fmt(d.key, { day: 'numeric' })}</span>
          ${mark}
        </button>`;
      }).join('')}
    </div>
  </div>`;
}

function workoutMeta(day) {
  const est = day.estSec || estimateSeconds(day, EX);
  const n = countExercises(day);
  return `<div class="hero-meta">
    <span>${icon('clock')} ${Math.round(est / 60)} min</span>
    <span>${icon('list')} ${n} exercise${n === 1 ? '' : 's'}</span>
    <span>${icon('target')} ${esc(FOCUS[day.focus]?.name || 'Workout')}</span>
    ${day.deload ? `<span>${icon('leaf')} Deload week</span>` : ''}
  </div>`;
}

function preview(day, max = 4) {
  const items = day.blocks.filter((b) => b.kind === 'main' || b.kind === 'finisher').flatMap((b) => b.items.map((it) => ({ it, b })));
  const shown = items.slice(0, max);
  return `<div class="ex-preview">
    ${shown.map(({ it, b }) => {
      const ex = EX[it.exId];
      const rx = b.format === 'circuit' ? `${b.rounds} × ${it.mode === 'time' ? `${it.duration} s` : it.reps}` : rxText(it, ex);
      return `<div class="ex"><div class="ex-badge">${icon(EQUIP_ICON[mainEquip(ex)] || 'dumbbell')}</div><div class="name truncate">${esc(ex?.name || it.exId)}</div><div class="rx">${esc(rx)}</div></div>`;
    }).join('')}
    ${items.length > max ? `<div class="ex"><div class="ex-badge" style="background:var(--fill-3);color:var(--label-2)">+${items.length - max}</div><div class="name sec">more exercises</div></div>` : ''}
  </div>`;
}

function weekLabel(s, key) {
  const w = weekIndexOf(key, s) + 1;
  return `Week ${w} of ${s.plan.weeks}`;
}

function upNextCards(s, today) {
  const todayDay = getDay(today, s);
  const doneToday = isDone(today, s);
  const next = upNext(s, today);
  const prog = planProgress(s, today);
  const out = [];

  if (todayDay?.type === 'workout' && !doneToday) {
    out.push(`<div class="card hero">
      <div class="eyebrow accent">Today · ${esc(weekLabel(s, today))}</div>
      <div class="hero-title">${esc(todayDay.title)}</div>
      ${workoutMeta(todayDay)}
      ${preview(todayDay)}
      <button class="btn btn-filled lg block" data-action="start-workout" data-key="${today}">${icon('play', 'sm')} Start Workout</button>
      <div class="hero-actions">
        <button class="btn btn-gray sm" data-action="toggle-done" data-key="${today}">${icon('check', 'xs')} Mark as Done</button>
        <button class="btn btn-gray sm" data-action="open-day" data-key="${today}">${icon('list', 'xs')} Details</button>
      </div>
    </div>`);
    return out.join('');
  }

  if (todayDay?.type === 'activity') {
    out.push(`<button class="card hero ${doneToday ? 'done-card' : ''} pressable" data-action="open-day" data-key="${today}" style="text-align:left">
      <div class="rest-head">
        <div class="act-badge" style="background:${activityColor(todayDay)}">${icon(activityIcon(todayDay))}</div>
        <div style="min-width:0"><div class="eyebrow">${doneToday ? 'Today · Complete' : 'Today'}</div><div class="t-title2 truncate">${esc(todayDay.title)}</div></div>
      </div>
      <div class="hero-meta">${activityMeta(todayDay).map((t, i) => `<span>${icon(['timer', 'route', 'gauge'][i])} ${esc(t)}</span>`).join('')}</div>
    </button>`);
  } else if (todayDay?.type === 'rest') {
    out.push(`<div class="card hero rest-card">
      <div class="rest-head">
        <div class="rest-icon">${icon('moon')}</div>
        <div><div class="eyebrow">Today</div><div class="t-title2">Rest Day</div></div>
      </div>
      <p class="t-callout sec" style="margin:0">${esc(todayDay.note || 'Recover and come back stronger.')}</p>
      ${doneToday
        ? `<div class="done-banner">${icon('circle-check', 'bold')} Rest day complete <button class="btn btn-plain sm" data-action="toggle-done" data-key="${today}">Undo</button></div>`
        : `<button class="btn btn-tinted block" data-action="toggle-done" data-key="${today}">${icon('check', 'sm')} Mark Rest Day Complete</button>`}
    </div>`);
  } else if (todayDay?.type === 'workout' && doneToday) {
    const log = s.log[today];
    out.push(`<div class="card hero done-card">
      <div class="rest-head">
        <div class="rest-icon done">${icon('check', 'bold')}</div>
        <div><div class="eyebrow">Today · Complete</div><div class="t-title2">${esc(todayDay.title)}</div></div>
      </div>
      <div class="hero-meta">
        ${log?.durationSec ? `<span>${icon('timer')} ${fmtMinutes(log.durationSec)}</span>` : ''}
        ${log?.sets ? `<span>${icon('repeat')} ${log.sets} sets</span>` : ''}
        ${log?.reps ? `<span>${icon('activity')} ${log.reps} reps</span>` : ''}
        <span>${icon('circle-check')} ${log?.mode === 'manual' ? 'Marked done' : log?.mode === 'paced' ? 'Own pace' : 'Timed'}</span>
      </div>
      <div class="hero-actions"><button class="btn btn-gray sm" data-action="toggle-done" data-key="${today}">${icon('undo-2', 'xs')} Undo</button></div>
    </div>`);
  } else if (prog && !prog.started) {
    out.push(`<div class="card"><div class="eyebrow accent">Plan starts ${esc(relativeLabel(prog.range.start, today))}</div>
      <div class="t-title3" style="margin-top:4px">${esc(s.plan.name)}</div>
      <p class="t-sub sec" style="margin:6px 0 0">${diffDays(today, prog.range.start)} day${diffDays(today, prog.range.start) === 1 ? '' : 's'} to go. Here is your first workout.</p></div>`);
  }

  if (next && next.key !== today) {
    out.push(`<div class="card hero">
      <div class="eyebrow accent">Up Next · ${esc(relativeLabel(next.key, today))}</div>
      <div class="hero-title">${esc(next.day.title)}</div>
      ${workoutMeta(next.day)}
      ${preview(next.day, 3)}
      <div class="hero-actions">
        <button class="btn btn-tinted" data-action="start-workout" data-key="${next.key}">${icon('play', 'xs')} Start Early</button>
        <button class="btn btn-gray" data-action="open-day" data-key="${next.key}">Details</button>
      </div>
    </div>`);
  } else if (!next && prog?.started) {
    out.push(`<div class="card hero" style="align-items:center;text-align:center">
      <div class="onboard-icon" style="background:color-mix(in srgb, var(--green) 16%, transparent);color:var(--green)">${icon('trophy')}</div>
      <div class="t-title2">Plan complete</div>
      <p class="t-callout sec" style="margin:0">You finished ${prog.done} of ${prog.total} workouts. Ready for the next block?</p>
      <button class="btn btn-filled block" data-action="open-wizard">Create New Plan</button>
    </div>`);
  }
  return out.join('');
}

function widgets(s, today) {
  const wk = weekSummary(s, today);
  const st = streaks(s, today);
  const prog = planProgress(s, today);
  const tot = totals(s);
  const pct = wk.planned ? wk.done / wk.planned : 0;
  const maxMin = Math.max(30, ...wk.days.map((d) => d.minutes));
  const letters = weekdayLetters(s.settings.weekStart);
  return `<div class="widgets">
    <button class="widget" data-action="go-tab" data-tab="calendar" aria-label="This week">
      <div class="widget-head accent">${icon('target')} This Week</div>
      <div class="ring-row">
        ${ringSvg(pct, { size: 74, stroke: 10 })}
        <div><div class="widget-value">${wk.done}<small>/${wk.planned}</small></div><div class="widget-foot" style="margin:0">workouts</div></div>
      </div>
    </button>
    <div class="widget">
      <div class="widget-head" style="color:var(--orange)">${icon('flame')} Streak</div>
      <div class="widget-value" style="margin-top:auto">${st.current}<small>day${st.current === 1 ? '' : 's'}</small></div>
      <div class="widget-foot" style="margin-top:0">Best ${st.best} · rest days count</div>
    </div>
    <div class="widget">
      <div class="widget-head" style="color:var(--green)">${icon('timer')} Minutes</div>
      <div class="widget-value">${wk.minutes}</div>
      <div class="mini-bars">
        ${wk.days.map((d, i) => `<div class="b ${d.minutes ? 'on' : ''} ${d.key === today ? 'today' : ''}"><i style="height:${Math.max(8, Math.round((d.minutes / maxMin) * 100))}%"></i><span>${esc(letters[i])}</span></div>`).join('')}
      </div>
    </div>
    <button class="widget" data-action="go-tab" data-tab="plan" aria-label="Plan progress">
      <div class="widget-head" style="color:var(--indigo)">${icon('flag')} Plan</div>
      ${prog ? `
        <div class="widget-value" style="margin-top:auto">Wk ${prog.started ? prog.week : 1}<small>of ${prog.weeks}</small></div>
        <div class="bar"><i style="width:${prog.pct}%;background:var(--indigo)"></i></div>
        <div class="widget-foot" style="margin-top:0">${prog.started ? `${prog.done}/${prog.total} workouts · ${prog.pct}%` : `Starts ${esc(relativeLabel(prog.range.start, today))}`}</div>`
      : `<div class="widget-value" style="margin-top:auto">${tot.workouts}</div><div class="widget-foot" style="margin-top:0">workouts logged</div>`}
    </button>
  </div>`;
}

function comingUp(s, today) {
  const rows = [];
  for (let i = 1; i <= 4; i++) {
    const k = addDays(today, i);
    const d = getDay(k, s);
    if (!d) continue;
    const rest = d.type === 'rest';
    const act = d.type === 'activity';
    const st = dayStatus(k, s, today);
    rows.push(`<button class="row has-icon" data-action="open-day" data-key="${k}">
      <div class="row-icon" style="background:${act ? activityColor(d) : rest ? 'var(--indigo)' : 'var(--accent)'}">${icon(act ? activityIcon(d) : rest ? 'moon' : 'dumbbell')}</div>
      <div class="grow"><div class="title truncate">${esc(rest ? 'Rest Day' : d.title)}</div><div class="subtitle">${esc(relativeLabel(k, today))}${rest ? '' : ` · ${act ? esc(activityMeta(d).join(' · ')) : `${Math.round((d.estSec || 0) / 60)} min`}`}</div></div>
      ${st === 'done' || st === 'rest-done' ? `<span style="color:var(--green)">${icon('circle-check')}</span>` : ''}
      ${icon('chevron-right', 'chev')}
    </button>`);
  }
  if (!rows.length) return '';
  return `<section class="section">
    <div class="section-head"><div class="section-title">Coming Up</div><button class="section-link" data-action="go-tab" data-tab="calendar">Calendar</button></div>
    <div class="list">${rows.join('')}</div>
  </section>`;
}
