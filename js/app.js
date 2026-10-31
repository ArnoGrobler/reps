// App shell: tab routing, navigation bar, floating Liquid Glass tab bar,
// global event delegation, theme, and the workout accessory.

import { icon } from './icons.js';
import { getState, subscribe } from './store.js';
import { refreshSheet, openSheet, sheetIsOpen } from './ui.js';
import { renderToday } from './views/today.js';
import { renderCalendar, actions as calendarActions } from './views/calendar.js';
import { renderPlan, actions as planActions, resetPlanUi } from './views/plan.js';
import { renderLibrary, actions as libraryActions, onInput as libraryInput } from './views/library.js';
import { actions as dayActions } from './views/day.js';
import * as editor from './views/editor.js';
import * as settings from './views/settings.js';
import * as wizard from './wizard.js';
import * as player from './player.js';

const TABS = [
  { id: 'today', label: 'Today', icon: 'house', render: renderToday },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', render: renderCalendar },
  { id: 'plan', label: 'Plan', icon: 'clipboard-list', render: renderPlan },
];
const SEARCH = { id: 'library', label: 'Search', icon: 'search', render: renderLibrary };
const ALL = [...TABS, SEARCH];

const scrollPos = {};
let tab = ALL.some((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : 'today';

const ACTIONS = {
  ...calendarActions, ...planActions, ...libraryActions, ...dayActions,
  ...editor.actions, ...settings.actions, ...wizard.actions, ...player.actions,
  'go-tab': (el) => go(el.dataset.tab),
  'open-settings': () => openSheet(settings.settingsView(), { detent: 'large' }),
};
const STEP = [editor.onStep, settings.onStep, wizard.onStep];
const SEG = [editor.onSeg, settings.onSeg, wizard.onSeg];
const TOGGLE = [editor.onToggle, settings.onToggle, wizard.onToggle];
const INPUT = [libraryInput, editor.onInput, wizard.onInput];
const CHANGE = [settings.onChange, wizard.onChange];

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
  const settingsBtn = tab === 'today' ? `<button class="icon-btn glass glass-interactive" data-action="open-settings" aria-label="Settings">${icon('settings')}</button>` : '';
  document.getElementById('nav-trailing').innerHTML = `${trailing}${settingsBtn}`;
  document.title = tab === 'today' ? 'Reps' : `${view.title} · Reps`;

  const tabbar = document.getElementById('tabbar');
  const idx = TABS.findIndex((t) => t.id === tab);
  tabbar.style.setProperty('--tab-i', Math.max(0, idx));
  tabbar.querySelector('.tab-lens').style.opacity = idx < 0 ? '0' : '1';
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

/* ---------- Events ---------- */

function bind() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
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
  document.addEventListener('reps:render', () => renderPage());
  document.addEventListener('reps:accessory', renderAccessory);
  document.addEventListener('reps:plan-created', () => { resetPlanUi(); go('today'); window.scrollTo(0, 0); });
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
});

shell();
bind();
applyTheme(getState());
player.restoreSession();
renderPage();
renderAccessory();

if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude\.ai|claudeusercontent/.test(location.hostname)) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
