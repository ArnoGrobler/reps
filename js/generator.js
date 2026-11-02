// Plan generator.
// Every training number here comes from docs/programming-evidence.md (§ = section,
// [n] = reference). Main sources: ACSM position stands 2026 [1] and 2009 [2],
// Iversen et al. 2021 [27] on time-efficient training, and the published protocols
// in js/data/templates.js. Values labelled "practitioner" in the evidence file are
// sensible defaults without a direct trial.
//
// Structure: 4-week blocks. Exercises stay the same within a block so progress can be
// measured (§1 "Exercise rotation"); reps climb inside a rep range (double progression,
// §1 "Progression rule"); intermediate/advanced get a lighter 4th week (§1 "Deload").

import { addDays, dow } from './dates.js';
import { TEMPLATE } from './data/templates.js';

export const GOALS = {
  strength: { label: 'Strength', icon: 'dumbbell', desc: 'Heavier sets with longer rests. Builds strength and muscle.' },
  balanced: { label: 'Balanced', icon: 'activity', desc: 'Strength work in time-saving pairs, plus a short conditioning finisher.' },
  conditioning: { label: 'Conditioning', icon: 'flame', desc: 'Proven circuits and intervals for fitness and endurance.' },
};

export const LEVELS = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };

/** How heavy the user's weights feel (sets the rep range, §1 "Only one light kettlebell"). */
export const LOADS = {
  light: { label: 'Light', desc: 'I could lift them 20+ times' },
  moderate: { label: 'Moderate', desc: 'About 10–15 times' },
  heavy: { label: 'Heavy', desc: 'About 5–8 times' },
};

export const FOCUS = {
  full: { name: 'Full Body', patterns: ['squat', 'pull_h', 'hinge', 'push_h', 'lunge', 'push_v', 'core', 'carry'] },
  lower: { name: 'Lower Body', patterns: ['squat', 'hinge', 'lunge', 'hinge', 'core', 'carry', 'squat'] },
  upper: { name: 'Upper Body', patterns: ['push_h', 'pull_h', 'push_v', 'pull_h', 'pull_v', 'core', 'push_h'] },
  conditioning: { name: 'Conditioning', patterns: ['full', 'cardio', 'squat', 'core', 'hinge', 'push_h', 'lunge', 'cardio'] },
  core: { name: 'Core', patterns: ['core', 'core', 'core', 'core', 'core', 'core'] },
  recovery: { name: 'Mobility', patterns: ['mobility', 'stretch', 'mobility', 'stretch', 'mobility', 'stretch', 'mobility', 'stretch'] },
};

// Time-saving pairs: moves that do not compete for the same muscles (§1 "Time saver") [27][31].
const PAIRS = {
  full: [['squat', 'pull_h'], ['hinge', 'push_h'], ['lunge', 'push_v'], ['carry', 'core']],
  lower: [['squat', 'core'], ['hinge', 'core'], ['lunge', 'carry']],
  upper: [['push_h', 'pull_h'], ['push_v', 'pull_h'], ['pull_v', 'core']],
};

const SPLITS = {
  strength: [[], ['full'], ['full', 'full'], ['full', 'full', 'full'], ['lower', 'upper', 'lower', 'upper'],
    ['lower', 'upper', 'conditioning', 'lower', 'upper'], ['lower', 'upper', 'conditioning', 'lower', 'upper', 'core'],
    ['lower', 'upper', 'conditioning', 'lower', 'upper', 'core', 'recovery']],
  balanced: [[], ['full'], ['full', 'full'], ['full', 'conditioning', 'full'], ['lower', 'upper', 'conditioning', 'full'],
    ['lower', 'upper', 'conditioning', 'full', 'core'], ['lower', 'upper', 'conditioning', 'full', 'core', 'conditioning'],
    ['lower', 'upper', 'conditioning', 'full', 'core', 'conditioning', 'recovery']],
  conditioning: [[], ['conditioning'], ['full', 'conditioning'], ['conditioning', 'full', 'conditioning'],
    ['conditioning', 'full', 'conditioning', 'full'], ['conditioning', 'full', 'conditioning', 'core', 'full'],
    ['conditioning', 'full', 'conditioning', 'core', 'full', 'conditioning'],
    ['conditioning', 'full', 'conditioning', 'core', 'full', 'conditioning', 'recovery']],
};
const DEMAND = { lower: 0, upper: 0, full: 0, conditioning: 1, core: 2, recovery: 3 };

const REST_NOTES = [
  'Easy walk for 20–30 minutes, or full rest.',
  'Light stretching and mobility if you like. Sleep well tonight.',
  'Recover: hydrate, eat protein, keep moving gently.',
  'Rest day. Training the same muscles hard again needs about 48 hours.',
];

/* ---------- Evidence-based prescription (§1 summary table) ---------- */

// Circuit work/rest by level (§1 "Circuit work:rest") [45][55].
const CIRCUIT = {
  1: { work: 30, rest: 30, roundRest: 90 },
  2: { work: 40, rest: 20, roundRest: 60 },
  3: { work: 45, rest: 15, roundRest: 45 },
};
const TRANSITION = 10;          // between moves done on the spot (§1 "Transition") [44][45]
const EQUIP_TRANSITION = 15;    // when the next move needs different equipment
const PAIR_REST = 75;           // 60–90 s between paired moves (§1 "Time saver")
const SINGLE_JOINT = /curl|raise|fly|pushdown|extension|kickback|pull-apart|face-pull|pullover|calf/;
// Explosive moves are trained for crisp reps, not low-rep grinds (practitioner; swing protocols use 30 s / 10+ reps [55][62]).
const BALLISTIC = /swing|snatch|clean|jump|burpee|thruster/;

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

