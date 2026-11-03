// Manual activities: yoga, a run, a hike… done outside the app. From a day's menu you pick the
// activity, then say how long it took (and how far, for runs, walks, hikes and rides). The day
// becomes an activity day; on today or earlier it counts as done. The planned workout is kept
// so you can switch back.

import { icon } from '../icons.js';
import { esc, pushSheet, popSheet, refreshSheet, segmented, stepperHtml, toast } from '../ui.js';
import { LOCALE, todayKey, relativeLabel, fmtShort, fmtMinutes } from '../dates.js';
import { getState, update, getDay, isDone } from '../store.js';

export const ACTIVITIES = {
  yoga: { name: 'Yoga', icon: 'flower-2', color: 'var(--purple)', minutes: 60 },
  running: { name: 'Running', icon: 'route', color: 'var(--orange)', minutes: 30, distance: true, rate: 'pace' },
  walking: { name: 'Walking', icon: 'footprints', color: 'var(--green)', minutes: 30, distance: true, rate: 'pace' },
  hiking: { name: 'Hiking', icon: 'mountain', color: 'var(--brown)', minutes: 90, distance: true },
  cycling: { name: 'Cycling', icon: 'bike', color: 'var(--blue)', minutes: 45, distance: true, rate: 'speed' },
  swimming: { name: 'Swimming', icon: 'waves', color: 'var(--cyan)', minutes: 30 },
  pilates: { name: 'Pilates', icon: 'person-standing', color: 'var(--pink)', minutes: 45 },
  sport: { name: 'Sport', icon: 'volleyball', color: 'var(--indigo)', minutes: 60, ask: 'Which sport?', placeholder: 'Tennis, football, padel…' },
  dance: { name: 'Dance', icon: 'music', color: 'var(--red)', minutes: 45 },
  climbing: { name: 'Climbing', icon: 'mountain-snow', color: 'var(--teal)', minutes: 60 },
  other: { name: 'Other', icon: 'activity', color: 'var(--gray)', minutes: 30, ask: 'What did you do?', placeholder: 'Gardening, surfing…' },
};

/** Miles where people usually think in miles, kilometres elsewhere (changeable on the form). */
const defaultUnit = () => (/-(US|GB|LR|MM)\b/i.test(LOCALE) ? 'mi' : 'km');

// The form being filled in: { key, type, minutes, distance, unit, name, depth }
let draft = null;

const round1 = (n) => Math.round(n * 10) / 10;

/** "5:12 /km" for runs and walks, "24.3 km/h" for rides. */
export function rateText(type, minutes, distance, unit) {
  const a = ACTIVITIES[type];
  if (!a?.rate || !(distance > 0) || !(minutes > 0)) return '';
  if (a.rate === 'speed') return `${round1(distance / (minutes / 60))} ${unit}/h`;
  const per = minutes / distance;
  const m = Math.floor(per);
  const sec = Math.round((per - m) * 60);
  return `${sec === 60 ? m + 1 : m}:${String(sec === 60 ? 0 : sec).padStart(2, '0')} /${unit}`;
}

/** Duration, distance and pace for an activity day, for cards and rows. */
export function activityMeta(day) {
  const parts = [fmtMinutes(day.minutes * 60)];
  if (day.distance) parts.push(`${day.distance} ${day.unit}`);
  const rate = rateText(day.activity, day.minutes, day.distance, day.unit);
  if (rate) parts.push(rate);
  return parts;
}

export const activityIcon = (day) => ACTIVITIES[day?.activity]?.icon || 'activity';
export const activityColor = (day) => ACTIVITIES[day?.activity]?.color || 'var(--gray)';

