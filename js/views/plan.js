// Plan tab: plan summary, weekly schedule, and the workouts for each week.

import { icon } from '../icons.js';
import { esc, showMenu, alertDialog, toast } from '../ui.js';
import { EQ, EQUIP_ICON, EQUIP_COLOR } from '../data.js';
import { todayKey, addDays, fmt, fmtMonthDay, weekdayLetters, diffDays } from '../dates.js';
import { getState, update, planProgress, isDone, getDay, planRange } from '../store.js';
import { GOALS, LEVELS, LOADS, countExercises, weeklySets } from '../generator.js';
import { EX } from '../data.js';
import { openWizard } from '../wizard.js';

const ui = { week: null };

export function renderPlan(s) {
  const head = `<div class="page-head"><h1 class="t-large" style="margin:0">Plan</h1></div>`;
  if (!s.plan) {
    return {
      title: 'Plan',
      body: `${head}<div class="card empty">${icon('clipboard-list')}
        <div class="t-title3">No plan yet</div>
        <p class="t-sub sec" style="margin:0">Answer a few questions about your equipment and time, and Reps builds a plan for each week.</p>
        <button class="btn btn-filled lg" data-action="open-wizard">Create My Plan</button></div>`,
    };
  }
  const p = s.plan;
  const today = todayKey();
  const prog = planProgress(s, today);
  const r = planRange(s);
  const current = Math.min(p.weeks - 1, Math.max(0, Math.floor(diffDays(p.startDate, today) / 7)));
  if (ui.week == null || ui.week >= p.weeks) ui.week = current;
  const letters = weekdayLetters(s.settings.weekStart, 'narrow');
  const order = Array.from({ length: 7 }, (_, i) => (i + s.settings.weekStart) % 7);

  const weekStart = addDays(p.startDate, ui.week * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const deloadWeek = days.some((k) => getDay(k, s)?.deload);

  return {
    title: 'Plan',
    trailing: `<button class="icon-btn glass glass-interactive" data-action="plan-menu" aria-label="Plan options">${icon('ellipsis')}</button>`,
    body: `${head}
      <div class="card plan-card">
        <div class="eyebrow accent">${esc(fmtMonthDay(r.start))} – ${esc(fmtMonthDay(r.end))}</div>
        <div class="t-title2">${esc(p.name)}</div>
        <div class="chips">
          <span class="tag accent">${icon(GOALS[p.goal]?.icon || 'activity')}${esc(GOALS[p.goal]?.label || p.goal)}</span>
          <span class="tag">${icon('gauge')}${esc(LEVELS[p.level])}</span>
          ${p.equipment.some((q) => q === 'kettlebell' || q === 'dumbbells') ? `<span class="tag">${icon('weight')}${esc(LOADS[p.load || 'moderate'].label)} weights</span>` : ''}
          ${p.equipment.map((q) => `<span class="tag">${icon(EQUIP_ICON[q] || 'dumbbell')}${esc(EQ[q]?.name || q)}</span>`).join('')}
        </div>
        <div class="plan-progress">
          <div class="bar"><i style="width:${prog.pct}%"></i></div>
          <div class="t-foot sec">${prog.done} of ${prog.total} workouts done · ${prog.started ? `week ${prog.week} of ${p.weeks}` : `starts ${esc(fmtMonthDay(r.start))}`}</div>
        </div>
        <div class="sched">
          ${order.map((d, i) => {
            const m = p.schedule[d];
            return `<div class="sched-day ${m ? 'on' : ''}"><span>${esc(letters[i])}</span><b class="rounded">${m || '–'}</b></div>`;
          }).join('')}
        </div>
        <div class="t-foot sec" style="text-align:center;margin-top:-4px">Minutes per day</div>
      </div>

      <div class="chips scroll week-chips" role="tablist" aria-label="Weeks">
        ${Array.from({ length: p.weeks }, (_, w) => {
          const wDays = Array.from({ length: 7 }, (_, i) => addDays(p.startDate, w * 7 + i));
          const workouts = wDays.filter((k) => getDay(k, s)?.type === 'workout');
          const allDone = workouts.length && workouts.every((k) => isDone(k, s));
          const deload = wDays.some((k) => getDay(k, s)?.deload);
          return `<button class="chip ${w === ui.week ? 'is-on' : ''}" role="tab" aria-selected="${w === ui.week}" data-action="plan-week" data-week="${w}">
            ${allDone ? icon('circle-check') : deload ? icon('leaf') : ''}Week ${w + 1}${w === current && prog.started ? ' ·  Now' : ''}</button>`;
        }).join('')}
      </div>

      <section class="section">
        <div class="section-head"><div class="section-title">Week ${ui.week + 1}</div><span class="t-foot sec">${deloadWeek ? 'Deload · lighter volume' : `Block ${Math.floor(ui.week / 4) + 1}`}</span></div>
        <div class="list">
          ${days.map((k) => {
            const d = getDay(k, s);
            if (!d) return '';
            const done = isDone(k, s);
            const rest = d.type === 'rest';
            return `<button class="row plan-row" data-action="open-day" data-key="${k}">
              <div class="date-badge ${k === today ? 'today' : ''}"><span>${esc(fmt(k, { weekday: 'short' }))}</span><b class="rounded">${fmt(k, { day: 'numeric' })}</b></div>
              <div class="grow"><div class="title truncate ${rest ? 'sec' : ''}">${esc(rest ? 'Rest Day' : d.title)}</div>
                <div class="subtitle truncate">${rest ? esc(d.note || 'Recover') : `${Math.round((d.estSec || 0) / 60)} min · ${countExercises(d)} exercises`}</div></div>
              ${done ? `<span style="color:var(--green)">${icon('circle-check')}</span>` : rest ? `<span class="ter">${icon('moon')}</span>` : ''}
              ${icon('chevron-right', 'chev')}
            </button>`;
          }).join('')}
        </div>
        <p class="footnote">Tap a day to see the exercises, watch demos, mark it done, or change it.</p>
      </section>
      ${volumeCard(p, weekStart)}`,
  };
}

export const actions = {
  'plan-week': (el) => {
    ui.week = +el.dataset.week;
    document.dispatchEvent(new CustomEvent('reps:render'));
  },
  'plan-menu': async (el) => {
    const v = await showMenu(el, [
      { label: 'Edit Schedule & Equipment', icon: 'square-pen', value: 'edit' },
      { label: 'Create New Plan', value: 'new' },
      { sep: true },
      { label: 'Delete Plan', icon: 'trash-2', value: 'delete', danger: true },
    ]);
    if (v === 'edit') openWizard({ fromPlan: true });
    if (v === 'new') openWizard();
    if (v === 'delete') {
      const ok = await alertDialog({ title: 'Delete this plan?', message: 'Your completed-workout history stays. Planned workouts are removed.', actions: [{ label: 'Cancel', value: false, style: 'gray' }, { label: 'Delete', value: true, style: 'danger' }] });
      if (ok) { update((s) => { s.plan = null; }); ui.week = null; toast('Plan deleted', { iconName: 'trash-2' }); }
    }
  },
};

export function resetPlanUi() { ui.week = null; }

/** Weekly hard sets per body region against the ACSM 2026 targets (evidence §1). */
function volumeCard(p, weekStart) {
  const ws = weeklySets(p, weekStart, EX);
  const target = p.level === 1 ? 4 : 10;
  const rows = [['upperPush', 'Upper push'], ['upperPull', 'Upper pull'], ['lowerPush', 'Squat & lunge'], ['lowerPull', 'Hinge']];
  const any = Object.values(ws).some((v) => v > 0);
  if (!any) return '';
  return `<section class="section">
    <div class="section-head"><div class="section-title">Weekly Sets</div><button class="section-link" data-action="open-science">Why</button></div>
    <div class="card volume-card">
      ${rows.map(([k, label]) => {
        const v = Math.round(ws[k]);
        const pct = Math.min(1, v / Math.max(target, 1));
        return `<div class="vol-row"><span class="vol-label">${label}</span><div class="bar"><i style="width:${Math.round(pct * 100)}%;background:${v >= target ? 'var(--green)' : 'var(--orange)'}"></i></div><span class="vol-num rounded num">${v}</span></div>`;
      }).join('')}
      <p class="t-foot sec" style="margin:4px 0 0">Target: at least ${target} hard sets per region a week${p.level === 1 ? ' for beginners' : ', up to about 20'}. ${Object.values(ws).some((v) => v < target) ? 'Short or few sessions limit this; more minutes or another day raises it.' : 'This week meets it.'}</p>
    </div>
  </section>`;
}
