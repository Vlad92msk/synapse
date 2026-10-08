// Озвучка ролика 1 через Fish.audio → video/media/voiceover/overview/NN-<id>.mp3 (+ NN-<id>.json с границами фраз).
//
//   1. video/render/.env (в git не попадает):
//        FISH_API_KEY=...            # fish.audio → API Keys
//        FISH_VOICE_ID=...           # id голоса (страница голоса → reference_id / model id)
//        FISH_MODEL=s2.1-pro         # необязательно: s1 | s2-pro | s2.1-pro
//        FISH_SPEED=1                # необязательно: темп 0.5–2.0
//   2. node voiceover-fish.mjs --dry           # сколько фраз и символов уйдёт в API, без запросов
//      node voiceover-fish.mjs                 # озвучить всё, что ещё не озвучено
//      node voiceover-fish.mjs --only=cover,why --force   # переозвучить выбранные слайды
//   3. node render.mjs                         # собрать видео с этой озвучкой
//
// Режимы:
//   по умолчанию (--mode=slide) — весь текст слайда одним запросом: естественные паузы и интонация.
//     Где начинается каждая фраза, узнаём распознаванием речи Fish (/v1/asr, таймкоды слов, ~$0.36/час)
//     и сопоставлением распознанных слов с текстом. Границы пишутся в NN-<id>.json — рендер берёт их оттуда.
//   --mode=phrase — каждая фраза отдельным запросом, склейка с паузой PAUSE (точно, но звучит рвано).
// Произношение: video/render/pronounce.json — { "synapse-storage": "синапс-сторадж" } — меняет текст только для озвучки.
// Клипы кэшируются по тексту+голосу: правка одной фразы переозвучивает только её.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dramaSpeech } from './drama-text.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const DECK = join(here, '..', 'decks', 'overview')
const OUT = join(here, '..', 'media', 'voiceover', 'overview')
const CACHE = join(here, '..', 'media', 'voiceover', 'cache')
const PAUSE = 0.5
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}`))?.split('=')[1] ?? (process.argv.includes(`--${k}`) ? true : undefined)
const ONLY = arg('only')?.split(',')
const FORCE = !!arg('force')
const DRY = !!arg('dry')
const MODE = arg('mode') ?? 'slide'

// .env без зависимостей
const envFile = join(here, '.env')
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const { FISH_API_KEY: KEY, FISH_VOICE_ID: VOICE, FISH_MODEL: MODEL = 's2.1-pro', FISH_SPEED: SPEED = '1' } = process.env
if (!DRY && (!KEY || !VOICE)) {
  console.error('Нет FISH_API_KEY или FISH_VOICE_ID — заполни video/render/.env (см. шапку файла).')
  process.exit(1)
}

const pronounce = existsSync(join(here, 'pronounce.json')) ? JSON.parse(readFileSync(join(here, 'pronounce.json'), 'utf8')) : {}
// замены целыми «словами» (буквы/цифры/._-/$ вокруг не трогаем), длинные ключи — первыми
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const dict = Object.entries(pronounce).sort((a, b) => b[0].length - a[0].length)
  .map(([a, b]) => [new RegExp(`(?<![\\w.$/-])${esc(a)}(?![\\w$/-]|\\.\\w)`, 'g'), b])
// модели Drama (drama-3-preview): термины по-английски отдельными словами, без нормализации текста на стороне Fish —
// так результат ближе всего к сайту; остальные модели — словарь pronounce.json
const DRAMA = /^drama/.test(MODEL)
const forSpeech = DRAMA ? dramaSpeech : (t) => dict.reduce((s, [re, b]) => s.replace(re, b), t).replace(/[«»„“]/g, '"')
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim()
const probe = (f) => Number(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))

const timeline = JSON.parse(readFileSync(join(DECK, 'timeline.json'), 'utf8'))
const NUM = Object.fromEntries(timeline.map((s, i) => [s.id, String(i + 1).padStart(2, '0')]))
const slides = ONLY ? timeline.filter((s) => ONLY.includes(s.id)) : timeline
mkdirSync(OUT, { recursive: true })
mkdirSync(CACHE, { recursive: true })

async function synth(text, raw = false) {
  const speech = raw ? text : forSpeech(text)
  const h = createHash('sha1').update([MODEL, VOICE, SPEED, speech].join('\n')).digest('hex').slice(0, 16)
  const f = join(CACHE, `${h}.mp3`)
  if (existsSync(f)) return f
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', model: MODEL },
      body: JSON.stringify({ text: speech, reference_id: VOICE, format: 'mp3', mp3_bitrate: 192, normalize: !DRAMA, prosody: { speed: Number(SPEED) } }),
    })
    if (res.ok) { writeFileSync(f, Buffer.from(await res.arrayBuffer())); return f }
    const body = await res.text().catch(() => '')
    if (res.status === 401) throw new Error('401: неверный FISH_API_KEY')
    if (res.status === 402) throw new Error('402: на счёте Fish.audio закончились кредиты')
    if (attempt >= 4) throw new Error(`Fish.audio ${res.status}: ${body.slice(0, 200)}`)
    await new Promise((r) => setTimeout(r, 2000 * attempt)) // 429/503 — подождать и повторить
  }
}

// ─── распознавание и выравнивание ─────────────────────────────────────────
async function asr(file) {
  const buf = readFileSync(file)
  const h = createHash('sha1').update(buf).digest('hex').slice(0, 16)
  const f = join(CACHE, `asr_${h}.json`)
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'))
  const form = new FormData()
  form.append('audio', new Blob([buf], { type: 'audio/mpeg' }), 'audio.mp3')
  form.append('language', 'ru')
  form.append('ignore_timestamps', 'false')
  const res = await fetch('https://api.fish.audio/v1/asr', { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form })
  if (!res.ok) throw new Error(`ASR ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  writeFileSync(f, JSON.stringify(json))
  return json
}
const words = (t) => t.toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter(Boolean)
const bigrams = (w) => { const r = new Set(); for (let i = 0; i < w.length - 1; i++) r.add(w.slice(i, i + 2)); return r }
const sim = (a, b) => {
  if (a === b) return 1
  const A = bigrams(a), B = bigrams(b)
  if (!A.size || !B.size) return 0
  let n = 0
  for (const x of A) if (B.has(x)) n++
  return (2 * n) / (A.size + B.size)
}
// Needleman–Wunsch: слова текста (с номером фразы) ↔ распознанные слова (с временем)
function align(script, heard) {
  const n = script.length, m = heard.length, G = -0.4
  const D = Array.from({ length: n + 1 }, (_, i) => Float64Array.from({ length: m + 1 }, (_, j) => (i + j) * G))
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const s = sim(script[i - 1].w, heard[j - 1].w)
    D[i][j] = Math.max(D[i - 1][j - 1] + (s >= 0.45 ? s : -0.6), D[i - 1][j] + G, D[i][j - 1] + G)
  }
  const match = new Array(n).fill(-1)
  let i = n, j = m
  while (i > 0 && j > 0) {
    const s = sim(script[i - 1].w, heard[j - 1].w)
    if (D[i][j] === D[i - 1][j - 1] + (s >= 0.45 ? s : -0.6)) { if (s >= 0.45) match[i - 1] = j - 1; i--; j-- }
    else if (D[i][j] === D[i - 1][j] + G) i--
    else j--
  }
  return match
}
// начало каждой фразы в аудио: середина паузы перед её первым узнанным словом
function cutsFromAsr(beatsSpeech, seg, dur) {
  const heard = []
  for (const sg of seg) {
    const ws = words(sg.text)
    ws.forEach((w, k) => heard.push({ w, start: sg.start + ((sg.end - sg.start) * k) / ws.length, end: sg.start + ((sg.end - sg.start) * (k + 1)) / ws.length }))
  }
  const script = beatsSpeech.flatMap((t, b) => words(t).map((w) => ({ w, b })))
  const match = align(script, heard)
  const matched = match.filter((x) => x >= 0).length / script.length
  const cuts = [0]
  for (let b = 1; b < beatsSpeech.length; b++) {
    const first = script.findIndex((x, i) => x.b === b && match[i] >= 0)
    if (first < 0) { cuts.push(null); continue }
    const h = match[first]
    const prevEnd = h > 0 ? heard[h - 1].end : 0
    cuts.push(Math.max(cuts.filter((c) => c != null).at(-1) + 0.2, (prevEnd + heard[h].start) / 2))
  }
  // фразы без узнанных слов — между соседями пропорционально длине текста
  for (let b = 1; b < cuts.length; b++) if (cuts[b] == null) {
    let e = b
    while (e < cuts.length && cuts[e] == null) e++
    const a = cuts[b - 1], z = e < cuts.length ? cuts[e] : dur
    for (let k = b; k < e; k++) cuts[k] = a + ((z - a) * (k - b + 1)) / (e - b + 1)
  }
  return { cuts: cuts.map((c) => +c.toFixed(3)), matched }
}

