// Shared UI: sheets (with an in-sheet navigation stack), alerts, menus, toasts,
// and small HTML helpers for iOS controls.

import { icon } from './icons.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const layer = () => document.getElementById('overlays');

/* ---------- Controls ---------- */

export function segmented(id, options, value, style = '') {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return `<div class="segmented" role="radiogroup" style="--n:${options.length};--i:${i};flex:none;${style}">
    <span class="seg-thumb"></span>
    ${options.map((o) => `<button role="radio" aria-checked="${o.value === value}" class="${o.value === value ? 'is-on' : ''}" data-action="seg" data-id="${id}" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join('')}
  </div>`;
}

export function switchHtml(id, on, label) {
  return `<button class="switch" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" data-action="toggle" data-id="${id}"></button>`;
}

export function stepperHtml(id, { canDec = true, canInc = true, label = '' } = {}) {
  return `<div class="stepper" role="group" aria-label="${esc(label)}">
    <button data-action="step" data-id="${id}" data-dir="-1" aria-label="Decrease ${esc(label)}" ${canDec ? '' : 'disabled'}>${icon('minus')}</button><i></i>
    <button data-action="step" data-id="${id}" data-dir="1" aria-label="Increase ${esc(label)}" ${canInc ? '' : 'disabled'}>${icon('plus')}</button>
  </div>`;
}

