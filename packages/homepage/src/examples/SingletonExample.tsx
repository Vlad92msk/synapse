import { useState, useEffect } from 'react'
import { MemoryStorage, LocalStorage } from 'synapse-storage/core'
import { useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle, buttonRow } from './styles'

/**
 * Пример 11: Singleton — singleton: { enabled: true, mergeStrategy }
 * Позволяет переиспользовать экземпляры хранилищ по имени
 */

// --- 1. Basic Singleton ---

function BasicSingletonDemo() {
  const [info, setInfo] = useState<string[]>([])

  const runDemo = async () => {
    const logs: string[] = []

    // Создаем первый экземпляр
    const storage1 = new MemoryStorage<{ count: number; name: string }>({
      name: 'singleton-basic',
      singleton: { enabled: true },
      initialState: { count: 0, name: 'Alice' },
    })
    await storage1.initialize()

    // Устанавливаем значение через первый экземпляр
    await storage1.set('count', 42)
    logs.push(`storage1: set count = 42`)

    // Создаем "второй" экземпляр с тем же именем — получим тот же объект!
    const storage2 = new MemoryStorage<{ count: number; name: string }>({
      name: 'singleton-basic',
      singleton: { enabled: true },
      initialState: { count: 0, name: 'Bob' }, // initialState будет проигнорирован (FIRST_WINS)
    })
    await storage2.initialize()

    const count2 = await storage2.get<number>('count')
    logs.push(`storage2: get count = ${count2} (should be 42, same instance!)`)

    const areSame = storage1 === storage2
    logs.push(`storage1 === storage2: ${areSame}`)

    // Cleanup
    await storage1.destroy()

    setInfo(logs)
  }

  return (
    <div style={{ padding: 8, background: '#e8f5e9', borderRadius: 4 }}>
      <h4>1. Basic Singleton (FIRST_WINS)</h4>
      <p style={{ fontSize: 12, color: '#666' }}>
        По умолчанию стратегия FIRST_WINS — первый initialState побеждает, последующие игнорируются.
      </p>
      <button onClick={runDemo}>Run demo</button>
      {info.length > 0 && (
        <pre style={{ fontSize: 11, background: '#f5f5f5', padding: 8, borderRadius: 4, marginTop: 8 }}>
          {info.join('\n')}
        </pre>
      )}
    </div>
  )
}

// --- 2. Merge Strategies ---

function MergeStrategiesDemo() {
  const [results, setResults] = useState<Record<string, string[]>>({})

  const runStrategy = async (strategy: string) => {
    const logs: string[] = []

    try {
      // Создаем первый экземпляр
      const s1 = new MemoryStorage<{ theme: string; lang: string; notifications?: boolean }>({
        name: `singleton-${strategy}`,
        singleton: {
          enabled: true,
          mergeStrategy: strategy as any,
          warnOnConflict: true,
        },
        initialState: { theme: 'dark', lang: 'en' },
      })
      await s1.initialize()
      logs.push(`s1 created with: theme=dark, lang=en`)

      // Создаем второй с отличающимся initialState
      const s2 = new MemoryStorage<{ theme: string; lang: string; notifications?: boolean }>({
        name: `singleton-${strategy}`,
        singleton: {
          enabled: true,
          mergeStrategy: strategy as any,
        },
        initialState: { theme: 'light', lang: 'ru', notifications: true },
      })
      await s2.initialize()

      const state = await s2.getState()
      logs.push(`s2 state after merge: ${JSON.stringify(state)}`)
      logs.push(`s1 === s2: ${s1 === s2}`)

      await s1.destroy()
    } catch (err: any) {
      logs.push(`Error: ${err.message}`)
    }

    setResults((prev) => ({ ...prev, [strategy]: logs }))
  }

  const strategies = [
    { key: 'first_wins', label: 'FIRST_WINS', desc: 'Игнорирует последующие конфигурации' },
    { key: 'deep_merge', label: 'DEEP_MERGE', desc: 'Рекурсивно объединяет initialState' },
    { key: 'override', label: 'OVERRIDE', desc: 'Последняя конфигурация перезаписывает (кроме name)' },
    { key: 'warn_and_use_first', label: 'WARN_AND_USE_FIRST', desc: 'Как FIRST_WINS, но с console.warn' },
    { key: 'strict', label: 'STRICT', desc: 'Бросает ошибку при конфликтах' },
  ]

  return (
    <div style={{ padding: 8, background: '#fff3e0', borderRadius: 4, marginTop: 8 }}>
      <h4>2. Merge Strategies</h4>
      <p style={{ fontSize: 12, color: '#666' }}>
        Что происходит, когда singleton создается с отличающимися параметрами.
      </p>
      <div style={buttonRow}>
        {strategies.map(({ key, label }) => (
          <button key={key} onClick={() => runStrategy(key)}>{label}</button>
        ))}
      </div>

      {strategies.map(({ key, desc }) => (
        results[key] && (
          <div key={key} style={{ marginTop: 4, fontSize: 11 }}>
            <strong>{key}</strong> ({desc}):
            <pre style={{ background: '#f5f5f5', padding: 4, borderRadius: 4, margin: '2px 0' }}>
              {results[key].join('\n')}
            </pre>
          </div>
        )
      ))}
    </div>
  )
}

