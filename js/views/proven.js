// Proven workouts (published protocols) and the "How Reps builds your plan" explainer.

import { icon } from '../icons.js';
import { esc, openSheet, pushSheet, popSheet, closeSheet, sheetIsOpen, toast } from '../ui.js';
import { EX, EQ, EQUIP_ICON, allowedExercises, sideText } from '../data.js';
import { TEMPLATES, TEMPLATE, EVIDENCE_LABEL } from '../data/templates.js';
import { templateDay, canDo, LEVELS } from '../generator.js';
import { getState, update, getDay, isDone } from '../store.js';
import { todayKey, addDays, fmtShort, relativeLabel } from '../dates.js';

const DOC_URL = 'https://github.com/ArnoGrobler/reps/blob/main/docs/programming-evidence.md';
const BADGE = { tested: 'green', reviews: 'blue', practitioner: 'orange' };

const usable = (tpl, s) => tpl.equipment.every((q) => q === 'bodyweight' || (s.plan?.equipment || []).includes(q));

export function evidenceTag(tpl) {
  return `<span class="tag ev-${BADGE[tpl.evidence]}">${icon(tpl.evidence === 'practitioner' ? 'info' : 'circle-check')}${esc(EVIDENCE_LABEL[tpl.evidence])}</span>`;
}

/** Cards for the Exercises tab. */
export function provenSectionHtml(s) {
  return `<section class="section">
    <div class="section-head"><div class="section-title">Proven Workouts</div><button class="section-link" data-action="open-science">How plans are built</button></div>
    <div class="chips scroll equip-scroll">
      ${TEMPLATES.map((t) => `<button class="equip-card proven-card" data-action="open-template" data-tpl="${t.id}">
        <div class="t-headline">${esc(t.name)}</div>
        <div class="t-foot sec">${esc(t.summary.split('.')[0])}.</div>
        <div class="proven-meta">${t.equipment.filter((q) => q !== 'bodyweight').map((q) => icon(EQUIP_ICON[q], 'xs')).join('')}${evidenceTag(t)}</div>
      </button>`).join('')}
    </div>
  </section>`;
}

function structureHtml(tpl, s) {
  const plan = s.plan || { level: 2, equipment: ['bodyweight', ...tpl.equipment], goal: 'balanced' };
  const day = templateDay(tpl.id, plan, allowedExercises(s.settings));
  return day.blocks.map((b) => `<section class="section">
    <div class="section-head"><div class="section-title">${esc(b.name)}</div><span class="t-foot sec">${b.format === 'circuit' && b.rounds > 1 ? `${b.rounds} ${b.pair ? 'sets' : 'rounds'}` : ''}</span></div>
    <div class="list">${b.items.map((it) => {
      const ex = EX[it.exId];
      const amt = it.mode === 'time' ? `${it.duration} s${sideText(it, ex)}` : `${it.reps} reps${it.oneSide ? ' (switch hands each set)' : ''}`;
      return `<button class="row" data-action="open-exercise" data-ex="${it.exId}"><div class="grow"><div class="title truncate">${esc(ex?.name || it.exId)}</div><div class="subtitle">${esc(amt)}${it.rest ? ` · ${it.rest} s ${b.restLabel ? b.restLabel.toLowerCase() : it.rest <= 20 ? 'to switch' : 'rest'}` : ''}</div></div>${icon('chevron-right', 'chev')}</button>`;
    }).join('')}</div></section>`).join('');
}

export function templateView(id, { key = null } = {}) {
  const tpl = TEMPLATE[id];
  return {
    title: tpl?.name || 'Workout',
    get subtitle() { return key ? fmtShort(key) : 'Proven workout'; },
    render: () => {
      const s = getState();
      const ok = usable(tpl, s);
      const levelOk = (s.plan?.level || 2) >= tpl.minLevel;
      return `
        <div class="card" style="display:flex;flex-direction:column;gap:10px">
          <div class="chips">${evidenceTag(tpl)}${tpl.equipment.filter((q) => q !== 'bodyweight').map((q) => `<span class="tag">${icon(EQUIP_ICON[q])}${esc(EQ[q]?.name || q)}</span>`).join('') || `<span class="tag">${icon('person-standing')}No equipment</span>`}</div>
          <p class="t-body" style="margin:0">${esc(tpl.summary)}</p>
          <p class="t-sub sec" style="margin:0"><b>Suits:</b> ${esc(tpl.suits)}</p>
        </div>
        ${structureHtml(tpl, s)}
        <section class="section"><div class="section-head"><div class="section-title">Source</div></div>
          <div class="card"><p class="t-sub" style="margin:0">${esc(tpl.source)}</p>${tpl.adapted ? `<p class="t-foot sec" style="margin:8px 0 0">Adapted for Reps: ${esc(tpl.adapted)}</p>` : ''}</div>
        </section>
        ${!levelOk ? `<p class="footnote">Recommended for ${esc(LEVELS[tpl.minLevel])} level and up.</p>` : ''}
        ${!s.plan ? '<p class="footnote">Create a plan first to schedule this workout.</p>'
          : !ok ? '<p class="footnote">Needs equipment that is not in your plan.</p>'
          : key ? `<button class="btn btn-filled lg block" data-action="use-template" data-tpl="${id}" data-key="${key}">Use on ${esc(relativeLabel(key))}</button>`
          : `<button class="btn btn-filled lg block" data-action="use-template" data-tpl="${id}" data-key="${todayKey()}">Use Today</button>
             <button class="btn btn-gray block" data-action="pick-template-day" data-tpl="${id}">Choose a Day</button>`}`;
    },
  };
}