const isLoaded = (ex) => ex.equipment.some((q) => q === 'kettlebell' || q === 'dumbbells' || q === 'bands');
const isCompound = (ex) => !['core', 'cardio', 'mobility', 'stretch'].includes(ex.pattern) && !SINGLE_JOINT.test(ex.id);

/* ---------- Timing ---------- */

/**
 * Is the amount per side? Alternating moves (shoulder taps, dead bugs) count reps per side,
 * but a timed set is one block of time with no left/right halves.
 */
export function perSideAmount(item, ex) {
  return !!ex?.perSide && !item?.oneSide && !(ex.alternating && item?.mode === 'time');
}

export function workSeconds(item, ex) {
  const sides = perSideAmount(item, ex) ? 2 : 1;
  if (item.mode === 'time') return Math.round((item.duration || 30) * sides);
  return Math.max(6, Math.round((item.reps || 10) * (ex?.tempo || 3) * sides));
}

export function estimateSeconds(day, exMap) {
  if (!day || day.type !== 'workout') return 0;
  let t = 0;
  for (const b of day.blocks) {
    if (!b.items.length) continue;
    if (b.format === 'circuit') {
      const round = b.items.reduce((s, it) => s + workSeconds(it, exMap[it.exId]) + (it.rest || 0), 0);
      t += b.rounds * round + Math.max(0, b.rounds - 1) * Math.max(0, (b.roundRest || 0) - (b.items[b.items.length - 1].rest || 0));
    } else {
      for (const it of b.items) t += it.sets * workSeconds(it, exMap[it.exId]) + it.sets * (it.rest || 0);
    }
  }
  return t;
}

export function countExercises(day) {
  if (!day || day.type !== 'workout') return 0;
  return new Set(day.blocks.filter((b) => b.kind === 'main' || b.kind === 'finisher').flatMap((b) => b.items.map((i) => i.exId))).size;
}

/* ---------- Prescription ---------- */

/** Rep range [low, high] for a move (§1 "Reps per set"). */
export function repRange(ex, { goal = 'balanced', level = 2, load = 'moderate' } = {}) {
  if (!isLoaded(ex)) {
    // Bodyweight: start from the move's own sensible default and allow ~50% more.
    const d = Math.max(4, (ex.defaults.reps ?? 10) - (level === 1 ? 2 : 0));
    return [d, Math.round(d * 1.5)];
  }
  if (BALLISTIC.test(ex.id)) return load === 'light' ? [15, 25] : [10, 15];
  if (load === 'light') return goal === 'strength' ? [12, 20] : [15, 25];       // light equipment: high reps near failure [10–14][27]
  if (goal === 'conditioning') return [12, 20];                                 // endurance 15–25 (consensus) [2][3]
  if (goal === 'strength') {
    if (level === 1 || !isCompound(ex)) return [8, 12];                         // beginners 8–12 [2]
    return load === 'heavy' ? [5, 8] : [6, 10];                                 // heavy loads ≤8 reps give most strength [1][2]
  }
  return [8, 12];                                                               // balanced / muscle growth [1][27]
}

/** Sets per exercise (§1 "Sets per exercise") [1][2]. */
function setsFor(ex, { goal, level }) {
  if (goal === 'strength') return level === 1 ? 2 : level === 2 ? 3 : (isCompound(ex) ? 4 : 3);
  return level === 1 ? 2 : 3;
}

/** Rest between sets in seconds (§1 "Rest between sets") [2][5][6][9][27]. */
function restFor(ex, { goal, level, load }) {
  if (ex.pattern === 'core' || ex.pattern === 'carry' || !isCompound(ex)) {
    return goal === 'strength' ? 75 : goal === 'conditioning' ? 45 : 60;        // single-joint & core: 60–90 s
  }
  if (goal === 'conditioning' || load === 'light') return 75;                   // 15–25 rep sets: 60–120 s
  if (goal === 'strength') return level === 1 ? 90 : 150;                       // loaded multi-joint: 90 / 120–180 s
  return 90;                                                                    // balanced: 75–90 s
}

/** Create a prescription for an exercise added by hand or by the generator. */
export function makeItem(ex, { goal = 'balanced', level = 2, load = 'moderate', kind = 'main' } = {}) {
  const item = { id: uid('i'), exId: ex.id, mode: ex.type === 'time' ? 'time' : 'reps', sets: 1, reps: 10, duration: 30, rest: TRANSITION };
  if (kind === 'warmup') {
    // 30–45 s dynamic moves with 10 s transitions (§1 "Warm-up") [27][45]
    if (item.mode === 'time') item.duration = 35; else item.reps = Math.min(ex.defaults.reps ?? 10, 10);
    return item;
  }
  if (kind === 'cooldown') {
    // Optional; 30 s holds, 10 s to change position (§1 "Cool-down") [3]
    item.mode = 'time';
    item.duration = 30;
    return item;
  }
  const range = repRange(ex, { goal, level, load });
  item.range = range;
  item.reps = range[0];
  item.duration = Math.max(20, (ex.defaults.duration ?? 30) - (level === 1 ? 5 : 0) + (level === 3 ? 10 : 0));
  item.sets = setsFor(ex, { goal, level });
  item.rest = restFor(ex, { goal, level, load });
  return item;
}

