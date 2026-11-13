// RUCHI: Check Time — звуки и расписание.
// Слова Сергея: промежуток (сек) × кол-во раз = цикл; цикл повторяется кол-во циклов раз.
// Звуки: старт, промежуток, конец цикла, конец сеанса. Каждый — набор в коде или свой файл.

export const RATE = 22050;

// ---------- наборы звуков (собраны в коде) ----------
// modes: [отношение к основной частоте, громкость, затухание в секундах, биение в Гц]
export const PRESETS = {
  pip:     { name: 'Пип',         f0: 880,  attack: 0.005,  dur: 0.3,  gap: 0.18, modes: [[1, 1, 0.06]] },
  drop:    { name: 'Капля',       f0: 1040, attack: 0.002,  dur: 0.45, gap: 0.25, glide: 0.18, modes: [[1, 1, 0.11], [2.01, 0.12, 0.05]] },
  bellS:   { name: 'Колокольчик', f0: 1320, attack: 0.002,  dur: 2.5,  gap: 0.45, modes: [[1, 1, 1.0], [2.0, 0.45, 0.6], [3.01, 0.25, 0.35], [4.2, 0.18, 0.2], [5.43, 0.1, 0.12]] },
  bell:    { name: 'Колокол',     f0: 330,  attack: 0.004,  dur: 2.5,  gap: 0.55, modes: [[1, 1, 1.2], [2.0, 0.5, 0.8], [2.76, 0.35, 0.5], [5.4, 0.15, 0.25]] },
  bowl:    { name: 'Чаша',        f0: 300,  attack: 0.012,  dur: 8,    gap: 1.4,  noise: 0.12, modes: [[1, 1, 5, 0.9], [2.77, 0.65, 3.5, 1.4], [5.18, 0.35, 2.2, 2.1], [8.3, 0.15, 1.2]] },
  wood:    { name: 'Дерево',      f0: 880,  attack: 0.0005, dur: 0.25, gap: 0.22, noise: 0.5, modes: [[1, 1, 0.04], [2.27, 0.45, 0.022], [3.93, 0.25, 0.012]] },
  tingsha: { name: 'Тингша',      f0: 2050, attack: 0.001,  dur: 4,    gap: 0.9,  noise: 0.08, modes: [[1, 1, 2.6, 4], [1.52, 0.45, 1.8, 6], [2.37, 0.25, 1.0]] },
};

// Роли звуков. def — как звучит сейчас (по умолчанию). rec — мои советы: [лучший, средний, запасной].
export const ROLES = {
  start: { name: 'Старт',        def: { on: true, preset: 'bell', strikes: 1, vol: 53, pitch: 8, length: 1 }, rec: ['bowl', 'bell', 'bellS'] },
  pip:   { name: 'Промежуток',   def: { on: true, preset: 'pip',  strikes: 1, vol: 53, pitch: 0, length: 1 }, rec: ['drop', 'wood', 'bellS'] },
  end:   { name: 'Конец цикла',  def: { on: true, preset: 'bell', strikes: 2, vol: 74, pitch: 0, length: 1 }, rec: ['bowl', 'bell', 'tingsha'] },
  final: { name: 'Конец сеанса', def: { on: true, preset: 'asEnd', strikes: 2, vol: 85, pitch: 0, length: 1 }, rec: ['bowl', 'tingsha', 'bell'] },
};

export function defaultSounds() {
  const s = {};
  for (const [k, r] of Object.entries(ROLES)) s[k] = { ...r.def };
  return s;
}

// ---------- синтез ----------
function rng(seed) { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; }

function peakNormalize(a, peak = 1) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  if (m > 0) for (let i = 0; i < a.length; i++) a[i] *= peak / m;
  return a;
}

export function synth(p, { pitch = 0, length = 1 } = {}, rate = RATE) {
  const k = Math.pow(2, pitch / 12);
  const dur = p.dur * length;
  const n = Math.max(1, Math.round(dur * rate));
  const out = new Float32Array(n);
  const att = Math.max(1, p.attack * rate);
  const fade = Math.max(1, Math.min(0.6, dur * 0.3) * rate);
  const nyq = rate * 0.45;
  const modes = p.modes.filter((m) => p.f0 * k * m[0] < nyq);
  const tau = 0.03, g = p.glide || 0;
  const rnd = rng(12345);
  let prevN = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const T = g ? t + g * tau * (1 - Math.exp(-t / tau)) : t; // время с «каплей» — частота сначала выше
    let v = 0;
    for (const [r, amp, d, beat] of modes) {
      const f = p.f0 * k * r;
      const e = amp * Math.exp(-t / (d * length));
      v += beat ? e * (0.6 * Math.sin(2 * Math.PI * f * T) + 0.4 * Math.sin(2 * Math.PI * (f + beat) * T))
                : e * Math.sin(2 * Math.PI * f * T);
    }
    if (p.noise) { const w = rnd(); v += p.noise * (w - prevN) * Math.exp(-t / 0.004); prevN = w; }
    out[i] = v * Math.min(1, i / att) * Math.min(1, (n - i) / fade);
  }
  return peakNormalize(out);
}

