// GitHub Gist sync, per profile.
// Each profile can link to one secret gist holding its plan, history and settings.
// This device's storage stays the working copy (works offline); sync pulls, merges and
// pushes: the newest plan and settings win, and history merges day by day by timestamp.
// The GitHub token is stored only in this device's profile list, never in the gist.

import { getProfile, getProfiles, activeProfile, updateProfile, readProfileState, applyRemoteState, onLocalChange } from './store.js';

const API = 'https://api.github.com';
export const FILE = 'reps-profile.json';
const DESCRIPTION = 'Reps workout data';

const status = {};          // profile id → { state: idle|pending|syncing|ok|error|offline, message }
let pushTimer = 0;
let chain = Promise.resolve();   // syncs run one at a time, in order
const jobs = new Map();          // profile id → { promise, started }

/* ---------- GitHub API ---------- */

async function gh(token, path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error('Could not reach GitHub. Check your connection.');
    err.offline = true;
    throw err;
  }
  if (!res.ok) {
    const msg = res.status === 401 ? 'GitHub rejected the token. It may have expired or been revoked.'
      : res.status === 403 ? 'GitHub refused the request. The token needs the “gist” permission.'
      : res.status === 404 ? 'The sync file is no longer on GitHub.'
      : `GitHub returned an error (${res.status}).`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/** Check a token and return the GitHub account it belongs to. */
export async function verifyToken(token) {
  const u = await gh(token, '/user');
  return { login: u.login, name: u.name || u.login };
}

/** Reps sync files this token can see: [{ gistId, name, updatedAt }]. */
export async function findRemoteProfiles(token) {
  const gists = await gh(token, '/gists?per_page=100');
  return gists
    .filter((g) => g.files && g.files[FILE])
    .map((g) => ({
      gistId: g.id,
      name: (g.description || '').split('·')[1]?.trim() || 'Profile',
      updatedAt: g.updated_at,
    }));
}

/** The stored payload, or null if the gist exists but has no Reps file. */
export async function readRemote(token, gistId) {
  const g = await gh(token, `/gists/${gistId}`);
  const f = g.files?.[FILE];
  if (!f) return null;
  let text = f.content;
  if (f.truncated) {
    const raw = await fetch(f.raw_url, { cache: 'no-store' });
    text = await raw.text();
  }
  try { return JSON.parse(text); } catch { return null; }
}

function payload(profile, state) {
  return JSON.stringify({
    app: 'reps',
    version: 1,
    savedAt: new Date().toISOString(),
    profile: { id: profile.id, name: profile.name, color: profile.color, photo: profile.photo || null },
    state: { version: 1, settings: state.settings, plan: state.plan, log: state.log, meta: state.meta },
  });
}

async function writeRemote(token, gistId, profile, state) {
  await gh(token, `/gists/${gistId}`, {
    method: 'PATCH',
    body: { description: `${DESCRIPTION} · ${profile.name}`, files: { [FILE]: { content: payload(profile, state) } } },
  });
}

export async function createRemote(token, profile, state) {
  const g = await gh(token, '/gists', {
    method: 'POST',
    body: { description: `${DESCRIPTION} · ${profile.name}`, public: false, files: { [FILE]: { content: payload(profile, state) } } },
  });
  return g.id;
}

/* ---------- Merge ---------- */

const at = (entry) => entry?.at || 0;

/**
 * Merge two copies of a profile's state.
 * Plan and settings: the copy changed most recently wins (ties keep whichever exists).
 * History: per day, the most recent entry wins; entries older than an erase are dropped.
 */
export function mergeStates(local, remote) {
  if (!remote) return local;
  const lm = local.meta || {};
  const rm = remote.meta || {};
  const resetAt = Math.max(lm.logResetAt || 0, rm.logResetAt || 0);
  const log = {};
  for (const src of [remote.log || {}, local.log || {}]) {
    for (const [k, v] of Object.entries(src)) {
      if (resetAt && at(v) < resetAt) continue;
      if (!log[k] || at(v) >= at(log[k])) log[k] = v;
    }
  }
  const pick = (lt, rt, lv, rv) => (lt > rt ? lv : rt > lt ? rv : (lv ?? rv));
  return {
    ...local,
    plan: pick(lm.planAt || 0, rm.planAt || 0, local.plan, remote.plan),
    // Settings always exist locally (defaults), so on a tie the synced copy wins.
    settings: (lm.settingsAt || 0) > (rm.settingsAt || 0) ? local.settings : (remote.settings || local.settings),
    log,
    meta: {
      planAt: Math.max(lm.planAt || 0, rm.planAt || 0),
      settingsAt: Math.max(lm.settingsAt || 0, rm.settingsAt || 0),
      logResetAt: resetAt,
    },
  };
}

const fingerprint = (s) => JSON.stringify([s?.plan ?? null, s?.log ?? {}, s?.settings ?? null, s?.meta ?? null]);

/* ---------- Status ---------- */

function setStatus(pid, state, message = '') {
  status[pid] = { state, message };
  document.dispatchEvent(new CustomEvent('reps:sync', { detail: { pid } }));
}

export function getStatus(pid) {
  const p = getProfile(pid);
  if (!p?.sync?.gistId) return { state: 'off' };
  const s = status[pid] || { state: p.sync.lastError ? 'error' : 'idle', message: p.sync.lastError || '' };
  return { ...s, lastSyncAt: p.sync.lastSyncAt || 0, login: p.sync.login || '' };
}

/* ---------- Sync ---------- */

/**
 * Pull, merge and push one profile. Safe to call often: syncs run one at a time, and a
 * request for a profile that is already waiting joins that run instead of adding another.
 */
export function syncProfile(pid = activeProfile()?.id) {
  const p = getProfile(pid);
  if (!p?.sync?.token || !p.sync.gistId) return Promise.resolve();
  const waiting = jobs.get(pid);
  if (waiting && !waiting.started) return waiting.promise;
  const entry = { started: false };
  entry.promise = chain.then(() => { entry.started = true; return runSync(pid); })
    .finally(() => { if (jobs.get(pid) === entry) jobs.delete(pid); });
  chain = entry.promise.catch(() => {});
  jobs.set(pid, entry);
  return entry.promise;
}

async function runSync(pid) {
  const p = getProfile(pid);
  if (!p?.sync?.token || !p.sync.gistId) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setStatus(pid, 'offline'); return; }
  setStatus(pid, 'syncing');
  try {
    const remote = await readRemote(p.sync.token, p.sync.gistId);
    const local = readProfileState(pid);
    const merged = mergeStates(local, remote?.state);
    if (fingerprint(merged) !== fingerprint(local)) applyRemoteState(pid, merged);
    const fresh = getProfile(pid);
    const nameChanged = remote && (remote.profile?.name !== fresh.name || remote.profile?.color !== fresh.color || (remote.profile?.photo || null) !== (fresh.photo || null));
    if (!remote || nameChanged || fingerprint(merged) !== fingerprint(remote.state)) {
      await writeRemote(p.sync.token, p.sync.gistId, fresh, merged);
    }
    updateProfile(pid, { sync: { ...getProfile(pid).sync, lastSyncAt: Date.now(), lastError: null } }, { quiet: true });
    setStatus(pid, 'ok');
  } catch (e) {
    if (e.offline) setStatus(pid, 'offline');
    else {
      const cur = getProfile(pid);
      if (cur?.sync) updateProfile(pid, { sync: { ...cur.sync, lastError: e.message } }, { quiet: true });
      setStatus(pid, 'error', e.message);
    }
  }
}

