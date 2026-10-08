// Генератор деки ролика 1: project/slides/*.html + project/deck.json.
// Запуск из корня репо: node video/decks/overview/build-slides.mjs && node video/decks/build-preview.mjs overview
//
// Заметки диктора (<aside>) берутся из VIDEO_OVERVIEW.md: шаги «N. «…»» нужного блока — поэтому сценарий
// и дека не расходятся. Шаг сценария = клик в деке (data-build-in без `auto`).
// Ручные правки слайдов на claude.ai генератор перезапишет — переносить их сюда.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, 'project')
const script = readFileSync(join(here, '..', '..', 'VIDEO_OVERVIEW.md'), 'utf8')
// вес библиотек (блок 15) — только из замера: min+gzip, сборка rolldown (как Vite production)
const SIZE = JSON.parse(readFileSync(join(here, '..', '..', '..', 'scripts', 'bundle-size', 'results', 'results.json'), 'utf8'))
const kb = (id) => {
  const r = [...SIZE.synapse, ...SIZE.competitors].find((x) => x.id === id)
  if (!r) throw new Error(`нет сценария ${id} в results.json`)
  return Math.round((r.rolldown.gzip / 1024) * 10) / 10
}
const fmtKb = (v) => v.toFixed(1)
const SIZE_NOTE = `min+gzip, KB · synapse-storage ${SIZE.synapseVersion} · замер ${SIZE.date.slice(0, 10)} · yarn size:full`
const LOGO = '/_blob/fd250de6df274195f364a3bc9b682265'
const TOTAL = 15

// ─── палитра (как в деке ролика 2) ─────────────────────────────────────────
const C = {
  bg: 'radial-gradient(circle at 85% 0%, rgba(249,115,22,.14), rgba(249,115,22,0) 55%), #232321',
  text: '#ECECEC', muted: '#A9A69F', accent: '#F97316', card: '#353431', line: '#4A4842',
  code: '#1B1A18', codeText: '#E6E2DA', kw: '#F97316', str: '#A3E635', com: '#7D7A72', dim: '#7A776F',
  soft: 'rgba(249,115,22,.16)', red: '#F87171',
}
const MONO = "'JetBrains Mono', monospace"

// ─── сценарий → заметки ────────────────────────────────────────────────────
function beats(block) {
  const start = script.indexOf(`### Блок ${block} —`)
  if (start < 0) throw new Error(`нет блока ${block}`)
  const end = script.indexOf('\n### Блок', start + 5)
  const body = script.slice(start, end < 0 ? undefined : end)
  const out = {}
  const re = /^(\d+)\.\s+([\s\S]*?)(?=^\d+\.\s|^\S|^\s*$)/gm
  for (const m of body.matchAll(re)) {
    const text = m[2].replace(/\s*\n\s*/g, ' ')
    const q = text.match(/^«([\s\S]*?)»(?=\s+—|\s*$)/)
    if (q) out[m[1]] = q[1]
  }
  return out
}
const notes = (block, from, to) => {
  const b = beats(block)
  const parts = []
  for (let i = from; i <= to; i++) {
    if (!b[i]) throw new Error(`блок ${block}: нет шага ${i}`)
    parts.push(b[i])
  }
  return parts
}

// ─── примитивы ─────────────────────────────────────────────────────────────
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const build = (s, out, fx = 'fade') =>
  (s ? ` data-build-in="${fx} ${s}"` : '') + (out ? ` data-build-out="fade ${out}"` : '')
const UNITLESS = new Set(['line-height', 'font-weight', 'opacity'])
const st = (o) => Object.entries(o).map(([k, v]) => `${k}:${typeof v === 'number' && !UNITLESS.has(k) ? v + 'px' : v}`).join(';')

const P = (x, y, w, html, style = {}, s = 0, out = 0, fx) =>
  `<p style="${st({ position: 'absolute', left: x, top: y, width: w, ...style })}"${build(s, out, fx)}>${html}</p>`
const DIV = (x, y, w, h, style = {}, s = 0, out = 0, fx) =>
  `<div style="${st({ position: 'absolute', left: x, top: y, width: w, height: h, ...style })}"${build(s, out, fx)}></div>`

const header = (eyebrow, block, title) =>
  P(128, 104, 1250, eyebrow, { 'font-size': 26, 'font-weight': 600, color: C.accent, 'letter-spacing': 3, 'text-transform': 'uppercase', 'line-height': 1.2 }) +
  (block == null ? '' : P(1492, 106, 300, `БЛОК ${block} / ${TOTAL}`, { 'font-size': 24, 'font-weight': 600, color: C.muted, 'letter-spacing': 2, 'text-align': 'right', 'line-height': 1.2 })) +
  (title ? `<h2 style="${st({ position: 'absolute', left: 128, top: 146, width: 1664, 'font-size': 54, 'font-weight': 700, color: C.text, 'line-height': 1.1, 'letter-spacing': -1 })}">${title}</h2>` : '')

const pillW = (text, size = 28) => Math.round(text.replace(/<[^>]+>/g, '').length * size * 0.6 + 56)
const pill = (x, y, text, { s = 0, out = 0, size = 28, hot = false, dashed = false, w, fx = 'pop', mono = false } = {}) =>
  P(x, y, w ?? pillW(text, size), text, {
    'font-size': size, 'font-weight': 600, 'line-height': 1.3, padding: '12px 26px', 'border-radius': 999,
    background: hot ? C.soft : dashed ? 'transparent' : C.card,
    border: `2px ${dashed ? 'dashed' : 'solid'} ${hot ? C.accent : dashed ? C.dim : C.line}`,
    color: dashed ? C.muted : C.text, 'white-space': 'nowrap', 'text-align': 'center',
    ...(mono ? { 'font-family': MONO } : {}),
  }, s, out, fx)
const card = (x, y, w, title, body, { s = 0, out = 0, hot = false, size = 26 } = {}) =>
  P(x, y, w, `<b style="color:${C.accent}">${title}</b>${body ? '<br>' + body : ''}`, {
    'font-size': size, 'line-height': 1.4, color: C.text, padding: '18px 24px', 'border-radius': 16,
    background: hot ? C.soft : C.card, border: `2px solid ${hot ? C.accent : C.line}`,
  }, s, out, 'rise')
const note = (x, y, w, html, s = 0, out = 0, size = 28) =>
  P(x, y, w, html, { 'font-size': size, color: C.muted, 'line-height': 1.4 }, s, out)
const conn = (x1, y1, x2, y2, { s = 0, out = 0, color = C.accent, dashed = false, width = 4, head = 'end' } = {}) =>
  `<x-connector x1="${Math.round(x1)}" y1="${Math.round(y1)}" x2="${Math.round(x2)}" y2="${Math.round(y2)}" head="${head}" route="straight" style="color:${color};border-width:${width}px${dashed ? ';border-style:dashed' : ''}"${build(s, out)}></x-connector>`
// высота бейджа: line-height 1.3 + padding 12×2 + рамка 2×2
const pillH = (size = 28) => Math.round(size * 1.3) + 28
// ряд бейджей со стрелками, выровненными по центру бейджей.
// items: [text, { s, hot, mono, dashed, w }]; стрелка перед бейджем появляется вместе с ним
function chain(x, y, items, { size = 28, gap = 56, s: s0 = 0 } = {}) {
  let html = ''
  const cy = y + pillH(size) / 2
  items.forEach(([t, o = {}], i) => {
    const s = o.s ?? s0
    if (i > 0) { html += conn(x - gap + 10, cy, x - 10, cy, { s, width: 4 }) }
    const w = o.w ?? pillW(t, size)
    html += pill(x, y, t, { size, ...o, s, w })
    x += w + gap
  })
  return { html, end: x - gap }
}

// кружок-узел с подписью внутри (div с border-radius 50% — в claude.ai рисуется, в отличие от пустого <p>)
const bubble = (cx, cy, d, text, { s = 0, out = 0, hot = false, dashed = false, size = 22 } = {}) =>
  DIV(cx - d / 2, cy - d / 2, d, d, { background: hot ? C.soft : dashed ? 'transparent' : C.card, border: `3px ${dashed ? 'dashed' : 'solid'} ${hot ? C.accent : dashed ? C.dim : C.line}`, 'border-radius': 999 }, s, out, 'pop') +
  P(cx - d / 2, cy - size * 0.7, d, text, { 'font-family': MONO, 'font-size': size, 'font-weight': 700, 'text-align': 'center', color: dashed ? C.muted : C.text }, s, out, 'pop')
// стрелка сверху вниз от кружка a к кружку b (по линии центров, с отступом от краёв)
const arrowDown = (a, b, o = {}) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L
  return conn(a[0] + ux * (a[2] / 2 + 8), a[1] + uy * (a[2] / 2 + 8), b[0] - ux * (b[2] / 2 + 14), b[1] - uy * (b[2] / 2 + 14), { width: 4, ...o })
}

// ─── код ───────────────────────────────────────────────────────────────────
const KW = new Set('import from export const let new class extends readonly return await async private constructor super this function if null true false typeof void interface type of'.split(' '))
function hl(src) {
  let out = ''
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (src.startsWith('//', i)) { out += `<span style="color:${C.com}">${esc(src.slice(i))}</span>`; break }
    if (ch === "'" || ch === '`') {
      const j = src.indexOf(ch, i + 1)
      const end = j < 0 ? src.length : j + 1
      out += `<span style="color:${C.str}">${esc(src.slice(i, end))}</span>`
      i = end
      continue
    }
    const w = src.slice(i).match(/^[A-Za-z_$][\w$]*/)
    if (w) {
      out += KW.has(w[0]) ? `<span style="color:${C.kw}">${w[0]}</span>` : esc(w[0])
      i += w[0].length
      continue
    }
    out += ch === ' ' ? '&#160;' : esc(ch)
    i++
  }
  return out
}
// rows: [step, text, outStep?] | { segs: [[step, text, outStep?], …] } | { alt: [[step, text, out?], …] } (одна строка, разные версии)
// | GAP — пустая строка-разделитель: занимает строку на экране, но не считается в номерах строк (c.at, mark, dimRows)
const GAP = { gap: true }
function code({ x = 128, y = 250, w = 1664, rows: all, size = 24, lh = 34, s = 0, pad = 28, dimRows = [] }) {
  const cw = size * 0.6
  const rows = all.filter((row) => row !== GAP)
  const vis = [] // номер строки → строка на экране
  all.forEach((row, v) => { if (row !== GAP) vis.push(v) })
  const vy = (r) => (r < rows.length ? vis[r] : all.length + r - rows.length)
  const h = all.length * lh + pad * 2
  // рамка — вместе с первой появляющейся строкой (пустая рамка до кода выглядит как незагрузившаяся картинка)
  const steps = rows.flatMap((row) => (Array.isArray(row) ? (row[1] ? [row[0]] : []) : (row.segs ?? row.alt ?? []).map((x) => x[0])))
  const s0 = s || Math.min(...steps, Infinity)
  let html = DIV(x, y, w, h, { background: C.code, border: `1px solid ${C.line}`, 'border-radius': 18 }, isFinite(s0) ? s0 : 0, 0, 'rise')
  const line = (r, text, step, out, col = 0) => {
    if (!text) return ''
    const lead = text.match(/^ */)[0].length
    return P(x + pad + (col + lead) * cw, y + pad + vy(r) * lh, Math.ceil((text.length - lead) * cw) + 24, hl(text.slice(lead)), {
      'font-family': MONO, 'font-size': size, 'line-height': `${lh}px`, color: dimRows.includes(r) ? C.dim : C.codeText, 'white-space': 'nowrap',
    }, step, out).replace('<p ', '<p data-code="1" ')
  }
  rows.forEach((row, r) => {
    if (Array.isArray(row)) html += line(r, row[1], row[0], row[2])
    else if (row.segs) {
      let col = 0
      for (const [step, text, out] of row.segs) { html += line(r, text, step, out, col); col += text.length }
    } else if (row.alt) for (const [step, text, out] of row.alt) html += line(r, text, step, out)
  })
  return { html, at: (r) => y + pad + vy(r) * lh, x, y, w, h, lh, pad, cw }
}
// подсветка строк кода [r1..r2]
const mark = (c, r1, r2, s, out = 0, cols) =>
  DIV(c.x + 12 + (cols ? cols[0] * c.cw + c.pad - 12 : 0), c.at(r1) - 4, cols ? (cols[1] - cols[0]) * c.cw + 24 : c.w - 24, c.at(r2) - c.at(r1) + c.lh + 8,
    { border: `3px solid ${C.accent}`, 'border-radius': 10, background: 'rgba(249,115,22,.08)' }, s, out, 'pop')