// --- 3. Custom Singleton Key ---

function CustomKeyDemo() {
  const [info, setInfo] = useState<string[]>([])

  const runDemo = async () => {
    const logs: string[] = []

    // Два хранилища с одним именем, но разными singleton keys
    const cache = new MemoryStorage<{ data: string }>({
      name: 'user-data',
      singleton: { enabled: true, key: 'user-cache' },
      initialState: { data: 'cached-data' },
    })
    await cache.initialize()

    const settings = new MemoryStorage<{ data: string }>({
      name: 'user-data', // То же имя!
      singleton: { enabled: true, key: 'user-settings' }, // Но другой ключ
      initialState: { data: 'settings-data' },
    })
    await settings.initialize()

    const cacheData = await cache.get('data')
    const settingsData = await settings.get('data')

    logs.push(`cache (key=user-cache): data = "${cacheData}"`)
    logs.push(`settings (key=user-settings): data = "${settingsData}"`)
    logs.push(`cache === settings: ${cache === settings} (different keys = different instances)`)

    await cache.destroy()
    await settings.destroy()

    setInfo(logs)
  }

  return (
    <div style={{ padding: 8, background: '#e3f2fd', borderRadius: 4, marginTop: 8 }}>
      <h4>3. Custom Singleton Key</h4>
      <p style={{ fontSize: 12, color: '#666' }}>
        Хранилища с одним name, но разными singleton.key — это разные экземпляры.
      </p>
      <button onClick={runDemo}>Run demo</button>
      {info.length > 0 && (
        <pre style={{ fontSize: 11, background: '#f5f5f5', padding: 8, borderRadius: 4, marginTop: 8 }}>
          {info.join('\n')}
        </pre>
      )}
    </div>
  )
}

// --- 4. Singleton in React (shared state between components) ---

const sharedStorage = new MemoryStorage<{ message: string; likes: number }>({
  name: 'shared-singleton',
  singleton: { enabled: true },
  initialState: { message: 'Hello from singleton!', likes: 0 },
})
sharedStorage.initialize()

function ComponentA() {
  const message = useStorageSubscribe(sharedStorage, (s) => s.message)

  return (
    <div style={{ padding: 4, border: '1px dashed #aaa', borderRadius: 4 }}>
      <strong>Component A</strong>: message = "{message}"
      <button onClick={() => sharedStorage.set('message', `Updated at ${new Date().toLocaleTimeString()}`)} style={{ marginLeft: 8 }}>
        Update
      </button>
    </div>
  )
}

function ComponentB() {
  // Создает "новый" MemoryStorage с тем же именем — получит тот же singleton
  const sameStorage = new MemoryStorage<{ message: string; likes: number }>({
    name: 'shared-singleton',
    singleton: { enabled: true },
    initialState: { message: 'different default', likes: 0 },
  })
  // Не нужно заново initialize() для singleton — уже инициализирован

  const message = useStorageSubscribe(sameStorage, (s) => s.message)
  const likes = useStorageSubscribe(sameStorage, (s) => s.likes)

  return (
    <div style={{ padding: 4, border: '1px dashed #aaa', borderRadius: 4, marginTop: 4 }}>
      <strong>Component B</strong> (same singleton): message = "{message}" | likes = {likes}
      <button onClick={() => sameStorage.update((s) => { s.likes++ })} style={{ marginLeft: 8 }}>
        Like
      </button>
    </div>
  )
}

function SharedSingletonDemo() {
  return (
    <div style={{ padding: 8, background: '#f3e5f5', borderRadius: 4, marginTop: 8 }}>
      <h4>4. Singleton in React</h4>
      <p style={{ fontSize: 12, color: '#666' }}>
        Два компонента создают MemoryStorage с одним именем и singleton:true — получают один экземпляр.
      </p>
      <ComponentA />
      <ComponentB />
    </div>
  )
}

export function SingletonExample() {
  return (
    <div style={cardStyle}>
      <h2>Singleton Pattern</h2>
      <p style={{ fontSize: 13, color: '#666' }}>
        Переиспользование экземпляров хранилищ по имени. Полезно для React (ре-рендеры) и shared state.
      </p>

      <BasicSingletonDemo />
      <MergeStrategiesDemo />
      <CustomKeyDemo />
      <SharedSingletonDemo />

      <h4>API заметки:</h4>
      <ul style={{ fontSize: 12, color: '#666' }}>
        <li><code>singleton: {'{ enabled: true }' }</code> — включает singleton по имени хранилища</li>
        <li><code>mergeStrategy</code> — FIRST_WINS (default), DEEP_MERGE, OVERRIDE, STRICT, WARN_AND_USE_FIRST</li>
        <li><code>warnOnConflict: true</code> — предупреждение в консоли при конфликтах (default: true)</li>
        <li><code>key</code> — кастомный ключ singleton (по умолчанию <code>{'{StorageType}_{name}'}</code>)</li>
        <li>Работает для MemoryStorage, LocalStorage, IndexedDBStorage</li>
        <li>Ключ singleton по умолчанию: <code>memory_name</code> / <code>localStorage_name</code></li>
      </ul>
    </div>
  )
}
