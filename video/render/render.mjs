// Черновой рендер ролика 1 из деки: слайды (decks/overview/project) + шаги диктора (decks/overview/timeline.json)
// + озвучка macOS `say` (голос Milena) → video/media/overview/overview-draft.mp4.
//
//   cd video/render && npm i && node render.mjs                 # весь ролик
//   node render.mjs --only=real-one,real-module                  # часть слайдов
//   node render.mjs --stills                                     # PNG итогового кадра каждого слайда (проверка вёрстки)
//   node render.mjs --only=real-one --shots=5,12.5               # PNG кадров на моменты t (с) → media/overview/shots/
//   node render.mjs --script                                     # video/VOICEOVER.md — текст и тайминги для озвучки
//
// Своя озвучка: файлы video/media/voiceover/overview/NN-<id>.mp3 (один на слайд) — см. VOICEOVER.md.
//
// Как устроено: все слайды кладутся на одну страницу в headless Chrome; window.__seek(t) выставляет состояние
// каждого элемента на момент t (появление, печать кода, стирание, magic-переход). Кадры снимаются только там,
// где что-то движется; статичные отрезки растягиваются через длительность кадра в ffmpeg concat.
import puppeteer from 'puppeteer-core'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DECK = join(here, '..', 'decks', 'overview')
const MEDIA = join(here, '..', 'media', 'overview')
const LOGO = join(here, '..', '..', 'packages', 'homepage', 'public', 'logo2.png')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}`))?.split('=')[1] ?? (process.argv.includes(`--${k}`) ? true : undefined)
const FPS = Number(arg('fps') ?? 30)
const ONLY = arg('only')?.split(',')
const STILLS = !!arg('stills')
const SHOTS = arg('shots')?.split(',').map(Number)
const SCRIPT = !!arg('script')
const VOICE = 'Milena'
const RATE = 185 // слов в минуту для say

// паузы (с)
const GAP_BEAT = 0.35
const HOLD_END = 0.9
// Паузы между фразами в своей озвучке (--pause=0.45, 0 — выключить): файл слайда режется по границам фраз и между
// кусками вставляется тишина — диктор не частит, анимация шага успевает доиграть. После законченного предложения —
// PAUSE, после части предложения (запятая, тире) — треть. Только когда границы фраз точные (NN-<id>.json).
const PAUSE = Number(arg('pause') ?? 0.45)
const pauseAfter = (text) => (/[.!?…:]["»)]?\s*$/.test(text) ? PAUSE : PAUSE / 3)
const TRANS = { fade: 0.7, magic: 1.0, push: 0.6 }
// «Петля наверх» (блок 12): вход в эти слайды — отъезд камеры. Все кольца предыдущего слайда сжимаются
// в кольцо ring-center нового, новая сеть приходит из глубины. Работает только после magic-слайда.
const ZOOM_OUT = new Set(['real-module', 'real-app'])
const ZOOM_DUR = 2.0
// Объёмные сцены: узлы (кольца с подписями и спутниками) стоят на разной глубине, камера медленно облетает сцену
// и к концу слайда возвращается в исходную точку (поэтому отъезды между масштабами остаются точными).
const NO3D = !!arg('no3d') // --no3d: блок 12 по-старому, 2D-схема с псевдо-3D (для сравнения)
const DEPTH = new Set(NO3D ? ['real-module', 'real-app'] : [])
// Настоящая 3D-сцена (video/scene3d, three.js): у этих слайдов 2D-схема (кольца, линии, точки, подписи узлов)
// убирается, вместо неё — общий WebGL-canvas под HTML-текстом слайда. Один мир и непрерывная камера: переходы
// между этими слайдами — перелёт камеры в сцене, текст слайдов сменяется наплывом.
const SCENE3D = new Set(NO3D ? [] : ['real-one', 'real-module', 'real-app'])
const S3D_DIR = join(here, '..', 'scene3d')
const ZOOM_DUR_3D = 2.6

for (const d of ['tts', 'frames']) mkdirSync(join(MEDIA, d), { recursive: true })
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim()

// ─── план ──────────────────────────────────────────────────────────────────
const fullTimeline = JSON.parse(readFileSync(join(DECK, 'timeline.json'), 'utf8'))
const NUM = Object.fromEntries(fullTimeline.map((s, i) => [s.id, String(i + 1).padStart(2, '0')]))
let timeline = ONLY ? fullTimeline.filter((s) => ONLY.includes(s.id)) : fullTimeline

// Своя озвучка: один файл на слайд — video/media/voiceover/overview/NN-<id>.(mp3|wav|m4a|…).
// Нет файла — фразы слайда озвучивает macOS `say`.
const VO = join(MEDIA, '..', 'voiceover', 'overview')
mkdirSync(VO, { recursive: true })
const voFile = (id) => ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac'].map((e) => join(VO, `${NUM[id]}-${id}.${e}`)).find(existsSync)
const probe = (f) => Number(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))
// всё аудио приводим к одному формату (44.1 кГц моно), кэш по пути+времени изменения
const norm = (f) => {
  const h = createHash('sha1').update(f + statSync(f).mtimeMs).digest('hex').slice(0, 16)
  const out = join(MEDIA, 'tts', `n_${h}.wav`)
  if (!existsSync(out)) sh('ffmpeg', ['-v', 'error', '-y', '-i', f, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', out])
  return out
}
// кусок файла [a, a + d) с короткими фейдами на краях (без щелчков), кэш по файлу и границам
const slice = (f, a, d) => {
  const h = createHash('sha1').update([f, a.toFixed(3), d.toFixed(3)].join('|')).digest('hex').slice(0, 16)
  const out = join(MEDIA, 'tts', `c_${h}.wav`)
  if (!existsSync(out)) sh('ffmpeg', ['-v', 'error', '-y', '-ss', a.toFixed(3), '-t', d.toFixed(3), '-i', f, '-af', `afade=t=in:d=0.012,afade=t=out:st=${Math.max(0, d - 0.02).toFixed(3)}:d=0.02`, '-c:a', 'pcm_s16le', out])
  return out
}
// середины пауз в файле — к ним привязываем границы фраз
const pauses = (f) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', f, '-af', 'silencedetect=noise=-32dB:d=0.12', '-f', 'null', '-'], { encoding: 'utf8' })
  const st = [...r.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]))
  const en = [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]))
  return st.map((x, i) => ({ at: en[i] != null ? (x + en[i]) / 2 : x, len: en[i] != null ? en[i] - x : 0.3 }))
}

// озвучка macOS: кэш по хэшу текста
const ttsText = (t) => t.replace(/«|»|„|“/g, '"').replace(/—/g, ',')
function tts(text) {
  const h = createHash('sha1').update(VOICE + RATE + text).digest('hex').slice(0, 16)
  const wav = join(MEDIA, 'tts', `${h}.wav`)
  if (!existsSync(wav)) sh('say', ['-v', VOICE, '-r', String(RATE), '--data-format=LEI16@22050', '-o', wav, ttsText(text)])
  return { wav: norm(wav), dur: probe(wav) }
}

const segs = [] // звуковые куски: { start, file }
let t = 0
const plan = timeline.map((s, i) => {
  const prev = timeline[i - 1]
  const zoom = ZOOM_OUT.has(s.id) && prev?.transition === 'magic'
  const trans = i === 0 ? 0 : zoom ? (SCENE3D.has(s.id) || SCENE3D.has(prev.id) ? ZOOM_DUR_3D : ZOOM_DUR) : TRANS[prev.transition] ?? 0.6
  const start = t
  t += trans
  const stepsOf = (b, bs, bd) => b.steps.map((step, k) => ({ step, t: bs + (bd * k * 0.9) / b.steps.length }))
  const vo = STILLS ? null : voFile(s.id)
  let beats
  if (vo) {
    // один файл на слайд: границы фраз — пропорционально длине текста, с привязкой к ближайшей паузе
    const file = norm(vo)
    const dur = probe(file)
    const ps = pauses(file)
    const w = s.beats.map((b) => b.text.length)
    const total = w.reduce((a, x) => a + x, 0)
    // ожидаемые границы — пропорционально длине текста; подбираем им паузы в файле (по порядку,
    // динамикой): стоимость = расстояние до ожидаемой границы − бонус за длину паузы (между фразами паузы длиннее)
    const n = w.length - 1
    const guess = []
    let acc = 0
    for (let k = 0; k < n; k++) { acc += w[k]; guess.push((dur * acc) / total) }
    // кандидаты: реальные паузы + «виртуальные» точки на самих ожидаемых границах (на случай речи без пауз)
    const P = [...ps.filter((p) => p.at > 0.3 && p.at < dur - 0.3), ...guess.map((g) => ({ at: g, len: 0, virt: true }))].sort((a, b) => a.at - b.at)
    const cost = (k, j) => Math.abs(P[j].at - guess[k]) - 3 * Math.min(P[j].len, 1) + (P[j].virt ? 0.6 : 0)
    let cuts
    // точные границы от voiceover-fish.mjs (NN-id.json рядом с файлом), если текст слайда не менялся
    const metaFile = vo.replace(/\.\w+$/, '.json')
    const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : null
    const textHash = createHash('sha1').update(s.beats.map((b) => b.text).join('\n')).digest('hex').slice(0, 12)
    const exact = !!(meta && meta.textHash === textHash && meta.cuts?.length === s.beats.length)
    if (exact) cuts = [...meta.cuts, dur]
    else if (n > 0 && P.length >= n) {
      // D[k][j] — лучшая стоимость, если k-я граница стоит на паузе j
      const D = Array.from({ length: n }, () => Array(P.length).fill(Infinity))
      const B = Array.from({ length: n }, () => Array(P.length).fill(-1))
      for (let j = 0; j < P.length; j++) D[0][j] = cost(0, j)
      for (let k = 1; k < n; k++) {
        let best = Infinity, bj = -1
        for (let j = k; j < P.length; j++) {
          if (D[k - 1][j - 1] < best) { best = D[k - 1][j - 1]; bj = j - 1 }
          D[k][j] = best + cost(k, j); B[k][j] = bj
        }
      }
      let j = D[n - 1].indexOf(Math.min(...D[n - 1]))
      const pick = []
      for (let k = n - 1; k >= 0; k--) { pick.unshift(P[j].at); j = B[k][j] }
      cuts = [0, ...pick, dur]
    } else cuts = [0, ...guess, dur] // пауз меньше, чем фраз — режем пропорционально
    if (exact && PAUSE > 0 && s.beats.length > 1) {
      // режем по границам фраз: граница — середина ближайшей паузы в речи (иначе чуть раньше начала слова)
      const at = cuts.map((c, k) => (k === 0 || k === cuts.length - 1 ? c : ps.filter((p) => Math.abs(p.at - c) < 0.3).sort((x, y) => Math.abs(x.at - c) - Math.abs(y.at - c))[0]?.at ?? Math.max(0, c - 0.05)))
      beats = s.beats.map((b, k) => {
        const piece = slice(file, at[k], at[k + 1] - at[k]), bd = probe(piece)
        const beat = { start: t, dur: bd, text: b.text, steps: stepsOf(b, t, bd) }
        segs.push({ start: t, file: piece })
        t += bd + (k < s.beats.length - 1 ? pauseAfter(b.text) : 0)
        return beat
      })
    } else {
      segs.push({ start: t, file })
      beats = s.beats.map((b, k) => { const bs = t + cuts[k], bd = cuts[k + 1] - cuts[k]; return { start: bs, dur: bd, text: b.text, steps: stepsOf(b, bs, bd) } })
      t += dur
    }
  } else {
    beats = s.beats.map((b) => {
      const a = STILLS ? { wav: null, dur: 1 } : tts(b.text)
      const beat = { start: t, dur: a.dur, text: b.text, steps: stepsOf(b, t, a.dur) }
      if (a.wav) segs.push({ start: t, file: a.wav })
      t += a.dur + GAP_BEAT
      return beat
    })
  }
  t += HOLD_END
  return { id: s.id, start, trans, magic: prev?.transition === 'magic', zoom, depth: DEPTH.has(s.id), end: t, beats, vo: !!vo }
})
const TOTAL = t
const fmt = (x) => new Date(x * 1000).toISOString().slice(14, 19)
console.log(`план: ${plan.length} слайдов, ${(TOTAL / 60).toFixed(1)} мин; своя озвучка: ${plan.filter((p) => p.vo).length} слайдов`)

// --script: текст и тайминги для записи озвучки → video/VOICEOVER.md
if (SCRIPT) {
  const lines = [
    '# Озвучка ролика 1 — текст и тайминги',
    '',
    '> Генерится: `cd video/render && node render.mjs --script`. Тайминги — от текущего черновика',
    '> (голос macOS `say` или уже положенные файлы) и служат ориентиром: видео подстроится под длину ваших файлов.',
    '',
    '## Автоматически через Fish.audio',
    '',
    '1. Создать `video/render/.env`: `FISH_API_KEY=…` и `FISH_VOICE_ID=…` (ключ в чат и в git не класть).',
    '2. `cd video/render && node voiceover-fish.mjs --dry` — сколько символов уйдёт в API; без `--dry` — озвучить.',
    '3. `node render.mjs` — собрать видео. Переозвучить слайды: `node voiceover-fish.mjs --only=cover,why --force`.',
    '   Как читать английские слова — `video/render/pronounce.json`, например `{ "synapse-storage": "синапс-сторадж" }`.',
    '',
    '## Вручную (любой сервис)',
    '',
    '1. **Один аудиофайл на слайд.** Имя — из заголовка слайда ниже (`NN-id.mp3`; подойдут mp3, wav, m4a, ogg, flac).',
    '2. Положить в **`video/media/voiceover/overview/`** (папка в `.gitignore`, в git не попадает).',
    '3. Внутри файла фразы идут по порядку, между фразами — пауза **0.4–0.7 с**: так рендер найдёт границы шагов.',
    '   ElevenLabs — каждая фраза с новой строки или `<break time="0.5s" />`; Fish.audio — каждая фраза с новой строки.',
    '   Блок «текст» под каждым слайдом уже разбит по строкам — его можно вставлять целиком.',
    '4. Пересобрать видео: `cd video/render && node render.mjs` (≈20 мин). Только часть: `--only=cover,why`.',
    '   Слайды без файла озвучиваются голосом macOS, поэтому подкладывать можно постепенно.',
    '5. Готовое видео: `video/media/overview/overview-draft.mp4`, главы для YouTube — `chapters.txt` рядом.',
    '',
    `Всего: ${plan.length} слайдов, ~${(TOTAL / 60).toFixed(0)} мин.`,
    '',
  ]
  for (const p of plan) {
    const speech = p.beats.at(-1).start + p.beats.at(-1).dur - p.beats[0].start
    lines.push(`## ${NUM[p.id]} · ${p.id} — \`${NUM[p.id]}-${p.id}.mp3\``, '', `Начало ${fmt(p.start)} · речь ~${speech.toFixed(0)} с${p.vo ? ' · файл уже есть' : ''}`, '')
    lines.push('```text', ...p.beats.map((b) => b.text), '```', '')
    lines.push('| # | старт | длит. | фраза |', '|---|---|---|---|')
    p.beats.forEach((b, k) => lines.push(`| ${k + 1} | ${fmt(b.start)} | ${b.dur.toFixed(1)} с | ${b.text.slice(0, 60)}${b.text.length > 60 ? '…' : ''} |`))
    lines.push('')
  }
  writeFileSync(join(here, '..', 'VOICEOVER.md'), lines.join('\n'))
  console.log('✓ video/VOICEOVER.md')
  process.exit(0)
}