const silence = join(CACHE, `pause_${PAUSE}.mp3`)
if (!DRY && !existsSync(silence)) sh('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(PAUSE), '-c:a', 'libmp3lame', '-b:a', '192k', silence])

let chars = 0, phrases = 0, asrWarned = false
for (const s of slides) {
  const name = `${NUM[s.id]}-${s.id}`
  const textHash = createHash('sha1').update(s.beats.map((b) => b.text).join('\n')).digest('hex').slice(0, 12)
  const meta = join(OUT, `${name}.json`)
  if (!FORCE && existsSync(meta) && JSON.parse(readFileSync(meta, 'utf8')).textHash === textHash && existsSync(join(OUT, `${name}.mp3`))) {
    console.log(`= ${name} — уже озвучен`)
    continue
  }
  chars += s.beats.reduce((n, b) => n + forSpeech(b.text).length, 0)
  phrases += s.beats.length
  if (DRY) { console.log(`· ${name}: ${s.beats.length} фраз`); continue }
  process.stdout.write(`→ ${name}: `)
  if (MODE === 'slide') {
    const speechBeats = s.beats.map((b) => forSpeech(b.text))
    const clip = await synth(speechBeats.join(' '), true)
    const out = join(OUT, `${name}.mp3`)
    sh('ffmpeg', ['-v', 'error', '-y', '-i', clip, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', out])
    const dur = probe(out)
    let cuts = null, matched = null
    try {
      const { segments = [] } = await asr(out)
      ;({ cuts, matched } = cutsFromAsr(speechBeats, segments, dur))
    } catch (e) {
      // нет API-баланса на распознавание и т.п. — границы найдёт рендер по паузам
      if (!asrWarned) { console.log(`\n  ⚠ распознавание недоступно (${e.message.slice(0, 60)}…) — границы фраз рендер найдёт по паузам`); asrWarned = true }
    }
    writeFileSync(meta, JSON.stringify({ textHash, cuts, voice: VOICE, model: MODEL, mode: 'slide', matched: matched == null ? null : +matched.toFixed(2) }, null, 1) + '\n')
    console.log(matched == null ? `${dur.toFixed(1)} с` : `${dur.toFixed(1)} с, узнано ${(matched * 100).toFixed(0)}% слов${matched < 0.7 ? '  ⚠ проверь синхронизацию' : ''}`)
    continue
  }
  const clips = []
  for (const b of s.beats) { clips.push(await synth(b.text)); process.stdout.write('.') }
  // склейка: фраза, пауза, фраза… ; границы фраз — для рендера
  const cuts = []
  let at = 0
  const list = []
  clips.forEach((c, i) => {
    if (i > 0) { list.push(silence); at += PAUSE }
    cuts.push(+at.toFixed(3))
    list.push(c)
    at += probe(c)
  })
  const listFile = join(CACHE, `${name}.txt`)
  writeFileSync(listFile, list.map((f) => `file '${f}'`).join('\n') + '\n')
  sh('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', join(OUT, `${name}.mp3`)])
  writeFileSync(meta, JSON.stringify({ textHash, cuts, voice: VOICE, model: MODEL }, null, 1) + '\n')
  console.log(` ${at.toFixed(1)} с`)
}
console.log(DRY ? `\nК озвучке: ${phrases} фраз, ${chars} символов (модель ${MODEL})` : `\n✓ ${OUT}`)
