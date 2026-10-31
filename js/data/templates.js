// Proven workouts from published studies and well-known programmes.
// Sources, structure and evidence level: docs/programming-evidence.md §2.
// Exercises Reps does not have (chair step-ups and dips) are swapped for the closest
// small-equipment move, and each swap is stated in `adapted`.

export const EVIDENCE_LABEL = {
  tested: 'Tested in trials',
  reviews: 'Built from research reviews',
  practitioner: 'Coaching programme, not tested in trials',
};

/** item helper: timed work with a rest/transition after it */
const t = (exId, duration, rest, extra = {}) => ({ exId, mode: 'time', duration, rest, sets: 1, ...extra });

export const TEMPLATES = [
  {
    id: 'seven-minute',
    name: '7-Minute Circuit',
    evidence: 'tested',
    equipment: ['bodyweight'],
    minLevel: 1,
    suits: 'Beginner to intermediate · conditioning',
    summary: '12 moves, 30 s each with 10 s to switch. About 8 minutes per circuit; add a circuit every 2 weeks.',
    source: 'Klika & Jordan 2013, ACSM’s Health & Fitness Journal. Tested in Schmidt et al. 2016, Mattar et al. 2017 and Ajjimaporn et al. 2023.',
    adapted: 'No chair: step-ups become reverse lunges and chair dips become diamond push-ups (knee push-ups for beginners).',
    roundSec: 12 * 40,
    progressRounds: true,
    build({ level, rounds = 1 }) {
      const easy = level === 1;
      return [{
        kind: 'main', name: '7-Minute Circuit', format: 'circuit', rounds, roundRest: 60, protocol: 'seven-minute',
        items: [
          t('jumping-jacks', 30, 10),
          t('wall-sit', 30, 10),
          t(easy ? 'knee-push-up' : 'push-up', 30, 10),
          t('bicycle-crunch', 15, 10),
          t('reverse-lunge', 15, 10),
          t('bodyweight-squat', 30, 10),
          t(easy ? 'knee-push-up' : 'diamond-push-up', 30, 10),
          t('plank', 30, 10),
          t('high-knees', 30, 10),
          t('split-squat', 15, 10),
          t('shoulder-taps', 30, 10),
          t('side-plank', 15, 10),
        ],
      }];
    },
  },
  {
    id: 'five-bx',
    name: '11-Minute 5BX Intervals',
    evidence: 'tested',
    equipment: ['bodyweight'],
    minLevel: 1,
    suits: 'Beginner to intermediate · conditioning on 10–15 minute days',
    summary: 'Five hard minutes, each followed by a minute walking on the spot. Includes its own warm-up and cool-down.',
    source: 'Archila et al. 2021, International Journal of Exercise Science (Gibala lab). Randomised controlled trial.',
    adapted: 'Beginners swap burpees, split jumps and squat jumps for mountain climbers, reverse lunges and squats.',
    roundSec: 11 * 60,
    standalone: true,
    build({ level }) {
      const easy = level === 1;
      return [
        { kind: 'warmup', name: 'Warm-Up', format: 'circuit', rounds: 1, roundRest: 0, items: [t('jumping-jacks', 60, 0)] },
        {
          kind: 'main', name: '5BX Intervals', format: 'circuit', rounds: 1, roundRest: 0, protocol: 'five-bx', restLabel: 'Walk on the spot',
          items: [
            t(easy ? 'mountain-climber' : 'burpee', 60, 60),
            t('high-knees', 60, 60),
            t(easy ? 'reverse-lunge' : 'jumping-lunge', 30, 60),
            t('high-knees', 60, 60),
            t(easy ? 'bodyweight-squat' : 'jump-squat', 60, 60),
          ],
        },
      ];
    },
  },
  {
    id: 'tabata-style',
    name: 'Tabata-Style 20/10',
    evidence: 'tested',
    equipment: ['bodyweight'],
    minLevel: 2,
    suits: 'Intermediate and advanced · very short conditioning days',
    summary: '8 rounds of 20 s all-out and 10 s rest: 4 minutes. One exercise per session.',
    source: 'McRae et al. 2012 and Schaun et al. 2018 (whole-body versions). The original Tabata 1996 study used an exercise bike.',
    adapted: 'Bodyweight cannot match the original bike load, so this is “Tabata-style”, not Tabata.',
    roundSec: 8 * 30,
    build({ variant = 0 }) {
      const moves = ['burpee', 'jumping-jacks', 'mountain-climber', 'jump-squat'];
      return [{
        kind: 'main', name: 'Tabata-Style 20/10', format: 'circuit', rounds: 8, roundRest: 10, protocol: 'tabata-style',
        items: [t(moves[variant % moves.length], 20, 10)],
      }];
    },
  },
  {
    id: 'kb-swing-intervals',
    name: 'Kettlebell Swing Intervals',
    evidence: 'tested',
    equipment: ['kettlebell'],
    minLevel: 2,
    suits: 'Intermediate and advanced who can already swing well · strength, power or conditioning',
    summary: '12 rounds of 30 s swings and 30 s rest: 12 minutes.',
    source: 'Lake & Lauder 2012, Journal of Strength and Conditioning Research. Randomised trial (12 or 16 kg bell).',
    adapted: '',
    roundSec: 12 * 60,
    build() {
      return [{
        kind: 'main', name: 'Swing Intervals', format: 'circuit', rounds: 12, roundRest: 30, protocol: 'kb-swing-intervals',
        items: [t('kb-swing', 30, 30)],
      }];
    },
  },
  {
    id: 'kb-snatch-1515',
    name: 'Kettlebell Snatch 15:15',
    evidence: 'tested',
    equipment: ['kettlebell'],
    minLevel: 3,
    suits: 'Advanced only: the snatch is a technical lift',
    summary: '20 minutes alternating 15 s of snatches and 15 s rest, switching hands each interval.',
    source: 'Falatic et al. 2015, Journal of Strength and Conditioning Research. Controlled trial in college athletes.',
    adapted: '',
    roundSec: 20 * 60,
    build() {
      return [{
        kind: 'main', name: 'Snatch 15:15', format: 'circuit', rounds: 40, roundRest: 15, protocol: 'kb-snatch-1515',
        items: [t('kb-snatch', 15, 15, { oneSide: true })],
      }];
    },
  },
  {
    id: 'simple-sinister',
    name: 'Simple & Sinister',
    evidence: 'practitioner',
    equipment: ['kettlebell'],
    minLevel: 2,
    suits: 'Intermediate and advanced who know the swing and the get-up',
    summary: '100 one-arm swings (10 × 10, a set every 30 s), 1 minute rest, then 10 get-ups (one per minute).',
    source: 'Pavel Tsatsouline, StrongFirst. Popular coaching programme; no peer-reviewed trial found.',
    adapted: '',
    roundSec: 16 * 60,
    build({ exMap }) {
      const sw = exMap['kb-single-arm-swing'];
      const gu = exMap['kb-turkish-get-up'];
      const swingWork = Math.round(10 * (sw?.tempo || 1.5));
      const guWork = Math.round(gu?.tempo || 15);
      return [
        {
          kind: 'main', name: 'Swings: a set every 30 s', format: 'circuit', rounds: 10, roundRest: Math.max(5, 30 - swingWork), protocol: 'simple-sinister',
          items: [{ exId: 'kb-single-arm-swing', mode: 'reps', reps: 10, rest: Math.max(5, 30 - swingWork), sets: 1, oneSide: true }],
        },
        {
          kind: 'main', name: 'Get-ups: one per minute', format: 'circuit', rounds: 10, roundRest: Math.max(15, 60 - guWork), protocol: 'simple-sinister',
          items: [{ exId: 'kb-turkish-get-up', mode: 'reps', reps: 1, rest: Math.max(15, 60 - guWork), sets: 1, oneSide: true }],
        },
      ];
    },
  },
  {
    id: 'minimal-strength',
    name: 'Minimal-Dose Full-Body Strength',
    evidence: 'reviews',
    equipment: ['bodyweight'],
    minLevel: 1,
    suits: 'Beginners and anyone on 15–20 minute days · strength or balanced',
    summary: 'Two pairs of moves (squat + row, hinge + press), 2 sets each, 60–90 s between moves. 2–3 times a week.',
    source: 'Built from Iversen et al. 2021, Fyfe et al. 2022 and Nuzzo et al. 2024 (minimal dose), and Zhang et al. 2025 (supersets). Not a single tested protocol.',
    adapted: '',
    roundSec: 14 * 60,
    build({ choose }) {
      const a1 = choose('squat'), a2 = choose('pull_h'), b1 = choose('hinge'), b2 = choose('push_h');
      return [
        { kind: 'main', name: 'Pair A', format: 'circuit', pair: true, rounds: 2, roundRest: 75, protocol: 'minimal-strength', items: [a1, a2].filter(Boolean).map((it) => ({ ...it, rest: 75 })) },
        { kind: 'main', name: 'Pair B', format: 'circuit', pair: true, rounds: 2, roundRest: 75, protocol: 'minimal-strength', items: [b1, b2].filter(Boolean).map((it) => ({ ...it, rest: 75 })) },
      ];
    },
  },
];

export const TEMPLATE = Object.fromEntries(TEMPLATES.map((x) => [x.id, x]));
