#!/usr/bin/env node
/**
 * Замер веса synapse-storage по сценариям использования + сравнение с конкурентами.
 *
 * Как работает:
 *  1. Копирует собранный пакет (packages/synapse/{package.json,dist}) в node_modules/synapse-storage —
 *     ровно то, что получает потребитель из npm (нужен свежий `yarn build` в packages/synapse).
 *  2. Для каждого сценария генерирует entry «код потребителя» (scenarios.mjs) и собирает его в
 *     production-режиме. react/react-dom — external, rxjs считается.
 *  3. Меряет min / gzip(9) / brotli(11), вычитая «пустой» бандл (рантайм самого бандлера).
 *  4. База для сравнения — опубликованная на npm версия (по умолчанию `latest`), меряется тем же способом
 *     и кэшируется в .cache/. Конкуренты меняются редко — их результаты лежат в competitors.json
 *     (обновляются режимом --full).
 *
 * Режимы:
 *   (по умолчанию)  быстрый: только synapse, только rolldown (= Vite 7+) → таблица в консоль (секунды)
 *   --full          все сценарии × esbuild/rollup/rolldown/webpack → results/report.md, results.json,
 *                   обновляет competitors.json (~2 мин)
 *   --baseline=X    сравнивать с synapse-storage@X вместо latest; --baseline=none — без сравнения
 *   --only=a,b      только перечисленные сценарии
 *   --postbuild     режим хука после сборки: любые ошибки не валят сборку (exit 0)
 */
import { build as esbuild } from 'esbuild'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import { rolldown } from 'rolldown'
import { rollup } from 'rollup'
import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import replace from '@rollup/plugin-replace'
import terser from '@rollup/plugin-terser'
import webpack from 'webpack'
import TerserPlugin from 'terser-webpack-plugin'

import { competitors, ladder, synapse, toEntrySource } from './scenarios.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const libDir = path.resolve(here, '../../packages/synapse')
const nm = path.join(here, 'node_modules')
const tmp = path.join(here, '.tmp')
const cacheDir = path.join(here, '.cache')
const outDir = path.join(here, 'results')
const competitorsFile = path.join(here, 'competitors.json')

const REACT_EXTERNALS = ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client']
const isReact = (id) => REACT_EXTERNALS.includes(id)

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const flag = (name) => process.argv.includes(`--${name}`)
const FULL = flag('full')
const POSTBUILD = flag('postbuild')
const only = arg('only')?.split(',')
const baselineArg = arg('baseline') ?? 'latest'

// ─── подготовка пакетов ─────────────────────────────────────────────────────

/** Кладёт пакет в node_modules/<name> (dist без .map/.d.ts + package.json). */
function installPackage(name, srcDir) {
  const target = path.join(nm, name)
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(target, { recursive: true })
  fs.cpSync(path.join(srcDir, 'dist'), path.join(target, 'dist'), {
    recursive: true,
    filter: (src) => !src.endsWith('.map') && !src.endsWith('.d.ts'),
  })
  const pkg = JSON.parse(fs.readFileSync(path.join(srcDir, 'package.json'), 'utf8'))
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify(pkg, null, 2))
  return pkg
}

/** Скачивает synapse-storage@version из npm (кэш .cache/pkg-<version>). */
function fetchPublished(version) {
  const resolved = execFileSync('npm', ['view', `synapse-storage@${version}`, 'version'], { encoding: 'utf8' }).trim().split('\n').pop()
  const dir = path.join(cacheDir, `pkg-${resolved}`)
  if (!fs.existsSync(path.join(dir, 'package.json'))) {
    fs.mkdirSync(cacheDir, { recursive: true })
    const tgz = execFileSync('npm', ['pack', `synapse-storage@${resolved}`, '--silent', '--pack-destination', cacheDir], { encoding: 'utf8' }).trim().split('\n').pop()
    fs.mkdirSync(dir, { recursive: true })
    execFileSync('tar', ['-xzf', path.join(cacheDir, tgz), '-C', dir, '--strip-components=1'])
    fs.rmSync(path.join(cacheDir, tgz))
  }
  return { version: resolved, dir }
}

