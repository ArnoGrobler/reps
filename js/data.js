// Exercise library access and display helpers.

/** Shown in the account sheet so it's easy to tell which version a device runs. */
export const VERSION = '2026.11.02.5';

import { EXERCISES, EQUIPMENT } from './data/exercises.js';
import { perSideAmount } from './generator.js';

export { EXERCISES, EQUIPMENT, perSideAmount };

export const EX = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));
export const EQ = Object.fromEntries(EQUIPMENT.map((q) => [q.id, q]));

export const EQUIP_ICON = {
  bodyweight: 'person-standing',
  kettlebell: 'weight',
  dumbbells: 'dumbbell',
  bands: 'infinity',
  jump_rope: 'spline',
  sliders: 'disc-3',
  ab_wheel: 'life-buoy',
};

export const EQUIP_COLOR = {
  bodyweight: 'var(--blue)',
  kettlebell: 'var(--orange)',
  dumbbells: 'var(--indigo)',
  bands: 'var(--green)',
  jump_rope: 'var(--pink)',
  sliders: 'var(--teal)',
  ab_wheel: 'var(--purple)',
};

export const PATTERNS = {
  squat: 'Squat', hinge: 'Hinge', lunge: 'Lunge', push_h: 'Push', push_v: 'Overhead Press',
  pull_h: 'Row & Pull', pull_v: 'Vertical Pull', core: 'Core', carry: 'Carry', cardio: 'Cardio',
  mobility: 'Mobility', stretch: 'Stretch', full: 'Full Body',
};

export const PATTERN_ORDER = ['squat', 'hinge', 'lunge', 'push_h', 'push_v', 'pull_h', 'pull_v', 'full', 'carry', 'core', 'cardio', 'mobility', 'stretch'];

export const titleCase = (s) => String(s || '').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Main equipment of an exercise (first non-bodyweight item, else bodyweight). */
export function mainEquip(ex) {
  return ex?.equipment.find((q) => q !== 'bodyweight') || 'bodyweight';
}

/** " / side" when the amount is per side, else "". */
export const sideText = (item, ex) => (perSideAmount(item, ex) ? ' / side' : '');

/** "3 × 12", "3 × 10 / side", "40 s", "2 × 30 s / side" */
export function rxText(item, ex, { sets = true } = {}) {
  const side = sideText(item, ex);
  const amount = item.mode === 'time' ? `${item.duration} s` : `${item.reps}`;
  const s = sets && item.sets > 1 ? `${item.sets} × ` : '';
  return `${s}${amount}${item.mode === 'reps' && !s ? ' reps' : ''}${side}`;
}

export function youtubeSearchUrl(ex) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${ex.name} exercise proper form`)}`;
}

/** YouTube iframes are blocked inside the claude.ai preview sandbox (a framed page); they work on GitHub Pages. */
const framed = (() => { try { return window.self !== window.top; } catch { return true; } })();
export const canEmbedVideo = !framed && !/claude\.ai|claudeusercontent|anthropic/.test(location.hostname);

/** Exercises the plan generator may use: everything except what this profile hid. */
export function allowedExercises(settings) {
  const hidden = new Set(settings?.hidden || []);
  return hidden.size ? EXERCISES.filter((e) => !hidden.has(e.id)) : EXERCISES;
}