// ─── логотип-синапс ────────────────────────────────────────────────────────
// кольцо с разрывом; gapAt — угол середины разрыва (0 = вправо, 180 = влево)
function ring(id, cx, cy, d, { s = 0, out = 0, gapAt = 0, stroke = 20, opacity = 1, fx = 'pop', dashed = false } = {}) {
  const r = 50 - stroke / 2 - 2
  const circ = 2 * Math.PI * r
  const gap = dashed ? 0 : circ * 0.17
  const gapDeg = (gap / circ) * 360
  const start = gapAt - 360 + gapDeg / 2
  const g = `g${id.replace(/[^a-z0-9]/gi, '')}`
  const dash = dashed ? 'stroke-dasharray="6 6"' : `stroke-dasharray="${(circ - gap).toFixed(1)} ${gap.toFixed(1)}"`
  const paint = dashed ? '#7A776F' : `url(#${g})`
  const sw = dashed ? 3 : stroke
  return `<svg id="${id}" viewBox="0 0 100 100" width="100" height="100" aria-label="${id}" style="${st({ position: 'absolute', left: cx - d / 2, top: cy - d / 2, width: d, height: d, opacity })}"${build(s, out, fx)}><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FB923C"/><stop offset="1" stop-color="#EA580C"/></linearGradient></defs><circle cx="50" cy="50" r="${r.toFixed(1)}" fill="none" stroke="${paint}" stroke-width="${sw}" stroke-linecap="round" ${dash} transform="rotate(${start.toFixed(1)} 50 50)"/></svg>`
}
// раскладка логотипа справа (центр + 4 спутника на дуге)
const LG = { cx: 1210, cy: 590, d: 230, sd: 120, dist: 340, angles: [-52, -17, 17, 52] }
const sat = (i) => {
  const a = (LG.angles[i] * Math.PI) / 180
  return { x: LG.cx + LG.dist * Math.cos(a), y: LG.cy + LG.dist * Math.sin(a), a }
}
const SAT_NAMES = ['Storage', 'Selectors', 'Dispatcher', 'Effects']
function satellite(i, { s = 0, out = 0, opacity = 1, label = SAT_NAMES[i], dashed = false, idSuffix = '', lx = 14 } = {}) {
  const p = sat(i)
  return ring(`ring-${SAT_NAMES[i].toLowerCase()}${idSuffix}`, p.x, p.y, LG.sd, { s, out, opacity, gapAt: 180 + LG.angles[i], stroke: 18, dashed }) +
    P(p.x + LG.sd / 2 + lx, p.y - 20, 300, label, { 'font-size': 28, 'font-weight': 700, color: dashed ? C.muted : C.text, opacity }, s, out)
}
function spoke(i, opts = {}) {
  const p = sat(i)
  const ux = Math.cos(p.a), uy = Math.sin(p.a)
  const r1 = LG.d / 2 + 14, r2 = LG.dist - LG.sd / 2 - 14
  return conn(LG.cx + ux * r1, LG.cy + uy * r1, LG.cx + ux * r2, LG.cy + uy * r2, { dashed: true, width: 8, head: 'none', ...opts })
}
const center = (label, { s = 0, out = 0 } = {}) =>
  ring('ring-center', LG.cx, LG.cy, LG.d, { s, out, gapAt: 0, stroke: 22 }) +
  P(LG.cx - 200, LG.cy + LG.d / 2 + 12, 400, label, { 'font-size': 30, 'font-weight': 700, color: C.accent, 'text-align': 'center', 'font-family': MONO }, s, out)

// логотип инлайн-SVG (копия packages/homepage/public/logo2.svg): в видео рендер рисует его и «пускает сигнал»
// по data-part (core — большое кольцо, link — связи, node — малые кольца); в деке он статичен
function logoSvg(id, x, y, size) {
  const g = `lg${id}`
  const node = (cy) => `<circle data-part="node" cx="140" cy="${cy}" r="14" stroke="url(#${g})" stroke-width="8" fill="none"/>`
  const link = (y1, y2) => `<line data-part="link" x1="92.1" y1="${y1}" x2="120.2" y2="${y2}" stroke="url(#${g})" stroke-width="6" stroke-linecap="round"/>`
  return `<svg data-logo="${id}" viewBox="0 0 200 200" fill="none" aria-label="логотип synapse" style="${st({ position: 'absolute', left: x, top: y, width: size, height: size, overflow: 'visible' })}">` +
    `<defs><linearGradient id="${g}" x1="30" y1="30" x2="160" y2="170" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#FF9B3E"/><stop offset="100%" stop-color="#E85D19"/></linearGradient>` +
    `<mask id="${g}cut"><rect width="200" height="200" fill="white"/><line x1="60" y1="100" x2="140" y2="45" stroke="black" stroke-width="10"/><line x1="60" y1="100" x2="140" y2="155" stroke="black" stroke-width="10"/></mask></defs>` +
    `<g mask="url(#${g}cut)"><circle data-part="core" cx="60" cy="100" r="26" stroke="url(#${g})" stroke-width="14" fill="none"/>${node(45)}${node(155)}</g>` +
    link(77.9, 58.6) + link(122.1, 141.4) + '</svg>'
}
// мягкое свечение за логотипом (в видео «дышит»)
const glow = (cx, cy, r) => `<div data-glow="1" style="${st({ position: 'absolute', left: cx - r, top: cy - r, width: 2 * r, height: 2 * r, 'border-radius': '50%', background: 'radial-gradient(circle, rgba(249,115,22,.20), rgba(249,115,22,0) 65%)' })}"></div>`

// ─── сборка слайда ────────────────────────────────────────────────────────
const slides = []
const slide = (id, body, beatTexts, { transition = 'fade', map } = {}) => {
  if (!map || map.length !== beatTexts.length) throw new Error(`${id}: map (${map?.length}) ≠ шагов диктора (${beatTexts.length})`)
  slides.push({
    id, transition, beats: beatTexts.map((text, i) => ({ text, steps: [].concat(map[i]) })),
    html: `<section id="${id}" data-transition="${transition}" style="background:${C.bg};color:${C.text};font-family:'Inter', sans-serif;padding:128px;display:flex;flex-direction:column">\n${body}\n<aside>${esc(beatTexts.join(' '))}</aside>\n</section>\n`,
  })
}

// ═══ Блок 0 — обложка ═══
slide('cover',
  glow(1530, 540, 340) + logoSvg('cover', 1290, 300, 480) +
  P(128, 230, 1100, 'synapse-storage 7.0.0 · обзор', { 'font-size': 26, 'font-weight': 600, color: C.accent, 'letter-spacing': 3, 'text-transform': 'uppercase' }) +
  `<h1 style="position:absolute;left:128px;top:290px;width:1150px;font-size:70px;font-weight:800;color:${C.text};line-height:1.1;letter-spacing:-1.5px;white-space:nowrap">От стора на две строки<br><span style="color:${C.accent}">до архитектуры бизнес-логики</span></h1>` +
  pill(128, 520, 'State manager', { s: 1, size: 34 }) +
  pill(128 + pillW('State manager', 34) + 24, 520, 'API-клиент', { s: 2, size: 34 }) +
  pill(128 + pillW('State manager', 34) + pillW('API-клиент', 34) + 48, 520, 'Бизнес-логика', { s: 3, size: 34, hot: true }),
  notes(0, 1, 5), { map: [0,1,2,3,3] })

// ═══ Блок 1 — зачем ═══
{
  const names = ['Стор', 'Кэш запросов', 'Персист', 'Логика / эффекты']
  const cw = (1664 - 72) / 4
  let b = header('Зачем', 1, 'Слой данных обычно собирают из нескольких библиотек')
  names.forEach((n, i) => {
    b += P(128 + i * (cw + 24), 330, cw, `<b>${n}</b>`, { 'font-size': 34, padding: '34px 28px', 'border-radius': 18, background: C.card, border: `2px solid ${C.line}`, 'text-align': 'center' }, i + 1, 0, 'rise')
  })
  b += P(128, 520, 1664, `<b>Клей, который пишешь сам:</b> <span style="color:${C.muted}">HTTP-обёртка · статусы загрузки · SSR · синхронизация вкладок</span>`,
    { 'font-size': 30, padding: '22px 32px', 'border-radius': 18, border: `3px dashed ${C.dim}`, 'line-height': 1.35 }, 5)
  b += P(128, 680, 1664, `<span style="color:${C.accent}">synapse:</span> storage · selectors · ApiClient · dispatcher · effects`,
    { 'font-size': 36, 'font-weight': 700, padding: '24px 32px', 'border-radius': 18, background: C.soft, border: `3px solid ${C.accent}` }, 6, 0, 'rise')
  b += note(128, 830, 1664, 'Tree-shakeable: в бандл попадает только импортированное. Сколько это стоит в KB — в конце видео.', 7, 0, 30)
  slide('why', b, notes(1, 1, 8), { map: [0,1,2,3,4,5,6,7] })
}

// ═══ Блок 2 — два слоя ═══
{
  let b = header('Ментальная модель', 2, 'Два слоя')
  const frame = (y, title, s, hot) =>
    DIV(128, y, 1180, 230, { background: C.card, border: `3px solid ${hot ? C.accent : C.line}`, 'border-radius': 22 }, s, 0, 'rise') +
    P(164, y + 30, 1100, title, { 'font-size': 26, 'font-weight': 600, color: hot ? C.accent : C.muted, 'letter-spacing': 2, 'text-transform': 'uppercase' }, s, 0, 'rise')
  const row = (y, items) => {
    let x = 164
    let h = ''
    for (const [t, o] of items) { h += pill(x, y, t, { size: 26, ...o }); x += pillW(t, 26) + 18 }
    return h
  }
  // нижний слой
  b += frame(600, 'State Manager — где лежит состояние', 1, false)
  b += row(700, [['Storage', { s: 2 }], ['Selectors', { s: 3 }], ['middleware · миграции', { s: 4 }]])
  // верхний слой
  b += frame(262, 'Business Logic Layer — как логика управляет состоянием', 5, true)
  b += row(362, [['Dispatcher — намерения', { s: 6 }], ['Effects — реакции', { s: 7 }], ['createSynapse', { s: 8, hot: true }]])
  b += P(180, 520, 1100, '↓ читает селекторами · пишет экшенами ↑', { 'font-size': 30, color: C.muted, 'font-weight': 600 }, 9)
  b += DIV(116, 588, 1204, 254, { border: `4px solid ${C.accent}`, 'border-radius': 26 }, 10, 0, 'pop')
  b += P(1360, 270, 432, `<b style="font-size:40px">ApiClient</b><br><span style="color:${C.muted}">Отдельно. Можно взять без диспетчера, эффектов и даже без React.</span>`,
    { 'font-size': 28, 'line-height': 1.4, padding: '30px 32px', 'border-radius': 22, background: C.code, border: `2px dashed ${C.dim}` }, 11, 0, 'pop')
  slide('layers', b, notes(2, 1, 13), { map: [0,1,2,3,4,5,6,7,8,9,10,11,11] })
}

// ═══ Блок 3 — хранилище ═══
{
  const c = code({ rows: [
    [1, "import { MemoryStorage } from 'synapse-storage/core'"],
    [0, ''],
    [2, 'const todoStorage = new MemoryStorage<TodoState>({'],
    [2, "  name: 'todo',"],
    [2, "  initialState: { todos: [], filter: 'all' },"],
    [2, '})'],
    GAP,
    [3, 'await todoStorage.initialize()'],
    [0, ''],
    [4, "todoStorage.set('filter', 'active')"],
    [5, 'todoStorage.update((s) => {          // «мутируем», как в Immer'],
    [5, "  s.todos.push({ id: 't3', title: 'Снять видео', done: false })"],
    [5, "  s.filter = 'all'"],
    [5, '})                                   // → одно уведомление'],
    [0, ''],
    [6, "todoStorage.subscribe('filter', (filter) => …)"],
    [7, 'todoStorage.subscribe((s) => s.todos.length, (count) => …)'],
    [8, 'todoStorage.subscribeToAll((event) => event.changedPaths)'],
  ] })
  let b = header('State Manager · хранилище', 3, 'Стор за пару строк') + c.html
  b += pill(1300, 300, 'на сервере', { s: 9 }) + pill(1300, 380, 'без React', { s: 9 })
  slide('storage', b, notes(3, 1, 10), { map: [0,1,2,3,4,5,6,7,8,9] })
}

