import { useState } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

// ─── Shared singleton instance ─────────────────────────────────────────────

const sharedStorage = new MemoryStorage<{ message: string; likes: number }>({
  name: 'singleton-shared',
  singleton: { enabled: true },
  initialState: { message: 'Hello from singleton!', likes: 0 },
})
sharedStorage.initialize()

// ─── Demos ─────────────────────────────────────────────────────────────────

function BasicSingletonDemo() {
  const [info, setInfo] = useState<string[]>([])

  const runDemo = async () => {
    const logs: string[] = []

    const s1 = new MemoryStorage<{ count: number }>({
      name: 'singleton-basic-demo',
      singleton: { enabled: true },
      initialState: { count: 0 },
    })
    await s1.initialize()
    s1.set('count', 42)
    logs.push(`s1: set count = 42`)

    const s2 = new MemoryStorage<{ count: number }>({
      name: 'singleton-basic-demo',
      singleton: { enabled: true },
      initialState: { count: 999 }, // будет проигнорирован (FIRST_WINS)
    })
    await s2.initialize()

    logs.push(`s2: get count = ${s2.get<number>('count')} (should be 42)`)
    logs.push(`s1 === s2: ${s1 === s2}`)

    await s1.destroy()
    setInfo(logs)
  }

  return (
    <div>
      <button onClick={runDemo}>Run demo</button>
      {info.length > 0 && <pre style={{ ...codeBlock, marginTop: 8 }}>{info.join('\n')}</pre>}
    </div>
  )
}

function MergeStrategiesDemo() {
  const [results, setResults] = useState<Record<string, string[]>>({})

  const runStrategy = async (strategy: string) => {
    const logs: string[] = []
    try {
      const s1 = new MemoryStorage<{ theme: string; lang: string; extra?: boolean }>({
        name: `singleton-${strategy}-demo`,
        singleton: { enabled: true, mergeStrategy: strategy as any },
        initialState: { theme: 'dark', lang: 'en' },
      })
      await s1.initialize()
      logs.push(`s1 created: theme=dark, lang=en`)

      const s2 = new MemoryStorage<{ theme: string; lang: string; extra?: boolean }>({
        name: `singleton-${strategy}-demo`,
        singleton: { enabled: true, mergeStrategy: strategy as any },
        initialState: { theme: 'light', lang: 'ru', extra: true },
      })
      await s2.initialize()

      logs.push(`s2 state: ${JSON.stringify(s2.getState())}`)
      logs.push(`s1 === s2: ${s1 === s2}`)
      await s1.destroy()
    } catch (err: any) {
      logs.push(`Error: ${err.message}`)
    }
    setResults((prev) => ({ ...prev, [strategy]: logs }))
  }

  const strategies = [
    { key: 'first_wins', label: 'FIRST_WINS', desc: 'игнорирует последующие' },
    { key: 'deep_merge', label: 'DEEP_MERGE', desc: 'рекурсивно объединяет' },
    { key: 'override', label: 'OVERRIDE', desc: 'последний перезаписывает' },
    { key: 'warn_and_use_first', label: 'WARN_AND_USE_FIRST', desc: 'как FIRST_WINS + console.warn' },
    { key: 'strict', label: 'STRICT', desc: 'бросает ошибку' },
  ]

  return (
    <div>
      <div style={buttonRow}>
        {strategies.map(({ key, label }) => (
          <button key={key} onClick={() => runStrategy(key)}>{label}</button>
        ))}
      </div>
      {strategies.map(({ key, desc }) => (
        results[key] && (
          <div key={key} style={{ marginTop: 4 }}>
            <strong>{key}</strong> ({desc}):
            <pre style={{ ...codeBlock, margin: '4px 0', fontSize: 11 }}>{results[key].join('\n')}</pre>
          </div>
        )
      ))}
    </div>
  )
}

function CustomKeyDemo() {
  const [info, setInfo] = useState<string[]>([])

  const runDemo = async () => {
    const logs: string[] = []

    const cache = new MemoryStorage<{ data: string }>({
      name: 'user-data',
      singleton: { enabled: true, key: 'user-cache' },
      initialState: { data: 'cached' },
    })
    await cache.initialize()

    const settings = new MemoryStorage<{ data: string }>({
      name: 'user-data',
      singleton: { enabled: true, key: 'user-settings' },
      initialState: { data: 'settings' },
    })
    await settings.initialize()

    logs.push(`cache (key=user-cache): data = "${cache.get('data')}"`)
    logs.push(`settings (key=user-settings): data = "${settings.get('data')}"`)
    logs.push(`cache === settings: ${cache === settings}`)

    await cache.destroy()
    await settings.destroy()
    setInfo(logs)
  }

  return (
    <div>
      <button onClick={runDemo}>Run demo</button>
      {info.length > 0 && <pre style={{ ...codeBlock, marginTop: 8 }}>{info.join('\n')}</pre>}
    </div>
  )
}

function ComponentA() {
  const message = useStorageSubscribe(sharedStorage, (s) => s.message)
  return (
    <div style={{ padding: 4, border: '1px dashed #aaa', borderRadius: 4 }}>
      <strong>Component A</strong>: "{message}"
      <button onClick={() => sharedStorage.set('message', `Updated at ${new Date().toLocaleTimeString()}`)} style={{ marginLeft: 8 }}>
        Update
      </button>
    </div>
  )
}

