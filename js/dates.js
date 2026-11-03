// Date helpers. Days are keyed as local 'YYYY-MM-DD' strings and built at noon
// so daylight-saving shifts never move a date.

export const DAY_MS = 86400000;

// The UI is English, so dates use an English locale (keeping the user's regional variant, e.g. en-ZA).
export const LOCALE = (navigator.languages || [navigator.language]).find((l) => /^en\b/i.test(l || '')) || 'en-US';

const pad = (n) => String(n).padStart(2, '0');

export function toKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function todayKey() {
  return toKey(new Date());
}

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a, b) {
  return Math.round((fromKey(b) - fromKey(a)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday */
export function dow(key) {
  return fromKey(key).getDay();
}

export function startOfWeek(key, weekStart = 1) {
  const back = (dow(key) - weekStart + 7) % 7;
  return addDays(key, -back);
}

export function weekDays(key, weekStart = 1) {
  const start = startOfWeek(key, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthKey(key) {
  return key.slice(0, 7);
}

export function addMonths(mKey, n) {
  const [y, m] = mKey.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1, 12);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function daysInMonth(mKey) {
  const [y, m] = mKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

const cache = new Map();
export function fmt(key, opts) {
  const id = JSON.stringify(opts);
  if (!cache.has(id)) cache.set(id, new Intl.DateTimeFormat(LOCALE, opts));
  return cache.get(id).format(fromKey(key));
}

export const fmtLong = (key) => fmt(key, { weekday: 'long', month: 'long', day: 'numeric' });
export const fmtShort = (key) => fmt(key, { weekday: 'short', month: 'short', day: 'numeric' });
export const fmtWeekday = (key) => fmt(key, { weekday: 'long' });
export const fmtMonthDay = (key) => fmt(key, { month: 'long', day: 'numeric' });

/** Weekday labels starting at weekStart, e.g. ['M','T','W',…] */
export function weekdayLetters(weekStart = 1, style = 'narrow') {
  const base = '2026-11-01'; // a Sunday
  return Array.from({ length: 7 }, (_, i) => fmt(addDays(base, (i + weekStart) % 7), { weekday: style }));
}

export function relativeLabel(key, today = todayKey()) {
  const d = diffDays(today, key);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  if (d > 1 && d < 7) return fmtWeekday(key);
  return fmtShort(key);
}

export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${pad(s)}`;
}

export function fmtMinutes(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}
