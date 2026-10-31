// Plan generator.
// Builds a training plan from goal, level, equipment and a per-weekday time budget.
// Structure: 4-week blocks. Exercises stay the same within a block so progress is
// measurable (reps/time climb each week, week 4 is a lighter deload), then rotate.

import { addDays, dow } from './dates.js';

export const GOALS = {
  strength: { label: 'Strength', icon: 'dumbbell', desc: 'Heavier sets, longer rests. Build muscle and strength.' },
  balanced: { label: 'Balanced', icon: 'activity', desc: 'Strength work plus a short conditioning finisher.' },
  conditioning: { label: 'Conditioning', icon: 'flame', desc: 'Circuits and intervals. Burn and build endurance.' },
};

export const LEVELS = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };

export const FOCUS = {
  full: { name: 'Full Body', patterns: ['squat', 'push_h', 'hinge', 'pull_h', 'lunge', 'push_v', 'core', 'carry', 'full'] },
  lower: { name: 'Lower Body', patterns: ['squat', 'hinge', 'lunge', 'hinge', 'squat', 'core', 'carry', 'lunge'] },
  upper: { name: 'Upper Body', patterns: ['push_h', 'pull_h', 'push_v', 'pull_h', 'push_h', 'core', 'pull_v', 'push_v'] },
  conditioning: { name: 'Conditioning', patterns: ['full', 'cardio', 'squat', 'core', 'hinge', 'push_h', 'lunge', 'cardio', 'full'] },
  core: { name: 'Core', patterns: ['core', 'core', 'core', 'core', 'core', 'core'] },
  recovery: { name: 'Mobility', patterns: ['mobility', 'stretch', 'mobility', 'stretch', 'mobility', 'stretch', 'mobility', 'stretch'] },
};

const SPLITS = {
  strength: [[], ['full'], ['full', 'full'], ['lower', 'upper', 'full'], ['lower', 'upper', 'lower', 'upper'],
    ['lower', 'upper', 'conditioning', 'lower', 'upper'], ['lower', 'upper', 'conditioning', 'lower', 'upper', 'core'],
    ['lower', 'upper', 'conditioning', 'lower', 'upper', 'core', 'recovery']],
  balanced: [[], ['full'], ['full', 'full'], ['full', 'conditioning', 'full'], ['lower', 'upper', 'conditioning', 'full'],
    ['lower', 'upper', 'conditioning', 'full', 'core'], ['lower', 'upper', 'conditioning', 'full', 'core', 'conditioning'],
    ['lower', 'upper', 'conditioning', 'full', 'core', 'conditioning', 'recovery']],
  conditioning: [[], ['conditioning'], ['full', 'conditioning'], ['conditioning', 'full', 'conditioning'],
    ['conditioning', 'full', 'conditioning', 'core'], ['conditioning', 'full', 'conditioning', 'core', 'full'],
    ['conditioning', 'full', 'conditioning', 'core', 'full', 'conditioning'],
    ['conditioning', 'full', 'conditioning', 'core', 'full', 'conditioning', 'recovery']],
};
const DEMAND = { lower: 0, upper: 0, full: 0, conditioning: 1, core: 2, recovery: 3 };

const REST_NOTES = [
  'Easy walk for 20–30 minutes, or full rest.',
  'Light stretching and mobility. Sleep well tonight.',
  'Recover: hydrate, eat protein, keep moving gently.',
  'Optional: 10 minutes of easy mobility work.',
];