/** The day sheet's card for an activity day. */
export function activityDayHtml(key, day, s) {
  const done = isDone(key, s);
  const missed = !done && key < todayKey();
  const [dur, dist, rate] = activityMeta(day);
  const prev = day.prev;
  return `
    <div class="card hero" style="gap:12px">
      <div class="chips">${done ? `<span class="tag green">${icon('check', 'bold')}Completed</span>` : missed ? `<span class="tag">${icon('circle-dashed')}Missed</span>` : `<span class="tag accent">${icon('calendar')}Planned</span>`}<span class="tag">${icon('pencil')}Manual</span></div>
      <div class="act-head">
        <div class="act-badge" style="background:${activityColor(day)}">${icon(activityIcon(day))}</div>
        <div style="min-width:0"><div class="t-title2 truncate">${esc(day.title)}</div>${day.title !== ACTIVITIES[day.activity]?.name ? `<div class="t-sub sec">${esc(ACTIVITIES[day.activity]?.name || 'Activity')}</div>` : ''}</div>
      </div>
      <div class="act-stats">
        <div><b class="rounded num">${esc(dur)}</b><span>Time</span></div>
        ${dist ? `<div><b class="rounded num">${esc(dist)}</b><span>Distance</span></div>` : ''}
        ${rate ? `<div><b class="rounded num">${esc(rate)}</b><span>${ACTIVITIES[day.activity].rate === 'speed' ? 'Speed' : 'Pace'}</span></div>` : ''}
      </div>
      <div class="hero-actions">
        <button class="btn btn-gray sm" data-action="toggle-done" data-key="${key}">${icon(done ? 'undo-2' : 'check', 'xs')} ${done ? 'Mark as Not Done' : 'Mark as Done'}</button>
        <button class="btn btn-gray sm" data-action="act-edit" data-key="${key}">${icon('pencil', 'xs')} Edit</button>
      </div>
    </div>
    ${prev ? `<p class="footnote">${prev.type === 'workout' ? `The planned workout, ${esc(prev.title)}, is set aside.` : 'This was a rest day.'} Use the ••• menu to switch back.</p>` : ''}`;
}

/* ---------- Sheets ---------- */

function pickerView(key) {
  const future = key > todayKey();
  return {
    title: future ? 'Plan an Activity' : 'Log an Activity',
    subtitle: fmtShort(key),
    render: () => `
      <p class="t-callout sec" style="margin:0">${future ? 'Something you will do outside the app. It replaces what is planned for this day.' : 'Something you did outside the app. It counts as this day’s workout.'}</p>
      <div class="act-grid">
        ${Object.entries(ACTIVITIES).map(([id, a]) => `<button class="act-tile" data-action="act-pick" data-key="${key}" data-type="${id}">
          <span class="act-badge" style="background:${a.color}">${icon(a.icon)}</span><span class="t-headline">${esc(a.name)}</span>
        </button>`).join('')}
      </div>`,
  };
}

function formView() {
  return {
    get title() { return ACTIVITIES[draft?.type]?.name || 'Activity'; },
    get subtitle() { return draft ? fmtShort(draft.key) : ''; },
    render: () => {
      if (!draft) return '';
      const a = ACTIVITIES[draft.type];
      const future = draft.key > todayKey();
      const editing = getDay(draft.key)?.type === 'activity';
      const rate = rateText(draft.type, draft.minutes, draft.distance, draft.unit);
      return `
        <div class="act-head">
          <div class="act-badge lg" style="background:${a.color}">${icon(a.icon)}</div>
          <div><div class="t-title2">${esc(a.name)}</div><div class="t-sub sec">${esc(relativeLabel(draft.key))}</div></div>
        </div>
        ${a.ask ? `<section class="section"><div class="section-head"><div class="section-title">${esc(a.ask)}</div></div>
          <div class="list"><div class="row"><input class="field plain-field" id="act-name" value="${esc(draft.name)}" placeholder="${esc(a.placeholder || '')}" maxlength="40" autocomplete="off" aria-label="${esc(a.ask)}"></div></div></section>` : ''}
        <section class="section"><div class="section-head"><div class="section-title">${future ? 'How long will it be?' : 'How long was it?'}</div></div>
          <div class="list">
            <div class="row"><div class="grow title">Time</div>
              <div class="value-stepper"><span class="val rounded">${esc(fmtMinutes(draft.minutes * 60))}</span>${stepperHtml('act:min', { canDec: draft.minutes > 5, canInc: draft.minutes < 600, label: 'minutes' })}</div></div>
          </div>
          <div class="chips">${[15, 30, 45, 60, 90, 120].map((m) => `<button class="chip ${draft.minutes === m ? 'is-on' : ''}" data-action="act-min" data-min="${m}">${fmtMinutes(m * 60)}</button>`).join('')}</div>
        </section>
        ${a.distance ? `<section class="section"><div class="section-head"><div class="section-title">${future ? 'How far?' : 'How far did you go?'}</div><span class="t-foot sec">Optional</span></div>
          <div class="list">
            <div class="row"><input class="field plain-field num" id="act-distance" type="number" inputmode="decimal" min="0" max="500" step="0.1" value="${draft.distance || ''}" placeholder="0.0" aria-label="Distance">
              ${segmented('act:unit', [{ value: 'km', label: 'km' }, { value: 'mi', label: 'mi' }], draft.unit, 'width:110px')}</div>
          </div>
          <p class="footnote" id="act-rate" ${rate ? '' : 'hidden'}>${rate ? `${a.rate === 'speed' ? 'Average speed' : 'Pace'}: ${esc(rate)}` : ''}</p>
        </section>` : ''}
        <button class="btn btn-filled lg block" data-action="act-save">${editing ? 'Save Changes' : future ? 'Plan Activity' : 'Log Activity'}</button>
        ${future ? '' : '<p class="footnote">Saved as done for this day, in place of what was planned.</p>'}`;
    },
  };
}