function strikes(a, count, gapSec, rate = RATE) {
  if (count <= 1) return a;
  const gap = Math.round(gapSec * rate);
  const out = new Float32Array(a.length + gap * (count - 1));
  for (let c = 0; c < count; c++) for (let i = 0; i < a.length; i++) out[i + c * gap] += a[i];
  return peakNormalize(out);
}

// Свой файл: уже моно, на частоте RATE, тишина в начале обрезана.
export function prepareCustom(mono, srcRate, rate = RATE, maxSec = 20) {
  // в моно на нужной частоте (линейная интерполяция)
  const ratio = srcRate / rate;
  const n = Math.min(Math.floor(mono.length / ratio), Math.round(maxSec * rate));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * ratio, j = Math.floor(x), f = x - j;
    out[i] = (mono[j] || 0) * (1 - f) + (mono[j + 1] || 0) * f;
  }
  peakNormalize(out);
  // тишину в начале долой (порог −40 дБ), чтобы удар приходил вовремя
  let s = 0;
  while (s < out.length && Math.abs(out[s]) < 0.01) s++;
  s = Math.max(0, s - Math.round(0.005 * rate));
  const cut = out.slice(s);
  const fade = Math.min(cut.length, Math.round(0.3 * rate));
  for (let i = 0; i < fade; i++) cut[cut.length - 1 - i] *= i / fade;
  return cut;
}

// Готовый звук роли с учётом громкости. custom — { start: Float32Array, ... } из своих файлов.
export function roleSound(role, cfg, custom = {}, all = null, rate = RATE) {
  if (cfg.preset === 'asEnd' && all) return roleSound('end', all.end, custom, null, rate);
  let base, gap;
  if (cfg.preset === 'custom') {
    base = custom[role];
    if (!base || !base.length) base = synth(PRESETS.pip, {}, rate);
    gap = Math.min(0.6, base.length / rate);
  } else {
    const p = PRESETS[cfg.preset] || PRESETS.pip;
    base = synth(p, { pitch: cfg.pitch, length: cfg.length }, rate);
    gap = p.gap;
  }
  const out = Float32Array.from(strikes(base, cfg.strikes || 1, gap, rate));
  const vol = Math.max(0, Math.min(100, cfg.vol)) / 100 * 0.95;
  for (let i = 0; i < out.length; i++) out[i] *= vol;
  return out;
}

export function makeSounds(sounds, custom = {}, rate = RATE) {
  const r = {};
  for (const k of Object.keys(ROLES)) r[k] = roleSound(k, sounds[k], custom, sounds, rate);
  return r;
}

// ---------- расписание ----------
// [{ t, kind, cycle, rep }], t — секунды от «Старт». kind: start | pip | end | final.
// on — включён ли звук роли (выключенный пропускается, время не меняется).
export function plan(o, on = { start: true, pip: true, end: true, final: true }) {
  const ev = [];
  if (on.start) ev.push({ t: o.delay, kind: 'start', cycle: 1, rep: 0 });
  for (let c = 0; c < o.cycles; c++) {
    for (let r = 1; r <= o.reps; r++) {
      const last = r === o.reps;
      const kind = last ? (c === o.cycles - 1 ? 'final' : 'end') : 'pip';
      if (on[kind]) ev.push({ t: o.delay + (c * o.reps + r) * o.period, kind, cycle: c + 1, rep: r });
    }
  }
  return ev;
}

export const cycleSeconds = (o) => o.period * o.reps;
export const sessionSeconds = (o) => o.delay + o.period * o.reps * o.cycles;

// ---------- WAV ----------
function wavHeader(dv, samples, rate) {
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + samples * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, samples * 2, true);
}

export function soundToWav(a, rate = RATE) {
  const buf = new ArrayBuffer(44 + a.length * 2);
  const dv = new DataView(buf);
  wavHeader(dv, a.length, rate);
  for (let i = 0; i < a.length; i++) dv.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, a[i])) * 32767), true);
  return buf;
}

// Хвост после последнего звука: сколько звучит самый длинный из звуков конца.
export const tailSeconds = (snd, rate = RATE) => Math.max(snd.final.length, snd.end.length) / rate + 0.3;

// Способ А: весь сеанс одним WAV.
export function buildSessionWav(o, snd, on, rate = RATE) {
  const events = plan(o, on);
  const n = Math.ceil((sessionSeconds(o) + tailSeconds(snd, rate)) * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  wavHeader(new DataView(buf), n, rate);
  const pcm = new Int16Array(buf, 44, n);
  for (const e of events) {
    const s = snd[e.kind];
    const off = Math.round(e.t * rate);
    for (let i = 0; i < s.length; i++) {
      const k = off + i;
      if (k >= n) break;
      pcm[k] = Math.max(-32768, Math.min(32767, pcm[k] + Math.round(s[i] * 32767)));
    }
  }
  return { buffer: buf, events, seconds: n / rate };
}

// Секунда тишины: держит звук iPhone «включённым» для способа Б.
export function silenceWav(seconds = 1, rate = RATE) {
  return soundToWav(new Float32Array(Math.round(seconds * rate)), rate);
}