// ─── 3D-сцена: сборка бандла и тайминги ────────────────────────────────────
const s3dSlides = plan.filter((p) => SCENE3D.has(p.id)).map((p) => {
  const steps = { 0: p.start }
  p.beats.forEach((b) => b.steps.forEach((s) => { steps[s.step] ??= s.t }))
  // фразы диктора — чтобы сцена выпускала элементы на нужном слове (см. word() в story.js)
  return { id: p.id, start: p.start, trans: p.trans, end: p.end, steps, beats: p.beats.map(({ start, dur, text }) => ({ start, dur, text })) }
})
const S3D_JS = join(S3D_DIR, 'dist', 'scene3d.js')
if (s3dSlides.length) {
  if (!existsSync(join(S3D_DIR, 'node_modules'))) sh('npm', ['i', '--prefix', S3D_DIR])
  sh('npm', ['run', 'build', '--prefix', S3D_DIR, '--silent'])
  // тайминги последнего рендера — для превью сцены (video/scene3d/preview.html)
  writeFileSync(join(S3D_DIR, 'dist', 'plan.js'), `window.SCENE3D_PLAN = ${JSON.stringify(s3dSlides)}\n`)
}

// ─── страница ──────────────────────────────────────────────────────────────
function convert(html) {
  return html
    .replace(/<aside>[\s\S]*?<\/aside>/, '')
    .replace(/\/_blob\/[0-9a-f]+/g, `file://${LOGO}`)
    .replace(/<x-connector([^>]*)><\/x-connector>/g, (m, attrs) => {
      // атрибуты в любом порядке: так их сохраняет и генератор, и редактор claude.ai
      const at = (k) => attrs.match(new RegExp(`\\b${k}="([^"]*)"`))?.[1]
      const style = at('style') ?? ''
      const color = style.match(/(?:^|;)\s*color:\s*([^;]+)/)?.[1].trim() ?? '#F97316'
      const w = Number(style.match(/border-width:\s*(\d+(?:\.\d+)?)px/)?.[1] ?? 2)
      const head = at('head') ?? 'end'
      const builds = attrs.match(/data-build-(?:in|out)="[^"]*"/g)?.join(' ') ?? ''
      const dash = /border-style:\s*dashed/.test(style) ? `stroke-dasharray="${w * 3} ${w * 2}"` : ''
      const id = `m${Math.random().toString(36).slice(2, 8)}`
      const marker = head !== 'none' ? `<defs><marker id="${id}" markerWidth="4" markerHeight="4" refX="2.5" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z" fill="${color}"/></marker></defs>` : ''
      return `<svg data-line="1" style="position:absolute;left:0;top:0;width:1920px;height:1080px;overflow:visible" ${builds}>${marker}<line x1="${at('x1')}" y1="${at('y1')}" x2="${at('x2')}" y2="${at('y2')}" stroke="${color}" stroke-width="${w}" ${dash} ${head !== 'none' ? `marker-end="url(#${id})"` : ''}/></svg>`
    })
    .replace(/<x-shape kind="ellipse"([^>]*?)style="([^"]*)"([^>]*)><\/x-shape>/g, (m, pre, st, attrs) => {
      const w = Number(st.match(/width:\s*(\d+(?:\.\d+)?)px/)?.[1] ?? 99)
      const dot = w <= 12 && !/data-build/.test(pre + attrs) ? ' data-dot="1"' : ''
      return `<div${pre}style="${st};border-radius:50%"${attrs}${dot}></div>`
    })
}
const sections = plan.map((p) => convert(readFileSync(join(DECK, 'project', 'slides', `${p.id}.html`), 'utf8'))).join('\n')
const page = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap">
${s3dSlides.length ? `<script src="file://${S3D_JS}"></script>` : ''}
<style>
html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#232321}
section{position:absolute!important;left:0;top:0;width:1920px;height:1080px;box-sizing:border-box;opacity:0}
*{margin:0;box-sizing:border-box}
#caret{position:absolute;width:3px;background:#F97316;opacity:0;z-index:100}
#s3d{position:absolute;left:0;top:0;width:1920px;height:1080px;z-index:20;opacity:0;visibility:hidden}
</style></head><body>${sections}<div id="s3d"></div><div id="caret"></div>
<script>
const clamp = (x) => Math.min(1, Math.max(0, x))
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3)
const easeIO = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 }
const smooth = (x, a, b) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u) }
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296 }
const ANIM = 0.45, ERASE = 0.35, LINE_ANIM = 0.7
// камера сцены: медленный наезд на CAM за слайд вокруг O; аффинное преобразование p → s·p + (tx, ty)
const CAM = 0.04, O = { x: 960, y: 560 }
const cam = (u) => { const s = 1 + CAM * u; return { s, tx: O.x * (1 - s), ty: O.y * (1 - s) } }
const ID = { s: 1, tx: 0, ty: 0 }
const comp = (a, b) => ({ s: a.s * b.s, tx: a.s * b.tx + a.tx, ty: a.s * b.ty + a.ty })
const mat = (m) => 'matrix(' + m.s + ',0,0,' + m.s + ',' + m.tx + ',' + m.ty + ')'
const mid = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
const BASE = new Map() // исходная opacity элемента (из вёрстки), рендер умножает на неё
const base = (el) => BASE.get(el) ?? 1
const isRing = (el) => el.tagName === 'svg' && /^(ring|mod)-/.test(el.id)
let S = [], S3 = null
window.__init = (plan, s3dSlides) => {
  const secs = [...document.querySelectorAll('section')]
  for (const el of document.querySelectorAll('section [style]')) BASE.set(el, parseFloat(el.style.opacity || '1'))
  S = []
  // 3D-сцена: слайды лежат по порядку (z = 10 + 2·i), canvas — сразу под видимым 3D-слайдом (его текст поверх,
  // своего фона у 3D-слайдов нет); при отъезде в обложку canvas поверх неё и гаснет, пока рисуется логотип
  const has3 = plan.some((p) => p.s3d)
  if (has3) {
    S3 = { scene: Scene3D.mount(document.getElementById('s3d'), { width: 1920, height: 1080, slides: s3dSlides }), el: document.getElementById('s3d') }
  }
  const labels3 = new Set(has3 ? Scene3D.LABELS : [])
  plan.forEach((p, i) => {
    const sec = secs[i]
    const zBase = 10 + 2 * i
    if (p.s3d) {
      // 2D-схема уходит: её рисует сцена. Остаются шапка, код, пояснения и плашки
      for (const el of [...sec.querySelectorAll('svg[id^="ring-"], svg[id^="mod-"], svg[data-line], div')]) {
        if (el.tagName === 'DIV' && el.style.borderRadius !== '50%') continue
        el.remove()
      }
      for (const el of [...sec.querySelectorAll('p')]) if (!el.style.background && !el.style.border && labels3.has(el.textContent.trim())) el.remove()
      sec.style.backgroundColor = 'transparent'
      sec.style.backgroundImage = 'none' // свечение фона рисует сцена (с дизерингом)
    }
    sec.style.transformOrigin = '960px 540px'
    const prevS = S[i - 1]
    const stepT = { 0: p.start }
    p.beats.forEach((b) => b.steps.forEach((s) => { if (stepT[s.step] == null) stepT[s.step] = s.t }))
    const beatEnd = (time) => { for (const b of p.beats) if (time < b.start + b.dur + 0.3) return b.start + b.dur; return p.end }
    const nextStepAfter = (time) => Math.min(...Object.values(stepT).filter((x) => x > time + 0.01), beatEnd(time) + 0.3)
    // «сцена» — слайд с кольцами-синапсами, звёздным фоном или логотипом: живёт весь слайд, её двигает камера.
    // Содержимое сцены переносится в обёртку-«мир»; шапка (тексты, начинающиеся выше 200px) остаётся на месте.
    const scene = !!sec.querySelector('svg[id^="ring-"], svg[id^="mod-"], [data-bg], div[data-dot], [data-logo]')
    let world = null
    if (scene) {
      world = document.createElement('div')
      world.style.cssText = 'position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0'
      // на слайде с логотипом (обложка) весь текст остаётся на месте — камера двигает только логотип
      const hasLogo = !!sec.querySelector('[data-logo]')
      for (const el of [...sec.children]) if (!(/^(P|H[1-6])$/.test(el.tagName) && (hasLogo || el.getBoundingClientRect().top < 200))) world.appendChild(el)
      sec.appendChild(world)
    }
    const kids = [...sec.children].filter((el) => el !== world).concat(world ? [...world.children] : [])
    // строка кода: data-code от генератора или (после пересохранения в claude.ai) моно-шрифт + nowrap + без фона
    const isCode = (el) => el.hasAttribute('data-code') || (el.tagName === 'P' && /JetBrains/.test(el.style.fontFamily) && el.style.whiteSpace === 'nowrap' && !el.style.padding && !el.style.background)
    const els = [...sec.querySelectorAll('[data-build-in],[data-build-out],[data-code],p')].filter((el) => el.hasAttribute('data-build-in') || el.hasAttribute('data-build-out') || isCode(el)).map((el) => {
      const [fx, s] = (el.getAttribute('data-build-in') ?? 'fade 0').split(' ')
      const out = el.getAttribute('data-build-out')?.split(' ')[1]
      const r = el.getBoundingClientRect()
      const ln = el.matches('svg[data-line]') ? el.querySelector('line') : null
      return { el, fx, tIn: s === '0' ? -1 : stepT[s] ?? Infinity, tOut: out ? stepT[out] ?? Infinity : Infinity, code: isCode(el), base: base(el),
        top: r.top, left: r.left, len: el.textContent.length, cw: parseFloat(getComputedStyle(el).fontSize) * 0.6, w: r.width, h: r.height, step: Number(s), ln,
        dot: el.tagName === 'DIV' && el.style.borderRadius === '50%' && r.width <= 24, c: mid(r) }
    })
    const elSet = new Set(els.map((e) => e.el))
    // печать кода: строки одного шага — по очереди, сверху вниз; если на шаге что-то стирается — сначала стирание
    const byStep = {}
    els.filter((e) => e.code && e.tIn > 0 && isFinite(e.tIn)).forEach((e) => (byStep[e.tIn] ??= []).push(e))
    for (const [tin, list] of Object.entries(byStep)) {
      const t0 = Number(tin) + (els.some((e) => e.code && e.tOut === Number(tin)) ? ERASE + 0.05 : 0.05)
      list.sort((a, b) => a.top - b.top || a.left - b.left)
      const chars = list.reduce((n, e) => n + e.len, 0)
      // допечатать к ~70% фразы: зритель успевает прочитать строку, пока о ней говорят (паузы между строками — в счёт)
      const avail = Math.max(0.6, (nextStepAfter(Number(tin)) - t0 - 0.2) * 0.7 - 0.04 * (list.length - 1))
      const cps = Math.max(36, chars / avail)
      let at = t0
      for (const e of list) { e.typeStart = at; e.typeDur = e.len / cps; at += e.typeDur + 0.04 }
    }
    // каскад: элементы одного шага появляются не разом. В сцене сеть «прорастает» от центрального кольца
    // (задержка по расстоянию), точки — по порядку вёрстки (веер раскрывается); на обычных слайдах — по порядку.
    // якорь отъезда: центральное кольцо, на обложке — логотип
    const anchorEl = sec.querySelector('#ring-center') ?? (p.zoom ? sec.querySelector('[data-logo]') : null)
    const A0 = anchorEl ? mid(anchorEl.getBoundingClientRect()) : { x: 960, y: 560 }
    const groups = {}
    els.filter((e) => !e.code && e.tIn > 0 && isFinite(e.tIn)).forEach((e) => (groups[e.tIn] ??= []).push(e))
    for (const g of Object.values(groups)) {
      if (g.length < 2) continue
      if (!scene) { g.forEach((e, k) => { e.tIn += k * Math.min(0.08, 0.4 / g.length) }); continue }
      const dots = g.filter((e) => e.dot), rest = g.filter((e) => !e.dot)
      dots.forEach((e, k) => { e.tIn += 0.15 + k * Math.min(0.05, 0.8 / dots.length) })
      const d = rest.map((e) => Math.hypot(e.c.x - A0.x, e.c.y - A0.y))
      const lo = Math.min(...d), hi = Math.max(...d)
      rest.forEach((e, k) => { e.tIn += hi - lo > 40 ? (0.9 * (d[k] - lo)) / (hi - lo) : 0 })
    }
    // линии-связи: рисуются от конца, ближнего к центру; по сплошным в сцене изредка бегут импульсы
    const lines = [...sec.querySelectorAll('svg[data-line]')].map((svg, k) => {
      const ln = svg.querySelector('line')
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((a) => Number(ln.getAttribute(a)))
      const near1 = Math.hypot(x1 - A0.x, y1 - A0.y) <= Math.hypot(x2 - A0.x, y2 - A0.y)
      const L = { svg, ln, a: near1 ? [x1, y1] : [x2, y2], b: near1 ? [x2, y2] : [x1, y1], near1, dashed: ln.hasAttribute('stroke-dasharray'), e: els.find((e) => e.el === svg) }
      if (L.e) L.e.L = L
      if (scene && !L.dashed) {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        c.setAttribute('r', '5'); c.setAttribute('fill', '#FDBA74'); c.style.filter = 'drop-shadow(0 0 6px #F97316)'; c.style.opacity = 0
        svg.appendChild(c)
        L.pulse = c; L.per = 6 + 3 * hash(p.id + k); L.ph = hash(k + p.id)
      }
      return L
    })
    // кольца «дышат»: лёгкое покачивание и масштаб; пунктирные медленно вращаются
    const rings = scene ? [...sec.querySelectorAll('svg')].filter(isRing).map((el) => {
      const r = el.getBoundingClientRect()
      return { el, ...mid(r), r: r.width / 2, ph: hash(el.id) * 6.283, dashed: el.querySelector('circle')?.getAttribute('stroke-dasharray') === '6 6' }
    }) : []
    // точки-спутники вокруг кольца (до 8 штук) плавают по орбите туда-обратно; веер (больше 8) стоит
    const orbit = []
    if (scene && rings.length) {
      const near = new Map()
      for (const e of els.filter((e) => e.dot)) {
        let best = null, bd = Infinity
        for (const r of rings) { const d = Math.hypot(e.c.x - r.x, e.c.y - r.y); if (d < bd) { bd = d; best = r } }
        if (best && bd < best.r * 2.6 + 30) { if (!near.has(best)) near.set(best, []); near.get(best).push(e) }
      }
      for (const [r, list] of near) if (list.length <= 8) for (const e of list) orbit.push({ el: e.el, dx: e.c.x - r.x, dy: e.c.y - r.y, ph: r.ph, dir: hash(r.el.id + 'o') > 0.5 ? 1 : -1 })
    }
    // логотип: прорисовка + «сигнал» по связям к малым кольцам
    const lgEl = sec.querySelector('[data-logo]')
    let logo = null
    if (lgEl) {
      const NS = 'http://www.w3.org/2000/svg'
      const core = lgEl.querySelector('[data-part=core]')
      const links = [...lgEl.querySelectorAll('[data-part=link]')].map((ln) => ({ ln, xy: ['x1', 'y1', 'x2', 'y2'].map((a) => Number(ln.getAttribute(a))) }))
      const nodes = [...lgEl.querySelectorAll('[data-part=node]')].map((c) => ({ c, cx: Number(c.getAttribute('cx')), cy: Number(c.getAttribute('cy')) }))
      const sparks = links.map(() => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', '4'); c.setAttribute('fill', '#FFE1C2'); c.style.filter = 'drop-shadow(0 0 4px #F97316)'; c.style.opacity = 0; lgEl.appendChild(c); return c })
      logo = { el: lgEl, core, coreLen: 2 * Math.PI * 26, nodeLen: 2 * Math.PI * 14, links, nodes, sparks, glow: sec.querySelector('[data-glow]') }
    }
    const bg = [...sec.querySelectorAll('[data-bg], div[data-dot]')].map((el) => ({ el, ...mid(el.getBoundingClientRect()), ph: hash(String(el.style.left) + el.style.top) * 6.283 }))
    // ─ объём: узел = кольцо (+ пунктирное кольцо с тем же центром) + подпись + точки-спутники + концы линий ─
    let space = null
    if (p.depth && rings.length) {
      const nodes = []
      for (const r of rings) {
        const n = nodes.find((n) => Math.hypot(n.x - r.x, n.y - r.y) < 12)
        if (n) { n.rings.push(r); n.r = Math.max(n.r, r.r) } else nodes.push({ x: r.x, y: r.y, r: r.r, rings: [r], members: [] })
      }
      const maxR = Math.max(...nodes.map((n) => n.r))
      for (const n of nodes) {
        // крупное — ближе, мелкое и тусклое — дальше; немного случайности, чтобы не было ровных «этажей»
        const dim = Math.min(...n.rings.map((r) => base(r.el)))
        n.z = 420 * (1 - n.r / maxR) - 140 + (dim < 0.85 ? 120 : 0) + (hash(n.rings[0].el.id + 'z') - 0.5) * 140
        for (const r of n.rings) n.members.push({ el: r.el, ...mid(r.el.getBoundingClientRect()), ring: r })
      }
      const nearest = (x, y, lim) => { let b = null, bd = Infinity; for (const n of nodes) { const d = Math.hypot(n.x - x, n.y - y); if (d < bd && d < lim(n)) { bd = d; b = n } } return b }
      // подписи: короткий текст рядом с кольцом (плашки-пояснения с фоном или рамкой остаются «над сценой»)
      for (const el of world.querySelectorAll('p')) {
        if (el.style.background || el.style.border || el.style.padding) continue
        // расстояние — до ближайшей точки блока подписи (блок шире текста, центр может быть далеко от кольца)
        const r = el.getBoundingClientRect(), c = mid(r)
        let best = null, bd = Infinity
        for (const n of nodes) {
          const d = Math.hypot(Math.max(r.left - n.x, 0, n.x - r.right), Math.max(r.top - n.y, 0, n.y - r.bottom))
          if (d < bd && d < n.r + 60) { bd = d; best = n }
        }
        if (best) best.members.push({ el, ...c })
      }
      for (const e of els.filter((e) => e.dot)) { const n = nearest(e.c.x, e.c.y, (n) => n.r * 2.6 + 30); if (n) n.members.push({ el: e.el, ...e.c }) }
      for (const L of lines) {
        L.na = nearest(L.a[0], L.a[1], (n) => n.r + 80)
        L.nb = nearest(L.b[0], L.b[1], (n) => n.r + 80)
      }
      // звёзды — далеко за сценой, дают самый сильный параллакс
      for (const d of bg) d.z = 600 + 600 * hash(d.el.style.left + d.el.style.top + 'z')
      // глубина резкости: дальние кольца и точки слегка размыты
      for (const n of nodes) if (n.z > 180) for (const m of n.members) if (m.el.tagName !== 'P') m.el.style.filter = 'blur(' + Math.min(1.6, (n.z - 180) / 160).toFixed(2) + 'px)'
      space = { nodes }
    }
    // magic: элементы с тем же id, что на предыдущем слайде (у предыдущего учитываем наезд его камеры)
    const pairs = []
    if (p.magic && !p.zoom && prevS) {
      const pc = prevS.world ? cam(1) : ID
      for (const el of sec.querySelectorAll('[id]')) {
        if (el.tagName === 'SECTION' || el.closest('defs')) continue
        const prev = prevS.sec.querySelector('#' + CSS.escape(el.id))
        if (!prev) continue
        const r = prev.getBoundingClientRect(), b = el.getBoundingClientRect()
        const a = { left: pc.s * r.left + pc.tx, top: pc.s * r.top + pc.ty, width: pc.s * r.width, height: pc.s * r.height }
        pairs.push({ el, prev, dx: a.left - b.left + (a.width - b.width) / 2, dy: a.top - b.top + (a.height - b.height) / 2, sx: a.width / b.width, sy: a.height / b.height })
      }
    }
    // отъезд камеры: рамка всех колец предыдущего слайда (A) ↔ кольцо ring-center нового (B), Z — во сколько раз
    let zoom = null
    if (p.zoom && prevS && anchorEl && world) {
      const rs = [...prevS.sec.querySelectorAll('svg')].filter(isRing).map((e) => e.getBoundingClientRect())
      if (rs.length) {
        const l = Math.min(...rs.map((r) => r.left)), r = Math.max(...rs.map((r) => r.right))
        const tp = Math.min(...rs.map((r) => r.top)), bt = Math.max(...rs.map((r) => r.bottom))
        const pc = prevS.world ? cam(1) : ID
        const A = { x: pc.s * (l + r) / 2 + pc.tx, y: pc.s * (tp + bt) / 2 + pc.ty }
        const nb = anchorEl.getBoundingClientRect()
        zoom = { A, B: mid(nb), Z: Math.max(1.2, (pc.s * Math.max(r - l, bt - tp)) / nb.width), pc }
      }
    }
    S.push({ p, sec, world, space, zBase, flight: p.s3d && p.magic && !!plan[i - 1]?.s3d, bgc: sec.style.backgroundColor, bgi: sec.style.backgroundImage, kids, els, elSet, lines, rings, orbit, logo, bg, pairs, zoom, matched: new Set(pairs.map((x) => x.el)) })
  })
  // интервалы, где кадр меняется
  const iv = []
  if (S3) plan.forEach((p, i) => { if (p.s3d) iv.push([p.start, (plan[i + 1] ? plan[i + 1].start + plan[i + 1].trans : p.end) + 0.1]) })
  for (const s of S) {
    iv.push([s.p.start, s.p.start + s.p.trans])
    if (s.world) iv.push([s.p.start, s.p.end])
    for (const e of s.els) {
      if (e.code && e.typeStart != null) iv.push([e.typeStart, e.typeStart + e.typeDur + 0.05])
      else if (e.tIn > 0 && isFinite(e.tIn)) iv.push([e.tIn, e.tIn + (e.L ? LINE_ANIM : ANIM)])
      if (isFinite(e.tOut)) iv.push([e.tOut, e.tOut + ERASE])
      if (e.step && !isFinite(e.tIn)) console.warn('шаг без фразы', s.p.id, e.step)
    }
  }
  return iv
}
// положение камеры при отъезде: k — прогресс, возвращает преобразования нового и старого «мира»
const zoomAt = (z, k) => {
  const f = Math.pow(z.Z, 1 - k)
  const c = { x: z.A.x + (z.B.x - z.A.x) * k, y: z.A.y + (z.B.y - z.A.y) * k }
  return {
    nw: { s: f, tx: c.x - f * z.B.x, ty: c.y - f * z.B.y },
    old: comp({ s: f / z.Z, tx: c.x - (f / z.Z) * z.A.x, ty: c.y - (f / z.Z) * z.A.y }, z.pc),
  }
}
window.__seek = (t) => {
  const caret = document.getElementById('caret')
  caret.style.opacity = 0
  if (S3) {
    // сцена видна, пока виден хоть один 3D-слайд; вход наплывом — проявляется, отъезд в обложку — гаснет поверх неё
    let on = false, op = 0, z = 0
    S.forEach((s, i) => {
      const prev = S[i - 1], next = S[i + 1]
      if (!s.p.s3d || t < s.p.start || (next && t >= next.p.start + next.p.trans)) return
      on = true
      let o = prev && !prev.p.s3d && !s.p.magic && s.p.trans ? ease((t - s.p.start) / s.p.trans) : 1, zz = s.zBase - 1
      if (next && !next.p.s3d && next.p.zoom && t >= next.p.start) { o *= 1 - smooth((t - next.p.start) / next.p.trans, 0.5, 1); zz = next.zBase + 1 }
      op = Math.max(op, o); z = Math.max(z, zz)
    })
    S3.el.style.visibility = on ? 'visible' : 'hidden'
    if (on) { S3.el.style.opacity = op; S3.el.style.zIndex = z; S3.scene.seek(t) }
  }

  S.forEach((s, i) => {
    const { p, sec, world } = s
    const next = S[i + 1]
    const visible = t >= p.start && (!next || t < next.p.start + next.p.trans)
    if (!visible) { sec.style.opacity = 0; sec.style.visibility = 'hidden'; return }
    sec.style.visibility = 'visible'
    const pr = p.trans ? ease((t - p.start) / p.trans) : 1
    const w = t - p.start
    const tf = new Map()
    const add = (el, x) => { if (!tf.has(el)) tf.set(el, []); tf.get(el).push(x) }
    // ─ вход и выход слайда ─
    // fade: новый слайд проявляется, чуть «подъезжая» (1.02 → 1); старый уходит назад и в лёгкий расфокус
    let op = 1, tr = '', fl = ''
    if (!p.magic && !p.zoom) { op = pr; tr = 'scale(' + (1.02 - 0.02 * pr) + ')' }
    const exitK = next && t >= next.p.start ? clamp((t - next.p.start) / next.p.trans) : -1
    if (exitK >= 0) {
      if (next.zoom) op *= 1 - smooth(easeIO(exitK), 0.1, 0.7)
      else if (next.p.s3d && p.s3d) op *= 1 - smooth(exitK, 0, 0.45) // 3D-перелёт: текст уходит в первой половине
      else if (next.p.magic) op *= 1 - ease(exitK)
      else { const q = ease(exitK); tr = 'scale(' + (1 - 0.015 * q) + ')'; if (q > 0.01) fl = 'blur(' + (4 * q).toFixed(2) + 'px)' }
    }
    sec.style.opacity = op; sec.style.transform = tr; sec.style.filter = fl
    // при отъезде старый слайд лежит поверх нового без фона — видно, как он сжимается в кольцо
    const over = exitK >= 0 && !!next.zoom
    // уход 3D-слайда в обложку: его текст — над canvas, который лежит над обложкой
    const over3 = exitK >= 0 && p.s3d && !next.p.s3d && next.p.zoom
    sec.style.zIndex = s.zBase + (over ? 3 : over3 ? 4 : 0)
    sec.style.backgroundColor = over ? 'transparent' : s.bgc
    sec.style.backgroundImage = over ? 'none' : s.bgi
    // ─ камера ─
    if (world) {
      let M = cam(clamp(w / (p.end - p.start)))
      let wop = 1
      if (s.zoom) { const k = easeIO(w / p.trans); M = comp(zoomAt(s.zoom, k).nw, M); wop = smooth(k, 0.2, 0.85) }
      if (exitK >= 0 && next.zoom) M = zoomAt(next.zoom, easeIO(exitK)).old
      world.style.transform = mat(M)
      world.style.opacity = wop
    }
    // ─ объём: проекция узлов через камеру, облетающую сцену ─
    const pre = new Map() // преобразования, которые идут первыми (положение узла в пространстве)
    if (s.space) {
      const u = clamp(w / (p.end - p.start))
      const yaw = 0.13 * Math.sin(Math.PI * u), pitch = -0.08 * Math.sin(2 * Math.PI * u)
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), D = 1500
      // точка (x, y) на глубине z: смещение на экране и масштаб относительно вёрстки
      const proj = (x, y, z) => {
        const s0 = D / (D + z), X = (x - O.x) / s0, Y = (y - O.y) / s0
        const X1 = X * cy + z * sy, Z1 = -X * sy + z * cy
        const Y1 = Y * cp - Z1 * sp, Z2 = Y * sp + Z1 * cp
        const s1 = D / (D + Z2)
        return { dx: O.x + s1 * X1 - x, dy: O.y + s1 * Y1 - y, k: s1 / s0 }
      }
      for (const n of s.space.nodes) {
        n.P = proj(n.x, n.y, n.z)
        for (const m of n.members) {
          const ox = n.P.dx + (m.x - n.x) * (n.P.k - 1), oy = n.P.dy + (m.y - n.y) * (n.P.k - 1)
          let x = 'translate(' + ox.toFixed(2) + 'px,' + oy.toFixed(2) + 'px) scale(' + n.P.k.toFixed(4) + ')'
          // кольцо — диск в пространстве: поворачивается против камеры и слегка покачивается
          if (m.ring) x += ' perspective(700px) rotateY(' + (-yaw * 1.6 + 0.2 * Math.sin(w * 0.45 + m.ring.ph)) + 'rad) rotateX(' + (pitch * 1.6 + 0.2 * Math.cos(w * 0.38 + m.ring.ph)) + 'rad)'
          pre.set(m.el, x)
        }
      }
      for (const d of s.bg) { const q = proj(d.cx, d.cy, d.z); pre.set(d.el, 'translate(' + q.dx.toFixed(2) + 'px,' + q.dy.toFixed(2) + 'px) scale(' + q.k.toFixed(4) + ')') }
      const ep = (pt, n) => n ? [pt[0] + n.P.dx + (pt[0] - n.x) * (n.P.k - 1), pt[1] + n.P.dy + (pt[1] - n.y) * (n.P.k - 1)] : pt
      for (const L of s.lines) { L.A = ep(L.a, L.na); L.B = ep(L.b, L.nb) }
    }
    // ─ элементы по шагам ─
    for (const e of s.els) {
      let o = 1, clip = ''
      if (e.code && e.typeStart != null) {
        const shown = Math.floor(clamp((t - e.typeStart) / e.typeDur) * e.len)
        o = shown > 0 ? 1 : 0
        if (shown < e.len) clip = 'inset(-8px ' + Math.max(0, e.w - shown * e.cw) + 'px -8px -8px)'
        if (shown > 0 && shown < e.len) { caret.style.opacity = 1; caret.style.left = (e.left + shown * e.cw + 1) + 'px'; caret.style.top = (e.top + 3) + 'px'; caret.style.height = (e.h - 6) + 'px' }
      } else if (e.tIn > 0) {
        if (e.L) {
          // линия прорисовывается от центра к краю
          const k = ease((t - e.tIn) / LINE_ANIM)
          o = k > 0 ? 1 : 0
          e.L.k = k
        } else {
          const k = ease((t - e.tIn) / ANIM)
          o = k
          if (e.fx === 'rise') add(e.el, 'translateY(' + (28 * (1 - k)) + 'px)')
          if (e.fx === 'pop') add(e.el, 'scale(' + (0.88 + 0.12 * k) + ')')
          if (e.fx === 'drop') add(e.el, 'translateY(' + (-28 * (1 - k)) + 'px)')
        }
      }
      if (t >= e.tOut) {
        const k = Math.min(1, (t - e.tOut) / ERASE)
        if (e.code) clip = 'inset(-8px ' + (e.w * k) + 'px -8px -8px)'
        o *= e.code ? (k < 1 ? 1 : 0) : 1 - k
      }
      if (p.magic && !s.zoom && !s.matched.has(e.el)) o *= s.flight ? smooth(w / p.trans, 0.55, 1) : pr
      e.el.style.opacity = o * e.base
      e.el.style.clipPath = clip
    }
    // содержимое без шагов: при magic — проявляется, при отъезде шапка сменяется плавно
    if (p.magic) for (const el of s.kids) {
      if (s.elSet.has(el) || s.matched.has(el) || el.hasAttribute('data-build-in') || el.hasAttribute('data-code')) continue
      if (s.zoom && el.parentNode === world) continue
      // при отъезде (и 3D-перелёте) новая шапка проявляется, когда старая уже ушла
      el.style.opacity = (s.zoom || s.flight ? smooth(w / p.trans, 0.55, 1) : pr) * base(el)
    }
    for (const m of s.pairs) {
      const k = 1 - pr
      add(m.el, 'translate(' + m.dx * k + 'px,' + m.dy * k + 'px) scale(' + (1 + (m.sx - 1) * k) + ',' + (1 + (m.sy - 1) * k) + ')')
      m.el.style.opacity = base(m.el)
      m.prev.style.visibility = pr < 1 ? 'hidden' : ''
    }
    // ─ «жизнь» сцены, пока говорит диктор ─
    for (const r of s.rings) {
      if (r.dashed) add(r.el, 'rotate(' + ((w * 7) % 360) + 'deg)')
      else add(r.el, 'rotate(' + (3.5 * Math.sin(w * 0.8 + r.ph)) + 'deg) scale(' + (1 + 0.018 * Math.sin(w * 1.25 + r.ph * 1.7)) + ')')
    }
    for (const d of s.orbit) {
      const a = d.dir * 0.33 * Math.sin((w * 6.283) / 14 + d.ph)
      const x = d.dx * Math.cos(a) - d.dy * Math.sin(a), y = d.dx * Math.sin(a) + d.dy * Math.cos(a)
      add(d.el, 'translate(' + (x - d.dx) + 'px,' + (y - d.dy) + 'px)')
    }
    // звёзды отстают от камеры (параллакс) и чуть мерцают
    const u = clamp(w / (p.end - p.start))
    for (const d of s.bg) {
      add(d.el, 'translate(' + (d.cx - 960) * -0.035 * u + 'px,' + (d.cy - 560) * -0.035 * u + 'px)')
      if (!s.elSet.has(d.el)) d.el.style.opacity = base(d.el) * (0.6 + 0.4 * Math.sin(w * 0.9 + d.ph))
    }
    for (const L of s.lines) {
      // концы линии (в объёмной сцене — за своими узлами); недорисованная линия обрезана на доле k
      const A = L.A ?? L.a, B = L.B ?? L.b, dk = L.k ?? 1
      if (L.A || L.k != null) {
        L.ln.setAttribute(L.near1 ? 'x1' : 'x2', A[0]); L.ln.setAttribute(L.near1 ? 'y1' : 'y2', A[1])
        L.ln.setAttribute(L.near1 ? 'x2' : 'x1', A[0] + (B[0] - A[0]) * dk); L.ln.setAttribute(L.near1 ? 'y2' : 'y1', A[1] + (B[1] - A[1]) * dk)
      }
      if (L.dashed && s.world) L.ln.style.strokeDashoffset = -w * 18
      if (!L.pulse) continue
      const from = (L.e && L.e.tIn > 0 ? L.e.tIn + LINE_ANIM : p.start + p.trans) + L.ph * L.per
      const lt = t - from, x = (lt % L.per) / 1.6
      if (lt < 0 || x > 1 || (L.e && t >= L.e.tOut) || exitK >= 0) { L.pulse.style.opacity = 0; continue }
      // импульс туда и обратно по очереди: к центру и от центра
      const k = easeIO(x), back = Math.floor(lt / L.per) % 2 === 0
      const q = back ? 1 - k : k
      L.pulse.setAttribute('cx', A[0] + (B[0] - A[0]) * q)
      L.pulse.setAttribute('cy', A[1] + (B[1] - A[1]) * q)
      L.pulse.style.opacity = 0.9 * Math.sin(Math.PI * x)
    }
    if (s.logo) {
      const g = s.logo
      // после отъезда логотип рисуется, когда сеть уже почти сжалась в него
      const w = t - p.start - (p.zoom ? p.trans * 0.55 : 0)
      // прорисовка: большое кольцо → связи → малые кольца
      const ck = ease((w - 0.25) / 0.9)
      g.core.setAttribute('stroke-dasharray', g.coreLen)
      g.core.setAttribute('stroke-dashoffset', g.coreLen * (1 - ck))
      g.links.forEach((l, k) => {
        const lk = ease((w - 0.85 - k * 0.12) / 0.4), [x1, y1, x2, y2] = l.xy
        l.ln.style.opacity = lk > 0 ? 1 : 0
        l.ln.setAttribute('x2', x1 + (x2 - x1) * lk); l.ln.setAttribute('y2', y1 + (y2 - y1) * lk)
      })
      // сигнал: каждые 3.6 с по связям бежит искра, малое кольцо вспыхивает
      const sw = w - 2.6, cyc = 3.6, sx = sw >= 0 ? (sw % cyc) / 0.6 : -1
      g.nodes.forEach((n, k) => {
        const nk = ease((w - 1.15 - k * 0.15) / 0.6)
        n.c.setAttribute('stroke-dasharray', g.nodeLen)
        n.c.setAttribute('stroke-dashoffset', g.nodeLen * (1 - nk))
        const hit = sx > 1 ? Math.sin(Math.PI * clamp((sx - 1) / 0.9)) : 0
        const sc = 1 + 0.12 * hit
        n.c.setAttribute('transform', 'translate(' + n.cx + ' ' + n.cy + ') scale(' + sc + ') translate(' + -n.cx + ' ' + -n.cy + ')')
      })
      g.sparks.forEach((c, k) => {
        if (sx < 0 || sx > 1) { c.style.opacity = 0; return }
        const [x1, y1, x2, y2] = g.links[k].xy, q = easeIO(sx)
        c.setAttribute('cx', x1 + (x2 - x1) * q); c.setAttribute('cy', y1 + (y2 - y1) * q)
        c.style.opacity = Math.sin(Math.PI * sx)
      })
      add(g.el, 'translateY(' + 7 * Math.sin((w * 6.283) / 7) + 'px)')
      if (g.glow) { g.glow.style.opacity = ck * (0.75 + 0.25 * Math.sin((w * 6.283) / 5)); add(g.glow, 'scale(' + (1 + 0.05 * Math.sin((w * 6.283) / 5)) + ')') }
    }
    for (const [el, x] of pre) add(el, '') // элементы только с положением в пространстве
    for (const [el, parts] of tf) el.style.transform = ((pre.get(el) ?? '') + ' ' + parts.join(' ')).trim()
    for (const e of s.els) if (!tf.has(e.el)) e.el.style.transform = ''
  })
}
</script></body></html>`
writeFileSync(join(MEDIA, 'page.html'), page)

// ─── съёмка ────────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--hide-scrollbars'] })
const tab = await browser.newPage()
await tab.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
tab.on('console', (m) => console.log('  [page]', m.text()))
await tab.goto(`file://${join(MEDIA, 'page.html')}`, { waitUntil: 'networkidle0' })
await tab.evaluate(() => document.fonts.ready)
const iv = await tab.evaluate((pl, s3) => window.__init(pl, s3), plan.map(({ id, start, trans, magic, zoom, depth, end, beats }) => ({ id, start, trans, magic, zoom, depth, s3d: SCENE3D.has(id), end, beats: beats.map(({ start, dur, steps }) => ({ start, dur, steps })) })), s3dSlides)
const cdp = await tab.createCDPSession()
const shot = async (file) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: file.endsWith('.png') ? 'png' : 'jpeg', quality: file.endsWith('.png') ? undefined : 88, optimizeForSpeed: true })
  writeFileSync(file, Buffer.from(data, 'base64'))
}

