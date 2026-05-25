import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse, createSynapseAwaiter } from 'synapse-storage/utils'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

// ─── Типы ───────────────────────────────────────────────────────────────────

interface ConfigState {
  locale: string
  apiUrl: string
  featureFlags: Record<string, boolean>
}

// ─── Создание store с задержкой (эмуляция загрузки конфига) ─────────────────

const configStorePromise = createSynapse({
  createStorageFn: async () => {
    await new Promise((r) => setTimeout(r, 2000)) // эмуляция сетевого запроса
    const storage = new MemoryStorage<ConfigState>({
      name: 'app-config-awaiter',
      initialState: {
        locale: 'ru',
        apiUrl: 'https://api.example.com',
        featureFlags: { darkMode: true, betaFeatures: false },
      },
    })
    storage.initialize()
    return storage
  },
})

// ─── Создание awaiter ───────────────────────────────────────────────────────

const configAwaiter = createSynapseAwaiter(configStorePromise)

// ─── Компонент-пример ───────────────────────────────────────────────────────

export function SynapseAwaiterExample() {
  return (
    <div style={cardStyle}>
      <h2>createSynapseAwaiter — framework-agnostic awaiter</h2>
      <p>
        Обёртка для ожидания асинхронной инициализации store.
        Работает в любом JS-окружении: Node.js, браузер, React Native.
      </p>

      {/* ─── Импорты ──────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Импорты</h3>
      <pre style={codeBlock}>{`import { createSynapse, createSynapseAwaiter } from 'synapse-storage/utils'`}</pre>

      {/* ─── Создание ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Создание</h3>
      <pre style={codeBlock}>{`// createSynapseAwaiter принимает Promise<SynapseStore> или готовый SynapseStore

// Вариант 1: Promise (типичный кейс — async инициализация)
const storePromise = createSynapse({
  createStorageFn: async () => {
    const config = await fetch('/api/config').then(r => r.json())
    const storage = new MemoryStorage<ConfigState>({
      name: 'app-config',
      initialState: config,
    })
    storage.initialize()
    return storage
  },
})

const awaiter = createSynapseAwaiter(storePromise)

// Вариант 2: уже готовый store (оборачивается в Promise.resolve)
const readyStore = await createSynapse({ storage: myStorage })
const awaiter2 = createSynapseAwaiter(readyStore)`}</pre>

      {/* ─── isReady / getStatus / getError ────────────────────────────── */}
      <h3 style={sectionTitle}>isReady() / getStatus() / getError()</h3>
      <pre style={codeBlock}>{`// Синхронная проверка готовности
awaiter.isReady()     // boolean

// Текущий статус
awaiter.getStatus()   // 'pending' | 'ready' | 'error'

// Ошибка инициализации (если была)
awaiter.getError()    // Error | null`}</pre>

      {/* ─── getStoreIfReady ──────────────────────────────────────────── */}
      <h3 style={sectionTitle}>getStoreIfReady()</h3>
      <pre style={codeBlock}>{`// Возвращает store, если он готов, или undefined
const store = awaiter.getStoreIfReady()

if (store) {
  // SynapseStore — тип зависит от конфигурации createSynapse:
  // - SynapseStoreBasic      (без dispatcher)
  // - SynapseStoreWithDispatcher
  // - SynapseStoreWithEffects
  //
  // Всегда есть:
  //   store.storage   — ISyncStorage | IAsyncStorage
  //   store.selectors — объект с селекторами
  //   store.destroy() — очистка ресурсов
  //
  // С dispatcher дополнительно:
  //   store.actions    — типизированные action'ы
  //   store.dispatcher — raw dispatcher
  //
  // С effects дополнительно:
  //   store.state$     — Observable<TStore>

  const state = store.storage.getStateSync()
  console.log(state.locale)  // 'ru'
}`}</pre>

      {/* ─── waitForReady ─────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>waitForReady()</h3>
      <pre style={codeBlock}>{`// Асинхронное ожидание — возвращает Promise<SynapseStore>
const store = await awaiter.waitForReady()

// Безопасно вызывать многократно — возвращает тот же store
const store1 = await awaiter.waitForReady()
const store2 = await awaiter.waitForReady()
// store1 === store2`}</pre>

      {/* ─── onReady / onError ────────────────────────────────────────── */}
      <h3 style={sectionTitle}>onReady() / onError()</h3>
      <pre style={codeBlock}>{`// Подписка на готовность — возвращает функцию отписки
const unsub = awaiter.onReady((store) => {
  console.log('Store ready!')
  const state = store.storage.getStateSync()
  console.log(state)
})

// Если store уже ready — callback вызовется сразу (синхронно)
// Можно подписать несколько обработчиков

// Подписка на ошибку
const unsubErr = awaiter.onError((error) => {
  console.error('Init failed:', error.message)
})

// Если ошибка уже произошла — callback вызовется сразу

// Отписка
unsub()
unsubErr()`}</pre>

      {/* ─── destroy ──────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>destroy()</h3>
      <pre style={codeBlock}>{`// Очистка ресурсов: сбрасывает подписки, статус -> 'pending', store -> undefined
awaiter.destroy()

// После destroy:
awaiter.isReady()        // false
awaiter.getStatus()      // 'pending'
awaiter.getStoreIfReady() // undefined`}</pre>

      {/* ─── Пример: React-компонент ──────────────────────────────────── */}
      <h3 style={sectionTitle}>Пример: использование в React-компоненте</h3>
      <pre style={codeBlock}>{`function ConfigPanel() {
  const [status, setStatus] = useState(awaiter.getStatus())
  const [config, setConfig] = useState<ConfigState | null>(null)

  useEffect(() => {
    const unsubReady = awaiter.onReady((store) => {
      setStatus('ready')
      setConfig(store.storage.getStateSync())
    })

    const unsubError = awaiter.onError(() => {
      setStatus('error')
    })

    // Если уже ready — обновим сразу
    if (awaiter.isReady()) {
      setStatus('ready')
      setConfig(awaiter.getStoreIfReady()?.storage.getStateSync() ?? null)
    }

    return () => { unsubReady(); unsubError() }
  }, [])

  if (status === 'pending') return <div>Loading config...</div>
  if (status === 'error') return <div>Error!</div>
  return <div>Locale: {config?.locale}</div>
}`}</pre>

      {/* ─── Live demo ────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Live Demo</h3>
      <ReactStatusPanel />
      <VanillaJsUsagePanel />
    </div>
  )
}

// ─── Демо-компоненты ────────────────────────────────────────────────────────

function ReactStatusPanel() {
  const [status, setStatus] = useState(configAwaiter.getStatus())
  const [config, setConfig] = useState<ConfigState | null>(null)

  useEffect(() => {
    const unsubReady = configAwaiter.onReady((store) => {
      setStatus('ready')
      setConfig(store.storage.getStateSync())
    })

    const unsubError = configAwaiter.onError(() => {
      setStatus('error')
    })

    if (configAwaiter.isReady()) {
      setStatus('ready')
      const s = configAwaiter.getStoreIfReady()?.storage.getStateSync()
      if (s) setConfig(s)
    }

    return () => { unsubReady(); unsubError() }
  }, [])

  return (
    <div style={{ padding: 8, background: '#e8f5e9', borderRadius: 4, marginTop: 8 }}>
      <strong>Demo: React component</strong>
      <div>Status: <code>{status}</code></div>
      {config && (
        <div style={{ fontSize: 12, marginTop: 4 }}>
          locale: {config.locale}, apiUrl: {config.apiUrl}, flags: {JSON.stringify(config.featureFlags)}
        </div>
      )}
      {status === 'pending' && <div style={{ color: '#888' }}>Waiting for initialization (2 sec)...</div>}
    </div>
  )
}

function VanillaJsUsagePanel() {
  const [log, setLog] = useState<string[]>([])
  const addLog = (msg: string) => setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])

  return (
    <div style={{ padding: 8, background: '#fff3e0', borderRadius: 4, marginTop: 8 }}>
      <strong>Demo: Vanilla JS API</strong>
      <div style={buttonRow}>
        <button onClick={() => addLog(`isReady(): ${configAwaiter.isReady()}`)}>
          isReady()
        </button>
        <button onClick={() => addLog(`getStatus(): ${configAwaiter.getStatus()}`)}>
          getStatus()
        </button>
        <button onClick={() => {
          const store = configAwaiter.getStoreIfReady()
          if (store) {
            const s = store.storage.getStateSync()
            addLog(`getStoreIfReady() -> locale: ${s.locale}`)
          } else {
            addLog('getStoreIfReady() -> undefined (not ready)')
          }
        }}>
          getStoreIfReady()
        </button>
        <button onClick={async () => {
          addLog('waitForReady() called...')
          const store = await configAwaiter.waitForReady()
          const state = store.storage.getStateSync()
          addLog(`waitForReady() resolved -> apiUrl: ${state.apiUrl}`)
        }}>
          await waitForReady()
        </button>
      </div>

      <div style={{ ...buttonRow, marginTop: 4 }}>
        <button onClick={() => {
          const unsub = configAwaiter.onReady((store) => {
            const s = store.storage.getStateSync()
            addLog(`onReady() -> flags: ${JSON.stringify(s.featureFlags)}`)
          })
          addLog('onReady() subscribed (fires immediately if ready)')
          setTimeout(unsub, 5000)
        }}>
          onReady(cb)
        </button>
        <button onClick={() => {
          const unsub = configAwaiter.onError((err) => {
            addLog(`onError() -> ${err.message}`)
          })
          addLog('onError() subscribed')
          setTimeout(unsub, 5000)
        }}>
          onError(cb)
        </button>
        <button onClick={() => addLog(`getError(): ${configAwaiter.getError()}`)}>
          getError()
        </button>
      </div>

      {log.length > 0 && (
        <>
          <pre style={{ ...codeBlock, fontSize: 11, maxHeight: 200, overflow: 'auto', marginTop: 8 }}>
            {log.join('\n')}
          </pre>
          <button onClick={() => setLog([])} style={{ fontSize: 11 }}>Clear log</button>
        </>
      )}
    </div>
  )
}