/* ---------- Utilities ---------- */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let idCounter = 0;
export const uid = (p = 'x') => `${p}${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

export function indexExercises(list) {
  return Object.fromEntries(list.map((e) => [e.id, e]));
}

export function canDo(ex, equipment) {
  return ex.equipment.every((q) => q === 'bodyweight' || equipment.includes(q));
}

const isLoaded = (ex) => ex.equipment.some((q) => q === 'kettlebell' || q === 'dumbbells');

/* ---------- Timing ---------- */

export function workSeconds(item, ex) {
  const sides = ex?.perSide ? 2 : 1;
  if (item.mode === 'time') return Math.round((item.duration || 30) * sides);
  return Math.max(8, Math.round((item.reps || 10) * (ex?.tempo || 2.5) * sides));
}

export function estimateSeconds(day, exMap) {
  if (!day || day.type !== 'workout') return 0;
  let t = 0;
  for (const b of day.blocks) {
    if (!b.items.length) continue;
    if (b.format === 'circuit') {
      const round = b.items.reduce((s, it) => s + workSeconds(it, exMap[it.exId]) + (it.rest || 0), 0);
      t += b.rounds * round + Math.max(0, b.rounds - 1) * (b.roundRest || 0);
    } else {
      for (const it of b.items) t += it.sets * workSeconds(it, exMap[it.exId]) + it.sets * (it.rest || 0);
    }
  }
  return t;
}

export function countExercises(day) {
  if (!day || day.type !== 'workout') return 0;
  return day.blocks.filter((b) => b.kind === 'main' || b.kind === 'finisher').reduce((s, b) => s + b.items.length, 0);
}

/* ---------- Item factories ---------- */

function baseReps(ex, { goal, level }) {
  let reps = ex.defaults.reps ?? 10;
  if (level === 1) reps -= 2;
  if (level === 3) reps += 2;
  if (goal === 'strength' && isLoaded(ex)) reps = Math.min(reps, 10);
  if (goal === 'conditioning') reps += 2;
  return Math.max(5, reps);
}

function baseDuration(ex, { level }) {
  let d = ex.defaults.duration ?? 30;
  if (level === 1) d -= 5;
  if (level === 3) d += 10;
  return Math.max(15, d);
}

/** Create a prescription for an exercise added by hand or by the generator. */
export function makeItem(ex, { goal = 'balanced', level = 2, kind = 'main' } = {}) {
  const item = { id: uid('i'), exId: ex.id, mode: ex.type === 'time' ? 'time' : 'reps', sets: 3, reps: 10, duration: 30, rest: 60 };
  if (kind === 'warmup') {
    item.sets = 1; item.rest = 5;
    if (item.mode === 'time') item.duration = 30; else item.reps = Math.min(ex.defaults.reps ?? 10, 10);
    return item;
  }
  if (kind === 'cooldown') {
    item.sets = 1; item.rest = 5; item.mode = 'time';
    item.duration = ex.defaults.duration ?? 30;
    return item;
  }
  item.reps = baseReps(ex, { goal, level });
  item.duration = baseDuration(ex, { level });
  item.sets = goal === 'strength' ? (level === 1 ? 3 : 4) : 3;
  item.rest = goal === 'strength' ? (level === 3 ? 90 : 75) : goal === 'conditioning' ? 30 : 60;
  if (ex.pattern === 'core' || ex.pattern === 'cardio') item.rest = Math.min(item.rest, 45);
  return item;
}

/* ---------- Exercise selection ---------- */

function chooser(exercises, { equipment, level, rng }) {
  const preferred = equipment.filter((q) => q !== 'bodyweight');
  const maxLevel = level;
  return function pick(pattern, role, ctx) {
    const usable = (relaxLevel, relaxRole) => exercises.filter((e) =>
      e.pattern === pattern &&
      (relaxRole || e.roles.includes(role)) &&
      canDo(e, equipment) &&
      e.level <= (relaxLevel ? 3 : maxLevel) &&
      !ctx.session.has(e.id));
    let list = usable(false, false);
    if (!list.length) list = usable(true, false);
    if (!list.length) list = usable(false, true);
    if (!list.length) list = usable(true, true);
    if (!list.length) return null;
    let best = null, bestScore = -Infinity;
    for (const e of list) {
      let score = rng() * 1.2;
      const usesPreferred = e.equipment.some((q) => preferred.includes(q));
      if (role === 'main' && preferred.length) {
        if (usesPreferred) {
          score += 2.2;
          // Balance between multiple kinds of equipment
          const least = Math.min(...preferred.map((q) => ctx.equipUse[q] || 0));
          if (e.equipment.some((q) => preferred.includes(q) && (ctx.equipUse[q] || 0) === least)) score += 0.8;
        }
      }
      if (e.level === level) score += 0.5;
      score -= (ctx.week.get(e.id) || 0) * 1.4;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    ctx.session.add(best.id);
    ctx.week.set(best.id, (ctx.week.get(best.id) || 0) + 1);
    best.equipment.forEach((q) => { ctx.equipUse[q] = (ctx.equipUse[q] || 0) + 1; });
    return best;
  };
}

/* ---------- Session templates ---------- */

function buildTemplate({ focus, minutes, goal, level, equipment, exercises, exMap, rng, week }) {
  const pick = chooser(exercises, { equipment, level, rng });
  const ctx = { session: new Set(), week, equipUse: {} };
  const budget = minutes * 60;
  const blocks = [];
  const opts = { goal, level };

  if (focus === 'recovery') {
    const items = [];
    const n = Math.max(4, Math.round(budget / 50));
    for (let i = 0; i < n; i++) {
      const ex = pick(FOCUS.recovery.patterns[i % 8], i % 2 ? 'cooldown' : 'warmup', ctx);
      if (ex) items.push({ ...makeItem(ex, { ...opts, kind: 'cooldown' }), duration: 40 });
    }
    blocks.push({ id: uid('b'), kind: 'main', name: 'Mobility Flow', format: 'circuit', rounds: 1, roundRest: 0, items });
    return { focus, blocks };
  }

  const warmSec = minutes <= 12 ? 70 : minutes <= 20 ? 105 : minutes <= 35 ? 140 : minutes <= 50 ? 175 : 210;
  const coolSec = minutes <= 12 ? 60 : minutes <= 25 ? 120 : 180;

  const warm = [];
  const warmPatterns = ['cardio', 'mobility', 'cardio', 'mobility', 'cardio', 'mobility', 'cardio'];
  for (let i = 0, t = 0; t < warmSec && i < 7; i++) {
    const ex = pick(warmPatterns[i], 'warmup', ctx);
    if (!ex) continue;
    const it = makeItem(ex, { ...opts, kind: 'warmup' });
    warm.push(it);
    t += workSeconds(it, ex) + it.rest;
  }
  blocks.push({ id: uid('b'), kind: 'warmup', name: 'Warm-Up', format: 'circuit', rounds: 1, roundRest: 0, items: warm });

  const cool = [];
  for (let i = 0, t = 0; t < coolSec && i < 6; i++) {
    const ex = pick('stretch', 'cooldown', ctx);
    if (!ex) break;
    const it = makeItem(ex, { ...opts, kind: 'cooldown' });
    cool.push(it);
    t += workSeconds(it, ex) + it.rest;
  }

  const used = () => blocks.reduce((s, b) => s + estimateSeconds({ type: 'workout', blocks: [b] }, exMap), 0)
    + estimateSeconds({ type: 'workout', blocks: [{ format: 'circuit', rounds: 1, items: cool }] }, exMap);

  const circuitMain = focus === 'conditioning' || focus === 'core' || (goal === 'conditioning' && focus === 'full');

  if (circuitMain) {
    const work = level === 1 ? 30 : level === 3 ? 45 : 40;
    const rest = level === 3 ? 15 : 20;
    const per = 4;
    const roundRest = 60;
    // Decide circuits × rounds up front so circuits are balanced
    const roughRound = per * (work + rest) + roundRest;
    const total = Math.max(1, Math.floor((budget - used() + roundRest) / roughRound));
    const nCircuits = total >= 9 ? 3 : total >= 5 ? 2 : 1;
    const roundsEach = Math.max(1, Math.min(4, Math.floor(total / nCircuits)));
    for (let ci = 0; ci < nCircuits; ci++) {
      const items = [];
      for (let i = 0; i < per; i++) {
        const pattern = FOCUS[focus].patterns[(ci * per + i) % FOCUS[focus].patterns.length];
        const ex = pick(pattern, focus === 'core' ? 'main' : 'finisher', ctx) || pick(pattern, 'main', ctx);
        if (!ex) continue;
        items.push({ ...makeItem(ex, opts), mode: 'time', duration: work, rest, sets: 1 });
      }
      if (!items.length) break;
      const roundT = items.reduce((s, it) => s + workSeconds(it, exMap[it.exId]) + it.rest, 0);
      const remaining = budget - used();
      const fit = Math.floor((remaining + roundRest) / (roundT + roundRest));
      const rounds = Math.max(1, Math.min(roundsEach, fit));
      if (fit < 1 && ci > 0) break;
      blocks.push({ id: uid('b'), kind: 'main', name: `Circuit ${String.fromCharCode(65 + ci)}`, format: 'circuit', rounds, roundRest, items });
    }
    // Spread leftover time into longer work intervals (capped by level)
    const cap = level === 1 ? 40 : level === 2 ? 50 : 60;
    const circuits = blocks.filter((b) => b.kind === 'main' && b.format === 'circuit');
    const slots = circuits.reduce((n, b) => n + b.rounds * b.items.reduce((m, it) => m + (exMap[it.exId]?.perSide ? 2 : 1), 0), 0);
    const extra = slots ? Math.floor((budget - used()) / slots / 5) * 5 : 0;
    if (extra > 0) circuits.forEach((b) => b.items.forEach((it) => { it.duration = Math.max(it.duration, Math.min(cap, it.duration + extra)); }));
  } else {
    const main = { id: uid('b'), kind: 'main', name: 'Strength', format: 'straight', rounds: 1, roundRest: 0, items: [] };
    blocks.push(main);
    const wantsFinisher = goal === 'balanced' && minutes >= 25;
    const reserve = wantsFinisher ? Math.min(360, budget * 0.18) : 0;
    const patterns = FOCUS[focus].patterns;
    const maxItems = 6;
    for (let i = 0; i < patterns.length * 2 && main.items.length < maxItems; i++) {
      const remaining = budget - reserve - used();
      if (remaining < 90) break;
      const ex = pick(patterns[i % patterns.length], 'main', ctx);
      if (!ex) continue;
      const it = makeItem(ex, opts);
      if (minutes <= 15) it.sets = Math.min(it.sets, 3);
      const perSet = workSeconds(it, ex) + it.rest;
      const fits = Math.floor(remaining / perSet);
      if (fits < 2 && main.items.length >= 2) { ctx.session.delete(ex.id); continue; }
      it.sets = Math.max(2, Math.min(it.sets, fits));
      main.items.push(it);
    }
    // Long sessions: add sets (up to 5) rather than piling on more exercises
    for (let pass = 0; pass < 2; pass++) {
      for (const it of main.items) {
        const ex = exMap[it.exId];
        const perSet = workSeconds(it, ex) + it.rest;
        if (it.sets < 5 && budget - reserve - used() >= perSet) it.sets++;
      }
    }
    if (wantsFinisher) {
      const remaining = budget - used();
      const items = [];
      for (const pattern of ['full', 'cardio', 'core']) {
        const ex = pick(pattern, 'finisher', ctx);
        if (ex) items.push({ ...makeItem(ex, opts), mode: 'time', duration: 30, rest: 15, sets: 1 });
      }
      if (items.length) {
        const roundT = items.reduce((s, it) => s + workSeconds(it, exMap[it.exId]) + it.rest, 0);
        const rounds = Math.max(1, Math.min(4, Math.floor(remaining / roundT)));
        if (remaining >= roundT) blocks.push({ id: uid('b'), kind: 'finisher', name: 'Finisher', format: 'circuit', rounds, roundRest: 0, items });
      }
    }
  }

  blocks.push({ id: uid('b'), kind: 'cooldown', name: 'Cool-Down', format: 'circuit', rounds: 1, roundRest: 0, items: cool });
  return { focus, blocks };
}

/** Turn a block template into a concrete day, applying weekly progression. */
function realize(template, { wib, block, deload, minutes, exMap, equipment }) {
  const blocks = template.blocks.map((b) => ({
    ...b,
    id: uid('b'),
    rounds: deload && b.format === 'circuit' && (b.kind === 'main' || b.kind === 'finisher') ? Math.max(1, b.rounds - 1) : b.rounds,
    items: b.items.map((it) => {
      const ex = exMap[it.exId];
      const n = { ...it, id: uid('i') };
      if (b.kind === 'main' || b.kind === 'finisher') {
        const steps = deload ? 0 : wib;
        if (n.mode === 'reps') {
          const step = isLoaded(ex) ? 1 : 2;
          n.reps = it.reps + steps * step + block * step;
        } else if (b.format === 'straight') {
          n.duration = it.duration + steps * 5 + block * 5;
        } else {
          // Intervals get denser: +5 s work, −5 s rest each week (same total time)
          const shift = Math.min(steps + block, Math.max(0, Math.floor((it.rest - 10) / 5)));
          n.duration = it.duration + shift * 5;
          n.rest = it.rest - shift * 5;
        }
        if (deload && b.format === 'straight') n.sets = Math.max(2, it.sets - 1);
      }
      return n;
    }),
  }));
  const day = { type: 'workout', focus: template.focus, minutes, blocks, deload };
  // Keep inside the time budget
  const budget = minutes * 60 * 1.1;
  const main = blocks.find((b) => b.kind === 'main' && b.format === 'straight');
  let guard = 20;
  while (estimateSeconds(day, exMap) > budget && guard-- > 0) {
    if (main && main.items.some((it) => it.sets > 2)) {
      const it = [...main.items].reverse().find((x) => x.sets > 2);
      it.sets--;
    } else if (main && main.items.length > 2) main.items.pop();
    else {
      const circ = blocks.find((b) => b.kind !== 'warmup' && b.kind !== 'cooldown' && b.format === 'circuit' && b.rounds > 1);
      if (circ) circ.rounds--; else break;
    }
  }
  day.title = titleFor(day, exMap, equipment);
  day.estSec = estimateSeconds(day, exMap);
  return day;
}

export function titleFor(day, exMap, equipment = []) {
  const focusName = FOCUS[day.focus]?.name || 'Workout';
  if (day.focus === 'recovery') return 'Mobility & Stretch';
  const counts = {};
  for (const b of day.blocks) {
    if (b.kind !== 'main' && b.kind !== 'finisher') continue;
    for (const it of b.items) for (const q of exMap[it.exId]?.equipment || []) counts[q] = (counts[q] || 0) + 1;
  }
  const order = ['kettlebell', 'dumbbells', 'bands', 'jump_rope', 'sliders', 'ab_wheel'];
  const top = order.filter((q) => counts[q]).sort((a, b) => counts[b] - counts[a])[0];
  const names = { kettlebell: 'Kettlebell', dumbbells: 'Dumbbell', bands: 'Band', jump_rope: 'Jump Rope', sliders: 'Slider', ab_wheel: 'Ab Wheel' };
  return `${top ? names[top] : 'Bodyweight'} · ${focusName}`;
}

function restDay(i) {
  return { type: 'rest', title: 'Rest Day', note: REST_NOTES[i % REST_NOTES.length] };
}

/* ---------- Public API ---------- */

/**
 * opts: { goal, level, weeks, startDate, equipment[], schedule[7] (minutes by weekday, 0 = rest), seed? }
 */
export function generatePlan(opts, exercises) {
  const exMap = indexExercises(exercises);
  const { goal, level, weeks, startDate, equipment, schedule } = opts;
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);

  // Training days in one 7-day window starting at startDate, in calendar order.
  const slots = [];
  for (let j = 0; j < 7; j++) {
    const m = schedule[dow(addDays(startDate, j))];
    if (m > 0) slots.push({ j, minutes: m });
  }
  const split = [...(SPLITS[goal] || SPLITS.balanced)[slots.length]].sort((a, b) => DEMAND[a] - DEMAND[b]);
  const byTime = [...slots].sort((a, b) => b.minutes - a.minutes);
  byTime.forEach((s, i) => { s.focus = split[i]; });

  const days = {};
  const templates = new Map();
  const weekUse = new Map();
  for (let w = 0; w < weeks; w++) {
    const block = Math.floor(w / 4);
    const wib = w % 4;
    const deload = weeks >= 4 && wib === 3 && w !== weeks - 1;
    if (!weekUse.has(block)) weekUse.set(block, new Map());
    let rests = 0;
    for (let j = 0; j < 7; j++) {
      const key = addDays(startDate, w * 7 + j);
      const slot = slots.find((s) => s.j === j);
      if (!slot) { days[key] = restDay(w + rests++); continue; }
      const tKey = `${block}:${j}`;
      if (!templates.has(tKey)) {
        templates.set(tKey, buildTemplate({
          focus: slot.focus, minutes: slot.minutes, goal, level, equipment, exercises, exMap,
          rng: mulberry32(seed + block * 977 + j * 131), week: weekUse.get(block),
        }));
      }
      days[key] = realize(templates.get(tKey), { wib, block, deload, minutes: slot.minutes, exMap, equipment });
    }
  }

  return {
    id: uid('p'),
    name: `${weeks}-Week ${GOALS[goal]?.label || ''} Plan`.replace('  ', ' '),
    createdAt: new Date().toISOString(),
    startDate, weeks, goal, level, equipment: [...equipment], schedule: [...schedule], seed,
    days,
  };
}

/** Build a fresh workout for one date using the plan's settings. */
export function regenerateDay(plan, key, exercises, { minutes, focus } = {}) {
  const exMap = indexExercises(exercises);
  const old = plan.days[key];
  const m = minutes ?? (old?.minutes || plan.schedule[dow(key)] || 30);
  const f = focus ?? (old?.focus || 'full');
  const t = buildTemplate({
    focus: f, minutes: m, goal: plan.goal, level: plan.level, equipment: plan.equipment, exercises, exMap,
    rng: mulberry32(Math.floor(Math.random() * 1e9)), week: new Map(),
  });
  return realize(t, { wib: 0, block: 0, deload: false, minutes: m, exMap, equipment: plan.equipment });
}

/** Exercises from `exercises` that can replace `source` (an exercise): same movement pattern first, then shared muscles. */
export function alternatives(source, exercises, equipment) {
  const ex = source;
  if (!ex) return [];
  return exercises
    .filter((e) => e.id !== ex.id && canDo(e, equipment))
    .map((e) => ({ e, score: (e.pattern === ex.pattern ? 10 : 0) + e.muscles.filter((m) => ex.muscles.includes(m)).length * 2 - Math.abs(e.level - ex.level) }))
    .filter((x) => x.score >= 4)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.e);
}

/** Expand a day into a linear list of steps for the workout player. */
export function flatten(day, exMap) {
  const steps = [];
  const blocks = day.blocks.filter((b) => b.items.length);
  let exerciseNo = 0;
  const exerciseTotal = blocks.reduce((s, b) => s + b.items.length, 0);
  blocks.forEach((b, bi) => {
    const lastBlock = bi === blocks.length - 1;
    const push = (it, extra) => {
      const ex = exMap[it.exId];
      steps.push({
        kind: 'work', exId: it.exId, name: ex?.name || it.exId, perSide: !!ex?.perSide,
        mode: it.mode, reps: it.reps, duration: it.duration, workSec: workSeconds(it, ex),
        block: b.name, blockKind: b.kind, ...extra,
      });
    };
    if (b.format === 'circuit') {
      const base = exerciseNo;
      for (let r = 1; r <= b.rounds; r++) {
        b.items.forEach((it, ii) => {
          push(it, { round: r, rounds: b.rounds, set: r, sets: b.rounds, exerciseNo: base + ii + 1, exerciseTotal, circuit: true });
          const lastInRound = ii === b.items.length - 1;
          const rest = lastInRound ? (r < b.rounds ? (b.roundRest || it.rest) : (lastBlock ? 0 : Math.max(15, it.rest))) : it.rest;
          if (rest > 0) steps.push({ kind: 'rest', sec: rest, long: lastInRound && r < b.rounds });
        });
      }
      exerciseNo += b.items.length;
    } else {
      b.items.forEach((it, ii) => {
        exerciseNo++;
        for (let s = 1; s <= it.sets; s++) {
          push(it, { set: s, sets: it.sets, exerciseNo, exerciseTotal });
          const last = lastBlock && ii === b.items.length - 1 && s === it.sets;
          if (!last && it.rest > 0) steps.push({ kind: 'rest', sec: it.rest });
        }
      });
    }
  });
  while (steps.length && steps[steps.length - 1].kind === 'rest') steps.pop();
  // Link each rest to the work that follows it
  for (let i = steps.length - 1, next = null; i >= 0; i--) {
    if (steps[i].kind === 'work') next = i; else steps[i].next = next;
  }
  return steps;
}

/** Fit an item to a different exercise (switching reps/time when the new move needs it). */
export function adaptItem(it, ex) {
  it.exId = ex.id;
  if (ex.type === 'time' && it.mode === 'reps') { it.mode = 'time'; it.duration = ex.defaults.duration ?? 30; }
  if (ex.type === 'reps' && it.mode === 'time' && it.duration > 60) { it.mode = 'reps'; it.reps = ex.defaults.reps ?? 10; }
  return it;
}

/** Replace oldId with newId in every workout from `fromKey` on that is not done. Returns how many workouts changed. */
export function replaceInPlan(plan, oldId, newId, { fromKey, isDone, exMap }) {
  let changed = 0;
  for (const [k, d] of Object.entries(plan.days)) {
    if (k < fromKey || d.type !== 'workout' || isDone(k)) continue;
    let hit = false;
    for (const b of d.blocks) for (const it of b.items) if (it.exId === oldId) { adaptItem(it, exMap[newId]); hit = true; }
    if (!hit) continue;
    changed++;
    d.estSec = estimateSeconds(d, exMap);
    if (!d.customTitle) d.title = titleFor(d, exMap, plan.equipment);
  }
  return changed;
}

/** Upcoming, not-done workouts that use an exercise. */
export function upcomingUses(plan, exId, { fromKey, isDone }) {
  if (!plan) return [];
  return Object.entries(plan.days)
    .filter(([k, d]) => k >= fromKey && d.type === 'workout' && !isDone(k) && d.blocks.some((b) => b.items.some((it) => it.exId === exId)))
    .map(([k]) => k);
}
