// Account sheet (opened from the avatar, top right): profile and switching, sync,
// appearance, workout cues, plan shortcuts, backup.

import { icon } from '../icons.js';
import { esc, segmented, switchHtml, stepperHtml, closeSheet, alertDialog, toast } from '../ui.js';
import { getState, update, replaceState, resetAll, activeProfile, getProfiles, switchProfile } from '../store.js';
import { avatarHtml } from './profiles.js';
import { syncSectionHtml } from './sync.js';
import { openWizard } from '../wizard.js';
import { EXERCISES } from '../data.js';

const ACCENTS = [['orange', 'Orange'], ['red', 'Red'], ['pink', 'Pink'], ['purple', 'Purple'], ['indigo', 'Indigo'], ['blue', 'Blue'], ['mint', 'Mint'], ['green', 'Green']];

export function settingsView() {
  return {
    get title() { return activeProfile()?.name || 'Settings'; },
    trailing: () => `<button class="icon-btn glass glass-prominent glass-interactive" data-sheet-close aria-label="Done">${icon('check')}</button>`,
    render: () => {
      const st = getState().settings;
      const sw = (id, label, sub, iconName, color) => `<div class="row has-icon">
        <div class="row-icon" style="background:${color}">${icon(iconName)}</div>
        <div class="grow"><div class="title">${esc(label)}</div>${sub ? `<div class="subtitle">${esc(sub)}</div>` : ''}</div>
        ${switchHtml(`set:${id}`, st[id], label)}</div>`;
      const me = activeProfile();
      const others = getProfiles().filter((p) => p.id !== me?.id);
      return `
        ${me ? `<button class="card account-card pressable" data-action="pf-edit-current">
          ${avatarHtml(me, 'lg')}
          <div class="grow" style="min-width:0"><div class="t-title3 truncate">${esc(me.name)}</div><div class="t-foot sec">Edit name, photo and color</div></div>
          ${icon('chevron-right', 'chev')}
        </button>` : ''}
        <section class="section"><div class="section-head"><div class="section-title">Profiles</div></div>
          <div class="list">
            ${others.map((p) => `<button class="row has-icon" data-action="switch-to" data-id="${p.id}">${avatarHtml(p, 'row')}<div class="grow"><div class="title">Switch to ${esc(p.name)}</div></div>${icon('arrow-left-right', 'sm')}</button>`).join('')}
            <button class="row has-icon" data-action="open-profiles"><div class="row-icon" style="background:var(--indigo)">${icon('users')}</div><div class="grow title">${others.length ? 'All Profiles' : 'Add a Profile'}</div>${icon('chevron-right', 'chev')}</button>
          </div>
        </section>
        ${me ? syncSectionHtml(me.id) : ''}
        <section class="section"><div class="section-head"><div class="section-title">Appearance</div></div>
          <div class="list">
            <div class="row"><div class="grow title">Mode</div>${segmented('set:theme', [{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], st.theme, 'width:176px')}</div>
            <div class="row" style="flex-direction:column;align-items:stretch;gap:12px">
              <div class="title">Accent color</div>
              <div class="accent-grid">${ACCENTS.map(([k, n]) => `<button class="accent-dot ${st.accent === k ? 'is-on' : ''}" style="--c:var(--${k})" data-action="set-accent" data-accent="${k}" aria-label="${n}" aria-pressed="${st.accent === k}"></button>`).join('')}</div>
            </div>
            <div class="row"><div class="grow title">Week starts on</div>${segmented('set:weekStart', [{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }], String(st.weekStart), 'width:176px')}</div>
          </div>
        </section>
        <section class="section"><div class="section-head"><div class="section-title">Workout Mode</div></div>
          <div class="list">
            <div class="row has-icon"><div class="row-icon" style="background:var(--yellow)">${icon('hourglass')}</div>
              <div class="grow"><div class="title">Countdown</div><div class="subtitle">Before timed workouts</div></div>
              <div class="value-stepper"><span class="val rounded">${st.getReady} s</span>${stepperHtml('set:getReady', { canDec: st.getReady > 5, canInc: st.getReady < 30, label: 'countdown seconds' })}</div></div>
            ${sw('sound', 'Sounds', 'Beeps for the last 3 seconds', 'volume-2', 'var(--red)')}
            ${sw('repTick', 'Rep counter tick', 'Soft tick on each counted rep', 'repeat', 'var(--orange)')}
            ${sw('voice', 'Voice cues', 'Announces each exercise and rest', 'mic', 'var(--purple)')}
            ${sw('haptics', 'Haptics', 'Vibration on supported phones', 'vibrate', 'var(--teal)')}
            ${sw('wakeLock', 'Keep screen on', 'During a workout', 'smartphone', 'var(--blue)')}
          </div>
        </section>
        <section class="section"><div class="section-head"><div class="section-title">Plan</div></div>
          <div class="list">
            <button class="row has-icon" data-action="settings-edit-plan"><div class="row-icon" style="background:var(--indigo)">${icon('square-pen')}</div><div class="grow title">Edit Schedule &amp; Equipment</div>${icon('chevron-right', 'chev')}</button>
            <button class="row has-icon" data-action="settings-new-plan"><div class="row-icon" style="background:var(--accent)">${icon('plus')}</div><div class="grow title">Create New Plan</div>${icon('chevron-right', 'chev')}</button>
          </div>
        </section>
        <section class="section"><div class="section-head"><div class="section-title">Your Data</div></div>
          <div class="list">
            <button class="row has-icon" data-action="backup-copy"><div class="row-icon" style="background:var(--green)">${icon('download')}</div><div class="grow"><div class="title">Back Up</div><div class="subtitle">Copy or save your plan and history</div></div></button>
            <label class="row has-icon tappable" for="restore-file"><div class="row-icon" style="background:var(--blue)">${icon('upload')}</div><div class="grow"><div class="title">Restore from Backup</div><div class="subtitle">Choose a .json backup file</div></div></label>
            <input type="file" id="restore-file" accept="application/json,.json" hidden>
            <button class="row has-icon" data-action="erase-all"><div class="row-icon" style="background:var(--red)">${icon('trash-2')}</div><div class="grow title" style="color:var(--red)">Erase ${esc(me?.name || 'Profile')}’s Data</div></button>
          </div>
          <p class="footnote">${me?.sync?.gistId ? 'This profile syncs through GitHub. A backup file is still handy as an extra copy.' : 'This profile is stored on this device only. Turn on sync, or back up before switching phones or clearing your browser.'}</p>
        </section>
        <p class="footnote" style="text-align:center">Reps · ${EXERCISES.length} exercises · Icons by Lucide (ISC). Demo videos belong to their YouTube creators.</p>`;
    },
  };
}

