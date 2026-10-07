// Собирает локальный просмотр деки: decks/<name>/preview.html из project/deck.json + project/slides/*.html.
// Запуск из корня репо: node video/decks/build-preview.mjs size-comparison
// Это приближённый просмотр (x-icon / x-shape / анимации не рендерятся) — для чтения текста и заметок.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const name = process.argv[2]
if (!name) {
  console.error('usage: node video/decks/build-preview.mjs <deck-folder>')
  process.exit(1)
}
const root = join(dirname(fileURLToPath(import.meta.url)), name, 'project')
const deck = JSON.parse(readFileSync(join(root, 'deck.json'), 'utf8'))

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fonts = Object.values(deck.faces ?? {})
  .filter((f) => f.href)
  .map((f) => `<link rel="stylesheet" href="${f.href}">`)
  .join('\n')

const slides = deck.order.map((id, i) => {
  const file = join(root, 'slides', `${id}.html`)
  if (!existsSync(file)) return `<p class="missing">${id}: файла нет</p>`
  const html = readFileSync(file, 'utf8')
  const notes = html.match(/<aside>([\s\S]*?)<\/aside>/)?.[1] ?? ''
  const section = html.replace(/<aside>[\s\S]*?<\/aside>/, '')
  return `<article id="${id}">
  <h2>${i + 1}. ${id}</h2>
  <div class="frame"><div class="canvas">${section}</div></div>
  <p class="notes">🎙 ${escape(notes.trim())}</p>
</article>`
})

const out = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(deck.title)}</title>
${fonts}
<style>
  body { margin: 0; padding: 24px; background: #141413; color: #ececec; font-family: Inter, sans-serif; }
  article { max-width: 960px; margin: 0 auto 48px; }
  h2 { font-size: 16px; color: #a9a69f; font-weight: 600; }
  .frame { width: 960px; height: 540px; overflow: hidden; position: relative; border-radius: 8px; }
  .canvas { width: 1920px; height: 1080px; transform: scale(0.5); transform-origin: 0 0; }
  .canvas > section { width: 1920px; height: 1080px; box-sizing: border-box; position: relative; }
  .canvas * { margin: 0; box-sizing: border-box; }
  .notes { font-size: 15px; line-height: 1.5; color: #d6d3cc; white-space: pre-wrap; }
  .missing { color: #f97316; }
</style></head>
<body>
<h1 style="max-width:960px;margin:0 auto 32px">${escape(deck.title)}</h1>
${slides.join('\n')}
</body></html>
`
writeFileSync(join(root, '..', 'preview.html'), out)
console.log(`✓ ${join(name, 'preview.html')} — ${deck.order.length} слайдов`)
