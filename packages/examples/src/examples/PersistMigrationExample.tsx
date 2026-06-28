import { useState } from 'react'
import { LocalStorage } from 'synapse-storage/core'
import { buttonRow, cardStyle, sectionTitle } from './styles'

/**
 * Persist-миграции на домене pokemon. Между релизами форма данных меняется: в v1 избранное
 * хранилось по ИМЕНАМ, в v2 — по id. Опции `version` + `migrate` переводят сохранённые данные
 * старой схемы к текущей при `initialize()`, не теряя пользовательский выбор.
 *
 * Демо разнесено на два шага, чтобы было видно реальный переход между версиями в одном
 * localStorage-ключе.
 */
const STORE = 'pokemon-prefs-demo'
const NAME_TO_ID: Record<string, number> = { pikachu: 25, charizard: 6, bulbasaur: 1, gengar: 94 }

// v2 (текущая схема): избранное по id.
interface PokemonPrefsV2 extends Record<string, any> {
  favorites: number[]
}

export function PersistMigrationExample() {
  const [log, setLog] = useState<string[]>([])
  const append = (m: string) => setLog((p) => [...p, m])

  // Шаг 1 — «прошлый релиз»: v1 хранит избранное по именам.
  const seedV1 = async () => {
    const v1 = new LocalStorage<{ favorites: string[] }>({ name: STORE, version: 1, initialState: { favorites: [] } })
    await v1.initialize()
    await v1.set('favorites', ['pikachu', 'charizard'])
    await v1.destroy() // LocalStorage по умолчанию НЕ стирает данные на destroy
    append('v1 saved: favorites = ["pikachu","charizard"]  (version 1)')
  }

  // Шаг 2 — «текущий релиз»: v2 + migrate переводит имена → id один раз.
  const openV2 = async () => {
    const v2 = new LocalStorage<PokemonPrefsV2>({
      name: STORE,
      version: 2,
      initialState: { favorites: [] },
      migrate: (old, oldVersion) =>
        oldVersion < 2 ? { favorites: ((old.favorites ?? []) as string[]).map((n) => NAME_TO_ID[n]).filter(Boolean) } : (old as PokemonPrefsV2),
    })
    await v2.initialize()
    append(`v2 opened: favorites = ${JSON.stringify(v2.getStateSync().favorites)}  (migrated to ids, version 2)`)
    await v2.destroy()
  }

  const reset = () => {
    localStorage.removeItem(STORE)
    localStorage.removeItem(`${STORE}::__synapse_version__`)
    setLog(['cleared localStorage'])
  }

  return (
    <div style={cardStyle}>
      <h2>Persist-миграции (Pokemon)</h2>
      <p>
        <code>version</code> + <code>migrate</code> переводят сохранённое избранное со старой схемы
        (имена) на текущую (id) при инициализации. Жми по порядку:
      </p>
      <div style={buttonRow}>
        <button onClick={seedV1}>1. Сохранить как v1 (имена)</button>
        <button onClick={openV2}>2. Открыть как v2 (migrate → id)</button>
        <button onClick={reset}>Сброс</button>
      </div>
      <h3 style={sectionTitle}>Log</h3>
      <ul style={{ fontSize: 12, fontFamily: 'monospace', paddingLeft: 16 }}>
        {log.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
    </div>
  )
}
