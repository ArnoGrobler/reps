// Workout editor (pushed inside the day sheet): change the title and time,
// edit sets/reps/time/rest, swap, reorder, add and remove exercises.
// Edits save immediately and apply to that date only, except swaps, which can
// also apply to the same workout in later weeks.

import { icon } from '../icons.js';
import { esc, pushSheet, popSheet, segmented, stepperHtml, switchHtml, alertDialog, toast } from '../ui.js';
import { EX, allowedExercises, EQUIP_ICON, EQUIP_COLOR, mainEquip, PATTERNS, titleCase } from '../data.js';
import { fmtShort, dow, LOCALE } from '../dates.js';
import { getState, update, getDay } from '../store.js';
import { estimateSeconds, workSeconds, makeItem, alternatives, canDo, titleFor, regenerateDay } from '../generator.js';
import { itemRx, blockFormat, setRestDay } from './day.js';
import { exerciseView } from './library.js';

const ctx = { key: null, blockId: null, itemId: null, swapFuture: true, addQuery: '' };

function find(s = getState()) {
  const day = getDay(ctx.key, s);
  const block = day?.blocks?.find((b) => b.id === ctx.blockId);
  const item = block?.items.find((i) => i.id === ctx.itemId);
  return { day, block, item };
}

/** Run a mutation on the current day and refresh its derived fields. */
function edit(fn) {
  update((s) => {
    const day = getDay(ctx.key, s);
    if (!day) return;
    fn(day, s);
    day.estSec = estimateSeconds(day, EX);
    if (!day.customTitle) day.title = titleFor(day, EX, s.plan.equipment);
  });
}

/* ---------- Day editor ---------- */

export function dayEditorView(key) {
  return {
    title: 'Edit Workout',
    subtitle: fmtShort(key),
    trailing: () => `<button class="icon-btn glass glass-prominent glass-interactive" data-sheet-back aria-label="Done">${icon('check')}</button>`,
    mount: () => { ctx.key = key; },
    render: () => {
      ctx.key = key;
      const s = getState();
      const day = getDay(key, s);
      if (!day || day.type !== 'workout') return '<div class="card empty">This day is not a workout.</div>';
      const est = Math.round(estimateSeconds(day, EX) / 60);
      const over = est > day.minutes * 1.15;
      return `
        <div class="list">
          <div class="row"><input class="field plain-field" id="ed-title" value="${esc(day.title)}" aria-label="Workout name" maxlength="60"></div>
          <div class="row"><div class="grow"><div class="title">Time available</div>
            <div class="subtitle" style="${over ? 'color:var(--red)' : ''}">Estimated ${est} min${over ? ' · over your time' : ''}</div></div>
            <div class="value-stepper"><span class="val rounded">${day.minutes} min</span>${stepperHtml('ed:minutes', { canDec: day.minutes > 5, canInc: day.minutes < 120, label: 'minutes' })}</div>
          </div>
        </div>
        ${day.blocks.map((b) => `
          <section class="section">
            <div class="section-head"><div class="section-title">${esc(b.name)}</div><span class="t-foot sec">${esc(blockFormat(b))}</span></div>
            <div class="list">
              ${b.format === 'circuit' && b.kind !== 'warmup' && b.kind !== 'cooldown' ? `<div class="row"><div class="grow title">Rounds</div>
                <div class="value-stepper"><span class="val rounded">${b.rounds}</span>${stepperHtml(`ed:rounds:${b.id}`, { canDec: b.rounds > 1, canInc: b.rounds < 10, label: 'rounds' })}</div></div>` : ''}
              ${b.items.map((it) => {
                const ex = EX[it.exId];
                const eq = mainEquip(ex);
                return `<button class="row has-icon" data-action="ed-item" data-block="${b.id}" data-item="${it.id}">
                  <div class="row-icon" style="background:${EQUIP_COLOR[eq]}">${icon(EQUIP_ICON[eq] || 'dumbbell')}</div>
                  <div class="grow"><div class="title truncate">${esc(ex?.name || it.exId)}</div><div class="subtitle truncate">${esc(itemRx(it, b))}</div></div>
                  ${icon('chevron-right', 'chev')}
                </button>`;
              }).join('')}
              <button class="row has-icon add-row" data-action="ed-add" data-block="${b.id}">
                <div class="row-icon" style="background:var(--fill-3);color:var(--accent)">${icon('plus')}</div>
                <div class="grow title accent">Add Exercise</div>
              </button>
            </div>
          </section>`).join('')}
        <div class="list">
          <button class="row has-icon" data-action="ed-regen"><div class="row-icon" style="background:var(--blue)">${icon('refresh-cw')}</div><div class="grow title">Generate a New Workout</div></button>
          <button class="row has-icon" data-action="ed-rest"><div class="row-icon" style="background:var(--indigo)">${icon('moon')}</div><div class="grow title">Change to Rest Day</div></button>
        </div>
        <p class="footnote">Changes save as you go and apply to ${esc(fmtShort(key))} only.</p>`;
    },
  };
}

