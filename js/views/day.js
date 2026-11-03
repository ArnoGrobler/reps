// Day sheet: what is planned for a date, with start / complete / edit actions.

import { icon } from '../icons.js';
import { esc, openSheet, pushSheet, closeSheet, showMenu, alertDialog, toast } from '../ui.js';
import { EX, allowedExercises, EQUIP_ICON, EQUIP_COLOR, mainEquip, rxText, sideText } from '../data.js';
import { todayKey, fmtWeekday, fmtMonthDay, relativeLabel, fmtMinutes, dow } from '../dates.js';
import { getState, update, getDay, isDone, dayStatus, weekIndexOf } from '../store.js';
import { countExercises, estimateSeconds, regenerateDay, FOCUS } from '../generator.js';
import { dayEditorView } from './editor.js';
import { templatePickerView, evidenceTag } from './proven.js';
import { TEMPLATE } from '../data/templates.js';
import { activityDayHtml, openActivityPicker, removeActivity } from './activity.js';

export function blockFormat(b) {
  if (b.pair) return `${b.rounds} set${b.rounds === 1 ? '' : 's'} · alternating`;
  if (b.format === 'circuit') {
    if (b.rounds <= 1) return b.kind === 'warmup' || b.kind === 'cooldown' ? 'Flow' : '1 round';
    return `${b.rounds} rounds${b.roundRest ? ` · ${b.roundRest} s between` : ''}`;
  }
  return 'Straight sets';
}

export function itemRx(it, b) {
  const ex = EX[it.exId];
  if (it.ramp) return `${it.reps} reps · light ramp-up set`;
  const range = it.range && it.mode === 'reps' ? ` (range ${it.range[0]}–${it.range[1]})` : '';
  if (b.pair) return `${it.mode === 'time' ? `${it.duration} s` : `${it.reps} reps`}${sideText(it, ex)}${range} · ${it.rest} s between`;
  if (b.format === 'circuit') {
    const amt = it.mode === 'time' ? `${it.duration} s` : `${it.reps} reps`;
    return `${amt}${sideText(it, ex)}${it.rest ? ` · ${it.rest} s ${b.restLabel ? b.restLabel.toLowerCase() : it.rest <= 20 ? 'to switch' : 'rest'}` : ''}`;
  }
  return `${rxText(it, ex)}${range} · ${it.rest} s rest`;
}

export function blockList(b, { action = 'open-exercise', key = '' } = {}) {
  return `<section class="section">
    <div class="section-head"><div class="section-title">${esc(b.name)}</div><span class="t-foot sec">${esc(blockFormat(b))}</span></div>
    <div class="list">
      ${b.items.map((it) => {
        const ex = EX[it.exId];
        const eq = mainEquip(ex);
        return `<button class="row has-icon" data-action="${action}" data-ex="${it.exId}" data-key="${key}" data-block="${b.id}" data-item="${it.id}">
          <div class="row-icon" style="background:${EQUIP_COLOR[eq]}">${icon(EQUIP_ICON[eq] || 'dumbbell')}</div>
          <div class="grow"><div class="title truncate">${esc(ex?.name || it.exId)}</div><div class="subtitle truncate">${esc(itemRx(it, b))}</div></div>
          ${icon('chevron-right', 'chev')}
        </button>`;
      }).join('') || '<div class="row"><span class="sec">No exercises</span></div>'}
    </div>
  </section>`;
}

