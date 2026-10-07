// Движение как функция времени: всё вычисляется от t, без состояния — поэтому перемотка назад работает.
// «Физика» — затухающие пружины. Линейная пружина имеет точное решение, поэтому вместо интегрирования
// шагами значение = начальное + Σ (скачок цели) · отклик_пружины(t − момент скачка) — суперпозиция откликов.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const smooth = (x, a = 0, b = 1) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u) }
export const easeIO = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 }
export const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3)
export const lerp = (a, b, k) => a + (b - a) * k
export const hash = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296 }

// переходная функция затухающей пружины (0 → 1 с перелётом); w — собственная частота, z — затухание
export const spring = (w = 9, z = 0.62) => {
  const wd = w * Math.sqrt(1 - z * z)
  return (tau) => (tau <= 0 ? 0 : 1 - Math.exp(-z * w * tau) * (Math.cos(wd * tau) + ((z * w) / wd) * Math.sin(wd * tau)))
}
// плавный переход за d секунд (без перелёта)
export const glide = (d = 0.8) => (tau) => easeIO(tau / d)
// притяжение: разгон к цели (как падение в центр), за d секунд
export const pull = (d = 0.7) => (tau) => { const u = clamp(tau / d); return u * u * u }
// короткий импульс: вздрагивание (затухающее колебание), 0 → ±1 → 0
export const kickFn = (tau, f = 2.2, decay = 4.5) => (tau <= 0 ? 0 : Math.exp(-tau * decay) * Math.sin(tau * f * 2 * Math.PI))
// вспышка: быстрый подъём, медленный спад
export const flashFn = (tau, decay = 2.4) => (tau <= 0 ? 0 : (1 - Math.exp(-tau * 25)) * Math.exp(-tau * decay))

const DEF = spring()
// дорожка числа: ключи [{ t, v, k? }] — v число или функция времени (движущаяся цель)
export function track(keys) {
  keys = keys.filter((x) => x.t != null && isFinite(x.t) || x === keys[0]).sort((a, b) => a.t - b.t)
  const val = (x, t) => (typeof x.v === 'function' ? x.v(t) : x.v)
  return (t) => {
    let v = val(keys[0], t)
    for (let i = 1; i < keys.length; i++) {
      const k = keys[i]
      if (t <= k.t) break
      v += (val(k, t) - val(keys[i - 1], t)) * (k.k ?? DEF)(t - k.t)
    }
    return v
  }
}
// дорожка вектора [x, y, z]: те же ключи, v — массив или функция времени → массив
export function track3(keys) {
  keys = keys.filter((x) => x.t != null && isFinite(x.t) || x === keys[0]).sort((a, b) => a.t - b.t)
  const val = (x, t) => (typeof x.v === 'function' ? x.v(t) : x.v)
  return (t, out = [0, 0, 0]) => {
    const v0 = val(keys[0], t)
    out[0] = v0[0]; out[1] = v0[1]; out[2] = v0[2]
    for (let i = 1; i < keys.length; i++) {
      const k = keys[i]
      if (t <= k.t) break
      const a = val(keys[i - 1], t), b = val(k, t), s = (k.k ?? DEF)(t - k.t)
      out[0] += (b[0] - a[0]) * s; out[1] += (b[1] - a[1]) * s; out[2] += (b[2] - a[2]) * s
    }
    return out
  }
}
