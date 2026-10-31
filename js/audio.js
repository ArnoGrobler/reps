// Workout cues: beeps (Web Audio), spoken prompts (Speech Synthesis),
// haptics (Vibration API, or the iOS Safari switch-control trick), and screen wake lock.
// Browsers only allow audio after a tap, so call unlock() from a click handler.

let ctx = null;
let wakeLock = null;
let hapticLabel = null;

export function unlock() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    // A silent buffer finishes the unlock on iOS
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
  } catch { /* no audio */ }
  try { window.speechSynthesis?.getVoices(); } catch { /* no speech */ }
}

export function beep({ freq = 880, dur = 0.12, vol = 0.18, type = 'sine' } = {}) {
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* ignore */ }
}

export const tick = () => beep({ freq: 1400, dur: 0.035, vol: 0.06, type: 'triangle' });
export const countBeep = () => beep({ freq: 880, dur: 0.12, vol: 0.2 });
export const goBeep = () => { beep({ freq: 1320, dur: 0.28, vol: 0.24 }); };
export const doneChime = () => {
  beep({ freq: 1046, dur: 0.18, vol: 0.2 });
  setTimeout(() => beep({ freq: 1318, dur: 0.18, vol: 0.2 }), 150);
  setTimeout(() => beep({ freq: 1568, dur: 0.36, vol: 0.22 }), 300);
};

let preferredVoice = null;
function pickVoice() {
  if (preferredVoice) return preferredVoice;
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const lang = (navigator.language || 'en-US').slice(0, 2);
  preferredVoice = voices.find((v) => v.lang?.startsWith(lang) && /Samantha|Ava|Siri|Karen|Daniel|Google/.test(v.name))
    || voices.find((v) => v.lang?.startsWith(lang)) || null;
  return preferredVoice;
}

export function say(text) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.04;
    u.pitch = 1;
    synth.speak(u);
  } catch { /* ignore */ }
}

export function stopSpeech() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}

export function haptic(pattern = 12) {
  try {
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    if (navigator.vibrate) { navigator.vibrate(pattern); return; }
    // iOS 18+ Safari gives a haptic tap when a switch-style checkbox toggles.
    if (!hapticLabel) {
      hapticLabel = document.createElement('label');
      hapticLabel.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
      hapticLabel.innerHTML = '<input type="checkbox" switch>';
      document.body.appendChild(hapticLabel);
    }
    hapticLabel.click();
  } catch { /* ignore */ }
}

export async function keepAwake(on) {
  try {
    if (on) {
      if (!wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener?.('release', () => { wakeLock = null; });
      }
    } else if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; }
}
