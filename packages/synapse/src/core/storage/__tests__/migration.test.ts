// @vitest-environment jsdom
//
// persist-migration: config.version + migrate(oldState, oldVersion) для localStorage/IndexedDB.
import 'fake-indexeddb/auto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { IndexedDBStorage } from '../adapters/indexed-DB.service'
import { LocalStorage } from '../adapters/local-storage.service'
import { MemoryStorage } from '../adapters/memory-storage.service'
import { decideMigration } from '../utils/migration.util'

interface V1 extends Record<string, any> {
  theme: string
}
interface V2 extends Record<string, any> {
  theme: string
  locale: string
}

let uid = 0
const nextName = (p: string) => `${p}_mig_${uid++}`
const flush = () => new Promise<void>((r) => setTimeout(r, 10))

type PersistKind = 'localStorage' | 'indexedDB'

function makeStore<T extends Record<string, any>>(
  kind: PersistKind,
  name: string,
  config: { version?: number; initialState?: T; migrate?: (s: any, v: number) => T },
  dbName?: string,
) {
  if (kind === 'localStorage') {
    return new LocalStorage<T>({ name, ...config })
  }
  return new IndexedDBStorage<T>({ name, ...config, options: { dbName: dbName ?? name } })
}

describe('decideMigration (pure)', () => {
  it('нет данных → seed', () => {
    expect(decideMigration({ hasExisting: false, existingState: {}, persistedVersion: undefined, targetVersion: 1 })).toEqual({ kind: 'seed' })
  })

  it('версии совпадают → none', () => {
    expect(decideMigration({ hasExisting: true, existingState: { a: 1 }, persistedVersion: 2, targetVersion: 2 })).toEqual({ kind: 'none' })
  })

  it('сохранённая версия ниже + migrate → migrate с результатом', () => {
    const d = decideMigration({
      hasExisting: true,
      existingState: { theme: 'dark' },
      persistedVersion: 1,
      targetVersion: 2,
      migrate: (s, v) => ({ ...s, locale: 'en', from: v }),
    })
    expect(d).toEqual({ kind: 'migrate', state: { theme: 'dark', locale: 'en', from: 1 } })
  })

  it('версия поднята без migrate → bump (+ dev warn)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(decideMigration({ hasExisting: true, existingState: { a: 1 }, persistedVersion: 1, targetVersion: 2 })).toEqual({ kind: 'bump' })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('сохранённая версия новее → none (+ dev warn)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(decideMigration({ hasExisting: true, existingState: { a: 1 }, persistedVersion: 3, targetVersion: 2 })).toEqual({ kind: 'none' })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe.each<PersistKind>(['localStorage', 'indexedDB'])('persist-migration — %s', (kind) => {
  const stores: Array<{ destroy: () => Promise<void> }> = []
  afterEach(async () => {
    for (const s of stores.splice(0)) {
      try {
        await s.destroy()
      } catch {
        /* noop */
      }
    }
  })

  it('первый запуск: засевает initialState и сохраняет версию', async () => {
    const name = nextName(kind)
    const dbName = nextName('db')
    const a = makeStore<V2>(kind, name, { version: 1, initialState: { theme: 'light', locale: 'en' } }, dbName)
    stores.push(a)
    await a.initialize()
    await flush()
    expect(await a.getState()).toEqual({ theme: 'light', locale: 'en' })
    await a.destroy()

    // Повторное открытие с той же версией не трогает данные (migrate не дёргается).
    const migrate = vi.fn()
    const b = makeStore<V2>(kind, name, { version: 1, initialState: { theme: 'light', locale: 'en' }, migrate }, dbName)
    stores.push(b)
    await b.initialize()
    await flush()
    expect(migrate).not.toHaveBeenCalled()
    expect(await b.getState()).toEqual({ theme: 'light', locale: 'en' })
  })

  it('данные старой версии → migrate один раз, потом стабильно', async () => {
    const name = nextName(kind)
    const dbName = nextName('db')

    // Старый релиз: version=1, схема V1.
    const v1 = makeStore<V1>(kind, name, { version: 1, initialState: { theme: 'dark' } }, dbName)
    stores.push(v1)
    await v1.initialize()
    await flush()
    expect(await v1.getState()).toEqual({ theme: 'dark' })
    await v1.destroy()

    // Новый релиз: version=2, добавили locale.
    const migrate = vi.fn((old: V1, fromVersion: number) => ({ theme: old.theme, locale: 'en', fromVersion }))
    const v2 = makeStore<V2>(kind, name, { version: 2, initialState: { theme: 'light', locale: 'en' }, migrate }, dbName)
    stores.push(v2)
    await v2.initialize()
    await flush()

    expect(migrate).toHaveBeenCalledTimes(1)
    expect(migrate).toHaveBeenCalledWith({ theme: 'dark' }, 1)
    expect(await v2.getState()).toEqual({ theme: 'dark', locale: 'en', fromVersion: 1 })
    await v2.destroy()

    // Третье открытие той же version=2 — migrate больше не вызывается.
    const migrate2 = vi.fn()
    const v2b = makeStore<V2>(kind, name, { version: 2, initialState: { theme: 'light', locale: 'en' }, migrate: migrate2 }, dbName)
    stores.push(v2b)
    await v2b.initialize()
    await flush()
    expect(migrate2).not.toHaveBeenCalled()
    expect(await v2b.getState()).toEqual({ theme: 'dark', locale: 'en', fromVersion: 1 })
  })

  it('версия не задана → миграция выключена, version-ключ не пишется (keys чисты)', async () => {
    const name = nextName(kind)
    const s = makeStore<V1>(kind, name, { initialState: { theme: 'dark' } }, nextName('db'))
    stores.push(s)
    await s.initialize()
    await flush()
    expect(await s.keys()).toEqual(['theme'])
  })

  it('version-ключ не виден в keys()/getState()', async () => {
    const name = nextName(kind)
    const s = makeStore<V1>(kind, name, { version: 1, initialState: { theme: 'dark' } }, nextName('db'))
    stores.push(s)
    await s.initialize()
    await flush()
    expect(await s.keys()).toEqual(['theme'])
    expect(await s.getState()).toEqual({ theme: 'dark' })
  })
})

describe('persist-migration — memory игнорирует версию', () => {
  it('memory: version задан, но миграция no-op (нечего персистить)', async () => {
    const s = new MemoryStorage<V1>({ name: nextName('memory'), version: 2, initialState: { theme: 'dark' }, migrate: () => ({ theme: 'x' }) })
    await s.initialize()
    expect(s.getState()).toEqual({ theme: 'dark' })
    await s.destroy()
  })
})
