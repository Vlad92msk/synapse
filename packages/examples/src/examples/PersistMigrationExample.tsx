import { useCallback, useState } from 'react'
import { LocalStorage } from 'synapse-storage/core'
import { buttonRow, cardStyle, codeBlock, sectionTitle } from './styles'

// Демонстрируем миграцию схемы localStorage между версиями релиза.
// Старая схема (v1): { theme: 'light' | 'dark' }
// Новая схема (v2): { theme: 'light' | 'dark'; locale: string }

const STORE_NAME = 'pm-demo-settings'
const VERSION_KEY = `${STORE_NAME}::__synapse_version__`

interface SettingsV2 extends Record<string, any> {
  theme: 'light' | 'dark'
  locale: string
}

function readRaw() {
  return {
    data: localStorage.getItem(STORE_NAME),
    version: localStorage.getItem(VERSION_KEY),
  }
}

function PersistMigrationDemo() {
  const [raw, setRaw] = useState(readRaw)
  const [migrated, setMigrated] = useState<SettingsV2 | null>(null)
  const [log, setLog] = useState<string[]>([])

  const refresh = useCallback(() => setRaw(readRaw()), [])
  const addLog = useCallback((line: string) => setLog((l) => [...l, line]), [])

  // Шаг 1: имитируем данные старого релиза (v1) прямо в localStorage.
  const seedV1 = useCallback(() => {
    localStorage.setItem(STORE_NAME, JSON.stringify({ theme: 'dark' }))
    localStorage.setItem(VERSION_KEY, '1')
    setMigrated(null)
    addLog('Записаны данные v1: { theme: "dark" }, версия = 1')
    refresh()
  }, [addLog, refresh])

  // Шаг 2: открываем хранилище новой версии (v2) с migrate.
  const openV2 = useCallback(async () => {
    const migrate = (old: any, _fromVersion: number): SettingsV2 => ({
      theme: old.theme ?? 'light',
      locale: old.locale ?? 'en', // новое поле схемы v2
    })

    const storage = new LocalStorage<SettingsV2>({
      name: STORE_NAME,
      version: 2,
      initialState: { theme: 'light', locale: 'en' },
      migrate,
    })
    await storage.initialize()
    const state = storage.getState()
    setMigrated(state)
    addLog(`После initialize() v2: ${JSON.stringify(state)} (версия → 2)`)
    refresh()
    await storage.destroy() // данные остаются (localStorage персистентен)
  }, [addLog, refresh])

  const reset = useCallback(() => {
    localStorage.removeItem(STORE_NAME)
    localStorage.removeItem(VERSION_KEY)
    setMigrated(null)
    setLog([])
    refresh()
  }, [refresh])

  return (
    <div>
      <div style={buttonRow}>
        <button onClick={seedV1}>1. Записать данные v1</button>
        <button onClick={openV2}>2. Открыть v2 (migrate)</button>
        <button onClick={reset}>Сбросить</button>
      </div>
      <p style={{ margin: '8px 0' }}>
        localStorage[<code>{STORE_NAME}</code>]: <strong>{raw.data ?? '∅'}</strong>
        <br />
        localStorage[<code>версия</code>]: <strong>{raw.version ?? '∅'}</strong>
      </p>
      {migrated && (
        <p style={{ margin: '8px 0' }}>
          getState() после миграции: <strong>{JSON.stringify(migrated)}</strong>
        </p>
      )}
      {log.length > 0 && (
        <ul style={{ fontSize: 13, color: '#555' }}>
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PersistMigrationExample() {
  return (
    <div style={cardStyle}>
      <h2>Persist-миграции (version + migrate)</h2>
      <p>
        Когда форма <code>initialState</code> меняется между релизами, в localStorage/IndexedDB
        остаются данные старой схемы. Опции <code>version</code> и <code>migrate</code>{' '}
        преобразуют их к текущей схеме при <code>initialize()</code>. Для MemoryStorage опции
        игнорируются. Без <code>version</code> поведение не меняется.
      </p>

      <h3 style={sectionTitle}>Конфигурация</h3>
      <pre style={codeBlock}>{`import { LocalStorage } from 'synapse-storage/core'

interface Settings { theme: 'light' | 'dark'; locale: string }

const storage = new LocalStorage<Settings>({
  name: 'settings',
  version: 2,                               // текущая версия схемы
  initialState: { theme: 'light', locale: 'en' },
  migrate: (oldState, oldVersion) => {
    if (oldVersion < 1) {
      // самая первая схема хранила { dark: boolean }
      return { theme: oldState.dark ? 'dark' : 'light', locale: 'en' }
    }
    // 1 → 2: добавили locale
    return { ...oldState, locale: oldState.locale ?? 'en' }
  },
})

await storage.initialize()
// Если в хранилище версия < 2 → migrate(oldState, oldVersion), результат записывается,
// версия фиксируется. migrate вызывается один раз — при следующих запусках уже не нужен.`}</pre>

      <h3 style={sectionTitle}>Где хранится версия</h3>
      <pre style={codeBlock}>{`// LocalStorage  → sidecar-ключ \`\${name}::__synapse_version__\`
// IndexedDB     → reserved-запись '__synapse_version__' в том же сторе
//                 (исключена из getState()/keys(), переживает clear()/set(''))
// Версия НЕ засоряет само состояние.`}</pre>

      <h3 style={sectionTitle}>Живой пример</h3>
      <PersistMigrationDemo />
    </div>
  )
}
