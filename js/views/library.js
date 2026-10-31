// Search tab: exercise library, equipment guide, exercise detail with demo video.

import { icon } from '../icons.js';
import { esc, openSheet, pushSheet, sheetIsOpen } from '../ui.js';
import { EXERCISES, EQUIPMENT, EX, EQ, EQUIP_ICON, EQUIP_COLOR, PATTERNS, PATTERN_ORDER, titleCase, mainEquip, youtubeSearchUrl, canEmbedVideo } from '../data.js';
import { LEVELS } from '../generator.js';

const ui = { q: '', equip: 'all' };

export function renderLibrary(s) {
  return {
    title: 'Exercises',
    body: `
      <div class="page-head"><h1 class="t-large" style="margin:0">Exercises</h1>
        <p class="t-sub sec" style="margin:4px 0 0">${EXERCISES.length} moves for small home equipment, each with a form guide.</p></div>
      <div class="search-field">${icon('search', 'sm')}<input id="lib-q" type="search" placeholder="Search name or muscle" value="${esc(ui.q)}" autocomplete="off" aria-label="Search exercises"></div>
      <div class="chips scroll" role="tablist">
        <button class="chip ${ui.equip === 'all' ? 'is-on' : ''}" data-action="lib-equip" data-equip="all">All</button>
        ${EQUIPMENT.map((q) => `<button class="chip ${ui.equip === q.id ? 'is-on' : ''}" data-action="lib-equip" data-equip="${q.id}">${icon(EQUIP_ICON[q.id] || 'dumbbell')}${esc(q.name)}</button>`).join('')}
      </div>
      <div id="lib-results" class="section" style="gap:22px">${results(s)}</div>`,
  };
}

function matches(e) {
  if (ui.equip !== 'all' && !e.equipment.includes(ui.equip)) return false;
  if (!ui.q) return true;
  const q = ui.q.toLowerCase();
  return e.name.toLowerCase().includes(q) || e.muscles.some((m) => m.includes(q)) || (PATTERNS[e.pattern] || '').toLowerCase().includes(q);
}

function results(s) {
  const list = EXERCISES.filter(matches);
  const guide = !ui.q ? equipmentGuide(s) : '';
  if (!list.length) return `${guide}<div class="card empty">${icon('search')}<div class="t-headline">No matches</div><p class="t-sub sec" style="margin:0">Try another name, a muscle like “glutes”, or clear the filter.</p></div>`;
  const groups = PATTERN_ORDER.map((p) => [p, list.filter((e) => e.pattern === p)]).filter(([, l]) => l.length);
  return `${guide}${groups.map(([p, l]) => `
    <section class="section">
      <div class="section-head"><div class="section-title">${esc(PATTERNS[p])}</div><span class="sec t-foot">${l.length}</span></div>
      <div class="list">${l.map(exerciseRow).join('')}</div>
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

export function exerciseRow(e) {
  const eq = mainEquip(e);
  return `<button class="row has-icon" data-action="open-exercise" data-ex="${e.id}">
    <div class="row-icon" style="background:${EQUIP_COLOR[eq]}">${icon(EQUIP_ICON[eq] || 'dumbbell')}</div>
    <div class="grow"><div class="title truncate">${esc(e.name)}</div><div class="subtitle truncate">${esc(e.muscles.map(titleCase).join(', '))} · ${esc(LEVELS[e.level])}</div></div>
    ${e.video ? `<span class="ter">${icon('circle-play', 'sm')}</span>` : ''}
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
  frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&playsinline=1&rel=0&modestbranding=1"
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
          <ul class="list steps">${ex.cues.map((c) => `<li class="row"><span class="cue-ic">${icon('sparkles', 'sm')}</span><span class="grow">${esc(c)}</span></li>`).join('')}</ul>
        </section>
        <section class="section">
          <div class="section-head"><div class="section-title">Muscles</div></div>
          <div class="chips">${ex.muscles.map((m) => `<span class="tag accent">${esc(titleCase(m))}</span>`).join('')}</div>
        </section>
        ${ex.source ? `<a class="btn btn-gray block" href="${esc(ex.source)}" target="_blank" rel="noopener">${icon('external-link', 'sm')} Full guide (${esc(new URL(ex.source).hostname.replace('www.', ''))})</a>` : ''}`;
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
  'open-exercise': (el) => openExercise(el.dataset.ex),
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