// ═══ Блок 4 — смена хранилища ═══
{
  const c = code({ y: 240, rows: [
    { alt: [[0, "import { MemoryStorage } from 'synapse-storage/core'", 1], [1, "import { LocalStorage } from 'synapse-storage/core'", 5], [5, "import { IndexedDBStorage } from 'synapse-storage/core'"]] },
    GAP,
    { alt: [[0, 'const todoStorage = new MemoryStorage<TodoState>({', 1], [1, 'const todoStorage = new LocalStorage<TodoState>({', 5], [5, 'const todoStorage = new IndexedDBStorage<TodoState>({']] },
    [0, "  name: 'todo',"],
    [0, "  initialState: { todos: [], filter: 'all' },"],
    [6, "  options: { dbName: 'my_app_db' },      // обязательно: имя базы"],
    [4, '  version: 2,                             // версия схемы данных'],
    [4, '  migrate: (old, fromVersion) => (fromVersion < 2 ? toV2(old) : old),'],
    [0, '})'],
    [0, 'await todoStorage.initialize()'],
    GAP,
    { alt: [[0, "todoStorage.set('filter', 'active')", 7], [7, "await todoStorage.set('filter', 'active')        // API асинхронный"]] },
    { alt: [[0, 'todoStorage.update((s) => {', 7], [7, 'await todoStorage.update((s) => {']] },
    [0, "  s.filter = 'all'"],
    [0, '})'],
    GAP,
    [0, "todoStorage.subscribe('filter', (filter) => …)  // подписки — те же"],
    [0, 'todoStorage.subscribeToAll((event) => event.changedPaths)'],
    [8, 'const cached = todoStorage.getStateSync()      // синхронно из кэша'],
  ] })
  let b = header('State Manager · смена хранилища', 4, 'Меняем класс — остальное то же') + c.html
  b += mark(c, 9, 14, 2, 3)
  b += mark(c, 2, 2, 3, 4) + mark(c, 8, 8, 3, 4)
  b += pill(1380, 250, 'LocalStorage', { s: 1, out: 5, hot: true }) + note(1380, 330, 412, 'переживает перезагрузку · ~5 МБ · только строки', 1, 5)
  b += pill(1380, 250, 'IndexedDBStorage', { s: 5, hot: true }) + note(1380, 330, 412, 'много данных, бинарные · API асинхронный', 5)
  slide('persist', b, notes(4, 1, 8), { map: [1,2,3,4,5,6,7,8] })
}
{
  const cols = [380, 180, 480, 500]
  const row = (y, cells, s, head) => {
    let x = 128
    let h = ''
    cells.forEach((t, i) => {
      h += P(x, y, cols[i] - 8, t, { 'font-size': 32, 'font-weight': head ? 700 : 400, color: head ? C.muted : C.text, padding: '18px 22px', background: head ? 'transparent' : C.card, 'border-radius': 12, 'font-family': i === 0 && !head ? MONO : "'Inter', sans-serif" }, s, 0, 'rise')
      x += cols[i] + 8
    })
    return h
  }
  let b = header('State Manager · смена хранилища', 4, 'Итого: три хранилища, один API')
  b += row(300, ['Хранилище', 'API', 'На сервере', 'После перезагрузки'], 0, true)
  b += row(400, ['MemoryStorage', 'sync', 'работает', 'теряется'], 1)
  b += row(500, ['LocalStorage', 'sync', 'через browserStorage', 'сохраняется (~5 МБ)'], 2)
  b += row(600, ['IndexedDBStorage', 'async', '—', 'сохраняется, много'], 3)
  b += DIV(128 + 380 + 180 + 16 - 4, 496, 488, 84, { border: `4px solid ${C.accent}`, 'border-radius': 14 }, 4, 0, 'pop')
  b += note(128, 760, 1400, '<b style="color:#ECECEC">browserStorage</b> — в браузере LocalStorage, на сервере MemoryStorage. Подробнее — в блоке про SSR.', 4, 0, 30)
  slide('persist-table', b, notes(4, 9, 12), { map: [1,2,3,4] })
}

// ═══ Блок 5 — middleware ═══
{
  let b = header('State Manager · middleware', 5, 'Точка расширения между set и записью')
  const ch = chain(128, 250, [['storage.set()', { s: 1, mono: true }], ['shallowCompare', { s: 3, hot: true }], ['batching', { s: 4, hot: true }],
    ['logger', { s: 5, hot: true }], ['broadcast', { s: 6, hot: true }], ['хранилище', { s: 1 }], ['подписчики', { s: 1 }]], { size: 24, gap: 46 })
  b += ch.html
  b += DIV(114, 238, ch.end - 114 + 14, pillH(24) + 24, { border: `4px solid ${C.accent}`, 'border-radius': 999 }, 7, 0, 'pop')
  const c = code({ y: 360, w: 1300, rows: [
    [2, 'const todoStorage = new LocalStorage<TodoState>({'],
    [2, "  name: 'todo',"],
    [2, '  initialState,'],
    [2, '  middlewares: (getDefault) => ['],
    [3, '    getDefault().shallowCompare(),              // то же значение — тишина'],
    [4, '    getDefault().batching({ batchSize: 5, batchDelay: 100 }),'],
    [5, '    getDefault().logger({ collapsed: true }),   // только dev'],
    [6, "    syncBroadcastMiddleware({ storageType: 'localStorage',"],
    [6, "                              storageName: 'todo' }),"],
    [2, '  ],'],
    [2, '})'],
  ] })
  b += c.html
  b += card(1460, 370, 332, 'вкладка 1', '<span style="font-family:JetBrains Mono, monospace">filter: active</span>', { s: 6 })
  b += P(1600, 510, 60, '⇅', { 'font-size': 44, color: C.accent, 'text-align': 'center' }, 6)
  b += card(1460, 580, 332, 'вкладка 2', '<span style="font-family:JetBrains Mono, monospace">filter: active</span>', { s: 6 })
  b += note(1460, 730, 332, 'порядок в массиве = порядок обработки', 7, 0, 26)
  slide('middleware', b, notes(5, 1, 7), { map: [1,2,3,4,5,6,7] })
}
{
  let b = header('State Manager · middleware', 5, 'Своя middleware — обычный объект')
  const c = code({ w: 1664, rows: [
    [1, 'const analyticsMiddleware = (): SyncMiddleware => ({'],
    [1, "  name: 'analytics',"],
    [1, '  reducer: (api) => (next) => (action) => {'],
    [1, '    const result = next(action)              // пропустить операцию дальше'],
    [1, "    if (action.type === 'set') analytics.track('todo_changed', { key: action.key })"],
    [1, '    return result'],
    [1, '  },'],
    [1, '})'],
    [0, ''],
    [4, 'middlewares: (getDefault) => [getDefault().logger(), analyticsMiddleware()]'],
  ] })
  b += c.html + mark(c, 4, 4, 2, 3)
  const cw = (1664 - 48) / 3
  b += card(128, 680, cw, 'не вызвать next', 'запись заблокирована — валидация', { s: 3 })
  b += card(128 + cw + 24, 680, cw, 'next({ …action, value })', 'изменили значение — нормализация', { s: 3 })
  b += card(128 + 2 * (cw + 24), 680, cw, 'next + track', 'выполнили и сообщили — аналитика', { s: 3, hot: true })
  b += pill(128, 870, 'ваша middleware → в тот же массив', { s: 4, hot: true, size: 26 })
  slide('middleware-custom', b, notes(5, 8, 11), { map: [1,2,3,4] })
}

// ═══ Блок 6 — React ═══
{
  const c = code({ y: 270, size: 28, lh: 42, rows: [
    [1, "import { useStorageSubscribe } from 'synapse-storage/react'"],
    [0, ''],
    [2, 'function TodoList() {'],
    [2, '  const todos = useStorageSubscribe(todoStorage, (s) => s.todos)'],
    [2, '  return <ul>{todos.map((t) => <li key={t.id}>{t.title}</li>)}</ul>'],
    [2, '}'],
  ] })
  let b = header('State Manager · React', 6, 'В React — один хук') + c.html
  b += chain(128, 660, [['storage'], ['useSyncExternalStore'], ['ре-рендер, только если изменился срез', { hot: true }]], { s: 3 }).html
  b += pill(128, 800, 'провайдер для простого случая не нужен', { s: 4, dashed: true })
  slide('react', b, notes(6, 1, 4), { map: [1,2,3,4] })
}

// ═══ Блок 7 — селекторы ═══
{
  const c = code({ y: 240, w: 1190, rows: [
    [1, "import { Selectors } from 'synapse-storage/core'"],
    [0, ''],
    { segs: [[2, 'export class PokemonSelectors '], [3, 'extends Selectors<PokemonState> {']] },
    [4, '  readonly pokemonList = this.select((s) => s.pokemonList)'],
    [4, '  readonly searchQuery = this.select((s) => s.searchQuery)'],
    [0, ''],
    [5, '  readonly filteredList = this.combine('],
    [5, '    [this.pokemonList, this.searchQuery],'],
    [5, '    (list, q) => (q ? list.filter((p) => p.name.includes(q)) : list),'],
    [7, "    { name: 'filteredList' },"],
    [5, '  )'],
    [0, ''],
    [8, '  readonly byId = this.keyed((id: number) =>'],
    [8, '    (s: PokemonState) => s.pokemonList.find((p) => p.id === id))'],
    { segs: [[2, '}']] },
    [0, ''],
    [9, 'const selectors = new PokemonSelectors(pokemonStorage)'],
    [9, 'const filtered = useSelector(selectors.filteredList)'],
  ] })
  let b = header('State Manager · селекторы', 7, 'Вычисляемые данные с мемоизацией') + c.html
  const A = [1480, 345, 180], B = [1700, 345, 180], F = [1590, 580, 200]
  b += bubble(A[0], A[1], A[2], 'pokemonList', { s: 5 }) + bubble(B[0], B[1], B[2], 'searchQuery', { s: 5 })
  b += arrowDown(A, F, { s: 5 }) + arrowDown(B, F, { s: 5 })
  b += bubble(F[0], F[1], F[2], 'filteredList', { s: 5, hot: true })
  b += note(1400, 700, 392, 'мемо: пересчёт только при смене входов', 6, 0, 24)
  b += P(1380, 790, 412, `<b style="color:${C.accent}">опции select / combine</b><br><span style="font-family:JetBrains Mono, monospace">equals?: (a, b) =&gt; boolean<br>name?: string</span>`,
    { 'font-size': 24, 'line-height': 1.5, padding: '18px 22px', 'border-radius': 16, background: C.card, border: `2px solid ${C.line}` }, 7, 0, 'rise')
  slide('selectors', b, notes(7, 1, 10), { map: [0,1,2,3,4,5,6,7,8,9] })
}
{
  const c = code({ y: 240, w: 1190, rows: [
    [1, 'export class PokemonSelectors extends Selectors<PokemonState> {'],
    [1, '  readonly favorites = this.select((s) => s.favorites)'],
    [1, '  readonly canAddFavorite: SelectorAPI<boolean>'],
    [0, ''],
    [2, '  constructor('],
    [2, '    storage: IStorage<PokemonState>,'],
    [2, '    private readonly user: UserSelectors,    // чужие селекторы'],
    [2, '  ) {'],
    [2, '    super(storage)'],
    [3, '    this.canAddFavorite = this.combine('],
    [3, '      [this.favorites, this.user.plan],'],
    [3, "      (favorites, plan) => plan === 'pro' || favorites.length < 10,"],
    [3, '    )'],
    [2, '  }'],
    [1, '}'],
    [0, ''],
    [6, 'const selectors = new PokemonSelectors(pokemonStorage, userSelectors)'],
  ] })
  let b = header('State Manager · селекторы', 7, 'Селекторы из другого модуля') + c.html + mark(c, 8, 12, 5, 6)
  const A = [1480, 345, 180], B = [1700, 345, 180], F = [1590, 590, 220]
  b += bubble(A[0], A[1], A[2], 'favorites', { s: 3 }) + bubble(B[0], B[1], B[2], 'user.plan', { s: 3, dashed: true })
  b += note(1610, 214, 182, 'чужой модуль', 3, 0, 22)
  b += arrowDown(A, F, { s: 3 }) + arrowDown(B, F, { s: 3, dashed: true, color: C.dim })
  b += bubble(F[0], F[1], F[2], 'canAddFavorite', { s: 3, hot: true })
  b += note(1380, 730, 412, 'сменился тариф → пересчитался наш селектор, хотя хранилища разные', 4, 0, 26)
  b += note(1380, 850, 412, 'combine с чужим — в конструкторе, после super', 5, 0, 26)
  slide('selectors-cross', b, notes(7, 11, 16), { map: [1,2,3,4,5,6] })
}

