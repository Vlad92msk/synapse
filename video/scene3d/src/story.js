// Сюжет блока 12: узлы, связи и импульсы одного 3D-мира на три масштаба, всё привязано к шагам слайдов.
// Раскладка — экранные пиксели слайда на своём масштабе (+ глубина z в тех же пикселях); place() переводит
// их в мировые координаты так, чтобы при «своей» камере узел стоял ровно там, где на слайде.
import { track, track3, spring, glide, pull, hash, easeIO, clamp, lerp } from './motion.js'

export const FOV = 30
export const KD = 540 / Math.tan((FOV / 2) * Math.PI / 180) // расстояние, на котором 1 мировая единица = 1 px
// раскладка задаёт глубину узла в px; в мире она растянута в ZK раз — больше параллакса, дымки и расфокуса
export const ZK = 1.5
export const TUBE = 0.25 // толщина трубки тора относительно радиуса
// масштабы: S — мировых единиц в пикселе, rs — где на экране стоит кольцо messenger (оно — начало координат)
export const LEVELS = [
  { S: 1, rs: [1210, 590] }, // масштаб 1: один синапс
  { S: 1.9, rs: [563, 623] }, // масштаб 2: модуль
  { S: 1.9 * 1.75, rs: [1040, 860] }, // масштаб 3: проект
]
const ORDER = ['real-one', 'real-module', 'real-app']
const DRIFT = 0.07 // медленный наезд камеры за слайд (доля масштаба)

// камера на дробном масштабе sig (1..3): плавно по логарифму масштаба
export function framing(sig) {
  const i = Math.min(1, Math.max(0, Math.floor(sig - 1))), f = sig - 1 - i
  const A = LEVELS[i], B = LEVELS[i + 1]
  const S = Math.exp(lerp(Math.log(A.S), Math.log(B.S), f))
  const g = clamp(f)
  const rs = [lerp(A.rs[0], B.rs[0], g), lerp(A.rs[1], B.rs[1], g)]
  // точка, куда смотрит камера (в плоскости z = 0)
  return { S, T: [-(rs[0] - 960) * S, (rs[1] - 540) * S, 0], D: KD * S }
}
// экранная точка масштаба L на глубине z (px) → мир
export function place(L, x, y, z = 0) {
  const { S, T } = framing(L)
  z *= ZK
  const k = (S * (KD - z)) / KD
  return [T[0] + (x - 960) * k, T[1] - (y - 540) * k, z * S]
}
// размер узла в мире. SIZE_COMP = 1 — дальний узел увеличен так, чтобы на экране выйти ровно в px раскладки;
// 0 — честная перспектива: px — размер на глубине 0, дальние на экране меньше
export const SIZE_COMP = 0
const size = (L, px, z = 0) => px * framing(L).S * Math.pow((KD - z * ZK) / KD, SIZE_COMP)