/** Push local changes a moment after they happen (batches quick edits). */
export function syncSoon(pid = activeProfile()?.id, delay = 2500) {
  if (!getProfile(pid)?.sync?.gistId) return;
  clearTimeout(pushTimer);
  setStatus(pid, 'pending');
  pushTimer = setTimeout(() => syncProfile(pid), delay);
}

/** Link a profile to a gist (existing or new) and run a first sync. */
export async function linkProfile(pid, { token, login, gistId }) {
  const p = getProfile(pid);
  let id = gistId;
  if (!id) id = await createRemote(token, p, readProfileState(pid));
  updateProfile(pid, { sync: { token, login, gistId: id, lastSyncAt: 0, lastError: null } });
  await syncProfile(pid);
  return id;
}

/** Profiles on this device that are not synced yet. */
export const unsyncedProfiles = (exceptPid) => getProfiles().filter((p) => p.id !== exceptPid && !p.sync?.gistId);

/**
 * Link several profiles to one GitHub account. Each gets its own secret gist; a profile
 * reuses an existing Reps gist with the same name (so a second device joins it) instead
 * of creating a duplicate.
 */
export async function linkMany(pids, { token, login, found = null }) {
  const remote = found || await findRemoteProfiles(token);
  const taken = new Set(getProfiles().map((p) => p.sync?.gistId).filter(Boolean));
  const linked = [];
  for (const pid of pids) {
    const p = getProfile(pid);
    if (!p || p.sync?.gistId) continue;
    const match = remote.find((r) => !taken.has(r.gistId) && r.name.trim().toLowerCase() === p.name.trim().toLowerCase());
    if (match) taken.add(match.gistId);
    await linkProfile(pid, { token, login, gistId: match?.gistId });
    linked.push(p.name);
  }
  return linked;
}

/** Forget the token on this device. The gist on GitHub is kept. */
export function unlinkProfile(pid) {
  if (!getProfile(pid)) return;
  updateProfile(pid, { sync: undefined });
  delete status[pid];
}

/** Tokens already saved for other profiles on this device: [{ token, login, from }]. */
export function savedTokens(exceptPid) {
  const seen = new Set();
  return getProfiles()
    .filter((p) => p.id !== exceptPid && p.sync?.token)
    .filter((p) => (seen.has(p.sync.token) ? false : seen.add(p.sync.token)))
    .map((p) => ({ token: p.sync.token, login: p.sync.login, from: p.name }));
}

export function startAutoSync() {
  onLocalChange((pid) => syncSoon(pid));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncProfile();
    else if (pushTimer) { clearTimeout(pushTimer); pushTimer = 0; syncProfile(); }
  });
  window.addEventListener('online', () => syncProfile());
  syncProfile();
}