// ═══ Блок 8 — API ═══
{
  const c = code({ y: 240, w: 1230, rows: [
    [1, "import { ApiClient } from 'synapse-storage/api'"],
    [1, "import { MemoryStorage } from 'synapse-storage/core'"],
    [0, ''],
    [2, 'export const pokemonApi = new ApiClient({'],
    [3, "  storage: new MemoryStorage({ name: 'api-cache', initialState: {} }),"],
    [4, '  baseQuery: {'],
    [4, "    baseUrl: 'https://pokeapi.co/api/v2',"],
    [4, '    timeout: 10000,'],
    [4, '    prepareHeaders: async (headers) => {'],
    [4, "      headers.set('Authorization', `Bearer ${getToken()}`)"],
    [4, '      return headers'],
    [4, '    },'],
    [4, '  },'],
    GAP,
    [5, '  cache: { ttl: 60000, invalidateOnError: true },'],
    [6, '  retry: { count: 3, delay: (attempt) => attempt * 500 },'],
    GAP,
    [2, '  endpoints: async (create) => ({ … }),   // → дальше'],
    [2, '})'],
  ] })
  let b = header('ApiClient · создание', 8, 'Транспорт, кэш, повторы') + c.html
  b += P(1420, 250, 372, 'как RTK Query, только без Redux', { 'font-size': 28, color: C.muted, 'line-height': 1.4 })
  b += card(1420, 360, 372, 'кэш = хранилище', 'Memory · LocalStorage · IndexedDB', { s: 3 })
  b += card(1420, 520, 372, 'baseQuery', 'адрес, таймаут, заголовки, свой fetch', { s: 4 })
  b += card(1420, 690, 372, 'retry', 'глобально — только идемпотентные методы', { s: 6 })
  slide('api-client', b, notes(8, 1, 7), { map: [0,1,2,3,4,5,6] })
}
{
  const c = code({ y: 240, w: 1300, size: 23, lh: 32, rows: [
    [1, 'endpoints: async (create) => ({'],
    [1, '  getList: create<{ limit: number; offset: number }, PokemonList>({'],
    [1, "    request: (params) => ({ path: '/pokemon', method: 'GET', query: params }),"],
    [2, '    cache: { ttl: 120000 },        // своя политика'],
    [2, "    tags: ['pokemon-list'],"],
    [1, '  }),'],
    GAP,
    [3, '  getDetails: create<{ id: number }, Pokemon>({'],
    [3, "    request: ({ id }) => ({ path: `/pokemon/${id}`, method: 'GET' }),"],
    [3, '    cache: true,'],
    [3, "    tags: ['pokemon-details'],"],
    [3, '  }),'],
    GAP,
    [4, '  createPokemon: create<{ name: string }, Pokemon>({'],
    [4, "    request: (body) => ({ path: '/pokemon', method: 'POST', body }),"],
    [4, "    invalidatesTags: ['pokemon-list'],"],
    [4, '  }),'],
    [1, '}),'],
    [0, ''],
    [5, 'await pokemonApi.init()              // обязательно перед запросами'],
    [6, 'export const endpoints = pokemonApi.getEndpoints()'],
  ] })
  let b = header('ApiClient · эндпоинты', 8, 'Эндпоинт описывается один раз') + c.html
  b += conn(c.x + c.w - 50, c.at(13) + 16, c.x + c.w - 50, c.at(4) + 16, { s: 4, dashed: true })
  b += note(1460, 260, 332, 'тип параметров, тип ответа, путь, метод — один раз', 1, 0, 26)
  b += note(1460, 560, 332, 'мутация сбросила тег → список перезапросится сам', 4, 0, 26)
  b += note(1460, 800, 332, 'init поднимает кэш и эндпоинты', 5, 0, 26)
  slide('api-endpoints', b, notes(8, 8, 13), { map: [1,2,3,4,5,6] })
}
{
  const c = code({ y: 240, rows: [
    [1, '// 1. React — чтение'],
    [2, 'const { data, isLoading, error, refetch } ='],
    [2, '  useApiQuery(endpoints.getDetails, { id }, { enabled: id != null })'],
    GAP,
    [1, '// 2. React — запись'],
    [3, 'const { mutate, isLoading } = useApiMutation(endpoints.createPokemon)'],
    GAP,
    [1, '// 3. Без React — запрос как объект'],
    [4, 'const req = endpoints.getDetails.request({ id: 25 })'],
    [5, 'req.subscribe((state) => state.status)   // idle → loading → success | error'],
    [6, 'const result = await req.wait()          // или просто await req'],
    [7, 'req.abort()                              // отмена — вместе с HTTP'],
    [0, ''],
    [8, 'endpoints.getDetails.subscribe((s) => s.fetchCounts)   // весь эндпоинт'],
  ] })
  let b = header('ApiClient · вызовы', 8, 'Три способа вызвать запрос') + c.html
  const checks = ['одинаковые запросы → один fetch', 'любая ошибка — ApiError', '204 / пустое тело — успех', 'кэш + теги']
  let x = 128
  checks.forEach((t) => { b += pill(x, c.y + c.h + 28, `<span style="color:${C.accent}">✓</span> ${t}`, { s: 9, size: 24 }); x += pillW(t, 24) + 50 })
  slide('api-calls', b, notes(8, 14, 22), { map: [1,2,3,4,5,6,7,8,9] })
}

// ═══ Блок 9 — диспетчер и сборка ═══
const logoBase = ({ center: withCenter = false, centerS = 0, spokes = [], sats = [0, 1, 2], dimDispatcher = false, effects = 'none', effectsS = 0, centerLabel = 'createSynapse' } = {}) => {
  let h = ''
  spokes.forEach(([i, s]) => { h += spoke(i, { s }) })
  sats.forEach((i) => { h += satellite(i, { opacity: i === 2 && dimDispatcher ? 0.4 : 1 }) })
  if (effects === 'placeholder') h += satellite(3, { s: effectsS, dashed: true, label: 'Effects?' })
  if (effects === 'ring') h += satellite(3, {})
  if (withCenter) h += center(centerLabel, { s: centerS })
  return h
}
{
  let b = header('Бизнес-логика', 9, 'Диспетчер и сборка синапса')
  b += note(128, 300, 820, 'Хранилище и селекторы уже умеем создавать. Теперь — диспетчер, а потом соберём всё в один модуль: синапс.', 0, 0, 34)
  b += satellite(0, { s: 1 }) + satellite(1, { s: 1 }) + satellite(2, { s: 2, opacity: 0.4 })
  slide('synapse-intro', b, notes(9, 1, 2), { transition: 'magic', map: [1,2] })
}
{
  const c = code({ y: 240, size: 23, lh: 31, rows: [
    [1, "import { Dispatcher } from 'synapse-storage/reactive'"],
    [0, ''],
    [2, 'export class PokemonDispatcher extends Dispatcher<PokemonState> {'],
    [3, '  readonly selectPokemon = this.action((store, id: number | null) => {'],
    [3, '    store.update((s) => { s.selectedPokemonId = id })'],
    [4, '    return id                                   // payload → эффектам'],
    [3, '  })'],
    GAP,
    [5, '  readonly setSearchQuery = this.action('],
    [5, "    (store, query: string) => { store.set('searchQuery', query); return query },"],
    [5, '    { memoize: (cur, prev) => cur === prev },   // тот же аргумент — пропуск'],
    [5, '  )'],
    GAP,
    [6, "  readonly loadMore = this.signal<void>('Подгрузить следующую страницу')"],
    [7, '  readonly loadDetails = this.apiActions<void>((s) => s.api.detailsRequest)'],
    [8, '  // d.loadDetails() — намерение · .loading() · .success() · .failure(msg)'],
    [9, '  readonly watchFavoriteCount = this.watcher({ selector: (s) => s.favorites.length })'],
    [2, '}'],
  ] })
  let b = header('Бизнес-логика · диспетчер', 9, 'Всё, что модуль умеет делать') + c.html + mark(c, 12, 13, 8, 9)
  // кольца «уехали в угол» — те же id, magic-переход
  b += ring('ring-storage', 1580, 60, 48, { gapAt: 180, stroke: 18 }) + ring('ring-selectors', 1660, 60, 48, { gapAt: 180, stroke: 18 }) + ring('ring-dispatcher', 1740, 60, 48, { gapAt: 180, stroke: 18 })
  b += chain(128, 870, [['UI'], ['selectPokemon(25)', { hot: true, mono: true }], ['стор'], ['action$ → эффекты']], { s: 10, size: 24 }).html
  slide('dispatcher', b, notes(9, 3, 13), { transition: 'magic', map: [0,1,2,3,4,5,6,7,8,9,10] })
}
{
  const c = code({ y: 240, w: 900, size: 22, lh: 32, rows: [
    [1, "import { createSynapse } from 'synapse-storage/utils'"],
    [0, ''],
    [1, 'export const pokemonSynapse = createSynapse({'],
    [2, '  storage: () => new MemoryStorage<PokemonState>({'],
    [2, "    name: 'pokemon', initialState }),"],
    [3, '  selectors: (storage) => new PokemonSelectors(storage),'],
    [4, '  dispatcher: (storage) => new PokemonDispatcher(storage),'],
    [1, '})'],
    [0, ''],
    [5, 'const pokemon = await pokemonSynapse  // при первом await'],
    [5, 'pokemon.actions.selectPokemon(25)'],
  ] })
  let b = header('Бизнес-логика · сборка', 9, 'Собираем синапс') + c.html
  b += spoke(0, { s: 2 }) + spoke(1, { s: 3 }) + spoke(2, { s: 4 })
  b += satellite(0) + satellite(1) + satellite(2, { opacity: 0.4 }) + satellite(2, { s: 4, idSuffix: '-on' })
  b += satellite(3, { s: 6, dashed: true, label: 'Effects?' })
  b += center('createSynapse', { s: 1 })
  slide('synapse-assemble', b, notes(9, 14, 19), { map: [1,2,3,4,5,6] })
}

