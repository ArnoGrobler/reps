// "Who's training?" picker (full-screen cover) and the add/edit profile sheet.
// Each profile has its own plan, history, settings and GitHub sync link.

import { icon } from '../icons.js';
import { esc, openSheet, pushSheet, popSheet, closeSheet, sheetIsOpen, refreshSheet, alertDialog, toast, switchHtml } from '../ui.js';
import { getRegistry, getProfiles, getProfile, activeProfile, switchProfile, addProfile, updateProfile, deleteProfile, setAskOnLaunch, PROFILE_COLORS } from '../store.js';
import { getStatus, syncSoon } from '../sync.js';
import { restoreView } from './sync.js';

let el = null;
const ui = { editing: false, firstRun: false };
const draft = { id: null, name: '', color: 'orange', photo: null, pushed: false };

export const initial = (p) => (p?.name || '?').trim().charAt(0).toUpperCase() || '?';

export function avatarHtml(p, cls = '') {
  if (p?.photo) return `<span class="avatar has-photo ${cls}" style="--c:var(--${p.color || 'gray'})" aria-hidden="true"><img src="${esc(p.photo)}" alt=""></span>`;
  return `<span class="avatar ${cls}" style="--c:var(--${p?.color || 'gray'})" aria-hidden="true">${esc(initial(p))}</span>`;
}

/* ---------- Picker ---------- */

export function openProfiles({ firstRun = false } = {}) {
  ui.firstRun = firstRun || !activeProfile();
  ui.editing = false;
  if (!el) {
    el = document.createElement('div');
    el.className = 'cover profiles';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Choose profile');
    document.getElementById('overlays').appendChild(el);
    document.documentElement.style.overflow = 'hidden';
    document.body.classList.add('cover-open');
  }
  render();
}

export function closeProfiles() {
  if (!el || !activeProfile()) return;
  const node = el;
  el = null;
  node.classList.add('out');
  document.documentElement.style.overflow = '';
  document.body.classList.remove('cover-open');
  setTimeout(() => node.remove(), 360);
}

export function refreshProfiles() { if (el) render(); }

function render() {
  const reg = getRegistry();
  const profiles = getProfiles();
  const active = activeProfile();
  const canClose = !ui.firstRun && active;
  el.classList.toggle('is-editing', ui.editing);
  el.innerHTML = `
    <header class="wiz-top">
      ${canClose ? `<button class="icon-btn glass glass-interactive" data-action="pf-close" aria-label="Close">${icon('x')}</button>` : '<span style="width:44px"></span>'}
      <span></span>
      ${profiles.length ? `<button class="toolbar-pill glass glass-interactive" data-action="pf-edit-toggle">${ui.editing ? 'Done' : 'Edit'}</button>` : '<span style="width:44px"></span>'}
    </header>
    <div class="profiles-body">
      <div class="profiles-head">
        <h1 class="t-large">${profiles.length ? 'Who’s training?' : 'Welcome to Reps'}</h1>
        <p class="t-callout sec">${profiles.length
          ? (ui.editing ? 'Tap a profile to rename it, change its color or delete it.' : 'Each person gets their own plan, history and settings.')
          : 'Add a profile for each person who trains with this device.'}</p>
      </div>
      <div class="profile-grid">
        ${profiles.map((p) => {
          const st = getStatus(p.id);
          return `<button class="profile-tile ${active?.id === p.id ? 'is-active' : ''}" data-action="pf-pick" data-id="${p.id}" aria-label="${esc(p.name)}${ui.editing ? ', edit' : ''}">
            <span class="avatar-wrap">${avatarHtml(p, 'xl')}${ui.editing ? `<span class="edit-badge glass">${icon('pencil')}</span>` : ''}</span>
            <span class="name">${esc(p.name)}</span>
            <span class="meta">${st.state === 'off' ? 'This device' : `${icon(st.state === 'error' ? 'cloud-off' : 'cloud', 'xs')} Synced`}</span>
          </button>`;
        }).join('')}
        <button class="profile-tile" data-action="pf-add" aria-label="Add profile">
          <span class="avatar-wrap"><span class="avatar xl add">${icon('plus', 'lg')}</span></span>
          <span class="name">Add Profile</span>
          <span class="meta">&nbsp;</span>
        </button>
      </div>
      ${profiles.length > 1 ? `<div class="list profiles-opt"><div class="row"><div class="grow"><div class="title">Ask when Reps opens</div><div class="subtitle">Show this screen each time</div></div>${switchHtml('pf:ask', reg.askOnLaunch, 'Ask who is training when Reps opens')}</div></div>` : ''}
      <button class="btn btn-plain" data-action="pf-restore">${icon('cloud', 'sm')} Set Up from GitHub</button>
    </div>`;
}

/* ---------- Add / edit sheet ---------- */

function startDraft(p) {
  draft.id = p?.id || null;
  draft.name = p?.name || '';
  draft.photo = p?.photo || null;
  const used = new Set(getProfiles().map((x) => x.color));
  draft.color = p?.color || PROFILE_COLORS.find((c) => !used.has(c)) || 'orange';
}