// ─── бандлеры ───────────────────────────────────────────────────────────────

const DEFINE = { 'process.env.NODE_ENV': '"production"' }

async function bundleEsbuild(entry, { rxExternal = false } = {}) {
  const res = await esbuild({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    metafile: true,
    logLevel: 'silent',
    define: DEFINE,
    external: [...REACT_EXTERNALS, ...(rxExternal ? ['rxjs', 'rxjs/*'] : [])],
    absWorkingDir: here,
    nodePaths: [nm],
  })
  return { code: res.outputFiles[0].text, meta: res.metafile }
}

async function bundleRollup(entry) {
  const bundle = await rollup({
    input: entry,
    external: (id) => isReact(id),
    onwarn: () => {},
    plugins: [
      replace({ preventAssignment: true, values: DEFINE }),
      nodeResolve({ browser: true, rootDir: here, modulePaths: [nm] }),
      commonjs(),
      terser({ compress: { passes: 2 }, format: { comments: false } }),
    ],
  })
  const { output } = await bundle.generate({ format: 'esm' })
  await bundle.close()
  return { code: output[0].code }
}

async function bundleRolldown(entry) {
  const bundle = await rolldown({
    input: entry,
    cwd: here,
    platform: 'browser',
    external: REACT_EXTERNALS,
    logLevel: 'silent',
    transform: { define: DEFINE },
    resolve: { modules: [nm, 'node_modules'] },
  })
  const { output } = await bundle.generate({ format: 'esm', minify: true })
  await bundle.close()
  return { code: output[0].code }
}

function bundleWebpack(entry) {
  const outPath = path.join(tmp, 'wp-' + path.basename(entry, '.mjs'))
  return new Promise((resolve, reject) => {
    webpack(
      {
        mode: 'production',
        entry,
        context: here,
        target: ['web', 'es2022'],
        devtool: false,
        output: { path: outPath, filename: 'out.js', module: true, chunkFormat: 'module' },
        experiments: { outputModule: true },
        externalsType: 'module',
        externals: Object.fromEntries(REACT_EXTERNALS.map((r) => [r, r])),
        resolve: { modules: [nm, 'node_modules'] },
        performance: false,
        // entry — .mjs: без этого webpack требует расширения в импортах подпутей CJS-пакетов (redux-persist/es/storage)
        module: { rules: [{ test: /\.m?js$/, resolve: { fullySpecified: false } }] },
        optimization: {
          minimizer: [new TerserPlugin({ extractComments: false, terserOptions: { compress: { passes: 2 }, format: { comments: false } } })],
        },
      },
      (err, stats) => {
        if (err) return reject(err)
        if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })))
        resolve({ code: fs.readFileSync(path.join(outPath, 'out.js'), 'utf8') })
      },
    )
  })
}

// ─── метрики ────────────────────────────────────────────────────────────────

const sizes = (code) => {
  const buf = Buffer.from(code)
  return {
    min: buf.length,
    gzip: zlib.gzipSync(buf, { level: 9 }).length,
    brotli: zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  }
}
const minus = (a, b) => ({ min: a.min - b.min, gzip: Math.max(0, a.gzip - b.gzip), brotli: Math.max(0, a.brotli - b.brotli) })