// ═══ Блок 10 — эффекты ═══
const OPS = ['ofType / ofTypes', 'selectorMap / Object', 'validateMap', 'mutationMap', 'fromRequest', 'apiResult']
const opsPanel = (lit) => {
  let h = ''
  OPS.forEach((t, i) => {
    const y = 250 + i * 100
    const s0 = lit.base ?? 0
    h += P(1440, y, 352, t, { 'font-family': MONO, 'font-size': 22, padding: '18px 20px', 'border-radius': 14, background: C.card, border: `2px solid ${C.line}`, color: C.dim }, s0, 0, 'rise')
    if (lit[t] != null) h += P(1440, y, 352, t, { 'font-family': MONO, 'font-size': 22, padding: '18px 20px', 'border-radius': 14, background: C.soft, border: `2px solid ${C.accent}`, color: C.text }, lit[t], 0, 'pop')
  })
  return h
}
{
  let b = header('Бизнес-логика · эффекты', 10, 'Хук или эффект?')
  const col = (x, title, items, s, hot) => {
    let h = P(x, 270, 800, title, { 'font-size': 40, 'font-weight': 800, color: hot ? C.accent : C.text }, s)
    items.forEach(([t, si], i) => { h += P(x, 350 + i * 96, 800, t, { 'font-size': 30, 'line-height': 1.35, padding: '18px 26px', 'border-radius': 16, background: hot ? C.soft : C.card, border: `2px solid ${hot ? C.accent : C.line}` }, si, 0, 'rise') })
    return h
  }
  b += col(128, '<span style="font-family:JetBrains Mono, monospace">useApiQuery</span> — хук', [['данные нужны экрану: показать и забыть', 2], ['запрос живёт, пока смонтирован компонент', 2], ['можно взять только ApiClient + хуки: кэш хоть в IndexedDB', 2]], 1)
  b += col(992, 'Эффект', [['запрос — часть логики, его запускает экшен', 3], ['ответ — в хранилище модуля, читают все', 3], ['цепочки, отмена устаревших, сокеты, таймеры', 3]], 3, true)
  b += P(128, 700, 1664, `один запрос · один <b>ApiClient</b> и кэш — хук через <span style="font-family:JetBrains Mono, monospace;color:${C.accent}">subscribe</span>, эффект через <span style="font-family:JetBrains Mono, monospace;color:${C.accent}">pipe</span>`, { 'font-size': 32, 'text-align': 'center', padding: '22px 30px', 'border-radius': 16, border: `2px dashed ${C.dim}` }, 4, 0, 'rise')
  b += note(128, 820, 1664, 'компонент вызывает <span style="font-family:JetBrains Mono, monospace;color:#ECECEC">selectPokemon(25)</span> и не знает, что дальше будет запрос', 4, 0, 28)
  slide('effects-why', b, notes(10, 1, 4), { map: [1, 2, 3, 4] })
}
{
  const c = code({ y: 240, w: 1280, rows: [
    [3, 'export class PokemonEffects extends Effects<PokemonState, PokemonDispatcher> {'],
    [4, '  constructor(private readonly api: PokemonApiEndpoints) { super() }'],
    [0, ''],
    [5, '  readonly loadDetails = this.effect((action$, state$, { dispatcher: d }) =>'],
    [5, '    action$.pipe('],
    [7, '      ofType(d.selectPokemon),'],
    [8, '      withLatestFrom(selectorMap(state$, (s) => s.selectedPokemonId)),'],
    [9, '      validateMap({ … }),          // → следующий слайд'],
    [5, '    ),'],
    [5, '  )'],
    [3, '}'],
  ] })
  let b = header('Бизнес-логика · эффекты', 10, 'Эффекты — реакции на намерения') + c.html
  b += opsPanel({ base: 6, 'ofType / ofTypes': 7, 'selectorMap / Object': 8, validateMap: 9 })
  b += note(128, c.y + c.h + 28, 1260, 'RxJS — только здесь. Знакомо по redux-observable и эффектам Angular.', 1, 0, 28)
  b += note(128, c.y + c.h + 80, 1260, 'selectorMap → массив · selectorObject → объект с именами', 8, 0, 28)
  slide('effects', b, notes(10, 5, 12), { map: [0,1,3,4,5,6,7,[8,9]] })
}
{
  const c = code({ y: 240, w: 1280, rows: [
    [0, 'action$.pipe(ofType(d.selectPokemon), withLatestFrom(…),'],
    [0, '  validateMap({'],
    [2, '    validator: ([, [id]]) => ({ conditions: [id !== null] }),'],
    GAP,
    [3, '    loadingAction: () => d.loadDetails.loading(),'],
    [4, '    errorAction: (err) => d.loadDetails.failure(err.message), // err: ApiError'],
    GAP,
    [5, '    apiCall: ([, [id]]) =>'],
    [5, '      fromRequest(this.api.getDetails.request({ id: id! })).pipe('],
    [6, '        apiResult((data) => {'],
    [6, '          d.applyPokemonDetails(mapDetailsResponse(data))'],
    [6, '          d.loadDetails.success()'],
    [6, '        }),'],
    [5, '      ),'],
    [0, '  }),'],
  ], dimRows: [0] })
  let b = header('Бизнес-логика · эффекты', 10, 'validateMap — весь цикл запроса') + c.html
  b += opsPanel({ 'ofType / ofTypes': 0, 'selectorMap / Object': 0, validateMap: 0, fromRequest: 5, apiResult: 6 })
  const stages = [['validator', 2], ['loadingAction', 3], ['apiCall', 5], ['success / errorAction', 4]]
  b += chain(128, c.y + c.h + 28, stages.map(([t]) => [t, { mono: true }]), { s: 1, size: 24 }).html
  let x = 128
  stages.forEach(([t, s]) => { b += pill(x, c.y + c.h + 28, t, { s, size: 24, mono: true, hot: true }); x += pillW(t, 24) + 56 })
  slide('effects-validate', b, notes(10, 13, 18), { map: [1,2,3,4,5,6] })
}
{
  // marble-диаграмма switchMap
  let b = header('Бизнес-логика · эффекты', 10, 'validateMap = switchMap: важен последний ответ')
  const lane = (y, label, s) => P(128, y - 22, 360, label, { 'font-size': 28, 'font-weight': 600, color: C.muted, 'font-family': MONO }, s) +
    DIV(520, y, 1240, 4, { background: C.line }, s)
  const dot = (x, y, t, s, hot) => P(x - 40, y - 40, 80, t, { 'font-size': 28, 'font-weight': 700, 'line-height': '74px', 'text-align': 'center', 'border-radius': 999, background: hot ? C.accent : C.card, border: `3px solid ${hot ? C.accent : C.line}`, color: C.text, height: 80, padding: '0' }, s, 0, 'pop')
  b += lane(380, 'selectPokemon', 0) + lane(560, 'HTTP id=25', 2) + lane(740, 'HTTP id=6', 3)
  b += dot(640, 382, '25', 1) + dot(1120, 382, '6', 3)
  b += DIV(640, 556, 480, 12, { background: C.dim, 'border-radius': 6 }, 2)
  b += P(1100, 520, 80, '✕', { 'font-size': 64, 'font-weight': 800, color: C.red, 'text-align': 'center' }, 3, 0, 'pop')
  b += DIV(1120, 736, 360, 12, { background: C.accent, 'border-radius': 6 }, 3)
  b += dot(1520, 742, '✓', 3, true)
  b += note(128, 860, 1600, 'новый выбор отменяет старый запрос вместе с HTTP — в стор попадает только ответ для 6', 3, 0, 30)
  slide('effects-switch', b, notes(10, 19, 19), { map: [[1,2,3]] })
}
{
  let b = header('Бизнес-логика · эффекты', 10, 'Запрос как поток')
  b += P(128, 260, 800, `<span style="font-family:JetBrains Mono, monospace"><span style="color:${C.kw}">await</span> req</span><br><span style="color:${C.muted};font-size:28px">промис: отписались — HTTP висит дальше</span> <span style="color:${C.red}">✕</span>`, { 'font-size': 32, 'line-height': 1.5, padding: '22px 28px', 'border-radius': 16, background: C.card, border: `2px solid ${C.line}` }, 1, 0, 'rise')
  b += P(992, 260, 800, `<span style="font-family:JetBrains Mono, monospace">fromRequest(req).pipe(apiResult(…))</span><br><span style="color:${C.muted};font-size:28px">поток: отписались — запрос прерван</span> <span style="color:${C.accent}">✓</span>`, { 'font-size': 30, 'line-height': 1.5, padding: '22px 28px', 'border-radius': 16, background: C.soft, border: `2px solid ${C.accent}` }, 2, 0, 'rise')
  b += chain(128, 470, [['fromRequest', { mono: true }], ['apiResult', { mono: true, hot: true }], ['успех → колбэк', {}], ['ApiError → errorAction', { mono: true }]], { s: 2, size: 26 }).html
  const c = code({ y: 580, w: 1664, size: 22, lh: 31, rows: [
    [3, 'readonly search = this.effect((action$, _state$, { dispatcher: d }) =>'],
    [3, '  action$.pipe('],
    [3, '    ofType(d.setSearchQuery),'],
    [3, '    debounceTime(300),            // ждём паузу в наборе'],
    [3, '    distinctUntilChanged(),       // тот же запрос — пропуск'],
    [3, '    validateMap({'],
    [3, '      apiCall: ({ payload }) =>'],
    [3, '        fromRequest(this.api.search.request({ query: payload })).pipe(apiResult(…)),'],
    [3, '    }),'],
    [3, '  ),'],
    [3, ')'],
  ] })
  b += c.html
  slide('effects-request', b, notes(10, 20, 22), { map: [1, 2, 3] })
}
{
  const c = code({ y: 240, w: 1180, size: 22, lh: 31, rows: [
    [1, 'createPost = this.effect((action$, _state$, { dispatcher: d }) =>'],
    [1, '  action$.pipe('],
    [1, '    ofType(d.createPost),'],
    [1, '    mutationMap({'],
    [2, '      flatten: exhaustMap,'],
    [1, '      // loadingAction, errorAction — как в validateMap'],
    [3, '      prepare: (payload) => buildFormData(payload),'],
    [1, '      apiCall: (_payload, body) =>'],
    [1, '        fromRequest(this.api.createPost.request({ body })).pipe('],
    [1, '          apiResult((post) => { d.prependPost(post); d.createPost.success() }),'],
    [1, '        ),'],
    [1, '    }),'],
    [1, '  ),'],
    [1, ')'],
    [0, ''],
    [4, 'removePost = this.effect((action$, _state$, { dispatcher: d }) =>'],
    [4, '  action$.pipe(ofType(d.removePost), mutationMap({'],
    [4, '    flatten: mergeMap,'],
    [4, '    apiCall: (id) => fromRequest(this.api.removePost.request({ id }))'],
    [4, '      .pipe(apiResult(() => d.dropPost(id))),'],
    [4, '  })),'],
    [4, ')'],
  ] })
  let b = header('Бизнес-логика · эффекты', 10, 'mutationMap — запись') + c.html + mark(c, 6, 6, 3, 4)
  b += P(1360, 250, 432, `<b style="color:${C.accent}">mutationMap</b> — запись: словарь тот же, стратегию выбираете вы`, { 'font-size': 28, 'line-height': 1.4, color: C.text }, 1)
  b += card(1360, 420, 432, 'exhaustMap', 'одиночная операция: повторный клик игнорируется', { s: 2 })
  b += card(1360, 600, 432, 'mergeMap', 'разные сущности — параллельно, ошибка одного не ломает остальные', { s: 4 })
  b += card(1360, 820, 432, 'concatMap', 'строго по очереди', { s: 5 })
  slide('effects-mutation', b, notes(10, 23, 27), { map: [1,2,3,4,5] })
}
{
  const c = code({ y: 240, w: 1230, size: 22, lh: 32, rows: [
    [1, 'export class TypingEffects extends Effects<MessengerState, MessengerDispatcher> {'],
    [2, '  constructor(private readonly socket: MessengerSocketService) { super() }'],
    [0, ''],
    [3, '  // входящее: событие сокета → экшен'],
    [3, '  typing = this.effect((_action$, _state$, { dispatcher: d }) =>'],
    [3, "    this.socket.on('chat:typing').pipe(tap((event) => d.applyTyping(event))),"],
    [3, '  )'],
    [0, ''],
    [4, '  // исходящее: сигнал → троттлинг → сокет'],
    [4, '  typingSend = this.effect((action$, _state$, { dispatcher: d }) =>'],
    [4, '    action$.pipe('],
    [4, '      ofType(d.typingInput),'],
    [4, '      throttleTime(3000),'],
    [4, "      tap(({ payload }) => this.socket.typing({ chat_id: payload, action: 'typing' })),"],
    [4, '    ),'],
    [4, '  )'],
    [1, '}'],
  ] })
  let b = header('Бизнес-логика · эффекты', 10, 'Источник — сокет') + c.html
  b += P(1400, 250, 392, 'Пример из реального мессенджера: «печатает…»', { 'font-size': 26, color: C.muted, 'line-height': 1.4 }, 1)
  const vchain = (y, items, s) => items.map((t, i) => pill(1400, y + i * 70, t, { s, size: 22, mono: true, hot: i === items.length - 1, w: 392 })).join('')
  b += vchain(360, ['socket', 'effect', 'd.applyTyping', 'стор'], 3)
  b += vchain(660, ['d.typingInput', 'throttle 3 с', 'socket'], 4)
  b += P(128, 860, 1664, 'через конструктор также: другие API-клиенты · диспетчер соседнего модуля · toObservable(other.state$)', { 'font-size': 26, color: C.muted }, 5)
  slide('effects-socket', b, notes(10, 28, 32), { map: [1,2,3,4,5] })
}
{
  const c = code({ y: 240, w: 900, size: 22, lh: 32, rows: [
    [0, 'export const pokemonSynapse = createSynapse({'],
    [0, '  storage: () => new MemoryStorage<PokemonState>({'],
    [0, "    name: 'pokemon', initialState }),"],
    [0, '  selectors: (storage) => new PokemonSelectors(storage),'],
    [0, '  dispatcher: (storage) => new PokemonDispatcher(storage),'],
    [1, '  effects: async () => {'],
    [1, '    await pokemonApi.init()          // async-пролог'],
    [1, '    return new PokemonEffects(pokemonApi.getEndpoints())'],
    [1, '  },'],
    [0, '})'],
  ] })
  let b = header('Бизнес-логика · сборка', 10, 'Подключаем эффекты') + c.html + mark(c, 5, 8, 2, 3)
  b += note(128, 660, 900, 'эффекты стартуют сами при первом await модуля — и только в браузере', 2, 0, 28)
  b += spoke(0) + spoke(1) + spoke(2) + spoke(3, { s: 3 })
  b += satellite(0) + satellite(1) + satellite(2) + satellite(3, { dashed: true, label: 'Effects?', idSuffix: '-ph', out: 3 }) + satellite(3, { s: 3 })
  b += center('createSynapse')
  b += P(LG.cx - 300, 140, 600, 'синапс собран', { 'font-size': 34, 'font-weight': 800, color: C.accent, 'text-align': 'center', 'letter-spacing': 2, 'text-transform': 'uppercase' }, 3, 0, 'pop')
  slide('effects-assemble', b, notes(10, 33, 35), { map: [1,2,3] })
}