/* ---------- Item editor ---------- */

function itemEditorView() {
  return {
    get title() { const { item } = find(); return EX[item?.exId]?.name || 'Exercise'; },
    get subtitle() { const { block } = find(); return block?.name || ''; },
    render: () => {
      const { day, block, item } = find();
      if (!item) return '<div class="card empty">This exercise was removed.</div>';
      const ex = EX[item.exId];
      const circuit = block.format === 'circuit';
      const idx = block.items.indexOf(item);
      const per = workSeconds(item, ex);
      const total = circuit ? block.rounds * (per + item.rest) : item.sets * (per + item.rest);
      return `
        <button class="card ex-head pressable" data-action="open-exercise" data-ex="${item.exId}">
          <div class="equip-badge" style="background:${EQUIP_COLOR[mainEquip(ex)]}">${icon(EQUIP_ICON[mainEquip(ex)] || 'dumbbell')}</div>
          <div class="grow" style="min-width:0;text-align:left"><div class="t-headline truncate">${esc(ex?.name)}</div>
            <div class="t-foot sec truncate">${esc(PATTERNS[ex?.pattern] || '')} · ${esc((ex?.muscles || []).map(titleCase).join(', '))}</div></div>
          <span class="tag accent">${icon('circle-play')}Demo</span>
        </button>
        <div class="list">
          <div class="row"><div class="grow title">Measure by</div>
            ${segmented('ed:mode', [{ value: 'reps', label: 'Reps' }, { value: 'time', label: 'Time' }], item.mode, 'width:150px')}</div>
          ${circuit ? `<div class="row"><div class="grow"><div class="title">Rounds</div><div class="subtitle">Set for the whole circuit</div></div><span class="detail">${block.rounds}</span></div>`
            : `<div class="row"><div class="grow title">Sets</div><div class="value-stepper"><span class="val rounded">${item.sets}</span>${stepperHtml('ed:sets', { canDec: item.sets > 1, canInc: item.sets < 10, label: 'sets' })}</div></div>`}
          ${item.mode === 'reps'
            ? `<div class="row"><div class="grow"><div class="title">Reps</div>${ex?.perSide ? '<div class="subtitle">Each side</div>' : ''}</div><div class="value-stepper"><span class="val rounded">${item.reps}</span>${stepperHtml('ed:reps', { canDec: item.reps > 1, canInc: item.reps < 100, label: 'reps' })}</div></div>`
            : `<div class="row"><div class="grow"><div class="title">Work time</div>${ex?.perSide ? '<div class="subtitle">Each side</div>' : ''}</div><div class="value-stepper"><span class="val rounded">${item.duration} s</span>${stepperHtml('ed:duration', { canDec: item.duration > 5, canInc: item.duration < 600, label: 'seconds' })}</div></div>`}
          <div class="row"><div class="grow"><div class="title">Rest after</div><div class="subtitle">${circuit ? 'Before the next exercise' : 'Between sets'}</div></div><div class="value-stepper"><span class="val rounded">${item.rest} s</span>${stepperHtml('ed:rest', { canDec: item.rest > 0, canInc: item.rest < 300, label: 'rest seconds' })}</div></div>
        </div>
        <p class="footnote">About ${Math.max(1, Math.round(total / 60))} min for this exercise. In timed mode each ${item.mode === 'reps' ? `rep gets about ${ex?.tempo || 2.5} s` : 'set counts down'}.</p>
        <div class="list">
          <button class="row has-icon" data-action="ed-swap"><div class="row-icon" style="background:var(--accent)">${icon('shuffle')}</div><div class="grow title">Swap Exercise</div>${icon('chevron-right', 'chev')}</button>
          <button class="row has-icon" data-action="ed-move" data-dir="-1" ${idx === 0 ? 'disabled style="opacity:.4"' : ''}><div class="row-icon" style="background:var(--gray)">${icon('arrow-up')}</div><div class="grow title">Move Up</div></button>
          <button class="row has-icon" data-action="ed-move" data-dir="1" ${idx === block.items.length - 1 ? 'disabled style="opacity:.4"' : ''}><div class="row-icon" style="background:var(--gray)">${icon('arrow-down')}</div><div class="grow title">Move Down</div></button>
          <button class="row has-icon" data-action="ed-remove"><div class="row-icon" style="background:var(--red)">${icon('trash-2')}</div><div class="grow title" style="color:var(--red)">Remove from Workout</div></button>
        </div>`;
    },
  };
}

