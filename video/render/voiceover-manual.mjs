// Озвучка вручную через сайт (модель без API, напр. Fish Audio Drama 3; лимит поля — 500 символов).
//
//   node voiceover-manual.mjs              # тексты для вставки → video/media/voiceover/drama/SCRIPT.md
//   node voiceover-manual.mjs --only=why   # только выбранные слайды
//   …озвучить каждый кусок на сайте, сохранить в video/media/voiceover/drama/ под именем из SCRIPT.md
//      (03-why-1.mp3, 03-why-2.mp3, …; годятся mp3/wav/m4a)…
//   node voiceover-manual.mjs --assemble   # склеить куски → video/media/voiceover/overview/NN-<id>.mp3 (+ .json)
//   node render.mjs                        # собрать видео
//
// Текст для диктора: английские термины пишутся по-английски отдельными словами (useApiQuery → use API Query) —
// так модель читает их правильно; исключения — pronounce.drama.json. Сценарий и слайды не меняются.
// Кусок = несколько целых фраз диктора, поэтому начало куска — точная граница фразы; границы фраз внутри куска
// ставятся по доле текста (--assemble пишет их в NN-<id>.json, рендер берёт оттуда).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dramaSpeech as forSpeech } from './drama-text.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const DECK = join(here, '..', 'decks', 'overview')
const SRC = join(here, '..', 'media', 'voiceover', 'drama')
const OUT = join(here, '..', 'media', 'voiceover', 'overview')
const LIMIT = 480 // символов в куске (поле на сайте — 500)
const GAP = 0.3 // пауза между кусками при склейке, с
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}`))?.split('=')[1] ?? (process.argv.includes(`--${k}`) ? true : undefined)
const ONLY = arg('only')?.split(',')

const timeline = JSON.parse(readFileSync(join(DECK, 'timeline.json'), 'utf8'))
const NUM = Object.fromEntries(timeline.map((s, i) => [s.id, String(i + 1).padStart(2, '0')]))
const slides = ONLY ? timeline.filter((s) => ONLY.includes(s.id)) : timeline
// куски слайда: подряд идущие фразы, пока влезают в лимит
const chunksOf = (s) => {
  const out = []
  for (const b of s.beats) {
    const text = forSpeech(b.text)
    const last = out.at(-1)
    if (last && last.text.length + 1 + text.length <= LIMIT) { last.text += ' ' + text; last.beats.push(text.length) }
    else out.push({ text, beats: [text.length] })
  }
  return out
}
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim()
const probe = (f) => Number(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))
const find = (base) => ['mp3', 'wav', 'm4a', 'ogg', 'flac'].map((e) => join(SRC, `${base}.${e}`)).find(existsSync)

mkdirSync(SRC, { recursive: true })
if (!arg('assemble')) {
  let md = '# Тексты для озвучки вручную\n\nКаждый блок — один запрос на сайте. Готовый звук сохранить в эту же папку под указанным именем.\n'
  let n = 0, chars = 0
  for (const s of slides) {
    const cs = chunksOf(s)
    md += `\n## ${NUM[s.id]} · ${s.id}\n`
    cs.forEach((c, i) => { md += `\n**${NUM[s.id]}-${s.id}-${i + 1}.mp3** · ${c.text.length} символов\n\n\`\`\`\n${c.text}\n\`\`\`\n`; n++; chars += c.text.length })
  }
  writeFileSync(join(SRC, 'SCRIPT.md'), md)
  console.log(`✓ ${join(SRC, 'SCRIPT.md')}: ${slides.length} слайдов, ${n} кусков, ${chars} символов`)
} else {
  mkdirSync(OUT, { recursive: true })
  let done = 0
  for (const s of slides) {
    const base = `${NUM[s.id]}-${s.id}`
    const cs = chunksOf(s)
    const files = cs.map((_, i) => find(`${base}-${i + 1}`))
    const have = files.filter(Boolean).length
    if (!have) continue
    if (have < cs.length) { console.log(`· ${base}: есть ${have} из ${cs.length} кусков — пропущен`); continue }
    const out = join(OUT, `${base}.mp3`)
    const filter = files.map((_, i) => `[${i}:a]aresample=44100,apad=pad_dur=${i < files.length - 1 ? GAP : 0}[a${i}]`).join(';') +
      ';' + files.map((_, i) => `[a${i}]`).join('') + `concat=n=${files.length}:v=0:a=1[o]`
    sh('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap((f) => ['-i', f]), '-filter_complex', filter, '-map', '[o]', '-b:a', '192k', out])
    // начала фраз: кусок начинается точно, внутри куска — по доле текста
    const cuts = []
    let t0 = 0
    cs.forEach((c, i) => {
      const d = probe(files[i]), total = c.beats.reduce((a, b) => a + b, 0)
      let acc = 0
      for (const len of c.beats) { cuts.push(+(t0 + (d * acc) / total).toFixed(3)); acc += len }
      t0 += d + (i < cs.length - 1 ? GAP : 0)
    })
    const textHash = createHash('sha1').update(s.beats.map((b) => b.text).join('\n')).digest('hex').slice(0, 12)
    writeFileSync(join(OUT, `${base}.json`), JSON.stringify({ textHash, cuts, mode: 'manual', chunks: cs.length }, null, 1) + '\n')
    console.log(`→ ${base}: ${cs.length} кусков, ${probe(out).toFixed(1)} с`)
    done++
  }
  console.log(`✓ собрано слайдов: ${done} из ${slides.length} → ${OUT}`)
}