function startDraft(key, type, depth) {
  const day = getDay(key);
  const same = day?.type === 'activity' && day.activity === type;
  const s = getState();
  draft = {
    key, type, depth,
    minutes: same ? day.minutes : ACTIVITIES[type].minutes,
    distance: same ? day.distance || 0 : 0,
    unit: same && day.unit ? day.unit : s.settings.distanceUnit || defaultUnit(),
    name: same && day.title !== ACTIVITIES[type].name ? day.title : '',
  };
}

/** From the day menu: choose an activity for this date. */
export function openActivityPicker(key) {
  pushSheet(pickerView(key));
}

function save() {
  if (!draft) return;
  const { key, type, depth } = draft;
  const a = ACTIVITIES[type];
  const s = getState();
  const old = getDay(key, s);
  const oldLog = s.log[key];
  const past = key <= todayKey();
  const day = {
    type: 'activity', activity: type, title: (a.ask && draft.name.trim()) || a.name, minutes: draft.minutes,
    ...(a.distance && draft.distance > 0 ? { distance: round1(draft.distance), unit: draft.unit } : {}),
  };
  // Keep the planned day underneath so it can be restored
  const prev = old?.type === 'activity' ? old.prev : old;
  if (prev) day.prev = prev;
  update((st) => {
    st.plan.days[key] = day;
    if (a.distance && draft.distance > 0) st.settings.distanceUnit = draft.unit;
    if (past) st.log[key] = { completed: true, at: Date.now(), mode: 'activity', durationSec: draft.minutes * 60 };
  });
  for (let i = 0; i < depth; i++) popSheet();
  draft = null;
  toast(`${day.title} ${past ? 'logged' : 'planned'}`, {
    iconName: a.icon,
    action: { label: 'Undo', onClick: () => update((st) => { if (old) st.plan.days[key] = old; else delete st.plan.days[key]; st.log[key] = oldLog || { completed: false, at: Date.now() }; }) },
  });
}

/** Put back what was planned before the activity (a workout or a rest day). */
export function removeActivity(key) {
  const s = getState();
  const day = getDay(key, s);
  if (day?.type !== 'activity') return;
  const oldLog = s.log[key];
  update((st) => {
    if (day.prev) st.plan.days[key] = day.prev; else delete st.plan.days[key];
    if (oldLog?.mode === 'activity') st.log[key] = { completed: false, at: Date.now() };
  });
  toast(day.prev ? (day.prev.type === 'rest' ? 'Back to rest day' : 'Back to the planned workout') : 'Activity removed', {
    iconName: 'undo-2',
    action: { label: 'Undo', onClick: () => update((st) => { st.plan.days[key] = day; if (oldLog) st.log[key] = { ...oldLog, at: Date.now() }; }) },
  });
}

function refreshRate() {
  const p = document.getElementById('act-rate');
  if (!p || !draft) return;
  const a = ACTIVITIES[draft.type];
  const rate = rateText(draft.type, draft.minutes, draft.distance, draft.unit);
  p.hidden = !rate;
  p.textContent = rate ? `${a.rate === 'speed' ? 'Average speed' : 'Pace'}: ${rate}` : '';
}

/* ---------- Events ---------- */

export const actions = {
  'act-pick': (el) => { startDraft(el.dataset.key, el.dataset.type, 2); pushSheet(formView()); },
  'act-edit': (el) => {
    const day = getDay(el.dataset.key);
    if (day?.type !== 'activity') return;
    startDraft(el.dataset.key, day.activity, 1);
    pushSheet(formView());
  },
  'act-min': (el) => { if (draft) { draft.minutes = +el.dataset.min; refreshSheet(); } },
  'act-save': () => save(),
};

export function onStep(id, dir) {
  if (id !== 'act:min' || !draft) return false;
  draft.minutes = Math.max(5, Math.min(600, draft.minutes + dir * 5));
  refreshSheet();
  return true;
}

export function onSeg(id, value) {
  if (id !== 'act:unit' || !draft) return false;
  draft.unit = value;
  refreshSheet();
  return true;
}

export function onInput(e) {
  if (!draft) return false;
  if (e.target.id === 'act-name') { draft.name = e.target.value; return true; }
  if (e.target.id === 'act-distance') {
    const v = parseFloat(String(e.target.value).replace(',', '.'));
    draft.distance = Number.isFinite(v) && v > 0 ? Math.min(500, v) : 0;
    refreshRate();
    return true;
  }
  return false;
}
