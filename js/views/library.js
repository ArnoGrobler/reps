// Search tab: exercise library, equipment guide, exercise detail with demo video.
// Swipe a row left to hide an exercise from suggestions (per profile); if upcoming
// workouts use it, the person picks a replacement and those workouts are updated.

import { icon } from '../icons.js';
import { esc, openSheet, pushSheet, popSheet, closeSheet, sheetIsOpen, alertDialog, toast } from '../ui.js';
import { EXERCISES, EQUIPMENT, EX, EQ, EQUIP_ICON, EQUIP_COLOR, PATTERNS, PATTERN_ORDER, titleCase, mainEquip, youtubeSearchUrl, canEmbedVideo, allowedExercises } from '../data.js';
import { LEVELS, alternatives, canDo, upcomingUses, replaceInPlan } from '../generator.js';
import { getState, update, isDone } from '../store.js';
import { todayKey } from '../dates.js';

const ui = { q: '', equip: 'all' };

export function renderLibrary(s) {
  return {
    title: 'Exercises',
    body: `
      <div class="page-head"><h1 class="t-large" style="margin:0">Exercises</h1>
        <p class="t-sub sec" style="margin:4px 0 0">${EXERCISES.length} moves for small home equipment, each with a form guide. Swipe left on one to stop it being suggested.</p></div>
      <div class="search-field">${icon('search', 'sm')}<input id="lib-q" type="search" placeholder="Search name or muscle" value="${esc(ui.q)}" autocomplete="off" aria-label="Search exercises"></div>
      <div class="chips scroll" role="tablist">
        <button class="chip ${ui.equip === 'all' ? 'is-on' : ''}" data-action="lib-equip" data-equip="all">All</button>
        ${(s.settings.hidden || []).length ? `<button class="chip ${ui.equip === 'hidden' ? 'is-on' : ''}" data-action="lib-equip" data-equip="hidden">${icon('eye-off')}Hidden ${(s.settings.hidden || []).length}</button>` : ''}
        ${EQUIPMENT.map((q) => `<button class="chip ${ui.equip === q.id ? 'is-on' : ''}" data-action="lib-equip" data-equip="${q.id}">${icon(EQUIP_ICON[q.id] || 'dumbbell')}${esc(q.name)}</button>`).join('')}
      </div>
      <div id="lib-results" class="section" style="gap:22px">${results(s)}</div>`,
  };
}

function matches(e, hidden) {
  if (ui.equip === 'hidden') { if (!hidden.has(e.id)) return false; }
  else if (ui.equip !== 'all' && !e.equipment.includes(ui.equip)) return false;
  if (!ui.q) return true;
  const q = ui.q.toLowerCase();
  return e.name.toLowerCase().includes(q) || e.muscles.some((m) => m.includes(q)) || (PATTERNS[e.pattern] || '').toLowerCase().includes(q);
}

function results(s) {
  const hidden = new Set(s.settings.hidden || []);
  const list = EXERCISES.filter((e) => matches(e, hidden));
  const guide = !ui.q && ui.equip !== 'hidden' ? equipmentGuide(s) : '';
  if (!list.length) return `${guide}<div class="card empty">${icon('search')}<div class="t-headline">No matches</div><p class="t-sub sec" style="margin:0">Try another name, a muscle like “glutes”, or clear the filter.</p></div>`;
  const groups = PATTERN_ORDER.map((p) => [p, list.filter((e) => e.pattern === p)]).filter(([, l]) => l.length);
  return `${guide}${groups.map(([p, l]) => `
    <section class="section">
      <div class="section-head"><div class="section-title">${esc(PATTERNS[p])}</div><span class="sec t-foot">${l.length}</span></div>
      <div class="list">${l.map((e) => swipeRow(e, hidden.has(e.id))).join('')}</div>
    </section>`).join('')}`;
}