export function ringSvg(pct, { size = 76, stroke = 9, color = 'var(--accent)', track = true } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, pct)));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    ${track ? `<circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>` : ''}
    <circle class="val" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke="${color}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/>
  </svg>`;
}

/* ---------- Sheets ---------- */

let sheet = null; // { root, el, stack, detent, onClose }

export function sheetIsOpen() { return !!sheet; }

/**
 * view = { title, subtitle?, trailing?: () => html, render: () => html, mount?(body) }
 */
export function openSheet(view, { detent = 'medium', onClose } = {}) {
  if (sheet) closeSheet(true);
  const root = document.createElement('div');
  root.className = 'sheet-layer';
  root.innerHTML = `<div class="sheet-scrim" data-sheet-close></div>
    <section class="sheet ${detent === 'large' ? 'detent-large' : ''}" role="dialog" aria-modal="true">
      <div class="sheet-grab" data-sheet-grab title="Drag to resize"></div>
      <header class="sheet-toolbar" data-sheet-grab></header>
      <div class="sheet-body"></div>
    </section>`;
  layer().appendChild(root);
  sheet = { root, el: root.querySelector('.sheet'), stack: [view], detent, onClose };
  renderSheet();
  bindSheetGestures(sheet);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-open')));
  document.documentElement.style.overflow = 'hidden';
}

export function pushSheet(view) {
  if (!sheet) return openSheet(view, { detent: 'large' });
  sheet.stack.push(view);
  setDetent('large');
  renderSheet(true);
}

export function popSheet() {
  if (!sheet) return;
  if (sheet.stack.length > 1) { sheet.stack.pop(); renderSheet(true); }
  else closeSheet();
}

export function closeSheet(immediate = false) {
  if (!sheet) return;
  const { root, onClose } = sheet;
  sheet = null;
  document.documentElement.style.overflow = '';
  if (immediate) root.remove();
  else {
    root.classList.remove('is-open');
    setTimeout(() => root.remove(), 420);
  }
  onClose?.();
}

export function setDetent(d) {
  if (!sheet) return;
  sheet.detent = d;
  sheet.el.classList.toggle('detent-large', d === 'large');
}

/** Re-render the visible sheet view (after state changes). Keeps scroll position. */
export function refreshSheet() {
  if (sheet) renderSheet(false);
}

function renderSheet(resetScroll = false) {
  const view = sheet.stack[sheet.stack.length - 1];
  const tb = sheet.el.querySelector('.sheet-toolbar');
  const body = sheet.el.querySelector('.sheet-body');
  const back = sheet.stack.length > 1;
  const trailing = view.trailing ? view.trailing() : '<span></span>';
  tb.innerHTML = `
    ${back
      ? `<button class="icon-btn glass glass-interactive" data-sheet-back aria-label="Back">${icon('chevron-left')}</button>`
      : `<button class="icon-btn glass glass-interactive" data-sheet-close aria-label="Close">${icon('x')}</button>`}
    <div class="sheet-title">${esc(view.title || '')}${view.subtitle ? `<small>${esc(view.subtitle)}</small>` : ''}</div>
    ${trailing}`;
  const top = body.scrollTop;
  body.innerHTML = view.render();
  body.scrollTop = resetScroll ? 0 : top;
  view.mount?.(body);
}

function bindSheetGestures(s) {
  const { root, el } = s;
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-sheet-back]')) popSheet();
    else if (e.target.closest('[data-sheet-close]')) closeSheet();
  });
  const body = el.querySelector('.sheet-body');
  body.addEventListener('scroll', () => {
    if (sheet === s && s.detent === 'medium' && body.scrollTop > 12) setDetent('large');
  }, { passive: true });

  let startY = 0, dy = 0, dragging = false, moved = false;
  el.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('[data-sheet-grab]') || e.target.closest('button')) return;
    dragging = true; moved = false; startY = e.clientY; dy = 0;
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dy = e.clientY - startY;
    if (Math.abs(dy) > 4) moved = true;
    const y = dy > 0 ? dy : dy / 4; // rubber-band upward
    el.style.transform = `translateY(${y}px)`;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging');
    el.style.transform = '';
    if (sheet !== s) return;
    if (!moved) { setDetent(s.detent === 'large' ? 'medium' : 'large'); return; }
    if (dy > 110) { if (s.detent === 'large' && dy < 320) setDetent('medium'); else closeSheet(); }
    else if (dy < -50) setDetent('large');
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/* ---------- Alerts ---------- */

/** actions: [{ label, value, style: 'filled' | 'danger' | 'gray' }] → Promise<value|null> */
export function alertDialog({ title, message = '', actions = [{ label: 'OK', value: true, style: 'filled' }] }) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'alert-layer';
    const two = actions.length === 2;
    root.innerHTML = `<div class="sheet-scrim" data-v="__cancel"></div>
      <div class="alert glass" role="alertdialog" aria-label="${esc(title)}">
        <div class="t-headline">${esc(title)}</div>
        ${message ? `<p>${esc(message)}</p>` : '<div style="height:12px"></div>'}
        <div class="actions ${two ? 'two' : ''}">
          ${actions.map((a, i) => `<button class="btn btn-${a.style || 'gray'}" data-i="${i}">${esc(a.label)}</button>`).join('')}
        </div>
      </div>`;
    layer().appendChild(root);
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i],[data-v]');
      if (!b) return;
      root.remove();
      resolve(b.dataset.i != null ? actions[+b.dataset.i].value : null);
    });
  });
}

/* ---------- Menus ---------- */

/** items: [{ label, icon, value, danger }] or { sep: true } → Promise<value|null> */
export function showMenu(anchor, items) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'menu-layer';
    root.innerHTML = `<div class="menu glass" role="menu">
      ${items.map((it, i) => it.sep ? '<hr>' : `<button role="menuitem" class="${it.danger ? 'danger' : ''}" data-i="${i}"><span>${esc(it.label)}</span>${it.icon ? icon(it.icon) : ''}</button>`).join('')}
    </div>`;
    layer().appendChild(root);
    const menu = root.querySelector('.menu');
    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const left = Math.max(12, Math.min(window.innerWidth - mw - 12, r.right - mw));
    menu.style.left = `${left}px`;
    const below = r.bottom + 8;
    if (below + menu.offsetHeight > window.innerHeight - 12) {
      menu.style.top = `${Math.max(12, r.top - menu.offsetHeight - 8)}px`;
      menu.style.transformOrigin = 'bottom right';
    } else menu.style.top = `${below}px`;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      root.remove();
      resolve(b ? items[+b.dataset.i].value : null);
    });
  });
}

/* ---------- Toasts ---------- */

let toastTimer = 0;
export function toast(text, { iconName = 'circle-check', action, duration = 2800 } = {}) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  clearTimeout(toastTimer);
  wrap.innerHTML = `<div class="toast glass" role="status">${icon(iconName)}<span>${esc(text)}</span>${action ? `<button class="btn btn-tinted">${esc(action.label)}</button>` : '<span style="width:8px"></span>'}</div>`;
  const el = wrap.firstElementChild;
  if (action) el.querySelector('button').onclick = () => { action.onClick(); el.remove(); };
  toastTimer = setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, duration);
}