// ═══ Блок 11 — SSR ═══
{
  let b = header('SSR', 11, 'Две проблемы, которых нет в браузере')
  b += card(128, 300, 800, '1. Общий стор на сервере', 'модуль объявлен в файле → один на все запросы', { s: 1 })
  b += pill(128, 500, 'запрос A', { s: 1 }) + pill(128, 600, 'запрос B', { s: 1 })
  b += conn(320, 530, 520, 575, { s: 1 }) + conn(320, 630, 520, 590, { s: 1 })
  b += pill(530, 555, 'один стор', { s: 1 })
  b += P(128, 700, 800, 'данные A → в ответ B', { 'font-size': 30, 'font-weight': 700, color: C.red }, 1)
  b += card(992, 300, 800, '2. Hydration mismatch', 'первый кадр клиента ≠ HTML сервера → React выбрасывает HTML и перерисовывает', { s: 2 })
  b += pill(992, 540, 'HTML сервера', { s: 2 }) + P(1290, 540, 60, '≠', { 'font-size': 44, color: C.red, 'text-align': 'center' }, 2) + pill(1360, 540, 'кадр клиента', { s: 2 })
  slide('ssr-problem', b, notes(11, 1, 3), { map: [0,1,2] })
}
{
  const c = code({ y: 240, size: 23, lh: 33, rows: [
    [1, 'export const PokemonCtx = createSynapseCtx(pokemonSynapse)   // контекст + хуки + dehydrate'],
    GAP,
    [2, '// сервер'],
    [2, 'const list = await fetchPokemonList()'],
    [2, 'const dehydrated = await PokemonCtx.dehydrate({ initialState: { pokemonList: list } })'],
    [6, 'const html = renderToString(<Pokedex dehydratedState={dehydrated} />)'],
  ] })
  let b = header('SSR · сервер', 11, 'Снапшот на каждый запрос') + c.html
  const L = (y, t, s) => P(128, y + 8, 220, t, { 'font-size': 26, 'font-weight': 700, color: C.muted }, s)
  b += L(530, 'запрос A', 2)
  b += chain(360, 530, [['fork A', { s: 3 }], ['effects: off', { s: 4, dashed: true }], ['залить данные', { s: 5 }], ['{ снапшот } ⏱', { s: 5, hot: true, mono: true }], ['fork ✕', { s: 5, dashed: true }]], { size: 24, gap: 48 }).html
  b += chain(360, 640, [['снапшот', { s: 7, mono: true }], ['одноразовый стор', { s: 7 }], ['HTML с данными', { s: 7, hot: true }]], { size: 24, gap: 48 }).html
  b += L(770, 'запрос B', 8)
  b += pill(360, 770, 'свой fork · свой одноразовый стор — без пересечений с A', { s: 8, size: 24 })
  b += note(128, 890, 1664, 'засев одноразового стора — синхронно, до рендера; общий модуль на сервере не трогается', 7, 0, 26)
  slide('ssr-server', b, notes(11, 4, 11), { map: [1,2,3,4,5,6,7,8] })
}
{
  let b = header('SSR · клиент', 11, 'Засев до первого рендера')
  b += chain(128, 240, [['HTML + снапшот JSON', { s: 1 }], ['засев до первого рендера', { s: 2 }], ['кадр = HTML ✓', { s: 3, hot: true }], ['эффекты стартуют', { s: 4 }]], { size: 26, gap: 50 }).html
  b += note(128, 330, 1664, 'синхронно, в инициализаторе useState — не в useEffect', 2, 0, 26)
  b += card(128, 410, 820, 'метка времени ⏱', 'при навигации старый снапшот не перетрёт более свежие данные', { s: 5 })
  const c = code({ x: 128, y: 600, w: 820, size: 22, lh: 32, rows: [
    [6, 'const selectors = useSynapseSelectors()'],
    [6, 'const actions = useSynapseActions()'],
    [6, 'const list = useSelector(selectors.pokemonList)'],
  ] })
  b += c.html
  b += card(1000, 410, 792, '≈ TanStack Query', 'клиент на запрос ≈ fork · dehydrate / hydrate · dataUpdatedAt ≈ метка. Разница: гидрируется весь модуль. У ApiClient — свои dehydrate / hydrate.', { s: 7 })
  b += card(1000, 700, 792, 'ограничения', 'синхронный SSR — для Memory / LocalStorage (browserStorage). Streaming и Suspense — пока вне гарантий.', { s: 8 })
  slide('ssr-client', b, notes(11, 12, 19), { map: [1,2,3,4,5,6,7,8] })
}

// ═══ Блок 12 — реальный проект ═══
// кольцо-узел с подписью; кольца прозрачные внутри — линии до них обрезаем по радиусу
const node = (id, x, y, d, label, { s = 0, out = 0, dim = false, labelPos = 'below', size = 24, gapAt = 0 } = {}) =>
  ring(id, x, y, d, { s, out, gapAt, stroke: d > 140 ? 20 : 16, opacity: dim ? 0.55 : 1 }) +
  (labelPos === 'right'
    ? P(x + d / 2 + 16, y - size * 0.7, 360, label, { 'font-size': size, 'font-weight': 700, 'font-family': MONO, color: dim ? C.muted : C.text }, s, out, 'pop')
    : P(x - 170, y + d / 2 + 8, 340, label, { 'font-size': size, 'font-weight': 700, 'font-family': MONO, color: dim ? C.muted : C.text, 'text-align': 'center' }, s, out, 'pop'))
