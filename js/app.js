// App shell: tab routing, navigation bar, floating Liquid Glass tab bar,
// global event delegation, theme, profiles, sync and the workout accessory.

import { icon } from './icons.js';
import { getState, subscribe, activeProfile, getRegistry, onBeforeSwitch, onAfterSwitch } from './store.js';
import { refreshSheet, openSheet, closeSheet } from './ui.js';
import { renderToday } from './views/today.js';
import { renderCalendar, actions as calendarActions } from './views/calendar.js';
import { renderPlan, actions as planActions, resetPlanUi } from './views/plan.js';
import { renderLibrary, actions as libraryActions, onInput as libraryInput } from './views/library.js';
import { actions as dayActions } from './views/day.js';
import * as editor from './views/editor.js';
import * as settings from './views/settings.js';
import * as wizard from './wizard.js';
import * as player from './player.js';
import { haptic } from './audio.js';
import * as profiles from './views/profiles.js';
import * as syncViews from './views/sync.js';
import { startAutoSync, syncProfile } from './sync.js';

const TABS = [
  { id: 'today', label: 'Today', icon: 'house', render: renderToday },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', render: renderCalendar },
  { id: 'plan', label: 'Plan', icon: 'clipboard-list', render: renderPlan },
];
const SEARCH = { id: 'library', label: 'Search', icon: 'search', render: renderLibrary };
const ALL = [...TABS, SEARCH];

