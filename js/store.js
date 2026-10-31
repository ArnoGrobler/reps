// App state, kept per profile: settings, the active plan (days keyed by date) and
// the completion log. Persisted to localStorage; every read/write is guarded because
// storage can be unavailable (private mode, sandboxed previews).
// Each state carries meta timestamps (planAt, settingsAt, logResetAt) and every log
// entry an `at` time, so copies from different devices can be merged by sync.js.

import { todayKey, addDays, diffDays, weekDays, startOfWeek } from './dates.js';

const REG_KEY = 'reps.profiles.v1';
const LEGACY_KEY = 'reps.v1';
const LEGACY_SESSION = 'reps.session.v1';
const stateKey = (pid) => `reps.v1.${pid}`;
const sessionKey = (pid) => `reps.session.v1.${pid}`;

export const PROFILE_COLORS = ['orange', 'blue', 'green', 'pink', 'purple', 'indigo', 'mint', 'red'];

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
  hidden: [],           // exercise ids never to suggest or add
};

function blank() {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, plan: null, log: {}, meta: { planAt: 0, settingsAt: 0, logResetAt: 0 } };
}

export function normalize(saved) {
  if (!saved || saved.version !== 1) return blank();
  const b = blank();
  return { ...b, ...saved, settings: { ...b.settings, ...(saved.settings || {}) }, log: saved.log || {}, meta: { ...b.meta, ...(saved.meta || {}) } };
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

const newId = () => `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/* ---------- Profiles ---------- */

function loadRegistry() {
  const saved = read(REG_KEY);
  if (saved && Array.isArray(saved.profiles)) return { askOnLaunch: true, activeId: null, ...saved };
  const reg = { activeId: null, askOnLaunch: true, profiles: [] };
  // Move data from before profiles existed into a first profile.
  const legacy = read(LEGACY_KEY);
  if (legacy) {
    const id = newId();
    reg.profiles.push({ id, name: 'Me', color: 'orange', createdAt: Date.now() });
    reg.activeId = id;
    write(stateKey(id), legacy);
    const sess = read(LEGACY_SESSION);
    if (sess) write(sessionKey(id), sess);
    write(LEGACY_KEY, null);
    write(LEGACY_SESSION, null);
  }
  write(REG_KEY, reg);
  return reg;
}

let registry = loadRegistry();
if (registry.activeId && !registry.profiles.some((p) => p.id === registry.activeId)) registry.activeId = registry.profiles[0]?.id || null;
let state = registry.activeId ? normalize(read(stateKey(registry.activeId))) : blank();

const listeners = new Set();       // re-render on any state change
const localListeners = new Set();  // changes made on this device (sync pushes these)
const beforeSwitch = new Set();    // run before the active profile changes
const afterSwitch = new Set();

const saveRegistry = () => write(REG_KEY, registry);
const persist = () => { if (registry.activeId) write(stateKey(registry.activeId), state); };
const notify = () => listeners.forEach((fn) => fn(state));
const notifyLocal = () => localListeners.forEach((fn) => fn(registry.activeId));

export const getRegistry = () => registry;
export const getProfiles = () => registry.profiles;
export const getProfile = (id) => registry.profiles.find((p) => p.id === id) || null;
export const activeProfile = () => getProfile(registry.activeId);
export const onBeforeSwitch = (fn) => beforeSwitch.add(fn);
export const onAfterSwitch = (fn) => afterSwitch.add(fn);
export const onLocalChange = (fn) => localListeners.add(fn);

export function switchProfile(id) {
  if (!getProfile(id) || id === registry.activeId) return;
  beforeSwitch.forEach((fn) => fn(registry.activeId));
  registry.activeId = id;
  saveRegistry();
  state = normalize(read(stateKey(id)));
  afterSwitch.forEach((fn) => fn(id));
  notify();
}

export function addProfile({ name, color, photo = null, id = newId(), sync = null, data = null }) {
  const profile = { id, name: name.trim() || 'Me', color: color || 'orange', createdAt: Date.now(), ...(photo ? { photo } : {}), ...(sync ? { sync } : {}) };
  registry.profiles.push(profile);
  if (data) write(stateKey(id), normalize(data));
  saveRegistry();
  return profile;
}

/** Patch a profile. `quiet` skips the re-render (used for sync bookkeeping). */
export function updateProfile(id, patch, { quiet = false } = {}) {
  const p = getProfile(id);
  if (!p) return;
  Object.assign(p, patch);
  saveRegistry();
  if (!quiet) notify();
}

export function deleteProfile(id) {
  if (id === registry.activeId) beforeSwitch.forEach((fn) => fn(id));
  registry.profiles = registry.profiles.filter((p) => p.id !== id);
  write(stateKey(id), null);
  write(sessionKey(id), null);
  if (id === registry.activeId) {
    registry.activeId = registry.profiles[0]?.id || null;
    state = registry.activeId ? normalize(read(stateKey(registry.activeId))) : blank();
    afterSwitch.forEach((fn) => fn(registry.activeId));
  }
  saveRegistry();
  notify();
}

export function setAskOnLaunch(on) {
  registry.askOnLaunch = !!on;
  saveRegistry();
}

/* ---------- State ---------- */

export function getState() { return state; }

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Mutate state in place, stamp what changed, persist, and notify. */
export function update(mutator, { silent = false } = {}) {
  const planBefore = JSON.stringify(state.plan);
  const settingsBefore = JSON.stringify(state.settings);
  mutator(state);
  const now = Date.now();
  if (JSON.stringify(state.plan) !== planBefore) state.meta.planAt = now;
  if (JSON.stringify(state.settings) !== settingsBefore) state.meta.settingsAt = now;
  persist();
  notifyLocal();
  if (!silent) notify();
}

/** Restore a backup into the active profile. Restored plan and settings count as the newest. */
export function replaceState(next) {
  const now = Date.now();
  state = normalize(next);
  state.meta = { ...state.meta, planAt: now, settingsAt: now };
  persist();
  notifyLocal();
  notify();
}

/** Erase the active profile's plan, history and settings (on every synced device too). */
export function resetAll() {
  const now = Date.now();
  state = { ...blank(), meta: { planAt: now, settingsAt: now, logResetAt: now } };
  persist();
  saveSession(null);
  notifyLocal();
  notify();
}

/** Wipe everything Reps stored on this device: all profiles, plans, history, settings, tokens and sessions. */
export function resetDevice() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('reps.')).forEach((k) => localStorage.removeItem(k));
  } catch { /* storage unavailable */ }
  registry = { activeId: null, askOnLaunch: true, profiles: [] };
  state = blank();
}

/** True when a profile has a plan or history that exists only on this device. */
export function hasUnsyncedData(pid) {
  const p = getProfile(pid);
  if (!p || p.sync?.gistId) return false;
  const s = pid === registry.activeId ? state : normalize(read(stateKey(pid)));
  return !!s.plan || Object.values(s.log || {}).some((l) => l?.completed);
}

/** Raw stored state for any profile (sync reads profiles that are not active). */
export function readProfileState(pid) {
  return pid === registry.activeId ? state : normalize(read(stateKey(pid)));
}

/** Replace a profile's state with a merged copy from sync. Does not trigger another push. */
export function applyRemoteState(pid, next) {
  const s = normalize(next);
  write(stateKey(pid), s);
  if (pid === registry.activeId) { state = s; notify(); }
}

export const loadSession = () => (registry.activeId ? read(sessionKey(registry.activeId)) : null);
export const saveSession = (s) => { if (registry.activeId) write(sessionKey(registry.activeId), s); };

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