// --shots=12.5,40 — PNG кадров на эти моменты (с от начала плана) → media/overview/shots/, без видео
if (SHOTS) {
  const dir = join(MEDIA, 'shots')
  mkdirSync(dir, { recursive: true })
  for (const x of SHOTS) { await tab.evaluate((y) => window.__seek(y), x); await shot(join(dir, `t${x.toFixed(2)}.png`)) }
  await browser.close()
  console.log(`✓ shots → ${dir}`)
  process.exit(0)
}
if (STILLS) {
  const dir = join(MEDIA, 'stills')
  mkdirSync(dir, { recursive: true })
  for (const p of plan) { await tab.evaluate((x) => window.__seek(x), p.end - 0.05); await shot(join(dir, `${p.id}.png`)) }
  await browser.close()
  console.log(`✓ stills → ${dir}`)
  process.exit(0)
}

rmSync(join(MEDIA, 'frames'), { recursive: true, force: true })
mkdirSync(join(MEDIA, 'frames'))
const busy = (x) => iv.some(([a, b]) => x >= a - 1e-6 && x <= b + 1 / FPS)
const N = Math.ceil(TOTAL * FPS)
const list = []
let wasBusy = true
for (let f = 0; f < N; f++) {
  const x = f / FPS
  const b = busy(x)
  if (f === 0 || b || wasBusy) {
    const file = join(MEDIA, 'frames', `f${String(list.length).padStart(6, '0')}.jpg`)
    await tab.evaluate((y) => window.__seek(y), x)
    await shot(file)
    list.push({ file, dur: 1 / FPS })
  } else list[list.length - 1].dur += 1 / FPS
  wasBusy = b
  if (f % (FPS * 30) === 0) process.stdout.write(`\r  кадры: ${(x / 60).toFixed(1)} / ${(TOTAL / 60).toFixed(1)} мин, снято ${list.length}`)
}
await browser.close()
console.log(`\n  снято кадров: ${list.length} из ${N}`)
writeFileSync(join(MEDIA, 'frames.txt'), list.map((l) => `file '${l.file}'\nduration ${l.dur.toFixed(5)}`).join('\n') + `\nfile '${list.at(-1).file}'\n`)