export function dayView(key) {
  return {
    get title() { return relativeLabel(key) === 'Today' ? 'Today' : fmtWeekday(key); },
    subtitle: fmtMonthDay(key),
    trailing: () => getDay(key) ? `<button class="icon-btn glass glass-interactive" data-action="day-menu" data-key="${key}" aria-label="More actions">${icon('ellipsis')}</button>` : '<span></span>',
    render: () => {
      const s = getState();
      const day = getDay(key, s);
      const done = isDone(key, s);
      const st = dayStatus(key, s);
      if (!day) {
        return `<div class="card empty">${icon('calendar')}
          <div class="t-headline">Nothing planned</div>
          <p class="t-sub sec" style="margin:0">${s.plan ? 'This day is outside your current plan.' : 'Create a plan to schedule workouts.'}</p>
          ${s.plan ? `<button class="btn btn-gray" data-action="day-activity" data-key="${key}">${icon('activity', 'sm')} ${key > todayKey() ? 'Plan an Activity' : 'Log an Activity'}</button>` : '<button class="btn btn-filled" data-action="open-wizard">Create My Plan</button>'}
        </div>`;
      }
      if (day.type === 'activity') return activityDayHtml(key, day, s);
      if (day.type === 'rest') {
        return `<div class="card hero rest-card">
          <div class="rest-head"><div class="rest-icon">${icon('moon')}</div>
            <div><div class="eyebrow">Week ${weekIndexOf(key, s) + 1}</div><div class="t-title2">Rest Day</div></div></div>
          <p class="t-callout sec" style="margin:0">${esc(day.note || 'Recover and come back stronger.')}</p>
          ${done
            ? `<div class="done-banner">${icon('circle-check', 'bold')} Rest day complete</div>
               <button class="btn btn-gray block" data-action="toggle-done" data-key="${key}">Mark as Not Done</button>`
            : `<button class="btn btn-tinted block" data-action="toggle-done" data-key="${key}">${icon('check', 'sm')} Mark Rest Day Complete</button>`}
        </div>`;
      }
      const log = s.log[key];
      const est = day.estSec || estimateSeconds(day, EX);
      const statusTag = done ? `<span class="tag green">${icon('check', 'bold')}Completed</span>`
        : st === 'missed' ? `<span class="tag">${icon('circle-dashed')}Missed</span>`
        : `<span class="tag accent">${icon('calendar')}Planned</span>`;
      return `
        <div class="card hero" style="gap:12px">
          <div class="chips">${statusTag}<span class="tag">Week ${weekIndexOf(key, s) + 1}</span>${day.deload ? `<span class="tag">${icon('leaf')}Deload</span>` : ''}</div>
          <div class="t-title2">${esc(day.title)}</div>
          <div class="hero-meta">
            <span>${icon('clock')} ${Math.round(est / 60)} min</span>
            <span>${icon('list')} ${countExercises(day)} exercises</span>
            <span>${icon('target')} ${esc(FOCUS[day.focus]?.name || 'Workout')}</span>
          </div>
          ${done && log ? `<div class="done-banner">${icon('circle-check', 'bold')} Done${log.durationSec ? ` in ${fmtMinutes(log.durationSec)}` : ''}${log.mode === 'manual' ? ' · marked by hand' : ''}</div>` : ''}
          ${done ? '' : `<button class="btn btn-filled lg block" data-action="start-workout" data-key="${key}">${icon('play', 'sm')} ${key === todayKey() ? 'Start Workout' : key < todayKey() ? 'Do This Workout' : 'Start Early'}</button>`}
          <div class="hero-actions">
            <button class="btn btn-gray sm" data-action="toggle-done" data-key="${key}">${icon(done ? 'undo-2' : 'check', 'xs')} ${done ? 'Mark as Not Done' : 'Mark as Done'}</button>
            <button class="btn btn-gray sm" data-action="edit-day" data-key="${key}">${icon('pencil', 'xs')} Edit</button>
          </div>
        </div>
        ${day.effort ? `<div class="card effort-card">${icon('gauge')}<div><div class="t-headline">Effort</div><div class="t-sub sec">${esc(day.effort)}</div></div></div>` : ''}
        ${(() => { const pid = day.blocks.find((b) => b.protocol)?.protocol; const tpl = pid && TEMPLATE[pid]; return tpl ? `<button class="card effort-card pressable" data-action="open-template" data-tpl="${tpl.id}">${icon('book-open')}<div style="min-width:0;flex:1"><div class="t-headline">${esc(tpl.name)}</div><div class="t-foot sec">${esc(tpl.source)}</div><div style="margin-top:6px">${evidenceTag(tpl)}</div></div>${icon('chevron-right', 'chev')}</button>` : ''; })()}
        ${day.blocks.filter((b) => b.items.length).map((b) => blockList(b, { key })).join('')}`;
    },
  };
}

export function openDay(key) {
  openSheet(dayView(key), { detent: 'medium' });
}

