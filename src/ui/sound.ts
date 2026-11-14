// Countdown and launch sounds, made in code with the Web Audio API (no sound files): a beep each
// second, a rumble that builds at ignition, and a roar at liftoff that fades as the rocket climbs.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** A short mission-control beep; the last one is higher. */
export function beep(final = false) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = 'sine';
  osc.frequency.value = final ? 1320 : 880;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.18, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + (final ? 0.5 : 0.18));
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + 0.6);
}

function noiseBuffer(a: AudioContext, seconds: number) {
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * seconds), a.sampleRate);
  const d = buf.getChannelData(0);
  // Brown-ish noise: deep and rumbly rather than hissy.
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

/**
 * Engine sound from ignition (a few seconds before liftoff) through the first part of the climb:
 * builds up, roars at liftoff, then fades as the rocket gets far away.
 */
export function engineRoar(buildS = 2.5, roarS = 9) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const total = buildS + roarS;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a, total + 0.5);
  const low = a.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.setValueAtTime(180, t);
  low.frequency.linearRampToValueAtTime(900, t + buildS);
  low.frequency.linearRampToValueAtTime(300, t + total);
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.exponentialRampToValueAtTime(0.35, t + buildS);
  gain.gain.linearRampToValueAtTime(0.5, t + buildS + 1);
  gain.gain.exponentialRampToValueAtTime(0.001, t + total);
  src.connect(low).connect(gain).connect(a.destination);
  src.start(t);
  src.stop(t + total + 0.5);
}

// ---------- The countdown voice ----------

let voice: SpeechSynthesisVoice | null | undefined;

/** The most natural-sounding English voice the device has (tablet voices vary a lot). */
export function bestVoice(): SpeechSynthesisVoice | null {
  if (voice !== undefined) return voice;
  const all = window.speechSynthesis?.getVoices() ?? [];
  if (!all.length) return null;
  const en = all.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|enhanced|premium/i.test(v.name) ? 8 : 0) +
    (/google/i.test(v.name) ? 4 : 0) +
    (/samantha|daniel|alex|karen|moira|aaron|nicky/i.test(v.name) ? 3 : 0) +
    (/en-(ca|us|gb)/i.test(v.lang) ? 1 : 0) -
    (/compact|espeak/i.test(v.name) ? 6 : 0);
  voice = en.sort((x, y) => score(y) - score(x))[0] ?? null;
  return voice;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.addEventListener?.('voiceschanged', () => (voice = undefined));
}

/** Say a countdown line in a calm mission-control voice. */
export function callOut(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = bestVoice();
  if (v) u.voice = v;
  u.rate = 0.95;
  u.pitch = 0.95;
  window.speechSynthesis.speak(u);
}