function equipmentGuide(s) {
  if (ui.equip !== 'all') {
    const q = EQ[ui.equip];
    return q ? `<div class="card equip-card-wide">
      <div class="equip-badge" style="background:${EQUIP_COLOR[q.id]}">${icon(EQUIP_ICON[q.id])}</div>
      <div style="min-width:0"><div class="t-headline">${esc(q.name)}</div><p class="t-sub sec" style="margin:2px 0 0">${esc(q.description)}</p>
      <button class="btn btn-plain sm" style="padding:0;margin-top:6px" data-action="open-equipment" data-equip="${q.id}">Buying &amp; usage tips</button></div>
    </div>` : '';
  }
  const mine = new Set(s.plan?.equipment || []);
  return `<section class="section">
    <div class="section-head"><div class="section-title">Equipment Guide</div></div>
    <div class="chips scroll equip-scroll">
      ${EQUIPMENT.map((q) => `<button class="equip-card" data-action="open-equipment" data-equip="${q.id}">
        <div class="equip-badge" style="background:${EQUIP_COLOR[q.id]}">${icon(EQUIP_ICON[q.id])}</div>
        <div class="t-headline">${esc(q.name)}</div>
        <div class="t-foot sec">${EXERCISES.filter((e) => e.equipment.includes(q.id)).length} exercises${mine.has(q.id) ? ' · In your plan' : ''}</div>
      </button>`).join('')}
    </div>
  </section>`;
}

function swipeRow(e, hidden) {
  return `<div class="swipe-row ${hidden ? 'is-hidden' : ''}" data-ex="${e.id}">
    <button class="swipe-action ${hidden ? 'restore' : ''}" data-action="lib-toggle-hide" data-ex="${e.id}" tabindex="-1">${icon(hidden ? 'eye' : 'eye-off')}<span>${hidden ? 'Show' : 'Hide'}</span></button>
    ${exerciseRow(e, hidden, 'swipe-content')}
  </div>`;
}

export function exerciseRow(e, hidden = false, cls = '') {
  const eq = mainEquip(e);
  return `<button class="row has-icon ${cls}" data-action="open-exercise" data-ex="${e.id}">
    <div class="row-icon" style="background:${EQUIP_COLOR[eq]}">${icon(EQUIP_ICON[eq] || 'dumbbell')}</div>
    <div class="grow"><div class="title truncate">${esc(e.name)}</div><div class="subtitle truncate">${esc(e.muscles.map(titleCase).join(', '))} · ${esc(LEVELS[e.level])}</div></div>
    ${hidden ? `<span class="tag">${icon('eye-off')}Hidden</span>` : e.video ? `<span class="ter">${icon('circle-play', 'sm')}</span>` : ''}
    ${icon('chevron-right', 'chev')}
  </button>`;
}

export function refreshLibraryResults(s) {
  const el = document.getElementById('lib-results');
  if (el) el.innerHTML = results(s);
}

/* ---------- Video ---------- */

export function videoBlock(ex) {
  const v = ex.video;
  if (v?.youtubeId && canEmbedVideo) {
    return `<div class="video-frame" data-yt-frame>
      <img src="https://i.ytimg.com/vi/${esc(v.youtubeId)}/hqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer">
      <div class="video-dim"></div>
      <button class="video-play glass glass-clear glass-interactive" data-action="play-video" data-yt="${esc(v.youtubeId)}" aria-label="Play demo video">${icon('play')}</button>
      <div class="video-caption"><span class="truncate">${esc(v.title || 'Form demo')}</span><span>${esc(v.channel || 'YouTube')}</span></div>
    </div>`;
  }
  const url = v?.youtubeId ? `https://www.youtube.com/watch?v=${v.youtubeId}` : youtubeSearchUrl(ex);
  return `<div class="video-frame placeholder">
    ${icon('circle-play', 'xl')}
    <div class="t-headline">${v ? 'Form demo video' : 'No demo video yet'}</div>
    <div class="t-foot sec">${v ? (canEmbedVideo ? '' : 'Plays inside the app on GitHub Pages. The preview cannot embed YouTube.') : 'Find a form demo on YouTube.'}</div>
    <a class="btn btn-tinted sm" href="${esc(url)}" target="_blank" rel="noopener">${icon('external-link', 'xs')} ${v ? 'Watch on YouTube' : 'Search YouTube'}</a>
  </div>`;
}