/* ---------- Swap ---------- */

function swapView() {
  return {
    title: 'Swap Exercise',
    get subtitle() { const { item } = find(); return EX[item?.exId]?.name || ''; },
    render: () => {
      const s = getState();
      const { item } = find(s);
      if (!item) return '';
      const alts = alternatives(EX[item.exId], allowedExercises(s.settings), s.plan.equipment);
      const others = allowedExercises(s.settings).filter((e) => e.id !== item.exId && canDo(e, s.plan.equipment) && !alts.includes(e));
      const row = (e) => `<button class="row has-icon" data-action="ed-swap-to" data-ex="${e.id}">
        <div class="row-icon" style="background:${EQUIP_COLOR[mainEquip(e)]}">${icon(EQUIP_ICON[mainEquip(e)] || 'dumbbell')}</div>
        <div class="grow"><div class="title truncate">${esc(e.name)}</div><div class="subtitle truncate">${esc(PATTERNS[e.pattern])} · ${esc(e.muscles.map(titleCase).join(', '))}</div></div>
      </button>`;
      return `
        <div class="list"><div class="row"><div class="grow"><div class="title">Also swap in later weeks</div><div class="subtitle">Same workout on future ${esc(new Intl.DateTimeFormat(LOCALE, { weekday: 'long' }).format(new Date(2026, 10, 1 + dow(ctx.key), 12)))}s</div></div>${switchHtml('ed:swapFuture', ctx.swapFuture, 'Also swap in later weeks')}</div></div>
        <section class="section"><div class="section-head"><div class="section-title">Best Matches</div></div>
          <div class="list">${alts.slice(0, 12).map(row).join('') || '<div class="row sec">No close matches with your equipment.</div>'}</div></section>
        <section class="section"><div class="section-head"><div class="section-title">Everything Else</div></div>
          <div class="list">${others.map(row).join('')}</div></section>`;
    },
  };
}

/* ---------- Add ---------- */