const link = (a, b, { trimA = 0, trimB = 0, off = 0, ...o } = {}) => {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L
  const px = -uy * off, py = ux * off
  return conn(a[0] + ux * trimA + px, a[1] + uy * trimA + py, b[0] - ux * trimB + px, b[1] - uy * trimB + py, o)
}
{
  let b = header('Реальный проект · масштаб 1', 12, null)
  b += P(128, 220, 900, 'Один синапс — ядро мессенджера', { 'font-size': 44, 'font-weight': 700, 'line-height': 1.15 })
  b += spoke(0) + spoke(1) + spoke(2) + spoke(3)
  b += satellite(0) + satellite(1) + satellite(2, { label: 'Dispatcher ×11', lx: 60 }) + satellite(3, { label: 'Effects ×11', lx: 60 })
  b += center('messenger')
  const fan = (i, s) => {
    const p = sat(i)
    let h = ''
    for (let k = 0; k < 11; k++) {
      const a = p.a + ((k - 5) * 11 * Math.PI) / 180
      h += `<x-shape kind="ellipse" style="position:absolute;left:${Math.round(p.x + Math.cos(a) * 92 - 9)}px;top:${Math.round(p.y + Math.sin(a) * 92 - 9)}px;width:18px;height:18px;background:${C.accent}"${build(s, 0, 'pop')}></x-shape>`
    }
    return h
  }
  b += fan(2, 2) + fan(3, 3)
  b += P(128, 320, 860, `<b style="color:${C.accent}">dispatcher/</b> sync · message-events · chat-events · typing · counters · list · history · thread · topics · outbox · privacy`, { 'font-size': 26, 'line-height': 1.45, 'font-family': MONO }, 2)
  b += P(128, 450, 860, `<b style="color:${C.accent}">effects/</b> те же 11 доменов · typing.mixin.ts ↔ typing.effects.ts`, { 'font-size': 26, 'line-height': 1.45, 'font-family': MONO }, 3)
  const c = code({ y: 560, w: 860, size: 22, lh: 30, pad: 22, rows: [
    [4, 'createSynapse({'],
    [4, '  dispatcher: (s) => new MessengerDispatcher(s),  // 11 миксинов'],
    [4, '  selectors: (s) => new MessengerSelectors(s, core.selectors),'],
    [4, '  dependencies: [coreSynapse, panelSynapse, relationsSynapse],'],
    [4, "  effects: async () => { await import('@services/socket') … },"],
    [4, '})'],
  ] })
  b += c.html
  b += P(128, 830, 860, '= один синапс', { 'font-size': 40, 'font-weight': 800, color: C.accent }, 5, 0, 'pop')
  slide('real-one', b, notes(12, 1, 6), { transition: 'magic', map: [0, 0, 2, 3, 4, 5] })
}
// «объёмная» сцена: z ∈ [0..1] — близость к зрителю (1 — ближе, крупнее, ярче)
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
// звёздное поле на фоне: мелкие точки, в видео отстают при наезде камеры (data-bg)
function starfield(n, s = 0) {
  let h = ''
  for (let i = 0; i < n; i++) {
    const x = 60 + rnd() * 1800, y = 230 + rnd() * 800, d = 3 + rnd() * 7, a = 0.12 + rnd() * 0.3
    h += `<x-shape kind="ellipse" data-bg="1" style="position:absolute;left:${Math.round(x)}px;top:${Math.round(y)}px;width:${Math.round(d)}px;height:${Math.round(d)}px;background:rgba(249,115,22,${a.toFixed(2)})"${build(s, 0, 'fade')}></x-shape>`
  }
  return h
}
// узел с глубиной: размер и яркость от z
const node3 = (id, x, y, d, z, label, { s = 0, dim = false, labelPos = 'right', gapAt = 180 } = {}) => {
  const op = dim ? 0.45 + 0.25 * z : 0.55 + 0.45 * z
  return ring(id, x, y, d, { s, gapAt, stroke: d > 140 ? 20 : 16, opacity: op }) +
    (labelPos === 'right'
      ? P(x + d / 2 + 14, y - 17, 340, label, { 'font-size': 24, 'font-weight': 700, 'font-family': MONO, color: dim ? C.muted : C.text, opacity: Math.min(1, op + 0.15) }, s, 0, 'pop')
      : P(x - 170, y + d / 2 + 6, 340, label, { 'font-size': 24, 'font-weight': 700, 'font-family': MONO, color: dim ? C.muted : C.text, opacity: Math.min(1, op + 0.15), 'text-align': 'center' }, s, 0, 'pop'))
}
const thin = (a, b, { s = 0, color = 'rgba(249,115,22,.5)', width = 3, head = 'none', off = 0, dashed = false } = {}) =>
  link(a, b, { trimA: a[2] / 2 + 10, trimB: b[2] / 2 + 10, s, color, width, head, off, dashed })
{
  // масштаб 2: модуль мессенджера
  seed = 7
  let b = header('Реальный проект · масштаб 2', 12, 'Синапс — часть модуля мессенджера') + starfield(46)
  const N = {
    messenger: [560, 620, 240], chat: [1150, 360, 120], 'chat-list': [1460, 500, 82], 'chat-info': [1260, 690, 130],
    contacts: [1560, 800, 72], 'call-history': [960, 880, 96], core: [230, 360, 70], relations: [330, 900, 62], panel: [1740, 560, 58],
  }
  const Z = { chat: 0.7, 'chat-list': 0.3, 'chat-info': 0.85, contacts: 0.2, 'call-history': 0.55, core: 0.2, relations: 0.1, panel: 0.1 }
  const feats = ['chat', 'chat-list', 'chat-info', 'contacts', 'call-history']
  feats.forEach((n) => { b += thin(N[n], N.messenger, { s: 1 }) })
  for (const n of ['core', 'relations', 'panel']) b += thin(N.messenger, N[n], { s: 5, color: 'rgba(169,166,159,.45)', width: 2 })
  // связи-события
  // импульсы видны только во время своей фразы
  const pulse = (a, z, s, o = {}) => link(a, z, { trimA: a[2] / 2 + 10, trimB: z[2] / 2 + 10, s, width: 6, head: 'end', color: C.accent, ...o }).replace('data-build-in', `data-build-out="fade ${s + 1}" data-build-in`)
  b += pulse(N.chat, N.messenger, 2)
  b += pulse(N.core, N.messenger, 3) + pulse(N.messenger, N.chat, 3)
  b += pulse(N.chat, N.messenger, 4, { color: '#FDBA74' })
  b += ring('ring-center', N.messenger[0], N.messenger[1], N.messenger[2], { gapAt: 0, stroke: 20 })
  b += P(N.messenger[0] - 220, N.messenger[1] + 130, 440, 'messenger.synapse', { 'font-size': 30, 'font-weight': 700, color: C.accent, 'text-align': 'center', 'font-family': MONO })
  feats.forEach((n) => { b += node3(`ring-${n}`, N[n][0], N[n][1], N[n][2], Z[n], n, { s: 1 }) })
  for (const n of ['core', 'relations', 'panel']) b += node3(`ring-${n}`, N[n][0], N[n][1], N[n][2], Z[n], n, { s: 5, dim: true, labelPos: 'below', gapAt: 0 })
  b += P(1340, 250, 400, `<span style="font-family:JetBrains Mono, monospace">dependencies: [messengerSynapse]</span>`, { 'font-size': 22, color: C.text, padding: '10px 16px', 'border-radius': 12, background: C.code, border: `1px solid ${C.accent}` }, 2, 3, 'pop')
  b += note(128, 236, 760, 'id пользователя: core → messenger → chat', 3, 4, 24)
  b += note(128, 236, 760, 'эффекты чата пишут в хранилище messenger', 4, 5, 24)
  b += ring('ring-glow', N.messenger[0], N.messenger[1], N.messenger[2] + 70, { s: 6, stroke: 3, dashed: true })
  b += P(128, 970, 1000, '7 синапсов тянутся к одному родителю', { 'font-size': 30, 'font-weight': 700, color: C.accent }, 6)
  slide('real-module', b, notes(12, 7, 12), { transition: 'magic', map: [1, 2, 3, 4, 5, 6] })
}
{
  // масштаб 3: сеть проекта — модули на разной глубине, у каждого спутники = его синапсы
  seed = 11
  let b = header('Реальный проект · масштаб 3', 12, 'Проект — сеть модулей') + starfield(60)
  // [x, y, d, z, синапсов]
  const M = {
    messenger: [430, 600, 130, 0.9, 7], core: [980, 560, 96, 0.7, 1], streaming: [1380, 420, 104, 0.8, 5], social: [720, 400, 74, 0.45, 3],
    media: [1250, 800, 84, 0.6, 3], posts: [1560, 650, 66, 0.4, 1], calls: [1060, 300, 56, 0.3, 1], notifications: [1580, 860, 60, 0.35, 2],
    presence: [1700, 360, 52, 0.25, 1], relations: [270, 420, 56, 0.3, 1], user: [760, 800, 60, 0.4, 1], accounts: [520, 900, 50, 0.25, 2],
    comments: [1380, 300, 44, 0.15, 1], reactions: [1740, 540, 40, 0.1, 1], live: [880, 960, 44, 0.2, 1], history: [200, 760, 44, 0.15, 1],
    'media-player': [1730, 760, 40, 0.1, 1],
  }
  const onCore = ['calls', 'comments', 'live', 'media', 'posts', 'presence', 'reactions', 'streaming', 'user', 'messenger']
  const P3 = (n) => [M[n][0], M[n][1], M[n][2]]
  for (const n of onCore) b += thin(P3(n), P3('core'), { s: 1, color: `rgba(169,166,159,${(0.2 + 0.35 * Math.min(M[n][3], M.core[3])).toFixed(2)})`, width: 2 })
  for (const [x, y] of [['messenger', 'relations'], ['social', 'relations'], ['notifications', 'presence'], ['streaming', 'presence']]) b += thin(P3(x), P3(y), { s: 1, width: 2 })
  // спутники модуля: точки по кругу
  const sats = (n, s) => {
    const [x, y, d, z, k] = M[n]
    let h = ''
    const r = d / 2 + 16 + 6 * z
    for (let i = 0; i < k; i++) {
      const a = (i / k) * 2 * Math.PI - Math.PI / 2
      const dd = Math.round(8 + 6 * z)
      h += `<x-shape kind="ellipse" style="position:absolute;left:${Math.round(x + Math.cos(a) * r - dd / 2)}px;top:${Math.round(y + Math.sin(a) * r - dd / 2)}px;width:${dd}px;height:${dd}px;background:${C.accent};opacity:${(0.5 + 0.5 * z).toFixed(2)}"${build(s, 0, 'pop')}></x-shape>`
    }
    return h
  }
  b += ring('ring-center', M.messenger[0], M.messenger[1], M.messenger[2], { gapAt: 0, stroke: 16 })
  b += P(M.messenger[0] - 170, M.messenger[1] + 90, 340, 'messenger', { 'font-size': 26, 'font-weight': 700, 'font-family': MONO, 'text-align': 'center' })
  b += sats('messenger', 0)
  for (const n of Object.keys(M)) {
    if (n === 'messenger') continue
    const [x, y, d, z] = M[n]
    b += node3(`mod-${n}`, x, y, d, z, n, { s: 1, labelPos: 'below', gapAt: 180 })
    if (n !== 'core') b += sats(n, 2)
  }
  b += note(128, 236, 900, 'точки вокруг модуля — его синапсы · линии — dependencies', 2, 0, 24)
  b += `<img src="${LOGO}" alt="логотип synapse" style="position:absolute;left:1500px;top:96px;width:120px;height:120px;object-fit:contain" data-build-in="pop 3">`
  b += P(128, 278, 560, '16 модулей + ядро = 33 синапса', { 'font-size': 26, 'font-weight': 700, color: C.accent, 'line-height': 1.35 }, 3, 0, 'rise')
  slide('real-app', b, notes(12, 13, 16), { map: [0, 1, 2, 3] })
}
{
  let b = header('Реальный проект · организация кода', 12, 'Большой модуль — делим по доменам')
  const doms = ['core', 'chat', 'chat-list', 'chat-info', 'contacts', 'call-history']
  let x = 128
  doms.forEach((d) => { b += pill(x, 250, `${d}/`, { s: 1, mono: true, size: 26 }); x += pillW(`${d}/`, 26) + 16 })
  b += P(128, 340, 1664, `в каждом: <span style="font-family:JetBrains Mono, monospace;color:#ECECEC">X.synapse · X.dispatcher · X.effects · X.selectors · X.context</span> + ui/`, { 'font-size': 26, color: C.muted }, 1)
  const c = code({ y: 420, w: 1100, size: 23, lh: 33, rows: [
    [2, '// dispatcher/counters.mixin.ts — одна тема: счётчики непрочитанного'],
    GAP,
    [2, 'export const CountersMixin = <TBase extends MessengerDispatcherCtor>(Base: TBase) => {'],
    [2, '  abstract class CountersDispatcher extends Base {'],
    [2, '    loadCounters = this.apiActions((s) => s.api.countersRequest)'],
    [2, "    refreshCounters = this.signal('Счётчики могли измениться')"],
    [2, '    setCounters = this.action((store, counters: ChatCountersDto) => {'],
    [2, '      store.update((s) => { s.counters = counters })'],
    [2, '    })'],
    [2, '  }'],
    [2, '  return CountersDispatcher'],
    [2, '}'],
  ] })
  b += c.html
  b += card(1300, 420, 492, 'Mixin', 'маленький кусок диспетчера про одну тему: набор текста, счётчики, история…', { s: 2 })
  b += note(1300, 640, 492, 'обычный ООП-паттерн, ничего специфичного для synapse', 2, 0, 26)
  slide('real-files', b, notes(12, 17, 19), { map: [0, 1, 2] })
}
{
  let b = header('Реальный проект · организация кода', 12, 'Миксины собираются в фасад')
  const c = code({ y: 240, w: 1100, size: 23, lh: 33, rows: [
    [1, 'export class MessengerDispatcher extends composeMixins('],
    [1, '  Dispatcher<MessengerState>,'],
    [1, '  SyncMixin, MessageEventsMixin, ChatEventsMixin, TypingMixin,'],
    [1, '  CountersMixin, ListMixin, HistoryMixin, ThreadMixin,'],
    [1, '  TopicsMixin, OutboxMixin, PrivacyMixin,'],
    [1, ') {}'],
  ] })
  b += c.html
  b += chain(128, 520, [['11 миксинов', { mono: true }], ['MessengerDispatcher — фасад', { hot: true }], ['useMessengerActions()', { mono: true }]], { s: 1, size: 26 }).html
  b += P(128, 620, 1100, `<span style="font-family:JetBrains Mono, monospace">typing.mixin.ts ↔ typing.effects.ts · counters.mixin.ts ↔ counters.effects.ts</span><br><span style="color:${C.muted}">миксин — что можно сделать · класс эффектов — как на это реагировать</span>`, { 'font-size': 24, 'line-height': 1.5 }, 2)
  const tw = (1100 - 24) / 2
  b += P(128, 740, tw, `<b style="color:${C.accent}">Даёт библиотека</b><br>Dispatcher и Effects — классы, которые можно наследовать и композировать · createSynapse и dependencies`, { 'font-size': 24, 'line-height': 1.4, padding: '18px 22px', 'border-radius': 16, background: C.card, border: `2px solid ${C.line}` }, 3, 0, 'rise')
  b += P(128 + tw + 24, 740, tw, `<b style="color:${C.accent}">Даёт проект</b><br>composeMixins — 5 строк своего хелпера · раскладка по доменам и файлам`, { 'font-size': 24, 'line-height': 1.4, padding: '18px 22px', 'border-radius': 16, background: C.card, border: `2px solid ${C.line}` }, 3, 0, 'rise')
  b += card(1300, 240, 492, 'Слой бизнес-логики', 'React-компоненты только читают селекторы и вызывают экшены. Вся логика — здесь.', { s: 4, hot: true })
  b += note(1300, 430, 492, 'маленькому приложению хватит одного синапса без миксинов', 5, 0, 26)
  slide('real-facade', b, notes(12, 20, 24), { map: [1, 2, 3, 4, 5] })
}

// ═══ Блок 13 — полка ═══
{
  let b = header('Что ещё есть', 13, 'Что ещё есть на полке')
  const rows = [
    ['createEventBus', 'шина событий: посредник между независимыми синапсами'],
    ['WorkerCacheStorage', 'общий живой кэш для всех вкладок — через Shared Worker'],
    ['свой fetchFn', 'свой транспорт API-клиента: обновление токена, ServiceWorker'],
    ['формы', 'рецепт: форма на хранилище, валидация — своей middleware'],
    ['toObservable', 'мост любого потока synapse в RxJS'],
  ]
  rows.forEach(([k, v], i) => {
    const y = 300 + i * 120
    b += P(128, y, 1664, `<span style="font-family:JetBrains Mono, monospace;color:${C.accent};font-weight:700">${k}</span>&#160;&#160;&#160;${v}`, { 'font-size': 32, padding: '22px 30px', 'border-radius': 16, background: C.card, border: `2px solid ${C.line}` }, i + 2, 0, 'rise')
  })
  slide('shelf', b, notes(13, 1, 7), { map: [0,2,3,4,5,6,6] })
}

// ═══ Блок 14 — чего нет ═══
{
  let b = header('Итог', 14, 'Есть и чего пока нет')
  const has = ['персист и миграции', 'IndexedDB и вкладки', 'HTTP-слой и кэш', 'SSR-гидрация', 'эффекты на RxJS', 'связи между синапсами']
  has.forEach((t, i) => { b += P(128, 290 + i * 86, 760, `<span style="color:${C.accent}">✓</span> ${t}`, { 'font-size': 34 }, 1, 0, 'rise') })
  const no = ['DevTools', 'polling, refetch при возврате', 'optimistic updates', 'большая экосистема']
  no.forEach((t, i) => { b += P(1000, 290 + i * 86, 792, `<span style="color:${C.red}">×</span> ${t}`, { 'font-size': 34, color: C.muted }, i + 2, 0, 'rise') })
  slide('have', b, notes(14, 1, 6), { map: [1,2,3,4,5,5] })
}

