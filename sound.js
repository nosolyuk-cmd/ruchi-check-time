// RUCHI: Check Time — звуки и расписание.
// Общий код: его берёт и страница, и проверка в Node (check_timing.mjs).
//
// Слова Сергея: промежуток (сек) × кол-во раз = цикл; цикл повторяется кол-во циклов раз.
// В последнем промежутке цикла вместо «пип» звучит «бам-бам» (догадка, ждёт Сергея).

export const RATE = 22050;

// Расписание звуков: [{ t, kind, cycle, rep }], t — секунды от нажатия «Старт».
export function plan(o) {
  const ev = [];
  if (o.startSound) ev.push({ t: o.delay, kind: 'start', cycle: 1, rep: 0 });
  for (let c = 0; c < o.cycles; c++) {
    for (let r = 1; r <= o.reps; r++) {
      ev.push({
        t: o.delay + (c * o.reps + r) * o.period,
        kind: r === o.reps ? 'end' : 'pip',
        cycle: c + 1,
        rep: r,
      });
    }
  }
  return ev;
}

export const cycleSeconds = (o) => o.period * o.reps;
export const sessionSeconds = (o) => o.delay + o.period * o.reps * o.cycles;

function normalize(a, peak) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  if (m > 0) for (let i = 0; i < a.length; i++) a[i] *= peak / m;
  return a;
}

// Лёгкий «пип»: короткий чистый тон.
export function makePip(rate = RATE) {
  const n = Math.round(0.25 * rate);
  const out = new Float32Array(n);
  const att = 0.005 * rate;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    out[i] = Math.min(1, i / att) * Math.exp(-t / 0.06) * Math.sin(2 * Math.PI * 880 * t);
  }
  return normalize(out, 0.5);
}

// Удар колокола: несколько обертонов, каждый затухает по-своему.
function bell(rate, f0, dur) {
  const partials = [
    [1.0, 1.0, 1.2],
    [2.0, 0.5, 0.8],
    [2.76, 0.35, 0.5],
    [5.4, 0.15, 0.25],
  ];
  const n = Math.round(dur * rate);
  const out = new Float32Array(n);
  const att = 0.004 * rate;
  const fade = 0.6 * rate; // плавный уход в конце, без щелчка
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const a = Math.min(1, i / att) * Math.min(1, (n - i) / fade);
    let v = 0;
    for (const [r, amp, d] of partials) v += amp * Math.exp(-t / d) * Math.sin(2 * Math.PI * f0 * r * t);
    out[i] = a * v;
  }
  return out;
}

// Звук на старте: один мягкий удар.
export function makeStart(rate = RATE) {
  return normalize(bell(rate, 528, 2.5), 0.5);
}

// «Бам-бам» в конце цикла: два низких удара.
export function makeEnd(rate = RATE) {
  const one = bell(rate, 330, 2.5);
  const gap = Math.round(0.55 * rate);
  const out = new Float32Array(one.length + gap);
  for (let i = 0; i < one.length; i++) {
    out[i] += one[i];
    out[i + gap] += one[i];
  }
  return normalize(out, 0.7);
}

export function makeSounds(rate = RATE) {
  return { pip: makePip(rate), start: makeStart(rate), end: makeEnd(rate) };
}

function wavHeader(dv, samples, rate) {
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF');
  dv.setUint32(4, 36 + samples * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // моно
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  w(36, 'data');
  dv.setUint32(40, samples * 2, true);
}

// Звук в WAV (моно, 16 бит).
export function soundToWav(a, rate = RATE) {
  const buf = new ArrayBuffer(44 + a.length * 2);
  const dv = new DataView(buf);
  wavHeader(dv, a.length, rate);
  for (let i = 0; i < a.length; i++) dv.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, a[i])) * 32767), true);
  return buf;
}

// Способ А: весь сеанс одним WAV, тишина между звуками.
export function buildSessionWav(o, rate = RATE) {
  const events = plan(o);
  const snd = makeSounds(rate);
  const tail = 3; // хвост «бам-бам» после конца
  const n = Math.ceil((sessionSeconds(o) + tail) * rate);
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