const scrollPos = {};
let suppressClickUntil = 0; // a drag gesture just ended; ignore the click it produces
let tab = ALL.some((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : 'today';

const ACTIONS = {
  ...calendarActions, ...planActions, ...libraryActions, ...dayActions,
  ...editor.actions, ...settings.actions, ...wizard.actions, ...player.actions, ...profiles.actions, ...syncViews.actions,
  'go-tab': (el) => go(el.dataset.tab),
  'open-settings': () => openSheet(settings.settingsView(), { detent: 'large' }),
};
const STEP = [editor.onStep, settings.onStep, wizard.onStep];
const SEG = [editor.onSeg, settings.onSeg, wizard.onSeg];
const TOGGLE = [editor.onToggle, settings.onToggle, wizard.onToggle, profiles.onToggle];
const INPUT = [libraryInput, editor.onInput, wizard.onInput, profiles.onInput, syncViews.onInput];
const CHANGE = [settings.onChange, wizard.onChange, profiles.onChange];

/* ---------- Shell ---------- */

function shell() {
  document.getElementById('app').innerHTML = `
    <header class="navbar" id="navbar">
      <div class="navbar-inner">
        <div class="nav-leading" id="nav-leading"></div>
        <div class="nav-title" id="nav-title"></div>
        <div class="nav-trailing" id="nav-trailing"></div>
      </div>
    </header>
    <main class="page" id="page" tabindex="-1"></main>
    <div id="accessory-slot"></div>
    <nav class="tabbar-wrap" id="tabbar-wrap" aria-label="Sections">
      <div class="tabbar glass" role="tablist" id="tabbar" style="--tabs:${TABS.length}">
        <span class="tab-lens" aria-hidden="true"></span>
        ${TABS.map((t, i) => `<button class="tab" role="tab" id="tab-${t.id}" data-action="go-tab" data-tab="${t.id}" data-i="${i}" aria-label="${t.label}">${icon(t.icon)}<span>${t.label}</span></button>`).join('')}
      </div>
      <button class="tab-search glass glass-interactive" role="tab" id="tab-library" data-action="go-tab" data-tab="library" aria-label="Search exercises">${icon('search')}</button>
    </nav>`;
}

function renderPage(animate = false) {
  const s = getState();
  const def = ALL.find((t) => t.id === tab);
  const view = def.render(s);
  const page = document.getElementById('page');
  page.innerHTML = view.body;
  if (animate) { page.classList.remove('enter'); void page.offsetWidth; page.classList.add('enter'); }
  page.classList.toggle('has-accessory', player.hasAccessory());
  document.getElementById('nav-title').textContent = view.title;
  const trailing = view.trailing ?? '';
  const me = activeProfile();
  const avatar = me ? `<button class="avatar-btn" data-action="open-settings" aria-label="${me.name}: account and settings">${profiles.avatarHtml(me, 'nav')}</button>` : '';
  document.getElementById('nav-trailing').innerHTML = `${trailing}${avatar}`;
  document.title = tab === 'today' ? 'Reps' : `${view.title} · Reps`;

  const tabbar = document.getElementById('tabbar');
  const idx = TABS.findIndex((t) => t.id === tab);
  tabbar.style.setProperty('--tab-i', Math.max(0, idx));
  tabbar.classList.toggle('no-lens', idx < 0);
  TABS.forEach((t) => {
    const b = document.getElementById(`tab-${t.id}`);
    b.classList.toggle('is-active', t.id === tab);
    b.setAttribute('aria-selected', t.id === tab);
  });
  const sb = document.getElementById('tab-library');
  sb.classList.toggle('is-active', tab === 'library');
  sb.setAttribute('aria-selected', tab === 'library');
  view.mount?.();
  onScroll();
}

function renderAccessory() {
  document.getElementById('accessory-slot').innerHTML = player.accessoryHtml();
  document.getElementById('page')?.classList.toggle('has-accessory', player.hasAccessory());
}

function go(id) {
  if (id === tab) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (id === 'plan') { resetPlanUi(); renderPage(); }
    return;
  }
  scrollPos[tab] = window.scrollY;
  tab = id;
  try { history.replaceState(null, '', `#${id}`); } catch { /* sandboxed */ }
  renderPage(true);
  window.scrollTo(0, scrollPos[id] || 0);
  if (id === 'calendar' && !scrollPos[id]) renderCalendar(getState()).mount?.();
}

function applyTheme(s) {
  const root = document.documentElement;
  if (s.settings.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = s.settings.theme;
  if (s.settings.accent === 'orange') delete root.dataset.accent;
  else root.dataset.accent = s.settings.accent;
  const dark = s.settings.theme === 'dark' || (s.settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#F2F2F7');
}

/* ---------- Scroll: edge effect + inline title ---------- */

function onScroll() {
  const nav = document.getElementById('navbar');
  nav?.classList.toggle('is-scrolled', window.scrollY > 36);
}

/* ---------- Gestures ---------- */

/** Press and slide along the tab bar: the selection lifts into a glass bubble that follows the thumb. */
function bindTabbarDrag() {
  const bar = document.getElementById('tabbar');
  let down = false, moved = false, startX = 0, hover = -1, rect = null;
  const tabW = () => (rect.width - 8) / TABS.length;
  const place = (x) => {
    const w = tabW();
    bar.style.setProperty('--drag-x', `${Math.max(0, Math.min(rect.width - 8 - w, x - rect.left - 4 - w / 2))}px`);
    const i = Math.max(0, Math.min(TABS.length - 1, Math.floor((x - rect.left - 4) / w)));
    if (i === hover) return;
    hover = i;
    bar.querySelectorAll('.tab').forEach((t, k) => t.classList.toggle('is-hover', k === i));
    if (moved && getState().settings.haptics) haptic(6);
  };
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    rect = bar.getBoundingClientRect();
    down = true; moved = false; startX = e.clientX; hover = -1;
    try { bar.setPointerCapture(e.pointerId); } catch { /* synthetic or lost pointer */ }
    place(e.clientX);
    bar.classList.remove('settle');
    bar.classList.add('is-pressing');
  });
  bar.addEventListener('pointermove', (e) => {
    if (!down) return;
    if (Math.abs(e.clientX - startX) > 6) moved = true;
    place(e.clientX);
  });
  const end = (cancel) => {
    if (!down) return;
    down = false;
    bar.classList.remove('is-pressing');
    bar.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-hover'));
    if (cancel) return;
    suppressClickUntil = Date.now() + 400;
    void bar.offsetWidth;
    bar.classList.add('settle');
    setTimeout(() => bar.classList.remove('settle'), 600);
    if (TABS[hover]) go(TABS[hover].id);
  };
  bar.addEventListener('pointerup', () => end(false));
  bar.addEventListener('pointercancel', () => end(true));
}

/** Drag the workout mini-player upward to open the full workout screen. */
function bindAccessoryDrag() {
  const slot = document.getElementById('accessory-slot');
  let down = false, moved = false, startY = 0, dy = 0, t0 = 0, node = null;
  slot.addEventListener('pointerdown', (e) => {
    const inner = e.target.closest('.accessory-inner');
    if (!inner || e.target.closest('.icon-btn')) return;
    node = inner; down = true; moved = false; startY = e.clientY; dy = 0; t0 = performance.now();
    try { inner.setPointerCapture(e.pointerId); } catch { /* synthetic or lost pointer */ }
    inner.classList.add('is-dragging');
  });
  slot.addEventListener('pointermove', (e) => {
    if (!down) return;
    dy = e.clientY - startY;
    if (Math.abs(dy) > 6) moved = true;
    const y = dy < 0 ? dy : dy / 4;
    node.style.transform = `translateY(${y}px) scale(${1 + Math.min(0.06, Math.max(0, -dy) / 900)})`;
  });
  const end = (cancel) => {
    if (!down) return;
    down = false;
    node.classList.remove('is-dragging');
    node.style.transform = '';
    if (cancel || !moved) return;
    suppressClickUntil = Date.now() + 400;
    const velocity = dy / Math.max(1, performance.now() - t0);
    if (dy < -60 || velocity < -0.45) ACTIONS['pl-open']();
  };
  slot.addEventListener('pointerup', () => end(false));
  slot.addEventListener('pointercancel', () => end(true));
}

/* ---------- Events ---------- */

function bind() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    if (Date.now() < suppressClickUntil && el.closest('#tabbar, #accessory-slot')) return;
    const name = el.dataset.action;
    const s = getState();
    if (name === 'step') { STEP.some((fn) => fn(el.dataset.id, +el.dataset.dir)); return; }
    if (name === 'seg') {
      const seg = el.closest('.segmented');
      const btns = [...seg.querySelectorAll('button')];
      seg.style.setProperty('--i', btns.indexOf(el));
      btns.forEach((b) => { b.classList.toggle('is-on', b === el); b.setAttribute('aria-checked', b === el); });
      SEG.some((fn) => fn(el.dataset.id, el.dataset.value));
      return;
    }
    if (name === 'toggle') {
      el.setAttribute('aria-checked', el.getAttribute('aria-checked') !== 'true');
      TOGGLE.some((fn) => fn(el.dataset.id));
      return;
    }
    const fn = ACTIONS[name];
    if (fn) fn(el, e, s);
  });
  document.addEventListener('input', (e) => { INPUT.some((fn) => fn(e, getState())); });
  document.addEventListener('change', (e) => { CHANGE.some((fn) => fn(e, getState())); });
  document.addEventListener('keydown', (e) => player.onKey(e));
  window.addEventListener('scroll', onScroll, { passive: true });
  bindTabbarDrag();
  bindAccessoryDrag();
  document.addEventListener('reps:render', () => renderPage());
  document.addEventListener('reps:accessory', renderAccessory);
  document.addEventListener('reps:plan-created', () => { resetPlanUi(); go('today'); window.scrollTo(0, 0); });
  document.addEventListener('reps:sync', () => { syncViews.refreshStatusLines(); profiles.refreshProfiles(); });
  document.addEventListener('reps:profiles', () => { renderPage(); profiles.refreshProfiles(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(getState()));
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (ALL.some((t) => t.id === id) && id !== tab) go(id);
  });
}

subscribe((s) => {
  applyTheme(s);
  renderPage(false);
  refreshSheet();
  profiles.refreshProfiles();
});

// Switching profile: park the running workout under the old profile, then load the new one.
onBeforeSwitch(() => { player.suspendForSwitch(); closeSheet(true); });
onAfterSwitch(() => {
  resetPlanUi();
  player.restoreSession();
  renderAccessory();
  window.scrollTo(0, 0);
  syncProfile();
});

shell();
bind();
applyTheme(getState());
player.restoreSession();
renderPage();
renderAccessory();

const reg = getRegistry();
if (!activeProfile()) profiles.openProfiles({ firstRun: true });
else if (reg.askOnLaunch && reg.profiles.length > 1) profiles.openProfiles();
startAutoSync();

if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude\.ai|claudeusercontent/.test(location.hostname)) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