/** Effort guidance for a day (§1 "Effort per set") [1][14–18]. */
export function effortFor({ level, load, deload, week, focus, circuit = false }) {
  if (focus === 'recovery') return { short: 'Easy, relaxed effort', text: 'Move gently through each position. This is recovery, not training.' };
  if (deload) return { short: 'Stop 3–4 reps early', text: 'Deload week: same exercises, fewer sets. Stop each set 3–4 reps before failure.' };
  if (level === 1 && week < 2) return { short: 'Easy to moderate effort', text: 'Learning weeks: easy to moderate effort while you get the form right. Sets and rounds start low and build up over the first weeks.' };
  if (focus === 'conditioning' || focus === 'core' || circuit) return { short: 'Hard but steady pace', text: 'Work at a hard pace you can hold for every interval, with good form.' };
  if (load === 'light') return { short: 'Leave 0–2 reps in the tank', text: 'Your weights are light, so take each set close to failure: 0–2 reps left.' };
  return { short: 'Leave 1–3 reps in the tank', text: 'Finish each set with 1–3 reps left in the tank. Training to failure is not needed.' };
}

/* ---------- Exercise selection ---------- */

function chooser(exercises, { equipment, level, rng }) {
  const preferred = equipment.filter((q) => q !== 'bodyweight');
  return function pick(pattern, role, ctx) {
    const usable = (relaxLevel, relaxRole) => exercises.filter((e) =>
      e.pattern === pattern &&
      (relaxRole || e.roles.includes(role)) &&
      canDo(e, equipment) &&
      e.level <= (relaxLevel ? 3 : level) &&
      !ctx.session.has(e.id));
    let list = usable(false, false);
    if (!list.length) list = usable(true, false);
    if (!list.length) list = usable(false, true);
    if (!list.length) list = usable(true, true);
    if (!list.length) return null;
    let best = null, bestScore = -Infinity;
    for (const e of list) {
      let score = rng() * 1.2;
      if (role === 'main' && preferred.length && e.equipment.some((q) => preferred.includes(q))) {
        score += 2.2;
        const least = Math.min(...preferred.map((q) => ctx.equipUse[q] || 0));
        if (e.equipment.some((q) => preferred.includes(q) && (ctx.equipUse[q] || 0) === least)) score += 0.8;
      }
      if (role === 'main' && isCompound(e)) score += 0.6;   // multi-joint moves first [1][2]
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

/** Order cool-down holds kneeling → lying → final rest, so you only get down to the floor once. */
function sortFlow(items, exMap) {
  return items.sort((a, b) => (exMap[a.exId]?.flow ?? 99) - (exMap[b.exId]?.flow ?? 99));
}

/**
 * Plans made before the yoga cool-downs: swap the plain stretches in upcoming, not-done cool-downs
 * for yoga holds. Seeded by date, so every device makes the same swap. Returns how many days changed.
 */
export function yogaCooldowns(plan, exercises, { fromKey, isDone }) {
  const exMap = indexExercises(exercises);
  const equipment = plan.equipment || ['bodyweight'];
  const pool = exercises.filter((e) => e.yoga && e.pattern === 'stretch' && e.roles.includes('cooldown') && canDo(e, equipment));
  let changed = 0;
  for (const [k, d] of Object.entries(plan.days)) {
    if (k < fromKey || d.type !== 'workout' || isDone(k)) continue;
    const b = d.blocks.find((x) => x.kind === 'cooldown');
    if (!b || b.items.every((it) => exMap[it.exId]?.yoga)) continue;
    const rng = mulberry32([...k].reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
    const used = new Set(b.items.map((it) => it.exId));
    for (const it of b.items) {
      if (exMap[it.exId]?.yoga) continue;
      const options = pool.filter((e) => !used.has(e.id) && e.level <= (plan.level || 2));
      if (!options.length) break;
      const ex = options[Math.floor(rng() * options.length)];
      used.add(ex.id);
      it.exId = ex.id;
      it.mode = 'time';
    }
    sortFlow(b.items, exMap);
    d.estSec = estimateSeconds(d, exMap);
    changed++;
  }
  return changed;
}

/** Rest after a circuit move: at least 15 s if the next move needs different equipment. */
function withTransitions(items, exMap) {
  items.forEach((it, i) => {
    const next = items[(i + 1) % items.length];
    const a = exMap[it.exId]?.equipment.join() || '';
    const b = exMap[next?.exId]?.equipment.join() || '';
    if (a !== b) it.rest = Math.max(it.rest, EQUIP_TRANSITION);
  });
  return items;
}

/* ---------- Session templates ---------- */

const blockOf = (fields) => ({ id: uid('b'), rounds: 1, roundRest: 0, ...fields, items: (fields.items || []).map((it) => ({ id: uid('i'), sets: 1, ...it })) });

function buildTemplate({ focus, minutes, goal, level, load, equipment, exercises, exMap, rng, week, slot }) {
  const pick = chooser(exercises, { equipment, level, rng });
  const pickYoga = chooser(exercises.filter((e) => e.yoga), { equipment, level, rng });
  const ctx = { session: new Set(), week, equipUse: {} };
  const budget = minutes * 60;
  const opts = { goal, level, load };
  const allowed = new Set(exercises.map((e) => e.id));
  const blocks = [];

  if (focus === 'recovery') {
    const items = [];
    for (let i = 0, t = 0; t < budget - 30 && i < 16; i++) {
      const ex = pick(FOCUS.recovery.patterns[i % 8], i % 2 ? 'cooldown' : 'warmup', ctx);
      if (!ex) continue;
      const it = { ...makeItem(ex, { ...opts, kind: 'cooldown' }), duration: 40 };
      items.push(it);
      t += workSeconds(it, ex) + it.rest;
    }
    blocks.push(blockOf({ kind: 'main', name: 'Mobility Flow', format: 'circuit', items }));
    return { focus, blocks };
  }

  // Warm-up: 3 to 5 min, at least 5 before sessions of 30+ min (§1 "Warm-up") [27]
  const warmSec = minutes <= 15 ? 180 : minutes < 30 ? 240 : 300;
  // Cool-down: optional, skipped on short days (§1 "Cool-down") [3][27][36–39]
  const coolSec = minutes <= 20 ? 0 : minutes < 40 ? 120 : 180;

  const warm = [];
  const warmPatterns = ['cardio', 'mobility', 'cardio', 'mobility', 'cardio', 'mobility', 'cardio', 'mobility'];
  for (let i = 0, t = 0; t < warmSec - 20 && i < 8 && warm.length < 6; i++) {   // 4–6 moves
    const ex = pick(warmPatterns[i], 'warmup', ctx);
    if (!ex) continue;
    const it = makeItem(ex, { ...opts, kind: 'warmup' });
    warm.push(it);
    t += workSeconds(it, ex) + it.rest;
  }
  // Cool-down holds come from the yoga poses (pigeon, happy baby, bridge, Katonah-style restoratives),
  // falling back to plain stretches only if those are hidden or used up
  const cool = [];
  for (let i = 0, t = 0; t < coolSec - 20 && i < 6; i++) {
    const ex = pickYoga('stretch', 'cooldown', ctx) || pick('stretch', 'cooldown', ctx);
    if (!ex) break;
    const it = makeItem(ex, { ...opts, kind: 'cooldown' });
    cool.push(it);
    t += workSeconds(it, ex) + it.rest;
  }
  sortFlow(cool, exMap);
  const warmBlock = blockOf({ kind: 'warmup', name: 'Warm-Up', format: 'circuit', items: warm });
  const coolBlock = blockOf({ kind: 'cooldown', name: 'Cool-Down (optional)', format: 'circuit', optional: true, items: cool });
  const fixed = () => estimateSeconds({ type: 'workout', blocks: [warmBlock, coolBlock] }, exMap);
  const used = () => fixed() + estimateSeconds({ type: 'workout', blocks }, exMap);

  if (focus === 'conditioning' && conditioningFromProtocol({ blocks, budget, used, level, equipment, allowed, exMap, slot, exercises })) {
    // proven protocol placed
  } else if (focus === 'conditioning' || focus === 'core' || (goal === 'conditioning' && focus === 'full')) {
    genericCircuits({ blocks, focus, budget, used, level, opts, pick, ctx, exMap });
  } else if (minutes <= 30) {
    pairedStrength({ blocks, focus, budget, used, opts, pick, ctx, exMap, level });
  } else {
    straightStrength({ blocks, focus, budget, used, opts, pick, ctx, exMap, level, goal, minutes });
  }

  // One lighter ramp-up set of the first loaded move (§1 "Warm-up") [27]
  const firstMain = blocks.find((b) => b.kind === 'main')?.items[0];
  if (firstMain && exMap[firstMain.exId] && isLoaded(exMap[firstMain.exId]) && firstMain.mode === 'reps') {
    warmBlock.items.push({ id: uid('i'), exId: firstMain.exId, mode: 'reps', reps: 6, sets: 1, rest: 30, ramp: true });
  }

  const standalone = blocks.some((b) => b.standalone);
  const out = standalone ? blocks : [warmBlock, ...blocks, ...(cool.length ? [coolBlock] : [])];
  return { focus, blocks: out };
}

/** Conditioning days use proven protocols where they fit (§2) [44–56]. */
function conditioningFromProtocol({ blocks, budget, used, level, equipment, allowed, exMap, slot, exercises }) {
  const has = (ids) => ids.every((id) => allowed.has(id));
  const left = budget - used();
  const tpl = (id, args) => TEMPLATE[id].build({ level, exMap, ...args }).map((b) => blockOf(b));

  // 10–14 min: the 11-minute 5BX session replaces warm-up and cool-down (§1 "Short session") [54]
  if (budget <= 14 * 60 && has(['jumping-jacks', 'high-knees', 'burpee', 'mountain-climber', 'jumping-lunge', 'reverse-lunge', 'jump-squat', 'bodyweight-squat'])) {
    const bs = tpl('five-bx');
    bs.forEach((b) => { b.standalone = true; });
    blocks.push(...bs);
    return true;
  }
  // Kettlebell swing intervals on alternate conditioning days (§2.4) [55]
  if (equipment.includes('kettlebell') && level >= 2 && slot % 2 === 1 && has(['kb-swing']) && left >= TEMPLATE['kb-swing-intervals'].roundSec) {
    blocks.push(...tpl('kb-swing-intervals'));
    const rest = budget - used();
    if (rest >= 9 * 60 && has(sevenMinuteIds())) addSevenMinute(blocks, budget, used, level, tpl);
    return true;
  }
  // Otherwise the 7-minute circuit, 1–5 circuits by time and level (§2.1) [44–47]
  if (has(sevenMinuteIds()) && left >= 9 * 60 && (slot % 2 === 0 || !equipment.some((q) => q !== 'bodyweight'))) {
    addSevenMinute(blocks, budget, used, level, tpl);
    return true;
  }
  void exercises;
  return false;
}

const sevenMinuteIds = () => ['jumping-jacks', 'wall-sit', 'push-up', 'knee-push-up', 'bicycle-crunch', 'reverse-lunge', 'bodyweight-squat', 'diamond-push-up', 'plank', 'high-knees', 'split-squat', 'shoulder-taps', 'side-plank'];

function addSevenMinute(blocks, budget, used, level, tpl) {
  const roundT = TEMPLATE['seven-minute'].roundSec + 60;
  const max = Math.max(1, Math.min(level === 1 ? 4 : 5, Math.floor((budget * 1.1 - used() + 60) / roundT)));
  const [b] = tpl('seven-minute', { rounds: max });
  b.maxRounds = max;
  b.progressRounds = true;
  blocks.push(b);
}

/** Generic circuits with level-based work/rest (§1 "Circuit work:rest", "Rounds per circuit") [45][46][55]. */
function genericCircuits({ blocks, focus, budget, used, level, opts, pick, ctx, exMap }) {
  const { work, rest, roundRest } = CIRCUIT[level];
  const per = 4;
  const roughRound = per * (work + rest) + roundRest;
  const total = Math.max(1, Math.floor((budget - used() + roundRest) / roughRound));
  const maxRounds = level === 1 ? 3 : level === 2 ? 4 : 5;
  const nCircuits = Math.max(1, Math.min(3, Math.ceil(total / maxRounds)));
  const roundsEach = Math.max(1, Math.min(maxRounds, Math.floor(total / nCircuits)));
  for (let ci = 0; ci < nCircuits; ci++) {
    const items = [];
    for (let i = 0; i < per; i++) {
      const pattern = FOCUS[focus].patterns[(ci * per + i) % FOCUS[focus].patterns.length];
      const ex = pick(pattern, focus === 'core' ? 'main' : 'finisher', ctx) || pick(pattern, 'main', ctx);
      if (!ex) continue;
      items.push({ ...makeItem(ex, opts), mode: 'time', duration: work, rest, sets: 1 });
    }
    if (!items.length) break;
    withTransitions(items, exMap);
    const b = blockOf({ kind: 'main', name: `Circuit ${String.fromCharCode(65 + ci)}`, format: 'circuit', rounds: roundsEach, roundRest, items });
    const fit = Math.floor((budget - used() + roundRest) / Math.max(1, estimateSeconds({ type: 'workout', blocks: [{ ...b, rounds: 1 }] }, exMap) + roundRest));
    b.rounds = Math.max(1, Math.min(roundsEach, fit));
    b.maxRounds = b.rounds;
    b.progressRounds = true;
    if (fit < 1 && ci > 0) break;
    blocks.push(b);
  }
}

/** Sessions of 30 min or less: alternating pairs (§1 "Time saver", "Short session") [27][31]. */
function pairedStrength({ blocks, focus, budget, used, opts, pick, ctx, exMap, level }) {
  const pairs = PAIRS[focus] || PAIRS.full;
  for (let p = 0; p < pairs.length; p++) {
    const left = budget - used();
    if (left < 150) break;
    const items = pairs[p].map((pattern) => pick(pattern, 'main', ctx)).filter(Boolean).map((ex) => ({ ...makeItem(ex, opts), rest: PAIR_REST }));
    if (!items.length) continue;
    const sets = Math.max(...items.map((it) => it.sets));
    const b = blockOf({ kind: 'main', name: `Pair ${String.fromCharCode(65 + blocks.length)}`, format: 'circuit', pair: true, rounds: sets, roundRest: PAIR_REST, items });
    const cost = estimateSeconds({ type: 'workout', blocks: [b] }, exMap);
    if (cost > left) {
      const perRound = cost / b.rounds;
      const fits = Math.floor(left / perRound);
      if (fits < 1 || (fits < 2 && blocks.length >= 2)) { items.forEach((it) => ctx.session.delete(it.exId)); break; }
      b.rounds = Math.max(1, fits);
    }
    blocks.push(b);
  }
  // Spare time: one more set per pair, up to 3 (4 for advanced) [1]
  const cap = level === 3 ? 4 : 3;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of blocks.filter((x) => x.pair)) {
      const perRound = estimateSeconds({ type: 'workout', blocks: [{ ...b, rounds: 1 }] }, exMap) + PAIR_REST;
      if (b.rounds < cap && budget * 1.05 - used() >= perRound) b.rounds++;
    }
  }
}

/** Longer sessions: straight sets with full rests, multi-joint moves first (§1 "Exercise order") [1][2]. */
function straightStrength({ blocks, focus, budget, used, opts, pick, ctx, exMap, level, goal, minutes }) {
  const main = blockOf({ kind: 'main', name: 'Strength', format: 'straight', items: [] });
  blocks.push(main);
  const wantsFinisher = goal === 'balanced' && minutes >= 30;
  const reserve = wantsFinisher ? Math.min(360, budget * 0.18) : 0;
  const patterns = FOCUS[focus].patterns;
  const maxItems = 6;
  for (let i = 0; i < patterns.length * 2 && main.items.length < maxItems; i++) {
    const left = budget - reserve - used();
    if (left < 120) break;
    const ex = pick(patterns[i % patterns.length], 'main', ctx);
    if (!ex) continue;
    const it = makeItem(ex, opts);
    const perSet = workSeconds(it, ex) + it.rest;
    const fits = Math.floor(left / perSet);
    if (fits < 2 && main.items.length >= 2) { ctx.session.delete(ex.id); continue; }
    it.sets = Math.max(1, Math.min(it.sets, fits));
    main.items.push(it);
  }
  // Multi-joint first, single-joint and core last [1][2]
  main.items.sort((a, b) => Number(isCompound(exMap[b.exId])) - Number(isCompound(exMap[a.exId])));
  // Spare time: add a set (up to 4) to the main lifts rather than more exercises (strength flattens beyond 2–3 sets [1])
  const cap = level === 3 ? 4 : 3;
  for (const it of main.items) {
    const perSet = workSeconds(it, exMap[it.exId]) + it.rest;
    if (it.sets < cap && isCompound(exMap[it.exId]) && budget - reserve - used() >= perSet) it.sets++;
  }
  if (wantsFinisher) {
    const { work, rest } = CIRCUIT[level];
    const items = [];
    for (const pattern of ['full', 'cardio', 'core']) {
      const ex = pick(pattern, 'finisher', ctx);
      if (ex) items.push({ ...makeItem(ex, opts), mode: 'time', duration: Math.min(work, 30), rest: Math.max(rest, 15), sets: 1 });
    }
    if (items.length) {
      withTransitions(items, exMap);
      const b = blockOf({ kind: 'finisher', name: 'Finisher', format: 'circuit', rounds: 1, roundRest: 30, items });
      const roundT = estimateSeconds({ type: 'workout', blocks: [b] }, exMap);
      const rounds = Math.max(1, Math.min(level === 1 ? 2 : 3, Math.floor((budget - used()) / roundT)));
      if (budget - used() >= roundT) { b.rounds = rounds; b.maxRounds = rounds; blocks.push(b); }
    }
  }
}

/** Turn a block template into a concrete day, applying progression for this week. */
function realize(template, { w, wib, block, deload, minutes, exMap, equipment, level, load }) {
  const blocks = template.blocks.map((b) => {
    const nb = { ...b, id: uid('b') };
    const training = b.kind === 'main' || b.kind === 'finisher';
    if (training && b.format === 'circuit' && !b.pair) {
      if (b.progressRounds && b.maxRounds) {
        // Beginners and the 7-minute circuit: start small and add a round every 2 weeks (§2.1) [45]
        // Beginners start one round below their maximum and add a round every 2 weeks [45]
        const start = level === 1 ? Math.max(1, b.maxRounds - 1) : b.maxRounds;
        nb.rounds = Math.min(b.maxRounds, start + Math.floor(w / 2));
      }
      if (deload) nb.rounds = Math.max(1, Math.round(nb.rounds * 0.6));
    }
    if (training && b.pair && deload) nb.rounds = Math.max(1, Math.round(b.rounds * 0.6));
    nb.items = b.items.map((it) => {
      const ex = exMap[it.exId];
      const n = { ...it, id: uid('i') };
      if (!training) return n;
      const steps = deload ? 0 : wib;
      if (n.mode === 'reps' && it.range) {
        // Double progression: +1 rep a week (bodyweight +2) up to the top of the range (§1 "Progression rule") [2][43]
        const step = isLoaded(ex) ? 1 : 2;
        n.reps = Math.min(it.range[1], it.range[0] + steps * step);
        n.atTop = n.reps >= it.range[1];
      } else if (n.mode === 'time' && b.format === 'straight') {
        n.duration = it.duration + Math.min(15, steps * 5);
      } else if (b.format === 'circuit' && !b.protocol && !b.pair) {
        if (level === 1) {
          // Beginners: 30/30, then 30/20 from week 3 (§1 "Circuit work:rest") [45]
          if (w >= 2) n.rest = Math.max(TRANSITION, Math.min(it.rest, 20));
        } else {
          // Denser intervals: +5 s work, −5 s rest each week, same total time (practitioner) [2][45]
          const shift = Math.min(steps, Math.max(0, Math.floor((it.rest - 10) / 5)));
          n.duration = it.duration + shift * 5;
          n.rest = it.rest - shift * 5;
        }
      }
      if (deload && b.format === 'straight') n.sets = Math.max(1, Math.round(it.sets * 0.6));   // cut sets by about a third to a half [40–42]
      return n;
    });
    return nb;
  });
  const day = { type: 'workout', focus: template.focus, minutes, blocks, deload };
  // Keep inside the time budget
  const budget = minutes * 60 * 1.1;
  let guard = 30;
  while (estimateSeconds(day, exMap) > budget && guard-- > 0) {
    const straight = blocks.find((b) => b.kind === 'main' && b.format === 'straight');
    const shrinkable = blocks.filter((b) => (b.kind === 'main' || b.kind === 'finisher') && b.format === 'circuit' && b.rounds > 1);
    if (straight && straight.items.some((it) => it.sets > 1)) {
      const it = [...straight.items].reverse().find((x) => x.sets > 1);
      it.sets--;
    } else if (shrinkable.length) shrinkable[shrinkable.length - 1].rounds--;
    else if (straight && straight.items.length > 2) straight.items.pop();
    else break;
  }
  const circuit = !blocks.some((b) => b.kind === 'main' && (b.format === 'straight' || b.pair));
  const effort = effortFor({ level, load, deload, week: w, focus: template.focus, circuit });
  day.effort = effort.text;
  day.effortShort = effort.short;
  day.title = titleFor(day, exMap, equipment);
  day.estSec = estimateSeconds(day, exMap);
  return day;
}

export function titleFor(day, exMap, equipment = []) {
  const protocol = day.blocks.find((b) => b.protocol)?.protocol;
  if (protocol && TEMPLATE[protocol]) return TEMPLATE[protocol].name;
  if (day.focus === 'recovery') return 'Mobility & Stretch';
  const focusName = FOCUS[day.focus]?.name || 'Workout';
  const counts = {};
  for (const b of day.blocks) {
    if (b.kind !== 'main' && b.kind !== 'finisher') continue;
    for (const it of b.items) for (const q of exMap[it.exId]?.equipment || []) counts[q] = (counts[q] || 0) + 1;
  }
  const order = ['kettlebell', 'dumbbells', 'bands', 'jump_rope', 'sliders', 'ab_wheel'];
  const top = order.filter((q) => counts[q]).sort((a, b) => counts[b] - counts[a])[0];
  const names = { kettlebell: 'Kettlebell', dumbbells: 'Dumbbell', bands: 'Band', jump_rope: 'Jump Rope', sliders: 'Slider', ab_wheel: 'Ab Wheel' };
  void equipment;
  return `${top ? names[top] : 'Bodyweight'} · ${focusName}`;
}

function restDay(i) {
  return { type: 'rest', title: 'Rest Day', note: REST_NOTES[i % REST_NOTES.length] };
}

/* ---------- Public API ---------- */

/**
 * opts: { goal, level, load, weeks, startDate, equipment[], schedule[7] (minutes by weekday, 0 = rest), seed? }
 */
export function generatePlan(opts, exercises) {
  const exMap = indexExercises(exercises);
  const { goal, level, weeks, startDate, equipment, schedule } = opts;
  const load = opts.load || 'moderate';
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);

  const slots = [];
  for (let j = 0; j < 7; j++) {
    const m = schedule[dow(addDays(startDate, j))];
    if (m > 0) slots.push({ j, minutes: m });
  }
  const split = [...(SPLITS[goal] || SPLITS.balanced)[slots.length]].sort((a, b) => DEMAND[a] - DEMAND[b]);
  const byTime = [...slots].sort((a, b) => b.minutes - a.minutes);
  byTime.forEach((s, i) => { s.focus = split[i]; });
  let condCount = 0;
  slots.forEach((s) => { if (s.focus === 'conditioning') s.condIndex = condCount++; });

  const days = {};
  const templates = new Map();
  const weekUse = new Map();
  for (let w = 0; w < weeks; w++) {
    const block = Math.floor(w / 4);
    const wib = w % 4;
    // Deload every 4th week for intermediate/advanced, never the final week; optional for beginners [40–42]
    const deload = level >= 2 && weeks >= 4 && wib === 3 && w !== weeks - 1;
    if (!weekUse.has(block)) weekUse.set(block, new Map());
    let rests = 0;
    for (let j = 0; j < 7; j++) {
      const key = addDays(startDate, w * 7 + j);
      const slot = slots.find((s) => s.j === j);
      if (!slot) { days[key] = restDay(w + rests++); continue; }
      const tKey = `${block}:${j}`;
      if (!templates.has(tKey)) {
        templates.set(tKey, buildTemplate({
          focus: slot.focus, minutes: slot.minutes, goal, level, load, equipment, exercises, exMap,
          rng: mulberry32(seed + block * 977 + j * 131), week: weekUse.get(block), slot: (slot.condIndex ?? 0) + block,
        }));
      }
      days[key] = realize(templates.get(tKey), { w, wib, block, deload, minutes: slot.minutes, exMap, equipment, level, load });
    }
  }

  return {
    id: uid('p'),
    name: `${weeks}-Week ${GOALS[goal]?.label || ''} Plan`.replace('  ', ' '),
    createdAt: new Date().toISOString(),
    startDate, weeks, goal, level, load, equipment: [...equipment], schedule: [...schedule], seed,
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
    focus: f, minutes: m, goal: plan.goal, level: plan.level, load: plan.load || 'moderate', equipment: plan.equipment, exercises, exMap,
    rng: mulberry32(Math.floor(Math.random() * 1e9)), week: new Map(), slot: Math.floor(Math.random() * 4),
  });
  return realize(t, { w: 0, wib: 0, block: 0, deload: false, minutes: m, exMap, equipment: plan.equipment, level: plan.level, load: plan.load || 'moderate' });
}