export const actions = {
  'set-accent': (el) => update((s) => { s.settings.accent = el.dataset.accent; }),
  'settings-edit-plan': () => { closeSheet(); openWizard({ fromPlan: true }); },
  'settings-new-plan': () => { closeSheet(); openWizard(); },
  'backup-copy': async () => {
    const json = JSON.stringify(getState(), null, 2);
    let saved = false;
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `reps-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      saved = true;
    } catch { /* downloads blocked */ }
    try { await navigator.clipboard.writeText(json); toast(saved ? 'Backup saved and copied' : 'Backup copied to clipboard', { iconName: 'download' }); }
    catch { toast(saved ? 'Backup file saved' : 'Could not save the backup here', { iconName: saved ? 'download' : 'info' }); }
  },
  'switch-to': (el) => { const p = getProfiles().find((x) => x.id === el.dataset.id); if (!p) return; closeSheet(true); switchProfile(p.id); toast(`Switched to ${p.name}`, { iconName: 'users' }); },
  'erase-all': async () => {
    const me = activeProfile();
    const ok = await alertDialog({ title: `Erase ${me?.name || 'this profile'}’s data?`, message: me?.sync?.gistId ? 'This deletes the plan, history and settings here and on every synced device. It cannot be undone.' : 'This deletes the plan, history and settings from this device. It cannot be undone.', actions: [{ label: 'Cancel', value: false, style: 'gray' }, { label: 'Erase', value: true, style: 'danger' }] });
    if (ok) { resetAll(); closeSheet(); toast('Profile data erased', { iconName: 'trash-2' }); }
  },
};

export function onChange(e) {
  if (e.target.id !== 'restore-file') return false;
  const file = e.target.files?.[0];
  if (!file) return true;
  file.text().then(async (txt) => {
    try {
      const data = JSON.parse(txt);
      if (!data || data.version !== 1 || typeof data.log !== 'object') throw new Error('bad');
      const ok = await alertDialog({ title: 'Restore this backup?', message: 'Your current plan and history on this device will be replaced.', actions: [{ label: 'Cancel', value: false, style: 'gray' }, { label: 'Restore', value: true, style: 'filled' }] });
      if (ok) { replaceState(data); toast('Backup restored'); }
    } catch {
      alertDialog({ title: 'Not a Reps backup', message: 'Choose a .json file made with Back Up in Reps settings.' });
    }
  });
  e.target.value = '';
  return true;
}

export function onStep(id, dir) {
  if (id !== 'set:getReady') return false;
  update((s) => { s.settings.getReady = Math.max(5, Math.min(30, s.settings.getReady + dir * 5)); });
  return true;
}

export function onSeg(id, value) {
  if (id === 'set:theme') { update((s) => { s.settings.theme = value; }); return true; }
  if (id === 'set:weekStart') { update((s) => { s.settings.weekStart = +value; }); return true; }
  return false;
}

export function onToggle(id) {
  if (!id.startsWith('set:')) return false;
  const k = id.slice(4);
  update((s) => { s.settings[k] = !s.settings[k]; });
  return true;
}