/** List of templates for one date (from the day menu). */
export function templatePickerView(key) {
  return {
    title: 'Proven Workouts',
    subtitle: fmtShort(key),
    render: () => {
      const s = getState();
      return `<p class="t-callout sec" style="margin:0">Replace this day with a workout from a published study or a well-known programme.</p>
        <div class="list">${TEMPLATES.filter((t) => usable(t, s)).map((t) => `<button class="row" data-action="open-template" data-tpl="${t.id}" data-key="${key}">
          <div class="grow"><div class="title">${esc(t.name)}</div><div class="subtitle">${esc(t.summary.split('.')[0])}.</div></div>${icon('chevron-right', 'chev')}</button>`).join('')}</div>
        <p class="footnote">Templates needing equipment outside your plan are hidden.</p>`;
    },
  };
}

function dayPickerView(id) {
  return {
    title: 'Choose a Day',
    subtitle: TEMPLATE[id].name,
    render: () => {
      const s = getState();
      const t = todayKey();
      const rows = [];
      for (let i = 0; i < 21; i++) {
        const k = addDays(t, i);
        const d = getDay(k, s);
        if (!d || isDone(k, s)) continue;
        rows.push(`<button class="row" data-action="use-template" data-tpl="${id}" data-key="${k}">
          <div class="grow"><div class="title">${esc(relativeLabel(k))}</div><div class="subtitle">${esc(d.type === 'rest' ? 'Rest day' : `Replaces ${d.title}`)}</div></div>${icon('chevron-right', 'chev')}</button>`);
      }
      return `<div class="list">${rows.join('') || '<div class="row sec">No upcoming days in your plan.</div>'}</div>`;
    },
  };
}

export function scienceView() {
  const rules = [
    ['Sets', 'Beginners 2 per exercise, intermediate 3, advanced 3–4. Strength gains level off beyond 2–3 sets.', 'ACSM 2026 position stand'],
    ['Reps', 'Set by goal, level and how heavy your weights are. Strength 5–8 with heavy weights; 8–12 for beginners and muscle growth; 15–25 near failure with light weights.', 'ACSM 2009; Schoenfeld 2017'],
    ['Effort', 'Finish most sets with 1–3 reps left in the tank. Training to failure is not needed.', 'ACSM 2026'],
    ['Rest', 'Loaded compound moves: 90 s for beginners, 2–3 min for intermediate and advanced. Core and single-joint moves: 60–90 s.', 'Grgic 2018; Singer 2024'],
    ['Short sessions', 'On days of 30 minutes or less, moves are done in alternating pairs (supersets), which save time with similar results.', 'Iversen 2021; Zhang 2025'],
    ['Weekly volume', 'At least 4 hard sets per body region a week for beginners, 10 or more for intermediate and advanced.', 'ACSM 2026'],
    ['Warm-up', '3–5 minutes of dynamic moves with 10 s to switch, then a lighter ramp-up set before the first loaded move.', 'Iversen 2021'],
    ['Cool-down', 'Optional. Stretching after training does not reduce soreness or speed recovery, but helps flexibility.', 'ACSM 2011; Afonso 2021'],
    ['Progression', 'Add a rep each week inside your range. At the top of the range, move to a heavier weight or harder variation.', 'ACSM 2009; Plotkin 2022'],
    ['Deload', 'Intermediate and advanced plans get a lighter week every 4th week: fewer sets, stop 3–4 reps early.', 'Rogerson 2024 (coach consensus)'],
    ['Conditioning', 'Circuits use tested formats: 30 s / 30 s for beginners, 40/20 intermediate, 45/15 advanced, plus the proven workouts.', 'Ajjimaporn 2023; Lake & Lauder 2012'],
  ];
  return {
    title: 'How Plans Are Built',
    render: () => `
      <p class="t-callout sec" style="margin:0">Reps sets sets, reps, rest and progression from position stands, systematic reviews and published training studies. Each source was checked at PubMed or the publisher.</p>
      <div class="list">${rules.map(([t, d, src]) => `<div class="row" style="align-items:flex-start"><div class="grow"><div class="title">${esc(t)}</div><div class="subtitle" style="white-space:normal">${esc(d)}</div><div class="t-foot ter" style="margin-top:4px">${esc(src)}</div></div></div>`).join('')}</div>
      <a class="btn btn-gray block" href="${DOC_URL}" target="_blank" rel="noopener">${icon('external-link', 'sm')} Full evidence and 63 references</a>
      <p class="footnote">Most training studies are in young adults, often men. Where there is no direct trial (warm-up length, transition time, deload timing), Reps uses expert consensus and says so in the full document.</p>`,
  };
}

function useTemplate(id, key) {
  const s = getState();
  const old = getDay(key, s);
  const day = templateDay(id, s.plan, allowedExercises(s.settings), { minutes: old?.minutes });
  update((st) => { st.plan.days[key] = { ...day, prev: old?.type === 'workout' ? old : old?.prev }; });
  if (sheetIsOpen()) closeSheet();
  toast(`${TEMPLATE[id].name} set for ${relativeLabel(key)}`, { iconName: 'circle-check', action: { label: 'Undo', onClick: () => update((st) => { st.plan.days[key] = old; }) } });
}

export const actions = {
  'open-template': (b) => {
    const v = templateView(b.dataset.tpl, { key: b.dataset.key || null });
    if (sheetIsOpen()) pushSheet(v); else openSheet(v, { detent: 'large' });
  },
  'open-science': () => { if (sheetIsOpen()) pushSheet(scienceView()); else openSheet(scienceView(), { detent: 'large' }); },
  'pick-template-day': (b) => pushSheet(dayPickerView(b.dataset.tpl)),
  'use-template': (b) => useTemplate(b.dataset.tpl, b.dataset.key),
};

export { templatePickerView as pickerForDay, canDo, popSheet };
