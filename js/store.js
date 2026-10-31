// App state: settings, the active plan (days keyed by date) and the completion log.
// Persisted to localStorage; every read/write is guarded because storage can be
// unavailable (private mode, sandboxed previews).

import { todayKey, addDays, diffDays, weekDays, startOfWeek } from './dates.js';

const KEY = 'reps.v1';
const SESSION_KEY = 'reps.session.v1';

export const DEFAULT_SETTINGS = {
  theme: 'system',      // system | light | dark
  accent: 'orange',
  weekStart: 1,         // 1 = Monday, 0 = Sunday
  getReady: 10,         // seconds before a timed workout starts
  sound: true,
  voice: true,
  haptics: true,
  wakeLock: true,
  repTick: true,        // soft tick for each rep in timed mode
};

function blank() {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, plan: null, log: {} };
}

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage unavailable — keep working in memory */ }
}

let state = (() => {
  const saved = read(KEY);
  if (!saved || saved.version !== 1) return blank();
  return { ...blank(), ...saved, settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) } };
})();

const listeners = new Set();

export function getState() { return state; }

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Mutate state in place, persist, and notify. */
export function update(mutator, { silent = false } = {}) {
  mutator(state);
  write(KEY, state);
  if (!silent) listeners.forEach((fn) => fn(state));
}

export function replaceState(next) {
  state = { ...blank(), ...next, settings: { ...DEFAULT_SETTINGS, ...(next.settings || {}) } };
  write(KEY, state);
  listeners.forEach((fn) => fn(state));
}

export function resetAll() {
  state = blank();
  write(KEY, state);
  write(SESSION_KEY, null);
  listeners.forEach((fn) => fn(state));
}

export const loadSession = () => read(SESSION_KEY);
export const saveSession = (s) => write(SESSION_KEY, s);

/* ---------- Selectors ---------- */

export function getDay(key, s = state) {
  return s.plan?.days?.[key] || null;
}

export function isDone(key, s = state) {
  return !!s.log[key]?.completed;
}

export function planRange(s = state) {
  if (!s.plan) return null;
  return { start: s.plan.startDate, end: addDays(s.plan.startDate, s.plan.weeks * 7 - 1) };
}

export function weekIndexOf(key, s = state) {
  if (!s.plan) return -1;
  return Math.floor(diffDays(s.plan.startDate, key) / 7);
}

export function inPlan(key, s = state) {
  const r = planRange(s);
  return !!r && key >= r.start && key <= r.end;
}

/** Day status for calendars: done | rest-done | planned | rest | missed | rest-missed | today-* | none */
export function dayStatus(key, s = state, today = todayKey()) {
  const day = getDay(key, s);
  const done = isDone(key, s);
  if (!day) return done ? 'done' : 'none';
  const rest = day.type === 'rest';
  if (done) return rest ? 'rest-done' : 'done';
  if (key < today) return rest ? 'rest-missed' : 'missed';
  return rest ? 'rest' : 'planned';
}

/** The workout to show on Today: today's day, or the next upcoming one. */
export function upNext(s = state, today = todayKey()) {
  if (!s.plan) return null;
  const r = planRange(s);
  const todayDay = getDay(today, s);
  if (todayDay && !isDone(today, s)) return { key: today, day: todayDay, isToday: true };
  const from = today < r.start ? r.start : addDays(today, 1);
  for (let k = from; k <= r.end; k = addDays(k, 1)) {
    const d = getDay(k, s);
    if (d && d.type === 'workout' && !isDone(k, s)) return { key: k, day: d, isToday: k === today };
  }
  return null;
}

export function weekSummary(s = state, today = todayKey()) {
  const days = weekDays(today, s.settings.weekStart);
  let planned = 0, done = 0, minutes = 0;
  const perDay = days.map((k) => {
    const d = getDay(k, s);
    const log = s.log[k];
    const mins = log?.completed ? Math.round((log.durationSec ?? (d?.minutes || 0) * 60) / 60) : 0;
    if (d?.type === 'workout') { planned++; if (log?.completed) done++; }
    else if (!d && log?.completed && mins) done++;
    minutes += d?.type === 'rest' ? 0 : mins;
    return { key: k, minutes: d?.type === 'rest' ? 0 : mins, status: dayStatus(k, s, today) };
  });
  return { days: perDay, planned, done, minutes };
}

/** Consecutive completed plan days (workouts and rest days), ending today or yesterday. */
export function streaks(s = state, today = todayKey()) {
  const isCounted = (k) => isDone(k, s);
  let current = 0;
  let k = isCounted(today) ? today : addDays(today, -1);
  while (isCounted(k)) { current++; k = addDays(k, -1); }
  const keys = Object.keys(s.log).filter((x) => s.log[x]?.completed).sort();
  let best = 0, run = 0, prev = null;
  for (const x of keys) {
    run = prev && diffDays(prev, x) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  }
  return { current, best: Math.max(best, current) };
}

export function planProgress(s = state, today = todayKey()) {
  if (!s.plan) return null;
  const r = planRange(s);
  let total = 0, done = 0;
  for (const [k, d] of Object.entries(s.plan.days)) {
    if (d.type !== 'workout') continue;
    total++;
    if (isDone(k, s)) done++;
  }
  const week = Math.min(s.plan.weeks, Math.max(1, Math.floor(diffDays(r.start, today) / 7) + 1));
  const started = today >= r.start;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0, week, weeks: s.plan.weeks, started, range: r };
}

export function totals(s = state) {
  let workouts = 0, seconds = 0;
  for (const [k, l] of Object.entries(s.log)) {
    if (!l?.completed) continue;
    const d = getDay(k, s);
    if (d?.type === 'rest') continue;
    workouts++;
    seconds += l.durationSec ?? (d?.minutes || 0) * 60;
  }
  return { workouts, seconds };
}

export { startOfWeek };
