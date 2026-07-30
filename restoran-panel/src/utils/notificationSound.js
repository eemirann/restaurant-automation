// Gerçek bir ses dosyası gerektirmeden Web Audio API (AudioContext + osilatör)
// ile kısa bir "ding" üretir. Mutfağa yeni sipariş düştüğünde veya müşteriden
// yeni bir istek geldiğinde çalınır (bkz. NotificationCenter.jsx).

const MUTE_KEY = 'notificationSoundMuted';

let audioCtx = null;

function getAudioContext() {
  if (audioCtx) return audioCtx;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  audioCtx = new AudioContextClass();
  return audioCtx;
}

export function isNotificationSoundMuted() {
  return localStorage.getItem(MUTE_KEY) === '1';
}

export function setNotificationSoundMuted(muted) {
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
}

// Kısa, iki notalı bir "ding" — sipariş/istek bildirimleri için.
export function playNotificationDing() {
  if (isNotificationSoundMuted()) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  const now = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = freq;

    const start = now + i * 0.09;
    const end = start + 0.16;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, end);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(end);
  });
}