export function toggleDone(key, { quiet = false } = {}) {
  const s = getState();
  const day = getDay(key, s);
  const wasDone = isDone(key, s);
  const prev = s.log[key];
  update((st) => {
    if (wasDone) st.log[key] = { completed: false, at: Date.now() };
    else st.log[key] = { completed: true, at: Date.now(), mode: day?.type === 'activity' ? 'activity' : 'manual', durationSec: day?.type === 'workout' ? (day.estSec || 0) : day?.type === 'activity' ? day.minutes * 60 : 0 };
  });
  if (quiet) return;
  const what = day?.type === 'rest' ? 'Rest day' : day?.type === 'activity' ? day.title : 'Workout';
  toast(wasDone ? `${what} marked not done` : `${what} complete`, {
    iconName: wasDone ? 'undo-2' : 'circle-check',
    action: { label: 'Undo', onClick: () => update((st) => { st.log[key] = prev ? { ...prev, at: Date.now() } : { completed: false, at: Date.now() }; }) },
  });
}

export async function setRestDay(key, rest) {
  const s = getState();
  const day = getDay(key, s);
  if (!day) return;
  if (rest) {
    const ok = await alertDialog({ title: 'Change to Rest Day?', message: 'The workout planned for this day will be set aside. You can switch it back later.', actions: [{ label: 'Cancel', value: false, style: 'gray' }, { label: 'Rest Day', value: true, style: 'filled' }] });
    if (!ok) return;
    update((st) => { st.plan.days[key] = { type: 'rest', title: 'Rest Day', note: 'Rest day you added. Recover well.', prev: day }; });
    toast('Changed to rest day', { iconName: 'moon' });
  } else {
    const next = day.prev || regenerateDay(s.plan, key, allowedExercises(s.settings), { minutes: s.plan.schedule[dow(key)] || 30 });
    update((st) => { st.plan.days[key] = next; });
    toast('Changed to workout day', { iconName: 'dumbbell' });
  }
}

export const actions = {
  'open-day': (el) => openDay(el.dataset.key),
  'day-activity': (el) => openActivityPicker(el.dataset.key),
  'toggle-done': (el) => toggleDone(el.dataset.key),
  'edit-day': (el) => pushSheet(dayEditorView(el.dataset.key)),
  'day-menu': async (el) => {
    const key = el.dataset.key;
    const s = getState();
    const day = getDay(key, s);
    if (!day) return;
    const done = isDone(key, s);
    const manual = { label: 'Change to Manual Activity', icon: 'activity', value: 'activity' };
    const items = day.type === 'workout'
      ? [
        { label: done ? 'Mark as Not Done' : 'Mark as Done', icon: done ? 'undo-2' : 'circle-check', value: 'done' },
        { label: 'Edit Workout', icon: 'pencil', value: 'edit' },
        { label: 'New Workout for This Day', icon: 'refresh-cw', value: 'regen' },
        { label: 'Use a Proven Workout', icon: 'book-open', value: 'proven' },
        { sep: true },
        manual,
        { label: 'Change to Rest Day', icon: 'moon', value: 'rest' },
      ]
      : day.type === 'activity'
      ? [
        { label: done ? 'Mark as Not Done' : 'Mark as Done', icon: done ? 'undo-2' : 'circle-check', value: 'done' },
        { label: 'Change Activity', icon: 'activity', value: 'activity' },
        { sep: true },
        ...(day.prev ? [{ label: day.prev.type === 'rest' ? 'Back to Rest Day' : 'Back to Planned Workout', icon: day.prev.type === 'rest' ? 'moon' : 'dumbbell', value: 'unactivity' }]
          : [{ label: 'Remove Activity', icon: 'trash-2', value: 'unactivity', danger: true }]),
      ]
      : [
        { label: done ? 'Mark as Not Done' : 'Mark as Done', icon: done ? 'undo-2' : 'circle-check', value: 'done' },
        { label: 'Change to Workout Day', icon: 'dumbbell', value: 'workout' },
        manual,
      ];
    const v = await showMenu(el, items);
    if (v === 'done') toggleDone(key);
    else if (v === 'activity') openActivityPicker(key);
    else if (v === 'unactivity') removeActivity(key);
    else if (v === 'edit') pushSheet(dayEditorView(key));
    else if (v === 'rest') setRestDay(key, true);
    else if (v === 'proven') pushSheet(templatePickerView(key));
    else if (v === 'workout') setRestDay(key, false);
    else if (v === 'regen') {
      const old = day;
      const next = regenerateDay(s.plan, key, allowedExercises(s.settings));
      update((st) => { st.plan.days[key] = next; });
      toast('New workout created', { iconName: 'refresh-cw', action: { label: 'Undo', onClick: () => update((st) => { st.plan.days[key] = old; }) } });
    }
  },
};

export { closeSheet };