/** Вклад пакетов в бандл (по esbuild metafile, байты минифицированного выхода, до сжатия). */
function packageBreakdown(meta) {
  const out = Object.values(meta.outputs)[0]
  const byPkg = {}
  const byFile = []
  for (const [file, { bytesInOutput }] of Object.entries(out.inputs)) {
    if (!bytesInOutput) continue
    const m = file.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\/(.*)$/)
    const pkg = m ? m[1] : '(entry)'
    byPkg[pkg] = (byPkg[pkg] || 0) + bytesInOutput
    if (pkg === 'synapse-storage') byFile.push({ file: m[2].replace(/^dist\//, ''), bytes: bytesInOutput })
  }
  byFile.sort((a, b) => b.bytes - a.bytes)
  return { byPkg, byFile }
}

// ─── прогон ─────────────────────────────────────────────────────────────────

/** Пишет entry сценария; `rename` подменяет имя пакета (для замера опубликованной версии). */
function writeEntry(sc, rename) {
  let imports = sc.imports
  if (rename) imports = Object.fromEntries(Object.entries(imports).map(([k, v]) => [k.replace(/^synapse-storage/, rename), v]))
  const file = path.join(tmp, `${sc.id}${rename ? '-base' : ''}.mjs`)
  fs.writeFileSync(file, toEntrySource(imports))
  return file
}

async function measureFull(entry, base, { withRxExternal }) {
  const eb = await bundleEsbuild(entry)
  const r = {
    esbuild: minus(sizes(eb.code), base.esbuild),
    rollup: minus(sizes((await bundleRollup(entry)).code), base.rollup),
    rolldown: minus(sizes((await bundleRolldown(entry)).code), base.rolldown),
    webpack: minus(sizes((await bundleWebpack(entry)).code), base.webpack),
    breakdown: packageBreakdown(eb.meta),
  }
  if (withRxExternal) r.esbuildNoRx = minus(sizes((await bundleEsbuild(entry, { rxExternal: true })).code), base.esbuild)
  return r
}

const measureQuick = async (entry, base) => ({ rolldown: minus(sizes((await bundleRolldown(entry)).code), base.rolldown) })

const meta = (sc) => ({ id: sc.id, group: sc.group, label: sc.label, imports: sc.imports })

async function main() {
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(tmp, { recursive: true })

  const pkg = installPackage('synapse-storage', libDir)

  const emptyEntry = path.join(tmp, '__empty.mjs')
  fs.writeFileSync(emptyEntry, 'globalThis.__keep = []\n')
  const base = { rolldown: sizes((await bundleRolldown(emptyEntry)).code) }
  if (FULL) {
    base.esbuild = sizes((await bundleEsbuild(emptyEntry)).code)
    base.rollup = sizes((await bundleRollup(emptyEntry)).code)
    base.webpack = sizes((await bundleWebpack(emptyEntry)).code)
  }

  const pick = (list) => (only ? list.filter((x) => only.includes(x.id)) : list)
  const synList = pick(synapse)

  // Опубликованная версия для сравнения (сбой сети/npm — не фатален: просто без сравнения)
  let baseline = null
  if (baselineArg !== 'none') {
    try {
      const pub = fetchPublished(baselineArg)
      installPackage('synapse-storage-published', pub.dir)
      const cacheFile = path.join(cacheDir, `rolldown-${pub.version}.json`)
      const cached = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {}
      // Ключ — id + набор импортов: правка сценария не должна брать устаревшую цифру из кэша.
      const cacheKey = (sc) => `${sc.id}:${JSON.stringify(sc.imports)}`
      for (const sc of synList) {
        const key = cacheKey(sc)
        if (!cached[key]) cached[key] = (await measureQuick(writeEntry(sc, 'synapse-storage-published'), base)).rolldown
      }
      fs.writeFileSync(cacheFile, JSON.stringify(cached, null, 2))
      baseline = { version: pub.version, sizes: Object.fromEntries(synList.map((sc) => [sc.id, cached[cacheKey(sc)]])) }
    } catch (e) {
      console.warn(`⚠ не удалось получить synapse-storage@${baselineArg} из npm — сравнение пропущено (${e.message.split('\n')[0]})`)
    }
  }

  const results = { date: new Date().toISOString(), synapseVersion: pkg.version, baselineVersion: baseline?.version ?? null, versions: {}, synapse: [], competitors: [] }
  for (const sc of synList) {
    if (FULL) process.stdout.write(`· ${sc.id}\n`)
    const m = FULL ? await measureFull(writeEntry(sc), base, { withRxExternal: true }) : await measureQuick(writeEntry(sc), base)
    results.synapse.push({ ...meta(sc), ...m, baseline: baseline?.sizes[sc.id] ?? null })
  }

  if (FULL) {
    for (const sc of pick(competitors)) {
      process.stdout.write(`· ${sc.id}\n`)
      try {
        results.competitors.push({ ...meta(sc), ...(await measureFull(writeEntry(sc), base, { withRxExternal: false })) })
      } catch (e) {
        console.error(`  ✗ ${sc.id}: ${e.message.split('\n').slice(0, 3).join(' ')}`)
      }
    }
    for (const name of fs.readdirSync(nm).flatMap((d) => (d.startsWith('@') ? fs.readdirSync(path.join(nm, d)).map((x) => `${d}/${x}`) : [d]))) {
      const p = path.join(nm, name, 'package.json')
      if (fs.existsSync(p) && !name.startsWith('synapse-storage')) results.versions[name] = JSON.parse(fs.readFileSync(p, 'utf8')).version
    }
    if (!only) {
      // eslint-disable-next-line no-unused-vars
      const comp = { date: results.date, versions: results.versions, competitors: results.competitors.map(({ breakdown, ...rest }) => rest) }
      fs.writeFileSync(competitorsFile, JSON.stringify(comp, null, 2) + '\n')
    }
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2))
    fs.writeFileSync(path.join(outDir, 'report.md'), renderReport(results))
  }

  fs.rmSync(tmp, { recursive: true, force: true })
  fs.rmSync(path.join(nm, 'synapse-storage-published'), { recursive: true, force: true })

  console.log(renderConsole(results))
  if (FULL) console.log(`Полный отчёт: ${path.relative(process.cwd(), path.join(outDir, 'report.md'))}`)
}

