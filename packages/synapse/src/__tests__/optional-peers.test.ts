/**
 * Гейт опциональных peer-зависимостей. Бандлеры (webpack/esbuild) резолвят все импорты модулей точки
 * входа ДО tree-shaking, так что даже «неиспользуемый» импорт валит сборку, если пакета нет. Поэтому:
 *
 * - `rxjs` не достижим из `.`, `./core`, `./api`, `./react`, `./utils`, `./dispatcher` (только `./reactive`);
 * - `react` не достижим из `.`, `./core`, `./api`, `./utils`, `./dispatcher` (только `./react`).
 *
 * Проверяются и `import type`: иначе `.d.ts` потребителя без пакета ломается на `Cannot find module`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(__dirname, '..')

const RXJS_FREE_ENTRIES = ['index.ts', 'core/index.ts', 'api/index.ts', 'react/index.ts', 'utils/index.ts', 'reactive/dispatcher/index.ts']
const REACT_FREE_ENTRIES = ['index.ts', 'core/index.ts', 'api/index.ts', 'utils/index.ts', 'reactive/dispatcher/index.ts']

const isPkg = (pkg: string) => (spec: string) => spec === pkg || spec.startsWith(`${pkg}/`)

// import … from 'x' | import 'x' | export … from 'x' (включая type-only и многострочные)
const SPECIFIER_RE = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]/g

function resolveLocal(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec)
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

/** BFS по графу импортов; возвращает цепочку до первого файла, импортирующего пакет (или null). */
function findImportChain(entry: string, isTarget: (spec: string) => boolean): string[] | null {
  const start = path.join(SRC, entry)
  const parent = new Map<string, string | null>([[start, null]])
  const queue = [start]
  while (queue.length) {
    const file = queue.shift()!
    const code = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    for (const match of code.matchAll(SPECIFIER_RE)) {
      const spec = match[1]
      if (isTarget(spec)) {
        const chain = [`${spec}`]
        for (let f: string | null = file; f; f = parent.get(f) ?? null) chain.unshift(path.relative(SRC, f))
        return chain
      }
      if (!spec.startsWith('.')) continue
      const resolved = resolveLocal(file, spec)
      if (resolved && !parent.has(resolved)) {
        parent.set(resolved, file)
        queue.push(resolved)
      }
    }
  }
  return null
}

describe('опциональные peer-зависимости', () => {
  it.each(RXJS_FREE_ENTRIES)('%s не достигает rxjs по графу импортов (включая import type)', (entry) => {
    expect(findImportChain(entry, isPkg('rxjs'))).toBeNull()
  })

  it.each(REACT_FREE_ENTRIES)('%s не достигает react по графу импортов (включая import type)', (entry) => {
    expect(findImportChain(entry, isPkg('react'))).toBeNull()
  })

  it('контроль детектора: reactive достигает rxjs, react — react', () => {
    expect(findImportChain('reactive/index.ts', isPkg('rxjs'))).not.toBeNull()
    expect(findImportChain('react/index.ts', isPkg('react'))).not.toBeNull()
  })
})