export function buildStory(slides) {
  const sl = Object.fromEntries(slides.map((s) => [s.id, s]))
  const firstIdx = Math.min(...ORDER.map((id, i) => (sl[id] ? i : 99)))
  const PAST = -1e6, FUT = 1e6
  // время шага слайда; нет слайда в плане — событие давно прошло (слайд раньше) или ещё не наступило
  const at = (id, step, off = 0) => {
    const s = sl[id]
    if (!s) return firstIdx < 99 && ORDER.indexOf(id) < firstIdx ? PAST : FUT
    const t = step === 'start' ? s.start : step === 'in' ? s.start + s.trans : step === 'end' ? s.end : s.steps?.[step] ?? s.start + s.trans
    return t + off
  }
  const tr = (id) => sl[id]?.trans || 0
  // момент, когда диктор доходит до слова needle во фразе beat слайда (по доле текста); нет фраз — fallback
  const word = (id, beat, needle, fallback) => {
    const b = sl[id]?.beats?.[beat]
    if (!sl[id] || !b) return sl[id] ? fallback : at(id, 'start')
    const i = b.text.indexOf(needle)
    return i < 0 ? fallback : b.start + (b.dur * i) / b.text.length
  }

  // ─ камера: дробный масштаб от времени ─
  const sigma = (t) => {
    let sig = 1
    for (let L = 1; L <= 3; L++) {
      const id = ORDER[L - 1], s = sl[id]
      if (!s) { if (at(id, 'start') === PAST) sig = L - DRIFT; continue }
      if (t < s.start) break
      const k = s.trans ? easeIO((t - s.start) / s.trans) : 1
      const u = clamp((t - s.start - s.trans) / Math.max(1, s.end - s.start - s.trans))
      sig = lerp(sig, L, k) - DRIFT * u
    }
    return sig
  }

  const nodes = [], links = [], pulses = []
  const N = {}
  const node = (id, o) => {
    const n = { id, kind: 'ring', kicks: [], flashes: [], labels: [], tilt: 0, ph: hash(id) * 6.283, ...o }
    // лёгкий наклон от плоскости кадра (4–7°, в свою сторону у каждого) — объём без сплющивания
    n.tilt ||= (hash(id + 't') < 0.5 ? -1 : 1) * (0.07 + 0.05 * hash(id + 'a'))
    nodes.push(n); N[id] = n
    return n
  }
  const label = (n, text, o) => n.labels.push({ text, font: 'mono', size: 24, color: '#ececec', alpha: 1, place: 'below', ...o })
  const link = (a, b, o) => { const l = { a: N[a], b: N[b], rpx: 1.6, S: 1, grow: 'a', dashed: false, lit: () => 0, op: () => 1, ...o }; links.push(l); return l }
  const kick = (n, t, amp = 1) => { n.kicks.push({ t, amp }); n.flashes.push({ t, amp }) }
  const pulse = (l, fromB, t0, dur = 1.0, amp = 1) => { pulses.push({ l, fromB, t0, dur, amp }); kick(fromB ? l.a : l.b, t0 + dur, 0.8 * amp) }
  // появление/уход; уход не раньше появления (когда оба момента «давно прошли», ключи иначе меняются местами)
  const vis = (tIn, tOut, dIn = 0.5, dOut = 0.5) => track([{ v: 0 }, { t: tIn, v: 1, k: glide(dIn) }, { t: Math.max(tOut, tIn + 1e-3), v: 0, k: glide(dOut) }])

  // ════ масштаб 1 — один синапс (real-one) ════
  const t1 = at('real-one', 'start') + tr('real-one') * 0.3
  const col = at('real-one', 5) // «Это всё — один синапс»: всё прижимается к центру
  const t2 = at('real-module', 'start'), tr2 = tr('real-module') || 2.6, tIn2 = t2 + tr2
  const t3 = at('real-app', 'start'), tr3 = tr('real-app') || 2.6
  const s2 = (k) => at('real-module', k), s3 = (k) => at('real-app', k)
  // кольцо messenger — одно на все масштабы (начало координат); растёт, «впитывая» части
  const M = node('messenger', {
    pos: track3([{ v: [0, 0, -380] }, { t: t1, v: [0, 0, 0], k: spring(4.5, 0.72) }]),
    R: track([{ v: 92 }, { t: col + 1.0, v: 70 * LEVELS[1].S / 1.25, k: spring(5, 0.55) }, { t: t3 + 0.4, v: 52 * LEVELS[2].S / 1.25, k: glide(1.6) }]),
    vis: vis(t1, FUT, 0.7), pop: track([{ v: 0.55 }, { t: t1, v: 1, k: spring(6, 0.5) }]),
    gap: 82, tilt: 0.1,
  })
  label(M, 'messenger', { size: 30, color: '#f97316', vis: vis(t1 + 0.5, t2 + 0.1, 0.6, 0.6) })
  label(M, 'messenger.synapse', { size: 30, color: '#f97316', vis: vis(t2 + tr2 * 0.65, t3 + 0.1, 0.6, 0.6) })
  label(M, 'messenger', { size: 28, color: '#f97316', vis: vis(t3 + tr3 * 0.7, FUT, 0.6) })

  const PARTS = [
    ['storage', 'Storage', 1419, 322, -60],
    ['selectors', 'Selectors', 1535, 491, 50],
    ['dispatcher', 'Dispatcher ×11', 1535, 689, -10],
    ['effects', 'Effects ×11', 1419, 858, 40],
  ]
  const FAN = {
    dispatcher: { step: 2, xy: [[1599, 612], [1615, 629], [1627, 650], [1634, 672], [1635, 696], [1631, 719], [1621, 740], [1607, 759], [1589, 774], [1568, 784], [1545, 789]] },
    effects: { step: 3, xy: [[1516, 831], [1519, 854], [1517, 878], [1510, 900], [1498, 920], [1481, 937], [1461, 949], [1438, 956], [1415, 958], [1392, 954], [1370, 945]] },
  }
  PARTS.forEach(([id, text, x, y, z], i) => {
    const P = place(1, x, y, z)
    const from = [P[0] * 1.7, P[1] * 1.7, P[2] - 300] // прилетает снаружи и «садится» на пружине
    const ta = Math.max(t1 + 0.7, word('real-one', 1, 'вокруг', t1 + 0.7)) + i * 0.35, tc = col + 0.45 + i * 0.14
    const n = node(id, {
      pos: track3([{ v: from }, { t: ta, v: P, k: spring(5.5, 0.55) }, { t: tc, v: [0, 0, 0], k: pull(0.7) }]),
      R: track([{ v: size(1, 58, z) / 1.25 }, { t: tc, v: size(1, 18, z), k: pull(0.7) }]),
      vis: vis(ta, tc + 0.5, 0.5, 0.25), pop: track([{ v: 0.5 }, { t: ta, v: 1, k: spring(7, 0.5) }]),
      gap: 74,
    })
    kick(M, tc + 0.7, 0.6)
    // подпись отодвигается, когда раскрывается веер
    label(n, text, { font: 'inter', size: 28, place: 'right', dx: FAN[id] ? track([{ v: 0 }, { t: at('real-one', FAN[id].step), v: 52, k: spring(6, 0.7) }, { t: col, v: 0, k: glide(0.5) }]) : null, vis: vis(ta + 0.3, col + 0.2, 0.5, 0.4) })
    link('messenger', id, { dashed: true, rpx: 3.2, grow: 'a', w: track([{ v: 0 }, { t: ta + 0.25, v: 1, k: glide(0.7) }]), op: track([{ v: 1 }, { t: tc + 0.25, v: 0, k: glide(0.4) }]) })
    const fan = FAN[id]
    if (fan) {
      const tf = at('real-one', fan.step)
      fan.xy.forEach(([fx, fy], j) => {
        const D = place(1, fx, fy, z)
        node(`${id}-fan${j}`, {
          kind: 'dot',
          pos: track3([{ v: P }, { t: tf + 0.1 + j * 0.06, v: D, k: spring(7, 0.5) }, { t: col + j * 0.02, v: P, k: pull(0.45) }]),
          R: () => 6.5, vis: vis(tf + 0.1 + j * 0.06, col + 0.3, 0.3, 0.2), pop: () => 1,
        })
      })
    }
  })

  // ════ масштаб 2 — модуль (real-module) ════
  // орбита-спутник вокруг узла: точка на наклонённой окружности, медленно вращается
  const orbit = (c, rpx, i, n, L, seed) => {
    const a0 = (i / n) * 6.283 + hash(seed) * 6.283, tiltX = 1.05 + 0.25 * hash(seed + 'x'), rotZ = (hash(seed + 'z') - 0.5) * 1.2
    const cx = Math.cos(tiltX), sx = Math.sin(tiltX), cz = Math.cos(rotZ), sz = Math.sin(rotZ)
    const r = size(L, rpx)
    const out = [0, 0, 0]
    return (t) => {
      const a = a0 + t * 0.22
      let x = Math.cos(a) * r, y = Math.sin(a) * r, z = 0
      const y1 = y * cx - z * sx, z1 = y * sx + z * cx
      const x2 = x * cz - y1 * sz, y2 = x * sz + y1 * cz
      const p = c.pos(t, out)
      return [p[0] + x2, p[1] + y2, p[2] + z1]
    }
  }
  const KIDS = [
    ['chat', 885, 320, -150, 44, 1],
    ['chat-list', 1143, 323, -450, 32, 0.84],
    ['chat-info', 1251, 668, 60, 46, 1],
    ['contacts', 1526, 860, -550, 28, 0.79],
    ['call-history', 960, 880, -250, 36, 0.95],
  ]
  const MSATS = 7 // синапсы модуля мессенджера — спутники узла messenger на масштабе 3
  const KID_WORDS = ['чат,', 'список чатов', 'информация о чате', 'контакты', 'история звонков']
  KIDS.forEach(([id, x, y, z, r, alpha], i) => {
    const P = place(2, x, y, z)
    const from = [P[0] * 1.45, P[1] * 1.45, P[2] - 900]
    const ta = Math.max(t2 + tr2 * 0.55 + i * 0.22, word('real-module', 0, KID_WORDS[i], -Infinity)), tm = t3 + 0.15 + i * 0.1
    const n = node(id, {
      pos: track3([{ v: from }, { t: ta, v: P, k: spring(4.2, 0.6) }, { t: s2(6), v: [P[0] * 0.93, P[1] * 0.93, P[2] * 0.93], k: spring(5, 0.5) }, { t: tm, v: orbit(M, 92, i, MSATS, 3, 'm'), k: spring(3.6, 0.7) }]),
      R: track([{ v: size(2, r, z) / 1.25 }, { t: tm, v: 0, k: glide(1.0) }]),
      dot: track([{ v: 0 }, { t: tm + 0.2, v: 1, k: glide(0.9) }]), dotR: size(3, 8),
      vis: vis(ta, FUT, 0.6), pop: track([{ v: 0.5 }, { t: ta, v: 1, k: spring(6, 0.5) }]), gap: 74,
    })
    label(n, id, { alpha, vis: vis(ta + 0.25, t3 + 0.05, 0.5, 0.5) })
    const L = link('messenger', id, {
      grow: 'b', rpx: 2.1, S: LEVELS[1].S,
      w: track([{ v: 0 }, { t: ta + 0.35, v: 1, k: glide(0.8) }]),
      op: track([{ v: 1 }, { t: tm, v: 0, k: glide(0.6) }]),
      lit: track([{ v: 0 }, ...(id === 'chat' ? [{ t: s2(2), v: 1, k: glide(0.4) }, { t: s2(3) + 2.6, v: 0, k: glide(1.0) }] : []), { t: s2(6), v: 1, k: glide(0.6) }, { t: t3, v: 0, k: glide(0.8) }].filter((k) => k.t == null || isFinite(k.t))),
    })
    N[id].link = L
  })
  // внешние соседи: core (шаг 3), relations и panel (шаг 5) — далеко и тускло
  const EXT = [
    // справа и глубоко: связи от них входят в разрез messenger вместе со связями детей
    ['core', 1700, 280, -700, 30, 0.65, s2(3)], // ближе остальных внешних: о нём говорит диктор
    ['relations', 1690, 540, -1100, 24, 0.63, s2(5)],
    ['panel', 1520, 400, -700, 24, 0.63, s2(5) + 0.2],
  ]
  for (const [id, x, y, z, r, alpha, ta] of EXT) {
    const P = place(2, x, y, z)
    const from = [P[0] * 1.3, P[1] * 1.3, P[2] - 1200]
    const R3 = { core: [720, 610, -60, 48], relations: [690, 960, -200, 28] }[id]
    const keys = [{ v: from }, { t: ta, v: P, k: spring(4, 0.65) }]
    const rk = [{ v: size(2, r, z) / 1.25 }]
    let dot = () => 0
    if (R3) {
      keys.push({ t: t3 + 0.3, v: place(3, R3[0], R3[1], R3[2]), k: spring(2.6, 0.75) })
      rk.push({ t: t3 + 0.3, v: size(3, R3[3], R3[2]) / 1.25, k: glide(1.6) })
    } else { // panel — синапс модуля: становится спутником messenger
      keys.push({ t: t3 + 0.6, v: orbit(M, 92, 5, MSATS, 3, 'm'), k: spring(3.6, 0.7) })
      rk.push({ t: t3 + 0.6, v: 0, k: glide(1.0) })
      dot = track([{ v: 0 }, { t: t3 + 0.8, v: 1, k: glide(0.9) }])
    }
    const n = node(id, { pos: track3(keys), R: track(rk), dot, dotR: size(3, 8), vis: vis(ta, FUT, 0.7), pop: track([{ v: 0.5 }, { t: ta, v: 1, k: spring(6, 0.5) }]), gap: 74 })
    if (id === 'core') {
      label(n, 'core', { alpha, vis: vis(ta + 0.3, t3 + 0.2, 0.6, 0.5) })
      label(n, 'social-network', { alpha: 1, ox: -30, vis: vis(t3 + tr3 * 0.8, FUT, 0.6) }) // левее: справа проходит линия к messenger
    } else if (id === 'relations') label(n, 'relations', { alpha, vis: vis(ta + 0.3, FUT, 0.6), alpha2: 0.84 })
    else label(n, 'panel', { alpha, vis: vis(ta + 0.3, t3 + 0.05, 0.6, 0.5) })
    n.link = link(id, 'messenger', {
      grow: 'a', rpx: 1.8, S: LEVELS[1].S,
      w: track([{ v: 0 }, { t: ta + 0.4, v: 1, k: glide(1.0) }]),
      op: id === 'panel' ? track([{ v: 1 }, { t: t3 + 0.3, v: 0, k: glide(0.6) }]) : () => 1,
      lit: track([{ v: 0 }, { t: s2(6), v: 1, k: glide(0.6) }, { t: t3, v: 0, k: glide(0.8) }]),
    })
  }
  // седьмой спутник messenger — само ядро модуля (точка появляется при отъезде)
  node('m-self', { kind: 'dot', pos: track3([{ v: [0, 0, 0] }, { t: t3 + 0.5, v: orbit(M, 92, 6, MSATS, 3, 'm'), k: spring(4, 0.6) }]), R: () => size(3, 8), vis: vis(t3 + 0.5, FUT, 0.6), pop: () => 1 })
  // общая подсветка модуля на шаге 6
  M.glow = track([{ v: 0 }, { t: s2(6), v: 1, k: glide(0.8) }, { t: t3, v: 0, k: glide(1.2) }])

  // смысловые импульсы масштаба 2
  pulse(N.chat.link, false, s2(2) + 0.5, 1.1) // ядро готово → эффекты чата стартуют
  pulse(N.core.link, false, s2(3) + 1.2, 1.3) // id пользователя: core → messenger …
  pulse(N.chat.link, false, s2(3) + 2.6, 1.0) // … → chat
  pulse(N.chat.link, true, s2(4) + 0.4, 1.1, 1.2) // эффекты чата пишут в хранилище мессенджера
  KIDS.forEach(([id], i) => pulse(N[id].link, true, s2(6) + 0.4 + i * 0.12, 1.1, 0.8)) // все тянутся к родителю

  // ════ масштаб 3 — проект (real-app) ════
  const NET = [
    ['streaming', 1270, 470, -150, 44, 5, 1],
    ['media', 1360, 660, -100, 38, 3, 0.97],
    ['posts', 1600, 560, -350, 30, 1, 0.88],
    ['calls', 980, 360, -250, 26, 1, 0.84],
    ['comments', 1560, 260, -600, 20, 1, 0.77],
    ['reactions', 1730, 840, -500, 20, 1, 0.75],
    ['live', 1330, 960, -300, 22, 1, 0.79],
    ['user', 1600, 930, -200, 26, 1, 0.88],
    // группа messenger (его зависимости и зависимые) — рядом с ним, слева-снизу от ядра
    ['social', 450, 840, -300, 30, 3, 0.9],
    ['history', 740, 765, -250, 20, 1, 0.77],
  ]
  const core3 = place(3, 720, 610, -60)
  NET.forEach(([id, x, y, z, r, sats, alpha], i) => {
    const P = place(3, x, y, z)
    const d = Math.hypot(P[0] - core3[0], P[1] - core3[1])
    const ta = s3(1) + 0.15 + d / 2600
    const from = [core3[0] + (P[0] - core3[0]) * 1.35, core3[1] + (P[1] - core3[1]) * 1.35, P[2] - 1500]
    const n = node(id, {
      pos: track3([{ v: from }, { t: ta, v: P, k: spring(4, 0.62) }]),
      R: () => size(3, r, z) / 1.25, vis: vis(ta, FUT, 0.6), pop: track([{ v: 0.5 }, { t: ta, v: 1, k: spring(6, 0.5) }]), gap: 74, net: true,
    })
    label(n, id, { alpha, vis: vis(ta + 0.25, FUT, 0.5) })
    for (let j = 0; j < sats; j++) {
      const ts = s3(2) + 0.15 + i * 0.07 + j * 0.08
      node(`${id}-sat${j}`, { kind: 'dot', pos: track3([{ v: P }, { t: ts, v: orbit(n, r * 1.75, j, sats, 3, id), k: spring(5, 0.55) }]), R: () => size(3, 5.5, z), vis: vis(ts, FUT, 0.4), pop: () => 1 })
    }
  })
  N.core.net = N.relations.net = M.net = true
  // «Отсюда и название»: на «Синапс — это узел» сеть гаснет, остаётся тройка social-network · streaming · messenger —
  // форма логотипа; на «Маленький собирается из частей» сеть возвращается и по ней идёт волна
  const tA = word('real-app', 3, 'Синапс —', s3(3)), tB = Math.max(tA + 2.5, word('real-app', 3, 'Маленький', s3(3) + 4))
  const netLink = (a, b, ta) => link(a, b, { grow: 'a', rpx: 1.8, S: LEVELS[2].S, w: track([{ v: 0 }, { t: ta, v: 1, k: glide(0.8) }]), lit: track([{ v: 0 }, { t: tB, v: 0.6, k: glide(1) }]) })
  const coreKids = ['streaming', 'media', 'posts', 'calls', 'comments', 'reactions', 'live', 'user']
  const netLinks = coreKids.map((id) => netLink('core', id, s3(1) + 0.35 + Math.hypot(...[0, 1].map((k) => place(3, ...NET.find((x) => x[0] === id).slice(1, 4))[k] - core3[k])) / 2600))
  netLinks.push(netLink('relations', 'social', s3(1) + 0.5))
  // history ↔ messenger: разрез history смотрит на messenger (ребёнок → родитель)
  netLinks.push(netLink('messenger', 'history', s3(1) + 0.55))
  // смысловые импульсы масштаба 3: волна от ядра по всей сети и обратно
  const w0 = tB + 0.2
  netLinks.forEach((l, i) => pulse(l, false, w0 + i * 0.09, 1.2, 0.9))
  pulse(N.core.link, true, w0 + 0.3, 1.2, 0.9)
  pulse(N.relations.link, true, w0 + 0.5, 1.2, 0.9)
  netLinks.forEach((l, i) => pulse(l, true, w0 + 2.6 + i * 0.11, 1.2, 0.7))
  // «сеть дышит» с шага 3
  for (const n of nodes) if (n.net) n.breath = s3(3)
  const TRIAD = new Set(['core', 'streaming', 'messenger'])
  const dim = track([{ v: 1 }, { t: tA, v: 0.22, k: glide(0.8) }, { t: tB, v: 1, k: glide(1.2) }])
  for (const n of nodes) if (!TRIAD.has(n.id)) n.dim = dim
  const tri = track([{ v: 0 }, { t: tA + 0.2, v: 1, k: glide(0.6) }, { t: tB, v: 0, k: glide(1.0) }])
  for (const l of [netLinks[0], N.core.link]) { const lit0 = l.lit; l.lit = (t) => Math.max(lit0(t), tri(t)) }
  pulse(netLinks[0], false, tA + 0.3, 1.1); pulse(N.core.link, false, tA + 0.3, 1.1)

  // ─ фоновые импульсы: редкие, не спорят со смысловыми ─
  const busy = pulses.map((p) => p.t0).concat([2, 3, 4, 5].map((k) => at('real-one', k)), [2, 3, 4, 5, 6].map(s2), [1, 2, 3].map(s3)).filter(isFinite)
  const windows = [[t1 + 3, col - 1], [tIn2 + 2.5, t3 - 0.5], [t3 + tr3 + 2, at('real-app', 'end')]]
  let seed = 0
  for (const [a, b] of windows) {
    if (!(b > a) || Math.abs(a) > 1e5) continue
    for (let t = a + 1.5 * hash(seed++); t < b - 1.2; t += 3.4 + 2.2 * hash(seed++)) {
      if (busy.some((x) => Math.abs(x - t) < 2.4)) continue
      const live = links.filter((l) => l.w(t) > 0.98 && l.op(t) > 0.98)
      if (!live.length) continue
      const l = live[Math.floor(hash(seed++) * live.length)]
      pulse(l, hash(seed++) > 0.5, t, 1.3, 0.45)
    }
  }
  // камера блока 12: дробный масштаб + медленный облёт; в середине перелёта между масштабами — дуга побольше
  const hold = track([{ v: 0 }, { t: t3 + tr3 * 0.2, v: 1, k: glide(Math.max(1.2, tr3)) }, { t: s3(1), v: 0, k: glide(3.4) }])
  const camera = (t) => {
    const sig = sigma(t), tr = Math.abs(sig - Math.round(sig)), h = clamp(hold(t))
    return {
      sig, center: h, zoom: 1 - 0.3 * h,
      yaw: 0.06 * Math.sin(t * 0.11 + 0.6) + 0.1 * Math.sin(Math.PI * clamp(tr * 2)) * Math.sign(Math.sin(sig * Math.PI)),
      pitch: 0.035 * Math.sin(t * 0.083 + 1.7) - 0.05 * Math.sin(Math.PI * clamp(tr * 2)),
    }
  }
  // узлы блока 12 не существуют до его первого слайда (иначе при --only без real-one «прошедшие» события видны)
  const blockStart = Math.min(...ORDER.map((id) => sl[id]?.start ?? Infinity))
  for (const n of nodes) n.alive = (t) => t >= blockStart - 0.01
  return { nodes, links, pulses, camera, N }
}