export function profileEditView() {
  return {
    get title() { return draft.id ? 'Edit Profile' : 'New Profile'; },
    trailing: () => `<button class="icon-btn glass glass-prominent glass-interactive" data-action="pf-save" aria-label="Save">${icon('check')}</button>`,
    render: () => `
      <div class="pf-edit-head">${avatarHtml({ name: draft.name || '?', color: draft.color, photo: draft.photo }, 'xl')}
        <div class="pf-photo-actions"><label class="btn btn-tinted sm" for="pf-photo">${draft.photo ? 'Change Photo' : 'Add Photo'}</label>${draft.photo ? '<button class="btn btn-gray sm" data-action="pf-photo-remove">Remove</button>' : ''}</div>
        <input type="file" id="pf-photo" accept="image/*" hidden></div>
      <div class="list"><div class="row"><input class="field plain-field" id="pf-name" placeholder="Name" value="${esc(draft.name)}" maxlength="24" autocomplete="off" autocapitalize="words" aria-label="Profile name"></div></div>
      <section class="section"><div class="section-head"><div class="section-title">Color</div></div>
        <div class="card"><div class="accent-grid">${PROFILE_COLORS.map((c) => `<button class="accent-dot ${draft.color === c ? 'is-on' : ''}" style="--c:var(--${c})" data-action="pf-color" data-color="${c}" aria-label="${c}" aria-pressed="${draft.color === c}"></button>`).join('')}</div></div>
      </section>
      ${draft.id ? '<button class="btn btn-danger block" data-action="pf-delete">Delete Profile</button>' : ''}
      <p class="footnote">${draft.id ? 'Deleting removes this profile’s plan and history from this device. A synced copy on GitHub is kept.' : 'Each profile has its own plan, history and settings.'}</p>`,
  };
}

/** Open the edit sheet for a profile, inside an open sheet (Settings) or on its own. */
export function editProfile(p) {
  startDraft(p);
  draft.pushed = sheetIsOpen();
  if (draft.pushed) pushSheet(profileEditView());
  else openSheet(profileEditView(), { detent: 'large' });
}

function finishEdit() {
  if (draft.pushed) popSheet(); else closeSheet();
}

/* ---------- Actions ---------- */

export const actions = {
  'open-profiles': () => { if (sheetIsOpen()) closeSheet(true); openProfiles(); },
  'pf-close': () => closeProfiles(),
  'pf-edit-toggle': () => { ui.editing = !ui.editing; render(); },
  'pf-pick': (b) => {
    const p = getProfile(b.dataset.id);
    if (!p) return;
    if (ui.editing) { editProfile(p); return; }
    const changed = activeProfile()?.id !== p.id;
    switchProfile(p.id);
    closeProfiles();
    if (changed) toast(`Switched to ${p.name}`, { iconName: 'users' });
  },
  'pf-add': () => editProfile(null),
  'pf-edit-current': () => editProfile(activeProfile()),
  'pf-restore': () => openSheet(restoreView(), { detent: 'large' }),
  'pf-color': (b) => {
    draft.color = b.dataset.color;
    document.querySelectorAll('[data-action="pf-color"]').forEach((d) => { d.classList.toggle('is-on', d === b); d.setAttribute('aria-pressed', d === b); });
    const av = document.querySelector('.pf-edit-head .avatar');
    if (av) av.style.setProperty('--c', `var(--${draft.color})`);
  },
  'pf-save': () => {
    const name = draft.name.trim();
    if (!name) { document.getElementById('pf-name')?.focus(); toast('Enter a name for the profile', { iconName: 'info' }); return; }
    if (draft.id) {
      updateProfile(draft.id, { name, color: draft.color, photo: draft.photo || undefined });
      syncSoon(draft.id, 500);
      finishEdit();
      refreshProfiles();
      toast('Profile saved', { iconName: 'circle-check' });
      return;
    }
    const p = addProfile({ name, color: draft.color, photo: draft.photo });
    finishEdit();
    switchProfile(p.id);
    closeProfiles();
    toast(`Welcome, ${name}`, { iconName: 'users' });
  },
  'pf-photo-remove': () => { draft.photo = null; refreshSheet(); },
  'pf-delete': async () => {
    const p = getProfile(draft.id);
    if (!p) return;
    const ok = await alertDialog({
      title: `Delete ${p.name}?`,
      message: 'Their plan and history are removed from this device. A synced copy on GitHub is kept.',
      actions: [{ label: 'Cancel', value: false, style: 'gray' }, { label: 'Delete', value: true, style: 'danger' }],
    });
    if (!ok) return;
    finishEdit();
    deleteProfile(p.id);
    toast(`${p.name} deleted`, { iconName: 'trash-2' });
    if (!activeProfile()) openProfiles({ firstRun: true }); else refreshProfiles();
  },
};

export function onToggle(id) {
  if (id !== 'pf:ask') return false;
  setAskOnLaunch(!getRegistry().askOnLaunch);
  return true;
}

export function onInput(e) {
  if (e.target.id !== 'pf-name') return false;
  draft.name = e.target.value;
  const av = document.querySelector('.pf-edit-head .avatar');
  if (av) av.textContent = initial({ name: draft.name || '?' });
  return true;
}

/** Crop a chosen photo to a small square so it stays light in storage and sync. */
async function squarePhoto(file, size = 192) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function onChange(e) {
  if (e.target.id !== 'pf-photo') return false;
  const file = e.target.files?.[0];
  if (file) {
    squarePhoto(file)
      .then((data) => { draft.photo = data; refreshSheet(); })
      .catch(() => toast('That photo could not be opened', { iconName: 'info' }));
  }
  e.target.value = '';
  return true;
}
