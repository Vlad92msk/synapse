import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse, createSynapseAwaiter } from 'synapse-storage/utils'
import { cardStyle, buttonRow } from './styles'

/**
 * Пример 7: createSynapseAwaiter() — framework-agnostic утилита ожидания готовности
 * В отличие от awaitSynapse (React-специфичный), работает в любом JS окружении
 */

interface ConfigState {
  locale: string
  apiUrl: string
  featureFlags: Record<string, boolean>
}

// Эмулируем длительную инициализацию (загрузка конфига с сервера)
const configStorePromise = createSynapse({
  createStorageFn: async () => {
    await new Promise((r) => setTimeout(r, 2000))
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

// Создаем awaiter — framework-agnostic
const configAwaiter = createSynapseAwaiter(configStorePromise)

// --- Пример использования в vanilla JS (имитация) ---
function VanillaJsUsagePanel() {
  const [log, setLog] = useState<string[]>([])

  const addLog = (msg: string) => setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])

  return (
    <div style={{ marginTop: 12 }}>
      <h4>Vanilla JS API (без React)</h4>
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
            addLog('getStoreIfReady() -> undefined (not ready yet)')
          }
        }}>
          getStoreIfReady()
        </button>
        <button onClick={async () => {
          addLog('waitForReady() called, waiting...')
          const store = await configAwaiter.waitForReady()
          const state = store.storage.getStateSync()
          addLog(`waitForReady() resolved -> apiUrl: ${state.apiUrl}`)
        }}>
          await waitForReady()
        </button>
      </div>

      <div style={{ marginTop: 8 }}>
        <strong>onReady / onError callbacks:</strong>
        <div style={buttonRow}>
          <button onClick={() => {
            const unsub = configAwaiter.onReady((store) => {
              const s = store.storage.getStateSync()
              addLog(`onReady callback -> featureFlags: ${JSON.stringify(s.featureFlags)}`)
            })
            addLog('Subscribed to onReady (auto-fires if already ready)')
            // Cleanup after demo
            setTimeout(unsub, 5000)
          }}>
            onReady(cb)
          </button>
          <button onClick={() => {
            const unsub = configAwaiter.onError((err) => {
              addLog(`onError callback -> ${err.message}`)
            })
            addLog('Subscribed to onError')
            setTimeout(unsub, 5000)
          }}>
            onError(cb)
          </button>
        </div>
      </div>

      {log.length > 0 && (
        <pre style={{ fontSize: 11, background: '#f5f5f5', padding: 8, borderRadius: 4, maxHeight: 200, overflow: 'auto' }}>
          {log.join('\n')}
        </pre>
      )}
      {log.length > 0 && (
        <button onClick={() => setLog([])} style={{ fontSize: 11 }}>Clear log</button>
      )}
    </div>
  )
}

// --- Пример: React-обертка поверх createSynapseAwaiter ---
function ReactStatusPanel() {
  const [status, setStatus] = useState(configAwaiter.getStatus())
  const [config, setConfig] = useState<ConfigState | null>(null)

  useEffect(() => {
    // Подписываемся на готовность
    const unsubReady = configAwaiter.onReady((store) => {
      setStatus('ready')
      const state = store.storage.getStateSync()
      setConfig(state)
    })

    const unsubError = configAwaiter.onError(() => {
      setStatus('error')
    })

    // Проверяем текущий статус
    if (configAwaiter.isReady()) {
      setStatus('ready')
      const s = configAwaiter.getStoreIfReady()?.storage.getStateSync()
      if (s) setConfig(s)
    }

    return () => { unsubReady(); unsubError() }
  }, [])

  return (
    <div style={{ padding: 8, background: '#f0f8ff', borderRadius: 4, marginTop: 8 }}>
      <strong>React component using createSynapseAwaiter:</strong>
      <div>Status: <code>{status}</code></div>
      {config && (
        <div style={{ fontSize: 12, marginTop: 4 }}>
          locale: {config.locale}, apiUrl: {config.apiUrl}
        </div>
      )}
      {status === 'pending' && <div style={{ color: '#888' }}>Waiting for initialization (2 sec)...</div>}
    </div>
  )
}

export function SynapseAwaiterExample() {
  return (
    <div style={cardStyle}>
      <h2>createSynapseAwaiter() — framework-agnostic awaiter</h2>
      <p style={{ fontSize: 13, color: '#666' }}>
        Работает в любом JS окружении: Node.js, браузер, React Native.
        Для React рекомендуется <code>awaitSynapse()</code> (пункт 17).
      </p>

      <ReactStatusPanel />
      <VanillaJsUsagePanel />

      <h4>API заметки:</h4>
      <ul style={{ fontSize: 12, color: '#666' }}>
        <li><code>createSynapseAwaiter(promise | store)</code> — создает awaiter</li>
        <li><code>waitForReady()</code> — Promise, резолвится при готовности</li>
        <li><code>isReady()</code> — синхронная проверка</li>
        <li><code>getStoreIfReady()</code> — store | undefined</li>
        <li><code>onReady(cb)</code> / <code>onError(cb)</code> — подписки (возвращают unsubscribe)</li>
        <li><code>getStatus()</code> — 'pending' | 'ready' | 'error'</li>
        <li><code>getError()</code> — Error | null</li>
        <li><code>destroy()</code> — очистка ресурсов</li>
      </ul>
    </div>
  )
}