function addView() {
  return {
    title: 'Add Exercise',
    get subtitle() { const { block } = find(); return block?.name || ''; },
    render: () => {
      const s = getState();
      const { block } = find(s);
      if (!block) return '';
      const role = block.kind === 'warmup' ? 'warmup' : block.kind === 'cooldown' ? 'cooldown' : block.kind === 'finisher' ? 'finisher' : 'main';
      const q = ctx.addQuery.toLowerCase();
      const list = allowedExercises(s.settings).filter((e) => canDo(e, s.plan.equipment) && (!q || e.name.toLowerCase().includes(q) || e.muscles.some((m) => m.includes(q))));
      const fit = list.filter((e) => e.roles.includes(role));
      const rest = list.filter((e) => !e.roles.includes(role));
      const row = (e) => `<button class="row has-icon" data-action="ed-add-ex" data-ex="${e.id}">
        <div class="row-icon" style="background:${EQUIP_COLOR[mainEquip(e)]}">${icon(EQUIP_ICON[mainEquip(e)] || 'dumbbell')}</div>
        <div class="grow"><div class="title truncate">${esc(e.name)}</div><div class="subtitle truncate">${esc(PATTERNS[e.pattern])} · ${esc(e.muscles.map(titleCase).join(', '))}</div></div>
        <span class="accent">${icon('plus')}</span>
      </button>`;
      return `
        <div class="search-field">${icon('search', 'sm')}<input id="ed-add-q" type="search" placeholder="Search exercises" value="${esc(ctx.addQuery)}" autocomplete="off" aria-label="Search exercises"></div>
        <div id="ed-add-results" class="section" style="gap:18px">
          ${fit.length ? `<section class="section"><div class="section-head"><div class="section-title">Suggested for ${esc(block.name)}</div></div><div class="list">${fit.map(row).join('')}</div></section>` : ''}
          ${rest.length ? `<section class="section"><div class="section-head"><div class="section-title">Other Exercises</div></div><div class="list">${rest.map(row).join('')}</div></section>` : ''}
          ${!list.length ? '<div class="card empty">No exercises match.</div>' : ''}
        </div>`;
    },
  };
}

/* ---------- Actions ---------- */

export const actions = {
  'ed-item': (el) => { ctx.blockId = el.dataset.block; ctx.itemId = el.dataset.item; pushSheet(itemEditorView()); },
  'ed-add': (el) => { ctx.blockId = el.dataset.block; ctx.addQuery = ''; pushSheet(addView()); },
  'ed-swap': () => pushSheet(swapView()),
  'ed-move': (el) => {
    const dir = +el.dataset.dir;
    edit((day) => {
      const b = day.blocks.find((x) => x.id === ctx.blockId);
      const i = b.items.findIndex((x) => x.id === ctx.itemId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= b.items.length) return;
      [b.items[i], b.items[j]] = [b.items[j], b.items[i]];
    });
  },
  'ed-remove': async () => {
    const { item } = find();
    const ok = await alertDialog({ title: `Remove ${EX[item?.exId]?.name || 'exercise'}?`, message: 'It will be removed from this day’s workout.', actions: [{ label: 'Cancel', value: false, style: 'gray' }, { label: 'Remove', value: true, style: 'danger' }] });
    if (!ok) return;
    edit((day) => {
      const b = day.blocks.find((x) => x.id === ctx.blockId);
      b.items = b.items.filter((x) => x.id !== ctx.itemId);
    });
    popSheet();
    toast('Exercise removed', { iconName: 'trash-2' });
  },
  'ed-swap-to': (el) => {
    const newId = el.dataset.ex;
    const ne = EX[newId];
    const { item: cur } = find();
    const oldId = cur?.exId;
    const adapt = (it) => {
      it.exId = newId;
      if (ne.type === 'time' && it.mode === 'reps') { it.mode = 'time'; it.duration = ne.defaults.duration ?? 30; }
      if (ne.type === 'reps' && it.mode === 'time' && it.duration > 60) { it.mode = 'reps'; it.reps = ne.defaults.reps ?? 10; }
    };
    let changed = 0;
    update((s) => {
      const day = getDay(ctx.key, s);
      const b = day.blocks.find((x) => x.id === ctx.blockId);
      const it = b.items.find((x) => x.id === ctx.itemId);
      adapt(it);
      changed++;
      if (ctx.swapFuture) {
        const wd = dow(ctx.key);
        for (const [k, d] of Object.entries(s.plan.days)) {
          if (k <= ctx.key || d.type !== 'workout' || dow(k) !== wd || d.focus !== day.focus) continue;
          for (const bb of d.blocks) for (const x of bb.items) if (x.exId === oldId) { adapt(x); changed++; }
          d.estSec = estimateSeconds(d, EX);
          if (!d.customTitle) d.title = titleFor(d, EX, s.plan.equipment);
        }
      }
      day.estSec = estimateSeconds(day, EX);
      if (!day.customTitle) day.title = titleFor(day, EX, s.plan.equipment);
    });
    popSheet();
    toast(changed > 1 ? `Swapped in ${changed} workouts` : `Swapped to ${ne.name}`, { iconName: 'shuffle' });
  },
  'ed-add-ex': (el) => {
    const ex = EX[el.dataset.ex];
    const s = getState();
    edit((day) => {
      const b = day.blocks.find((x) => x.id === ctx.blockId);
      const kind = b.kind === 'warmup' || b.kind === 'cooldown' ? b.kind : 'main';
      const it = makeItem(ex, { goal: s.plan.goal, level: s.plan.level, kind });
      if (b.format === 'circuit' && kind === 'main' && b.items[0]) {
        it.mode = 'time'; it.duration = b.items[0].duration; it.rest = b.items[0].rest; it.sets = 1;
      }
      b.items.push(it);
    });
    popSheet();
    toast(`Added ${ex.name}`, { iconName: 'plus' });
  },
  'ed-regen': async () => {
    const ok = await alertDialog({ title: 'Generate a New Workout?', message: 'This replaces the exercises for this day with a fresh selection.', actions: [{ label: 'Cancel', value: false, style: 'gray' }, { label: 'Generate', value: true, style: 'filled' }] });
    if (!ok) return;
    const s = getState();
    const old = getDay(ctx.key, s);
    const next = regenerateDay(s.plan, ctx.key, allowedExercises(s.settings), { minutes: old.minutes, focus: old.focus });
    update((st) => { st.plan.days[ctx.key] = next; });
    toast('New workout created', { iconName: 'refresh-cw', action: { label: 'Undo', onClick: () => update((st) => { st.plan.days[ctx.key] = old; }) } });
  },
  'ed-rest': async () => { await setRestDay(ctx.key, true); popSheet(); },
};