// ═══ Блок 15 — сколько это стоит ═══
{
  let b = header('Сколько это стоит', 15, 'Цена — килобайты в бандле')
  b += card(128, 290, 520, 'KB = min + gzip', 'бандл после сборки, как в Vite production', { s: 1, size: 30 })
  b += card(700, 290, 520, 'react — не считаем', 'он есть в любом React-приложении', { s: 2, size: 30 })
  b += card(1272, 290, 520, 'rxjs — считаем', 'и у synapse, и у redux-observable — там, где он нужен', { s: 2, size: 30 })
  b += P(128, 560, 1664, 'Платите за импортированное', { 'font-size': 44, 'font-weight': 700 }, 3)
  b += pill(128, 650, `вся библиотека — ${fmtKb(kb('syn-full-core'))} KB`, { s: 3, size: 32 })
  b += pill(128 + pillW(`вся библиотека — ${fmtKb(kb('syn-full-core'))} KB`, 32) + 24, 650, `+ /react и /reactive — ${fmtKb(kb('syn-full'))} KB`, { s: 3, size: 32 })
  b += note(128, 900, 1664, SIZE_NOTE, 0, 0, 24)
  slide('cost-rules', b, notes(15, 1, 4), { map: [0, 1, 2, 3] })
}
// горизонтальные полосы: rows [подпись, KB, hot?]
function bars(x, y, rows, { labelW = 420, maxW = 1000, rowH = 82, barH = 46, s = 0, size = 30 } = {}) {
  const max = Math.max(...rows.map((r) => r[1]))
  let html = ''
  rows.forEach(([label, v, hot], i) => {
    const ty = y + i * rowH
    const w = Math.max(6, Math.round((v / max) * maxW))
    html += P(x, ty + (barH - size * 1.3) / 2, labelW - 30, label, { 'font-size': size, 'text-align': 'right', color: hot ? C.accent : C.text, 'font-weight': hot ? 700 : 400, 'line-height': 1.3, 'white-space': 'nowrap' }, s)
    html += DIV(x + labelW, ty, w, barH, { background: hot ? C.accent : C.card, border: `2px solid ${hot ? C.accent : C.line}`, 'border-radius': 8 }, s, 0, 'rise')
    html += P(x + labelW + w + 18, ty + (barH - size * 1.3) / 2, 160, fmtKb(v), { 'font-size': size, 'font-weight': 700, color: hot ? C.accent : C.text, 'line-height': 1.3, 'font-family': MONO }, s)
  })
  return { html, at: (i) => y + i * rowH, rowH, barH }
}
{
  let b = header('Сколько это стоит', 15, 'Только хранилище, без React')
  const rows = [['zustand/vanilla', kb('zustand-vanilla')], ['redux', kb('redux')], ['RTK', kb('rtk')], ['synapse', kb('syn-memory'), true], ['effector', kb('effector')], ['MobX', kb('mobx')]]
  const g = bars(128, 290, rows, { s: 1 })
  b += g.html
  b += DIV(128 + 60, g.at(0) - 14, 1500, g.rowH + g.barH + 28, { border: `3px solid ${C.accent}`, 'border-radius': 14, background: 'rgba(249,115,22,.06)' }, 2, 0, 'pop')
  b += note(128, 800, 1664, `Окупается, когда нужно то, что внутри: middleware, обновления в стиле Immer, подписки на конкретные поля. React-хук — ещё +${fmtKb(kb('syn-react-storage') - kb('syn-memory'))} KB.`, 3, 0, 28)
  b += note(128, 900, 1664, SIZE_NOTE, 0, 0, 24)
  slide('cost-store', b, notes(15, 5, 8), { map: [0, 1, 2, 3] })
}
{
  let b = header('Сколько это стоит', 15, 'Цена по мере роста приложения')
  // ячейка: KB | [KB, тусклая?] | null (слоя нет); тусклая — цена не изменилась, новых пакетов нет
  const stacks = [
    ['synapse', 'одна библиотека', [kb('syn-react-storage'), kb('syn-react-api'), kb('syn-typical-norx'), kb('syn-typical')], true],
    ['zustand', '② + TanStack Query', [kb('zustand'), kb('stack-zustand-rq'), [kb('stack-zustand-rq'), 1], null]],
    ['effector', '② + farfetched', [kb('effector-react'), kb('stack-effector-ff'), [kb('stack-effector-ff'), 1], null]],
    ['RTK', '② + RTK Query · ④ + observable', [kb('rtk-react'), kb('stack-rtk-rtkq'), [kb('stack-rtk-rtkq'), 1], kb('stack-rtk-full')]],
    ['MobX', '② + TanStack Query', [kb('mobx-react'), kb('stack-mobx-rq'), [kb('stack-mobx-rq'), 1], null]],
  ]
  const cols = ['① стор + React', '② + запросы, кэш', '③ + логика', '④ + RxJS-эффекты']
  const X0 = 540, CW = 312, Y0 = 330, RH = 100, SC = 5.4 // px на KB
  cols.forEach((t, c) => { b += P(X0 + c * CW, 262, CW - 12, t, { 'font-size': 26, 'font-weight': 700, color: C.accent }, c + 1) })
  stacks.forEach(([name, sub, vals, hot], r) => {
    const y = Y0 + r * RH
    b += P(128, y - 6, 400, `<b style="color:${hot ? C.accent : C.text}">${name}</b><br><span style="color:${C.muted};font-size:24px">${sub}</span>`, { 'font-size': 30, 'line-height': 1.25 })
    vals.forEach((v, c) => {
      const x = X0 + c * CW, s = c + 1
      if (v == null) { b += P(x, y - 2, 80, '—', { 'font-size': 28, color: C.dim, 'line-height': 1.4 }, s); return }
      const [a, same] = Array.isArray(v) ? v : [v]
      const w = Math.max(5, Math.round(a * SC))
      b += DIV(x, y, w, 34, { background: hot ? C.accent : C.card, border: `2px solid ${hot ? C.accent : same ? C.line : C.dim}`, 'border-radius': 6, opacity: same ? 0.45 : 1 }, s, 0, 'rise')
      b += P(x + w + 12, y - 3, 110, fmtKb(a), { 'font-size': 26, 'font-weight': 700, color: hot ? C.accent : same ? C.dim : C.text, 'font-family': MONO, 'white-space': 'nowrap', 'line-height': 1.5 }, s)
    })
  })
  b += P(128, 840, 1664, 'На старте — чуть легче RTK, дальше — на уровне Redux-стеков. Дороже zustand + TanStack Query и чуть дороже effector. Но одна библиотека — и без своего связующего кода.', { 'font-size': 28, 'line-height': 1.4, color: C.text, padding: '18px 26px', 'border-radius': 16, background: C.soft, border: `2px solid ${C.accent}` }, 5, 0, 'rise')
  b += note(128, 990, 1664, `${SIZE_NOTE} · серые — без новых пакетов · RTK + saga вместо observable — ${fmtKb(kb('stack-rtk-saga'))} · персист в цифре только у synapse и zustand`, 0, 0, 24)
  slide('cost-growth', b, notes(15, 9, 14), { map: [0, 1, 2, 3, 4, 5] })
}
{
  let b = header('Сколько это стоит', 15, 'Кому подойдёт, а кому нет')
  const no = ['только UI-стейт → zustand или redux', 'только кэш запросов → TanStack Query', 'нужны DevTools, polling, optimistic → TanStack / RTK Query']
  b += P(128, 280, 800, 'Скорее не нужен, если', { 'font-size': 34, 'font-weight': 700, color: C.muted }, 1)
  no.forEach((t, i) => { b += P(128, 350 + i * 110, 800, `<span style="color:${C.red}">×</span> ${t}`, { 'font-size': 30, 'line-height': 1.35, padding: '20px 26px', 'border-radius': 16, background: C.card, border: `2px solid ${C.line}` }, 1, 0, 'rise') })
  b += P(1000, 280, 792, 'Присмотреться, если', { 'font-size': 34, 'font-weight': 700, color: C.accent }, 2)
  b += P(1000, 350, 792, 'вы всё равно собираете стор + API + бизнес-логику (+ персист, IndexedDB, SSR, вкладки) и хотите одну библиотеку с общими соглашениями', { 'font-size': 32, 'line-height': 1.4, padding: '26px 30px', 'border-radius': 16, background: C.soft, border: `2px solid ${C.accent}` }, 2, 0, 'rise')
  slide('cost-fit', b, notes(15, 15, 16), { map: [1, 2] })
}
{
  let b = glow(258, 350, 200) + logoSvg('end', 128, 220, 260)
  b += P(128, 520, 1664, 'Спасибо!', { 'font-size': 80, 'font-weight': 800, 'line-height': 1.1 }, 0)
  b += note(128, 660, 1664, 'документация и исходники — ссылки в описании · <span style="font-family:JetBrains Mono, monospace;color:#ECECEC">yarn add synapse-storage</span>', 0, 0, 32)
  b += note(128, 740, 1664, '<span style="font-family:JetBrains Mono, monospace;color:#ECECEC">github.com/Vlad92msk/synapse</span> · <span style="font-family:JetBrains Mono, monospace;color:#ECECEC">synapse-homepage.web.app</span>', 0, 0, 28)
  slide('end', b, notes(15, 17, 17), { map: [0] })
}

// ─── запись ────────────────────────────────────────────────────────────────
mkdirSync(join(root, 'slides'), { recursive: true })
// Слайды, которые автор правил руками на claude.ai: вёрстку не трогаем, обновляем только заметки (<aside>).
// Чтобы вернуть слайд генератору — убрать id отсюда.
const MANUAL = new Set(['real-one', 'real-module', 'real-app'])
const manualHtml = {}
for (const id of MANUAL) {
  const f = join(root, 'slides', `${id}.html`)
  try { manualHtml[id] = readFileSync(f, 'utf8') } catch { /* нет файла — сгенерируем */ }
}
for (const f of readdirSync(join(root, 'slides'))) unlinkSync(join(root, 'slides', f))
for (const s of slides) {
  const kept = manualHtml[s.id]
  const html = kept ? kept.replace(/<aside>[\s\S]*?<\/aside>/, s.html.match(/<aside>[\s\S]*?<\/aside>/)[0]) : s.html
  writeFileSync(join(root, 'slides', `${s.id}.html`), html)
}
const deckPath = join(root, 'deck.json')
const deck = JSON.parse(readFileSync(deckPath, 'utf8'))
deck.order = slides.map((s) => s.id)
deck.cover = 'cover'
deck.sections = {
  intro: { description: 'Обложка, зачем synapse и два слоя', start: 'cover' },
  state: { description: 'State Manager: хранилище, смена хранилища, middleware, React, селекторы', start: 'storage' },
  api: { description: 'ApiClient: создание, эндпоинты, вызовы', start: 'api-client' },
  logic: { description: 'Бизнес-логика: диспетчер, сборка синапса, эффекты', start: 'synapse-intro' },
  ssr: { description: 'SSR: форк на запрос, снапшот, гидрация', start: 'ssr-problem' },
  real: { description: 'Синапсы в реальном проекте', start: 'real-one' },
  outro: { description: 'Что ещё есть и чего нет', start: 'shelf' },
  cost: { description: 'Сколько это стоит: вес в бандле и сравнение', start: 'cost-rules' },
}
writeFileSync(deckPath, JSON.stringify(deck, null, 2) + '\n')
// таймлайн для видео: шаги диктора и какие клики (build-шаги) они запускают
writeFileSync(join(here, 'timeline.json'), JSON.stringify(slides.map(({ id, transition, beats }) => ({ id, transition, beats })), null, 1) + '\n')
const big = slides.map((s) => [s.id, (s.html.match(/<(p|div|svg|x-connector|x-shape|img|h1|h2)\b/g) || []).length]).filter(([, n]) => n > 150)
console.log(`✓ ${slides.length} слайдов`, big.length ? `— много элементов: ${JSON.stringify(big)}` : '')
