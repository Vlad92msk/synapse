// Снимки превью сцены в PNG без рендера видео: node tools/snap.mjs 5 12.5 40 … → shots/t<сек>.png
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const puppeteer = (await import(createRequire(join(here, '../../render/x.js')).resolve('puppeteer-core'))).default
const out = join(here, '..', 'shots'); mkdirSync(out, { recursive: true })
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--allow-file-access-from-files', '--hide-scrollbars'] })
const p = await b.newPage()
await p.setViewport({ width: 1920, height: 1120 })
p.on('console', (m) => console.log('[page]', m.text())); p.on('pageerror', (e) => console.log('[err]', e.message))
await p.goto('file://' + join(here, '..', 'preview.html'), { waitUntil: 'networkidle0' })
await p.evaluate(() => document.fonts.ready)
for (const t of process.argv.slice(2)) {
  const ms = await p.evaluate((t) => { const a = performance.now(); document.getElementById('t').value = t; document.getElementById('t').oninput(); return performance.now() - a }, Number(t))
  await p.screenshot({ path: join(out, `t${t}.png`), clip: { x: 0, y: 0, width: 1920, height: 1080 } })
  console.log(`t=${t} seek ${ms.toFixed(0)} ms`)
}
await b.close()
