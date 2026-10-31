// Sync screens: the Settings section, connecting a profile to GitHub, choosing a
// sync file, and setting up a new device from GitHub.

import { icon } from '../icons.js';
import { esc, pushSheet, popSheet, closeSheet, refreshSheet, alertDialog, toast } from '../ui.js';
import { getProfile, getProfiles, activeProfile, addProfile, updateProfile, switchProfile } from '../store.js';
import { verifyToken, findRemoteProfiles, readRemote, linkProfile, unlinkProfile, getStatus, syncProfile, savedTokens } from '../sync.js';

const TOKEN_URL = 'https://github.com/settings/tokens/new?description=Reps%20sync&scopes=gist';
const ctx = { pid: null, token: '', login: '', found: [], busy: false, error: '', mode: 'link' };

function ago(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}

export function statusText(pid) {
  const s = getStatus(pid);
  if (s.state === 'off') return 'Not connected';
  if (s.state === 'syncing' || s.state === 'pending') return 'Syncing…';
  if (s.state === 'offline') return 'Offline. Changes sync when you are back online.';
  if (s.state === 'error') return s.message || 'Sync failed';
  return s.lastSyncAt ? `Synced ${ago(s.lastSyncAt)}` : 'Connected';
}

/** Update status lines in place (no re-render, so typing elsewhere is not interrupted). */
export function refreshStatusLines() {
  document.querySelectorAll('[data-sync-status]').forEach((n) => {
    const pid = n.dataset.syncStatus;
    n.textContent = statusText(pid);
    n.classList.toggle('is-error', getStatus(pid).state === 'error');
  });
}

/* ---------- Settings section ---------- */

export function syncSectionHtml(pid) {
  const p = getProfile(pid);
  if (!p) return '';
  if (!p.sync?.gistId) {
    return `<section class="section"><div class="section-head"><div class="section-title">Sync</div></div>
      <div class="list">
        <button class="row has-icon" data-action="sync-connect"><div class="row-icon" style="background:var(--gray)">${icon('cloud')}</div>
          <div class="grow"><div class="title">Sync with GitHub</div><div class="subtitle">Keep ${esc(p.name)}’s plan the same on every device</div></div>${icon('chevron-right', 'chev')}</button>
      </div>
      <p class="footnote">Saves this profile to a secret gist on a GitHub account. Free, and nothing else is shared.</p></section>`;
  }
  return `<section class="section"><div class="section-head"><div class="section-title">Sync</div></div>
    <div class="list">
      <div class="row has-icon"><div class="row-icon" style="background:var(--green)">${icon('cloud')}</div>
        <div class="grow"><div class="title">GitHub · @${esc(p.sync.login || 'account')}</div><div class="subtitle sync-line" data-sync-status="${pid}">${esc(statusText(pid))}</div></div></div>
      <button class="row has-icon" data-action="sync-now"><div class="row-icon" style="background:var(--blue)">${icon('refresh-cw')}</div><div class="grow title">Sync Now</div></button>
      <button class="row has-icon" data-action="sync-unlink"><div class="row-icon" style="background:var(--red)">${icon('unlink')}</div><div class="grow title" style="color:var(--red)">Stop Syncing on This Device</div></button>
    </div>
    <p class="footnote">Stored in a secret gist on @${esc(p.sync.login || 'your account')}’s GitHub. Secret gists are unlisted, not encrypted: anyone with the exact link could read the workout data.</p></section>`;
}

/* ---------- Token entry (shared by connect and restore) ---------- */

function tokenSteps(pid) {
  const saved = savedTokens(pid);
  return `
    <ol class="list steps">
      <li class="row"><span class="step-n rounded">1</span><span class="grow"><b>Create a token on GitHub.</b> Tick only <b>gist</b> and choose an expiry date, for example one year.
        <a class="btn btn-tinted sm" style="margin-top:8px" href="${TOKEN_URL}" target="_blank" rel="noopener">${icon('external-link', 'xs')} Open GitHub</a></span></li>
      <li class="row"><span class="step-n rounded">2</span><span class="grow"><b>Paste it here.</b> It stays on this device and is never put in the gist.
        <input class="field" style="margin-top:10px" id="sync-token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ghp_…" value="${esc(ctx.token)}" aria-label="GitHub token"></span></li>
    </ol>
    ${saved.length ? `<div class="list">${saved.map((t, i) => `<button class="row has-icon" data-action="sync-use-saved" data-i="${i}"><div class="row-icon" style="background:var(--indigo)">${icon('key-round')}</div>
      <div class="grow"><div class="title">Use @${esc(t.login)}’s token</div><div class="subtitle">Already saved for ${esc(t.from)} on this device</div></div></button>`).join('')}</div>` : ''}
    ${ctx.error ? `<div class="sync-error">${icon('triangle-alert', 'sm')}<span>${esc(ctx.error)}</span></div>` : ''}`;
}