export function onStep(id, dir) {
  if (!id.startsWith('ed:')) return false;
  const [, field, blockId] = id.split(':');
  if (field === 'minutes') { edit((day) => { day.minutes = Math.max(5, Math.min(120, day.minutes + dir * 5)); }); return true; }
  if (field === 'rounds') { edit((day) => { const b = day.blocks.find((x) => x.id === blockId); b.rounds = Math.max(1, Math.min(10, b.rounds + dir)); }); return true; }
  edit((day) => {
    const b = day.blocks.find((x) => x.id === ctx.blockId);
    const it = b?.items.find((x) => x.id === ctx.itemId);
    if (!it) return;
    if (field === 'sets') it.sets = Math.max(1, Math.min(10, it.sets + dir));
    if (field === 'reps') it.reps = Math.max(1, Math.min(100, it.reps + dir));
    if (field === 'duration') it.duration = Math.max(5, Math.min(600, it.duration + dir * 5));
    if (field === 'rest') it.rest = Math.max(0, Math.min(300, it.rest + dir * 5));
  });
  return true;
}

export function onSeg(id, value) {
  if (id !== 'ed:mode') return false;
  edit((day) => {
    const b = day.blocks.find((x) => x.id === ctx.blockId);
    const it = b?.items.find((x) => x.id === ctx.itemId);
    if (!it) return;
    it.mode = value;
    const ex = EX[it.exId];
    if (value === 'time' && !it.duration) it.duration = ex?.defaults.duration ?? 30;
    if (value === 'reps' && !it.reps) it.reps = ex?.defaults.reps ?? 10;
  });
  return true;
}

export function onToggle(id) {
  if (id !== 'ed:swapFuture') return false;
  ctx.swapFuture = !ctx.swapFuture;
  return true;
}

export function onInput(e) {
  if (e.target.id === 'ed-title') {
    const v = e.target.value.trim();
    update((s) => { const d = getDay(ctx.key, s); if (d) { d.title = v || d.title; d.customTitle = true; } }, { silent: true });
    return true;
  }
  if (e.target.id === 'ed-add-q') {
    ctx.addQuery = e.target.value.trim();
    const holder = document.getElementById('ed-add-results');
    if (holder) {
      const html = addView().render();
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      holder.innerHTML = tmp.querySelector('#ed-add-results')?.innerHTML || '';
    }
    return true;
  }
  return false;
}

export { exerciseView };