// ─── вывод ──────────────────────────────────────────────────────────────────

const kb = (n) => (n / 1024).toFixed(2)
const kb1 = (n) => (n / 1024).toFixed(1)
const ansi = process.stdout.isTTY && !process.env.NO_COLOR
const color = (code, s) => (ansi ? `\x1b[${code}m${s}\x1b[0m` : s)
// Порог «шума»: < 50 байт gzip или < 1 % — не подсвечиваем
const delta = (now, was) => {
  if (was == null) return ''
  const d = now - was
  const pct = was ? (d / was) * 100 : 0
  const s = `${d > 0 ? '+' : ''}${kb(d)} KB (${d > 0 ? '+' : ''}${pct.toFixed(1)}%)`
  if (Math.abs(d) < 50 || Math.abs(pct) < 1) return color(2, s)
  return d > 0 ? color(31, `▲ ${s}`) : color(32, `▼ ${s}`)
}

/** Простая таблица с выравниванием (ANSI-коды не учитываются в ширине). */
function table(head, rows, align) {
  const strip = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '')
  const w = head.map((h, i) => Math.max(strip(h).length, ...rows.map((r) => strip(r[i]).length)))
  const pad = (s, i) => {
    const fill = ' '.repeat(w[i] - strip(s).length)
    return align?.[i] === 'r' ? fill + s : s + fill
  }
  const line = (r) => '  ' + r.map(pad).join(' │ ')
  return [line(head), '  ' + w.map((x) => '─'.repeat(x)).join('─┼─'), ...rows.map(line)].join('\n')
}

function loadCompetitors(r) {
  const data = r.competitors.length ? { date: r.date, competitors: r.competitors } : fs.existsSync(competitorsFile) ? JSON.parse(fs.readFileSync(competitorsFile, 'utf8')) : null
  if (!data) return null
  return { date: data.date, byId: Object.fromEntries(data.competitors.map((c) => [c.id, c])) }
}