export function connectView(pid) {
  return {
    title: 'Sync with GitHub',
    get subtitle() { return getProfile(pid)?.name || ''; },
    render: () => {
      ctx.pid = pid;
      ctx.mode = 'link';
      return `<p class="t-callout sec" style="margin:0">Reps saves this profile to a secret gist on GitHub. Every device using a token for the same account stays in step, and it keeps working offline.</p>
        ${tokenSteps(pid)}
        <button class="btn btn-filled lg block" data-action="sync-verify" ${ctx.busy ? 'disabled' : ''}>${ctx.busy ? 'Connecting…' : 'Connect'}</button>`;
    },
  };
}

function chooseView() {
  return {
    title: 'Choose Sync File',
    get subtitle() { return `@${ctx.login}`; },
    render: () => {
      const p = getProfile(ctx.pid);
      return `<p class="t-callout sec" style="margin:0">These Reps sync files are on @${esc(ctx.login)}’s GitHub. Link ${esc(p?.name || 'this profile')} to one to continue from another device, or start a new file.</p>
        <div class="list">${ctx.found.map((f) => `<button class="row has-icon" data-action="sync-link" data-gist="${esc(f.gistId)}" ${ctx.busy ? 'disabled' : ''}>
          <div class="row-icon" style="background:var(--green)">${icon('cloud')}</div>
          <div class="grow"><div class="title">${esc(f.name)}</div><div class="subtitle">Updated ${esc(ago(Date.parse(f.updatedAt)))}</div></div>${icon('chevron-right', 'chev')}</button>`).join('')}</div>
        <div class="list"><button class="row has-icon" data-action="sync-link-new" ${ctx.busy ? 'disabled' : ''}><div class="row-icon" style="background:var(--accent)">${icon('plus')}</div>
          <div class="grow"><div class="title">New Sync File for ${esc(p?.name || 'this profile')}</div><div class="subtitle">Upload what is on this device</div></div></button></div>
        <p class="footnote">Linking to an existing file merges it with this device: the most recently changed plan wins, and completed days from both are kept.</p>`;
    },
  };
}

export function restoreView() {
  Object.assign(ctx, { token: '', login: '', found: [], error: '', busy: false });
  return {
    title: 'Set Up from GitHub',
    render: () => {
      ctx.mode = 'restore';
      ctx.pid = null;
      if (ctx.found.length && ctx.login) {
        const have = new Set(getProfiles().map((p) => p.sync?.gistId).filter(Boolean));
        return `<p class="t-callout sec" style="margin:0">Profiles saved on @${esc(ctx.login)}’s GitHub. Add the ones that train on this device.</p>
          <div class="list">${ctx.found.map((f) => `<button class="row has-icon" data-action="sync-restore-one" data-gist="${esc(f.gistId)}" ${have.has(f.gistId) || ctx.busy ? 'disabled' : ''}>
            <div class="row-icon" style="background:var(--green)">${icon('cloud')}</div>
            <div class="grow"><div class="title">${esc(f.name)}</div><div class="subtitle">${have.has(f.gistId) ? 'Already on this device' : `Updated ${esc(ago(Date.parse(f.updatedAt)))}`}</div></div>
            ${have.has(f.gistId) ? icon('check', 'sm') : `<span class="accent">${icon('plus')}</span>`}</button>`).join('')}</div>
          <button class="btn btn-filled lg block" data-action="sync-restore-all" ${ctx.busy ? 'disabled' : ''}>${ctx.busy ? 'Adding…' : 'Add All'}</button>`;
      }
      return `<p class="t-callout sec" style="margin:0">Already use Reps on another device with sync on? Connect the same GitHub account to bring those profiles here.</p>
        ${tokenSteps(null)}
        <button class="btn btn-filled lg block" data-action="sync-verify" ${ctx.busy ? 'disabled' : ''}>${ctx.busy ? 'Looking…' : 'Find My Profiles'}</button>`;
    },
  };
}