function ComponentB() {
  const sameStorage = new MemoryStorage<{ message: string; likes: number }>({
    name: 'singleton-shared',
    singleton: { enabled: true },
    initialState: { message: 'different default', likes: 0 },
  })

  const message = useStorageSubscribe(sameStorage, (s) => s.message)
  const likes = useStorageSubscribe(sameStorage, (s) => s.likes)

  return (
    <div style={{ padding: 4, border: '1px dashed #aaa', borderRadius: 4, marginTop: 4 }}>
      <strong>Component B</strong> (same singleton): "{message}" | likes: {likes}
      <button onClick={() => sameStorage.update((s) => { s.likes++ })} style={{ marginLeft: 8 }}>
        Like
      </button>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────

export function SingletonExample() {
  return (
    <div style={cardStyle}>
      <h2>Singleton Pattern</h2>
      <p>
        Переиспользование экземпляров хранилища по имени.
        Полезно для shared state и когда хранилище создаётся в нескольких местах (React-компоненты, модули).
      </p>

      {/* ─── Включение ───────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Включение singleton</h3>
      <pre style={codeBlock}>{`import { MemoryStorage } from 'synapse-storage/core'

// Первый экземпляр — создаёт хранилище
const storage1 = new MemoryStorage<{ count: number }>({
  name: 'my-store',
  singleton: { enabled: true },
  initialState: { count: 0 },
})
await storage1.initialize()
storage1.set('count', 42)

// Второй экземпляр с ТЕМ ЖЕ именем — получает тот же объект
const storage2 = new MemoryStorage<{ count: number }>({
  name: 'my-store',
  singleton: { enabled: true },
  initialState: { count: 999 },  // проигнорировано (FIRST_WINS по умолчанию)
})
await storage2.initialize()

storage2.get('count')     // 42 (тот же экземпляр!)
storage1 === storage2     // true

// Работает с MemoryStorage, LocalStorage, IndexedDB
// Ключ singleton по умолчанию: \`\${storageType}_\${name}\` (memory_my-store)`}</pre>
      <BasicSingletonDemo />

      {/* ─── Merge strategies ─────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Стратегии слияния (mergeStrategy)</h3>
      <pre style={codeBlock}>{`import { MemoryStorage, ConfigMergeStrategy } from 'synapse-storage/core'

const storage = new MemoryStorage({
  name: 'my-store',
  singleton: {
    enabled: true,
    mergeStrategy: ConfigMergeStrategy.FIRST_WINS,  // по умолчанию
  },
  initialState: { ... },
})

// Все стратегии:

// FIRST_WINS (default)
// Первый initialState побеждает, последующие игнорируются

// DEEP_MERGE
// Рекурсивно объединяет initialState:
// s1: { theme: 'dark', lang: 'en' }
// s2: { theme: 'light', extra: true }
// → { theme: 'dark', lang: 'en', extra: true }

// OVERRIDE
// Последняя конфигурация перезаписывает (кроме name)

// WARN_AND_USE_FIRST
// Как FIRST_WINS, но с console.warn при конфликтах

// STRICT
// Бросает Error если initialState отличается`}</pre>
      <MergeStrategiesDemo />

      {/* ─── Custom key ───────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Кастомный ключ (singleton.key)</h3>
      <pre style={codeBlock}>{`// По умолчанию ключ: \`\${storageType}_\${name}\`
// Два хранилища с одним name но разными key — разные экземпляры

const cache = new MemoryStorage<{ data: string }>({
  name: 'user-data',
  singleton: { enabled: true, key: 'user-cache' },
  initialState: { data: 'cached' },
})

const settings = new MemoryStorage<{ data: string }>({
  name: 'user-data',  // тот же name!
  singleton: { enabled: true, key: 'user-settings' },  // другой key
  initialState: { data: 'settings' },
})

cache === settings  // false (разные ключи → разные экземпляры)`}</pre>
      <CustomKeyDemo />

      {/* ─── React ────────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Singleton в React</h3>
      <pre style={codeBlock}>{`// Два компонента создают хранилище с одним именем — один экземпляр

const sharedStorage = new MemoryStorage<{ message: string; likes: number }>({
  name: 'shared-store',
  singleton: { enabled: true },
  initialState: { message: 'Hello!', likes: 0 },
})
sharedStorage.initialize()

function ComponentA() {
  const message = useStorageSubscribe(sharedStorage, (s) => s.message)
  return <div>{message} <button onClick={() => sharedStorage.set('message', 'Updated!')}>Update</button></div>
}

function ComponentB() {
  // Создаёт "новый" storage — но получит тот же singleton
  const sameStorage = new MemoryStorage<{ message: string; likes: number }>({
    name: 'shared-store',
    singleton: { enabled: true },
    initialState: { message: 'different', likes: 0 },
  })
  const message = useStorageSubscribe(sameStorage, (s) => s.message)
  // message тут = то же что в ComponentA
  return <div>{message}</div>
}`}</pre>
      <ComponentA />
      <ComponentB />

      {/* ─── Полная конфигурация ──────────────────────────────────────── */}
      <h3 style={sectionTitle}>Полная конфигурация SingletonOptions</h3>
      <pre style={codeBlock}>{`interface SingletonOptions {
  enabled: boolean                // включить singleton
  mergeStrategy?: ConfigMergeStrategy  // стратегия слияния (default: FIRST_WINS)
  warnOnConflict?: boolean        // предупреждение в консоли (default: true)
  key?: string                    // кастомный ключ (default: \`\${type}_\${name}\`)
}

// ConfigMergeStrategy enum:
enum ConfigMergeStrategy {
  STRICT = 'strict',
  FIRST_WINS = 'first_wins',
  DEEP_MERGE = 'deep_merge',
  OVERRIDE = 'override',
  WARN_AND_USE_FIRST = 'warn_and_use_first',
}`}</pre>
    </div>
  )
}