function renderConsole(r) {
  const comp = loadCompetitors(r)
  const byId = Object.fromEntries(r.synapse.map((x) => [x.id, x]))
  const out = []
  const vs = r.baselineVersion ? `npm ${r.baselineVersion}` : null

  out.push('', color(1, `synapse-storage ${r.synapseVersion} (локальный dist) — min+gzip KB, rolldown (Vite 7+)`), '')
  const head = ['Сценарий', 'сейчас', ...(vs ? [vs, 'Δ'] : [])]
  const rows = r.synapse.map((x) => [x.label, kb(x.rolldown.gzip), ...(vs ? [x.baseline ? kb(x.baseline.gzip) : '—', delta(x.rolldown.gzip, x.baseline?.gzip)] : [])])
  out.push(table(head, rows, ['l', 'r', 'r', 'r']))

  if (comp) {
    out.push('', color(1, `Сравнение по ступеням, min+gzip KB, rolldown (конкуренты замерены ${comp.date.slice(0, 10)}, обновить: yarn size:full)`), '')
    const lrows = []
    for (const l of ladder) {
      const s = byId[l.syn]
      if (!s) continue
      const others = l.comp.map((id) => comp.byId[id]).filter(Boolean).map((c) => `${c.label}: ${kb1(c.rolldown.gzip)}`)
      if (!others.length) lrows.push([l.step, kb1(s.rolldown.gzip), '—'])
      others.forEach((o, i) => lrows.push(i === 0 ? [l.step, kb1(s.rolldown.gzip), o] : ['', '', o]))
    }
    out.push(table(['Ступень', 'synapse', 'Конкуренты'], lrows, ['l', 'r', 'l']))
  }
  out.push('')
  return out.join('\n')
}

const cell = (s) => (s ? `${kb(s.min)} / **${kb(s.gzip)}** / ${kb(s.brotli)}` : '—')
const pkgs = (b) => Object.entries(b.byPkg).sort((a, c) => c[1] - a[1]).map(([k, v]) => `${k} ${kb(v)}`).join(', ')

function renderReport(r) {
  const L = []
  L.push(`# Bundle size — сырые результаты`, '')
  L.push(`synapse-storage ${r.synapseVersion} (локальный dist), ${r.date}. База сравнения: ${r.baselineVersion ? `npm ${r.baselineVersion}` : '—'}.`)
  L.push(`Единицы — KB (1024 B), ячейка: min / **gzip** / brotli. Из каждого значения вычтен «пустой» бандл соответствующего бандлера. react/react-dom — external.`, '')

  L.push(`## synapse-storage`, '')
  L.push(`| Сценарий | esbuild | rollup | rolldown | webpack 5 | esbuild без rxjs | rolldown, npm ${r.baselineVersion ?? '—'} |`)
  L.push(`|---|---|---|---|---|---|---|`)
  for (const x of r.synapse) {
    L.push(`| ${x.label} | ${cell(x.esbuild)} | ${cell(x.rollup)} | ${cell(x.rolldown)} | ${cell(x.webpack)} | ${cell(x.esbuildNoRx)} | ${cell(x.baseline)} |`)
  }
  L.push('', `## Конкуренты`, '')
  L.push(`| Сценарий | esbuild | rollup | rolldown | webpack 5 | состав (esbuild, min KB) |`)
  L.push(`|---|---|---|---|---|---|`)
  for (const x of r.competitors) L.push(`| ${x.label} | ${cell(x.esbuild)} | ${cell(x.rollup)} | ${cell(x.rolldown)} | ${cell(x.webpack)} | ${pkgs(x.breakdown)} |`)

  L.push('', `## Состав бандлов synapse (esbuild metafile, min-байты до сжатия)`, '')
  for (const x of r.synapse) {
    L.push(`<details><summary><b>${x.label}</b> — ${pkgs(x.breakdown)}</summary>`, '')
    L.push('| файл dist | KB min |', '|---|--:|')
    for (const f of x.breakdown.byFile) L.push(`| ${f.file} | ${kb(f.bytes)} |`)
    L.push('', '</details>', '')
  }
  L.push(`## Версии`, '', Object.entries(r.versions).filter(([k]) => !k.startsWith('.')).map(([k, v]) => `${k}@${v}`).join(', '), '')
  return L.join('\n')
}

main().catch((e) => {
  console.error(POSTBUILD ? `⚠ замер размера не выполнен: ${e.message}` : e)
  process.exit(POSTBUILD ? 0 : 1)
})