// ─── звук: куски озвучки + тишина между ними ──────────────────────────────
const silence = (d) => {
  const f = join(MEDIA, 'tts', `sil44_${Math.round(d * 1000)}.wav`)
  if (!existsSync(f)) sh('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', d.toFixed(3), '-c:a', 'pcm_s16le', f])
  return f
}
const audio = []
let cur = 0
for (const sg of segs) {
  if (sg.start - cur > 0.001) audio.push(silence(sg.start - cur))
  audio.push(sg.file)
  cur = sg.start + probe(sg.file)
}
if (TOTAL - cur > 0.001) audio.push(silence(TOTAL - cur))
writeFileSync(join(MEDIA, 'audio.txt'), audio.map((f) => `file '${f}'`).join('\n') + '\n')
sh('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(MEDIA, 'audio.txt'), '-c:a', 'pcm_s16le', join(MEDIA, 'audio.wav')])

// ─── сборка ────────────────────────────────────────────────────────────────
const out = join(MEDIA, ONLY ? `overview-draft-${ONLY.join('_')}.mp4` : 'overview-draft.mp4')
sh('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(MEDIA, 'frames.txt'), '-i', join(MEDIA, 'audio.wav'),
  '-vf', `fps=${FPS},scale=in_range=full:out_range=tv,format=yuv420p`, '-color_range', 'tv', '-movflags', '+faststart', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-b:a', '128k', '-shortest', out])
rmSync(join(MEDIA, 'frames'), { recursive: true, force: true }) // временные кадры (~600 МБ) больше не нужны
// главы для описания YouTube
const chapters = plan.map((p) => `${new Date(p.start * 1000).toISOString().slice(11, 19)} ${p.id}`).join('\n')
writeFileSync(join(MEDIA, 'chapters.txt'), chapters + '\n')
console.log(`✓ ${out} (${(TOTAL / 60).toFixed(1)} мин)`)