/** A proven workout (js/data/templates.js) as a full day, with the standard warm-up where the protocol has none. */
export function templateDay(templateId, plan, exercises, { minutes } = {}) {
  const exMap = indexExercises(exercises);
  const tpl = TEMPLATE[templateId];
  const level = plan?.level || 2;
  const equipment = plan?.equipment || ['bodyweight'];
  const opts = { goal: plan?.goal || 'balanced', level, load: plan?.load || 'moderate' };
  const pick = chooser(exercises, { equipment, level, rng: Math.random });
  const ctx = { session: new Set(), week: new Map(), equipUse: {} };
  const choose = (pattern) => { const ex = pick(pattern, 'main', ctx); return ex ? makeItem(ex, opts) : null; };
  const main = tpl.build({ level, exMap, choose, rounds: tpl.progressRounds ? 1 : undefined, variant: Math.floor(Math.random() * 4) }).map((b) => blockOf(b));
  let blocks = main;
  if (!tpl.standalone) {
    const warm = [];
    const wctx = { session: new Set(), week: new Map(), equipUse: {} };
    for (let i = 0, t = 0; t < 160 && i < 6; i++) {
      const ex = pick(i % 2 ? 'mobility' : 'cardio', 'warmup', wctx);
      if (!ex) continue;
      const it = makeItem(ex, { ...opts, kind: 'warmup' });
      warm.push(it);
      t += workSeconds(it, ex) + it.rest;
    }
    blocks = [blockOf({ kind: 'warmup', name: 'Warm-Up', format: 'circuit', items: warm }), ...main];
  }
  const day = { type: 'workout', focus: templateId === 'minimal-strength' ? 'full' : 'conditioning', minutes: minutes || Math.ceil((tpl.roundSec + 200) / 60), blocks, deload: false, template: templateId };
  const effort = effortFor({ level, load: opts.load, deload: false, week: 4, focus: day.focus });
  day.effort = effort.text;
  day.effortShort = effort.short;
  day.title = tpl.name;
  day.customTitle = true;
  day.estSec = estimateSeconds(day, exMap);
  return day;
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

/** Weekly hard sets per movement region for a week of a plan (§1 "Hard sets per region") [1][27]. */
export function weeklySets(plan, weekStartKey, exMap) {
  const REGION = { squat: 'lowerPush', lunge: 'lowerPush', hinge: 'lowerPull', push_h: 'upperPush', push_v: 'upperPush', pull_h: 'upperPull', pull_v: 'upperPull' };
  const out = { upperPush: 0, upperPull: 0, lowerPush: 0, lowerPull: 0 };
  for (let i = 0; i < 7; i++) {
    const d = plan.days[addDays(weekStartKey, i)];
    if (!d || d.type !== 'workout') continue;
    for (const b of d.blocks) {
      if (b.kind !== 'main' && b.kind !== 'finisher') continue;
      for (const it of b.items) {
        const ex = exMap[it.exId];
        if (!ex) continue;
        const sets = b.format === 'circuit' ? b.rounds : it.sets;
        const r = REGION[ex.pattern];
        if (r) out[r] += sets;
        else if (ex.pattern === 'full') { out.lowerPush += sets / 2; out.upperPush += sets / 2; }
      }
    }
  }
  return out;
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
        kind: 'work', exId: it.exId, name: ex?.name || it.exId, perSide: perSideAmount(it, ex), alternating: !!ex?.alternating, oneSide: !!it.oneSide,
        mode: it.mode, reps: it.reps, duration: it.duration, workSec: workSeconds(it, ex), ramp: !!it.ramp, atTop: !!it.atTop,
        block: b.name, blockKind: b.kind, pair: !!b.pair, ...extra,
      });
    };
    const restStep = (sec, { long = false, between = false } = {}) => {
      const label = b.restLabel || (long ? 'Round Rest' : between || sec <= 20 ? 'Transition' : 'Rest');
      steps.push({ kind: 'rest', sec, long, label, active: !!b.restLabel });
    };
    if (b.format === 'circuit') {
      const base = exerciseNo;
      for (let r = 1; r <= b.rounds; r++) {
        b.items.forEach((it, ii) => {
          push(it, { round: r, rounds: b.rounds, set: r, sets: b.rounds, exerciseNo: base + ii + 1, exerciseTotal, circuit: !b.pair });
          const lastInRound = ii === b.items.length - 1;
          const finalStep = lastInRound && r === b.rounds;
          let rest;
          if (!lastInRound) rest = it.rest;
          else if (r < b.rounds) rest = Math.max(b.roundRest || 0, it.rest || 0);
          else rest = lastBlock ? (b.restLabel ? it.rest : 0) : Math.max(20, it.rest || 0);
          if (rest > 0) restStep(rest, { long: lastInRound && r < b.rounds && (b.roundRest || 0) > (it.rest || 0), between: finalStep && !lastBlock && rest <= 20 });
        });
      }
      exerciseNo += b.items.length;
    } else {
      b.items.forEach((it, ii) => {
        exerciseNo++;
        for (let s = 1; s <= it.sets; s++) {
          push(it, { set: s, sets: it.sets, exerciseNo, exerciseTotal });
          const last = lastBlock && ii === b.items.length - 1 && s === it.sets;
          if (!last && it.rest > 0) restStep(it.rest);
        }
      });
    }
  });
  // Drop trailing plain rests (keep an active recovery like "Walk on the spot")
  while (steps.length && steps[steps.length - 1].kind === 'rest' && !steps[steps.length - 1].active) steps.pop();
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
