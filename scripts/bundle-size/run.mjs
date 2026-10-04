#!/usr/bin/env node
/**
 * Точка входа для `yarn size*` из корня: при первом запуске (или после изменения package-lock.json)
 * ставит зависимости стенда (`npm ci`), затем запускает measure.mjs с теми же аргументами.
 * Зависимости стенда (бандлеры, конкуренты) живут только здесь и не попадают в workspaces.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const lock = path.join(here, 'package-lock.json')
const installed = path.join(here, 'node_modules', '.package-lock.json')
const postbuild = process.argv.includes('--postbuild')

if (process.env.SYNAPSE_SIZE === '0') process.exit(0)

try {
  if (!fs.existsSync(installed) || fs.statSync(installed).mtimeMs < fs.statSync(lock).mtimeMs) {
    console.log('· bundle-size: устанавливаю зависимости стенда (один раз)…')
    execFileSync('npm', ['ci', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: here, stdio: 'inherit' })
  }
  await import('./measure.mjs')
} catch (e) {
  console.error(`⚠ bundle-size: ${e.message}`)
  process.exit(postbuild ? 0 : 1)
}