/* ---------- Actions ---------- */

async function busy(fn) {
  ctx.busy = true; ctx.error = ''; refreshSheet();
  try { await fn(); } catch (e) { ctx.error = e.message || 'Something went wrong'; } finally { ctx.busy = false; refreshSheet(); }
}

async function restoreGist(gistId) {
  const remote = await readRemote(ctx.token, gistId);
  if (!remote?.state) throw new Error('That sync file is empty or damaged.');
  const rp = remote.profile || {};
  const existing = rp.id && getProfile(rp.id);
  const sync = { token: ctx.token, login: ctx.login, gistId, lastSyncAt: 0, lastError: null };
  if (existing) { updateProfile(existing.id, { sync }, { quiet: true }); syncProfile(existing.id); return existing; }
  return addProfile({ id: rp.id || undefined, name: rp.name || 'Profile', color: rp.color || 'orange', photo: rp.photo || null, sync, data: remote.state });
}

function finishRestore(added) {
  ctx.found = []; ctx.token = '';
  closeSheet();
  if (added[0] && !activeProfile()) switchProfile(added[0].id);
  document.dispatchEvent(new CustomEvent('reps:profiles'));
  if (added.length) toast(added.length === 1 ? `${added[0].name} added` : `${added.length} profiles added`, { iconName: 'cloud' });
}

export const actions = {
  'sync-connect': () => { ctx.token = ''; ctx.error = ''; ctx.found = []; pushSheet(connectView(activeProfile().id)); },
  'sync-use-saved': (b) => {
    const t = savedTokens(ctx.pid)[+b.dataset.i];
    if (!t) return;
    ctx.token = t.token;
    actions['sync-verify']();
  },
  'sync-verify': () => busy(async () => {
    const token = ctx.token.trim();
    if (!token) throw new Error('Paste your GitHub token first.');
    const user = await verifyToken(token);
    ctx.token = token;
    ctx.login = user.login;
    ctx.found = await findRemoteProfiles(token);
    if (ctx.mode === 'restore') {
      if (!ctx.found.length) throw new Error(`No Reps sync files found on @${user.login}. Turn on sync on your other device first.`);
      return;
    }
    if (ctx.found.length) { pushSheet(chooseView()); return; }
    await linkProfile(ctx.pid, { token, login: user.login });
    popSheet();
    toast('Sync is on', { iconName: 'cloud' });
  }),
  'sync-link': (b) => busy(async () => {
    await linkProfile(ctx.pid, { token: ctx.token, login: ctx.login, gistId: b.dataset.gist });
    popSheet(); popSheet();
    toast('Sync is on', { iconName: 'cloud' });
  }),
  'sync-link-new': () => busy(async () => {
    await linkProfile(ctx.pid, { token: ctx.token, login: ctx.login });
    popSheet(); popSheet();
    toast('Sync is on', { iconName: 'cloud' });
  }),
  'sync-restore-one': (b) => busy(async () => { finishRestore([await restoreGist(b.dataset.gist)]); }),
  'sync-restore-all': () => busy(async () => {
    const have = new Set(getProfiles().map((p) => p.sync?.gistId).filter(Boolean));
    const added = [];
    for (const f of ctx.found) if (!have.has(f.gistId)) added.push(await restoreGist(f.gistId));
    finishRestore(added);
  }),
  'sync-now': () => syncProfile(activeProfile()?.id),
  'sync-unlink': async () => {
    const p = activeProfile();
    const ok = await alertDialog({
      title: 'Stop syncing on this device?',
      message: `The token is removed from this device. ${p.name}’s data stays here, and the copy on GitHub is kept.`,
      actions: [{ label: 'Cancel', value: false, style: 'gray' }, { label: 'Stop Syncing', value: true, style: 'danger' }],
    });
    if (!ok) return;
    unlinkProfile(p.id);
    toast('Sync turned off on this device', { iconName: 'cloud-off' });
  },
};

export function onInput(e) {
  if (e.target.id !== 'sync-token') return false;
  ctx.token = e.target.value;
  return true;
}