export function playVideo(btn) {
  const frame = btn.closest('[data-yt-frame]');
  if (!frame) return;
  const id = btn.dataset.yt;
  // iPhone/iPad Safari only lets a cross-site embed start on its own when muted, so start
  // muted there (YouTube shows its unmute button). Elsewhere the tap allows sound.
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&playsinline=1&rel=0&modestbranding=1${iOS ? '&mute=1' : ''}"
    title="Exercise demo video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
    referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

/* ---------- Exercise detail (sheet view) ---------- */

export function exerciseView(exId, { extraTop = '' } = {}) {
  const ex = EX[exId];
  return {
    title: ex?.name || 'Exercise',
    subtitle: ex ? PATTERNS[ex.pattern] : '',
    render: () => {
      if (!ex) return '<div class="card empty">This exercise is no longer in the library.</div>';
      const tags = [
        ...ex.equipment.map((q) => `<span class="tag">${icon(EQUIP_ICON[q] || 'dumbbell')}${esc(EQ[q]?.name || titleCase(q))}</span>`),
        `<span class="tag">${icon('gauge')}${esc(LEVELS[ex.level])}</span>`,
        ex.perSide ? `<span class="tag">${icon('arrow-left-right')}Each side</span>` : '',
        `<span class="tag">${icon(ex.type === 'time' ? 'timer' : 'repeat')}${ex.type === 'time' ? `${ex.defaults.duration ?? 30} s` : `${ex.defaults.reps ?? 10} reps`} default</span>`,
      ].join('');
      return `${extraTop}
        ${videoBlock(ex)}
        <div class="chips">${tags}</div>
        <p class="t-body" style="margin:0">${esc(ex.description)}</p>
        <section class="section">
          <div class="section-head"><div class="section-title">How To</div></div>
          <ol class="list steps">${ex.steps.map((st, i) => `<li class="row"><span class="step-n rounded">${i + 1}</span><span class="grow">${esc(st)}</span></li>`).join('')}</ol>
        </section>
        <section class="section">
          <div class="section-head"><div class="section-title">Coaching Cues</div></div>
          <ul class="list steps">${ex.cues.map((c) => `<li class="row"><span class="cue-ic">${icon('target', 'sm')}</span><span class="grow">${esc(c)}</span></li>`).join('')}</ul>
        </section>
        <section class="section">
          <div class="section-head"><div class="section-title">Muscles</div></div>
          <div class="chips">${ex.muscles.map((m) => `<span class="tag accent">${esc(titleCase(m))}</span>`).join('')}</div>
        </section>
        ${ex.source ? `<a class="btn btn-gray block" href="${esc(ex.source)}" target="_blank" rel="noopener">${icon('external-link', 'sm')} Full guide (${esc(new URL(ex.source).hostname.replace('www.', ''))})</a>` : ''}
        ${(getState().settings.hidden || []).includes(ex.id)
          ? `<button class="btn btn-tinted block" data-action="lib-toggle-hide" data-ex="${ex.id}">${icon('eye', 'sm')} Allow in Workouts</button>`
          : `<button class="btn btn-gray block" data-action="lib-toggle-hide" data-ex="${ex.id}">${icon('eye-off', 'sm')} Don’t Suggest This Exercise</button>`}`;
    },
  };
}

function equipmentView(id) {
  const q = EQ[id];
  const list = EXERCISES.filter((e) => e.equipment.includes(id));
  return {
    title: q?.name || 'Equipment',
    subtitle: `${list.length} exercises`,
    render: () => `
      <div class="card equip-card-wide">
        <div class="equip-badge lg" style="background:${EQUIP_COLOR[id]}">${icon(EQUIP_ICON[id])}</div>
        <div style="min-width:0"><div class="t-title3">${esc(q.name)}</div><div class="t-sub sec">${esc(q.short || '')}</div></div>
      </div>
      <p class="t-body" style="margin:0">${esc(q.description)}</p>
      ${q.tips?.length ? `<section class="section"><div class="section-head"><div class="section-title">Tips</div></div>
        <ul class="list steps">${q.tips.map((t) => `<li class="row"><span class="cue-ic">${icon('info', 'sm')}</span><span class="grow">${esc(t)}</span></li>`).join('')}</ul></section>` : ''}
      <section class="section"><div class="section-head"><div class="section-title">Exercises</div></div>
        <div class="list">${list.map(exerciseRow).join('')}</div></section>`,
  };
}

export function openExercise(exId) {
  if (sheetIsOpen()) pushSheet(exerciseView(exId));
  else openSheet(exerciseView(exId), { detent: 'large' });
}

export const actions = {
  'lib-equip': (el, e, s) => {
    ui.equip = el.dataset.equip;
    document.querySelectorAll('[data-action="lib-equip"]').forEach((c) => c.classList.toggle('is-on', c === el));
    refreshLibraryResults(s);
  },
  'open-exercise': (el) => {
    if (Date.now() < suppressRowClick) return;
    const row = el.closest('.swipe-row');
    if (row && row === openRow) { closeSwipe(row); return; }
    openExercise(el.dataset.ex);
  },
  'lib-toggle-hide': (el) => { const row = el.closest('.swipe-row'); if (row) closeSwipe(row); toggleHide(el.dataset.ex); },
  'lib-replace-with': (el) => replaceAndHide(el.dataset.old, el.dataset.ex),
  'open-equipment': (el) => {
    const v = equipmentView(el.dataset.equip);
    if (sheetIsOpen()) pushSheet(v); else openSheet(v, { detent: 'large' });
  },
  'play-video': (el) => playVideo(el),
};

export function onInput(e, s) {
  if (e.target.id === 'lib-q') {
    ui.q = e.target.value.trim();
    refreshLibraryResults(s);
    return true;
  }
  return false;
}

/* ---------- Hide from suggestions ---------- */

function setHidden(exId, on) {
  update((st) => {
    const h = new Set(st.settings.hidden || []);
    if (on) h.add(exId); else h.delete(exId);
    st.settings.hidden = [...h];
  });
}

export async function toggleHide(exId) {
  const s = getState();
  const ex = EX[exId];
  if (!ex) return;
  if ((s.settings.hidden || []).includes(exId)) {
    setHidden(exId, false);
    toast(`${ex.name} can be suggested again`, { iconName: 'eye' });
    return;
  }
  const uses = upcomingUses(s.plan, exId, { fromKey: todayKey(), isDone: (k) => isDone(k, s) });
  if (!uses.length) {
    setHidden(exId, true);
    toast(`Reps won’t suggest ${ex.name}`, { iconName: 'eye-off', action: { label: 'Undo', onClick: () => setHidden(exId, false) } });
    return;
  }
  const n = uses.length;
  const v = await alertDialog({
    title: `${ex.name} is in ${n} upcoming workout${n === 1 ? '' : 's'}`,
    message: 'Pick a replacement and Reps swaps it into those workouts. Or keep it there and only stop new suggestions.',
    actions: [
      { label: 'Choose Replacement', value: 'replace', style: 'filled' },
      { label: 'Keep in Those Workouts', value: 'keep', style: 'gray' },
      { label: 'Cancel', value: null, style: 'gray' },
    ],
  });
  if (v === 'keep') {
    setHidden(exId, true);
    toast(`Reps won’t suggest ${ex.name} again`, { iconName: 'eye-off' });
  } else if (v === 'replace') {
    const view = replacementView(exId, n);
    if (sheetIsOpen()) pushSheet(view); else openSheet(view, { detent: 'large' });
  }
}

function replacementView(exId, n) {
  const ex = EX[exId];
  return {
    title: 'Choose Replacement',
    subtitle: `For ${ex.name}`,
    render: () => {
      const s = getState();
      const equipment = s.plan?.equipment || ['bodyweight'];
      const pool = allowedExercises(s.settings).filter((e) => e.id !== exId);
      const best = alternatives(ex, pool, equipment).slice(0, 12);
      const rest = pool.filter((e) => canDo(e, equipment) && !best.includes(e));
      const row = (e) => `<button class="row has-icon" data-action="lib-replace-with" data-old="${exId}" data-ex="${e.id}">
        <div class="row-icon" style="background:${EQUIP_COLOR[mainEquip(e)]}">${icon(EQUIP_ICON[mainEquip(e)] || 'dumbbell')}</div>
        <div class="grow"><div class="title truncate">${esc(e.name)}</div><div class="subtitle truncate">${esc(PATTERNS[e.pattern])} · ${esc(e.muscles.map(titleCase).join(', '))}</div></div>
      </button>`;
      return `<p class="t-callout sec" style="margin:0">The replacement goes into the ${n} upcoming workout${n === 1 ? '' : 's'} that use ${esc(ex.name)}, keeping their sets, reps and rest. Completed days stay as they were.</p>
        <section class="section"><div class="section-head"><div class="section-title">Best Matches</div></div><div class="list">${best.map(row).join('') || '<div class="row sec">No close matches with your equipment.</div>'}</div></section>
        <section class="section"><div class="section-head"><div class="section-title">Everything Else</div></div><div class="list">${rest.map(row).join('')}</div></section>`;
    },
  };
}

function replaceAndHide(oldId, newId) {
  let changed = 0;
  update((st) => {
    const h = new Set(st.settings.hidden || []);
    h.add(oldId);
    st.settings.hidden = [...h];
    if (st.plan) changed = replaceInPlan(st.plan, oldId, newId, { fromKey: todayKey(), isDone: (k) => !!st.log[k]?.completed, exMap: EX });
  });
  if (sheetIsOpen()) { popSheet(); }
  toast(`Swapped ${EX[newId].name} into ${changed} workout${changed === 1 ? '' : 's'}`, { iconName: 'shuffle' });
}

/* ---------- Swipe gesture ---------- */

const ACTION_W = 92;
let swipe = null;
let openRow = null;
let suppressRowClick = 0;

function closeSwipe(row) {
  const c = row?.querySelector('.swipe-content');
  if (c) c.style.transform = '';
  row?.style.removeProperty('--reveal');
  if (openRow === row) openRow = null;
}

document.addEventListener('pointerdown', (e) => {
  const content = e.target.closest('.swipe-content');
  if (openRow && (!content || content.parentElement !== openRow) && !e.target.closest('.swipe-action')) closeSwipe(openRow);
  if (!content) return;
  swipe = { row: content.parentElement, content, x0: e.clientX, y0: e.clientY, dx: 0, base: content.parentElement === openRow ? -ACTION_W : 0, decided: false, horizontal: false };
});

document.addEventListener('pointermove', (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x0;
  const dy = e.clientY - swipe.y0;
  if (!swipe.decided) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    swipe.decided = true;
    swipe.horizontal = Math.abs(dx) > Math.abs(dy);
    if (!swipe.horizontal) { swipe = null; return; }
    swipe.content.classList.add('is-dragging');
    try { swipe.content.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
  }
  let x = swipe.base + dx;
  if (x > 0) x /= 4;
  swipe.dx = x;
  swipe.content.style.transform = `translateX(${x}px)`;
  swipe.row.style.setProperty('--reveal', `${Math.max(ACTION_W, -x)}px`);
});

function endSwipe(cancel) {
  if (!swipe) return;
  const s = swipe;
  swipe = null;
  if (!s.horizontal) return;
  s.content.classList.remove('is-dragging');
  suppressRowClick = Date.now() + 350;
  if (!cancel && s.dx < -Math.min(220, s.row.offsetWidth * 0.55)) {
    closeSwipe(s.row);
    toggleHide(s.row.dataset.ex);
  } else if (!cancel && s.dx < -ACTION_W / 2) {
    s.content.style.transform = `translateX(${-ACTION_W}px)`;
    s.row.style.setProperty('--reveal', `${ACTION_W}px`);
    openRow = s.row;
  } else closeSwipe(s.row);
}
document.addEventListener('pointerup', () => endSwipe(false));
document.addEventListener('pointercancel', () => endSwipe(true));
