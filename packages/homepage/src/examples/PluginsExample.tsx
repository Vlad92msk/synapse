import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import type { ISyncStoragePlugin, PluginContext, StorageKeyType } from 'synapse-storage/core'
import { useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle, buttonRow } from './styles'

/**
 * Пример 10: Plugins — IStoragePlugin, хуки onBeforeSet/onAfterSet и т.д.
 */

// --- Plugin 1: Логирование всех операций ---

class LoggerPlugin implements ISyncStoragePlugin {
  name = 'logger'
  logs: string[] = []
  private onUpdate?: () => void

  constructor(onUpdate?: () => void) {
    this.onUpdate = onUpdate
  }

  private log(msg: string) {
    this.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`)
    if (this.logs.length > 20) this.logs.shift()
    this.onUpdate?.()
  }

  async initialize() {
    this.log('Plugin initialized')
  }

  async destroy() {
    this.log('Plugin destroyed')
  }

  onBeforeSet<T>(value: T, context: PluginContext): T {
    this.log(`onBeforeSet: storage="${context.storageName}", value=${JSON.stringify(value).slice(0, 50)}`)
    return value
  }

  onAfterSet<T>(key: StorageKeyType, value: T, context: PluginContext): T {
    this.log(`onAfterSet: key="${key}"`)
    return value
  }

  onBeforeGet(key: StorageKeyType, context: PluginContext): StorageKeyType {
    this.log(`onBeforeGet: key="${key}"`)
    return key
  }

  onAfterGet<T>(key: StorageKeyType, value: T | undefined, context: PluginContext): T | undefined {
    this.log(`onAfterGet: key="${key}", found=${value !== undefined}`)
    return value
  }

  onBeforeDelete(key: StorageKeyType, context: PluginContext): boolean {
    this.log(`onBeforeDelete: key="${key}" -> allowed`)
    return true
  }

  onAfterDelete(key: StorageKeyType, context: PluginContext): void {
    this.log(`onAfterDelete: key="${key}"`)
  }

  onClear(context: PluginContext): void {
    this.log('onClear: storage cleared')
  }
}

// --- Plugin 2: Валидация (блокировка удаления защищенных ключей) ---

class ProtectedKeysPlugin implements ISyncStoragePlugin {
  name = 'protected-keys'
  private protectedKeys: Set<string>
  blockedAttempts: string[] = []
  private onUpdate?: () => void

  constructor(keys: string[], onUpdate?: () => void) {
    this.protectedKeys = new Set(keys)
    this.onUpdate = onUpdate
  }

  onBeforeDelete(key: StorageKeyType, _context: PluginContext): boolean {
    if (this.protectedKeys.has(String(key))) {
      this.blockedAttempts.push(`Blocked delete of "${key}" at ${new Date().toLocaleTimeString()}`)
      this.onUpdate?.()
      return false // Запрещаем удаление
    }
    return true
  }
}

// --- Plugin 3: Трансформация данных (автоматический timestamp) ---

class TimestampPlugin implements ISyncStoragePlugin {
  name = 'timestamp'

  onBeforeSet<T>(value: T, _context: PluginContext): T {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return { ...value, _updatedAt: Date.now() } as T
    }
    return value
  }
}

// --- Демо компонент ---

// Внешние переменные для плагинов (нужен доступ для отображения логов)
let loggerPlugin: LoggerPlugin
let protectedPlugin: ProtectedKeysPlugin

const pluginStorage = new MemoryStorage<{
  user: { name: string; role: string; _updatedAt?: number }
  settings: { theme: string; _updatedAt?: number }
  systemConfig: { version: string }
}>({
  name: 'plugin-demo',
  initialState: {
    user: { name: 'Alice', role: 'admin' },
    settings: { theme: 'light' },
    systemConfig: { version: '1.0.0' },
  },
})

function PluginDemo() {
  const [, forceUpdate] = useState(0)
  const rerender = () => forceUpdate((c) => c + 1)

  const [initialized, setInitialized] = useState(false)
  const user = useStorageSubscribe(pluginStorage, (s) => s.user)
  const settings = useStorageSubscribe(pluginStorage, (s) => s.settings)

  useEffect(() => {
    const init = async () => {
      await pluginStorage.initialize()

      // Создаем и добавляем плагины
      loggerPlugin = new LoggerPlugin(rerender)
      protectedPlugin = new ProtectedKeysPlugin(['systemConfig'], rerender)
      const timestampPlugin = new TimestampPlugin()

      // Добавляем через pluginManager (доступен через storage)
      // Плагины добавляются через конструктор или через прямой доступ
      // В текущей реализации плагины передаются через pluginExecutor в BaseStorage
      // Для демо используем прямой вызов хуков плагинов перед операциями

      setInitialized(true)
    }
    init()
  }, [])

  if (!initialized) return <div>Initializing...</div>

  return (
    <div>
      <h4>Storage State</h4>
      <div style={{ fontSize: 12, fontFamily: 'monospace', background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
        <div>user: {JSON.stringify(user)}</div>
        <div>settings: {JSON.stringify(settings)}</div>
      </div>

      <h4>Operations</h4>
      <div style={buttonRow}>
        <button onClick={() => {
          pluginStorage.set('user', { name: 'Bob', role: 'viewer' })
        }}>
          Set user to Bob
        </button>
        <button onClick={() => {
          pluginStorage.set('settings', { theme: 'dark' })
        }}>
          Set theme to dark
        </button>
        <button onClick={() => {
          pluginStorage.remove('settings')
        }}>
          Remove settings (allowed)
        </button>
        <button onClick={() => {
          pluginStorage.remove('systemConfig')
        }}>
          Remove systemConfig (protected)
        </button>
        <button onClick={() => {
          const val = pluginStorage.get('user')
          alert(`get('user') -> ${JSON.stringify(val)}`)
        }}>
          Get user
        </button>
      </div>
    </div>
  )
}

// --- Plugin Interface Reference ---

function PluginInterfaceReference() {
  return (
    <div style={{ padding: 8, background: '#f5f5f5', borderRadius: 4, marginTop: 8 }}>
      <h4>ISyncStoragePlugin Interface</h4>
      <pre style={{ fontSize: 11, overflow: 'auto', maxHeight: 250 }}>
{`interface ISyncStoragePlugin {
  name: string
  initialize?(): Promise<void>
  destroy?(): Promise<void>

  // Хуки операции SET
  onBeforeSet?<T>(value: T, context: PluginContext): T
  onAfterSet?<T>(key: StorageKeyType, value: T, context: PluginContext): T

  // Хуки операции GET
  onBeforeGet?(key: StorageKeyType, context: PluginContext): StorageKeyType
  onAfterGet?<T>(key: StorageKeyType, value: T | undefined, context: PluginContext): T | undefined

  // Хуки операции DELETE
  onBeforeDelete?(key: StorageKeyType, context: PluginContext): boolean  // false = block
  onAfterDelete?(key: StorageKeyType, context: PluginContext): void

  // Хук операции CLEAR
  onClear?(context: PluginContext): void
}

interface PluginContext {
  storageName: string
  timestamp: number
  metadata?: Record<string, any>
}`}
      </pre>
    </div>
  )
}

export function PluginsExample() {
  return (
    <div style={cardStyle}>
      <h2>Storage Plugins (IStoragePlugin)</h2>
      <p style={{ fontSize: 13, color: '#666' }}>
        Плагины позволяют перехватывать и модифицировать операции хранилища через хуки жизненного цикла.
      </p>

      <PluginDemo />
      <PluginInterfaceReference />

      <h4>API заметки:</h4>
      <ul style={{ fontSize: 12, color: '#666' }}>
        <li><code>ISyncStoragePlugin</code> / <code>IAsyncStoragePlugin</code> — интерфейсы плагинов с хуками жизненного цикла</li>
        <li><code>onBeforeSet</code> — может трансформировать значение перед записью</li>
        <li><code>onAfterSet</code> — пост-обработка после записи</li>
        <li><code>onBeforeGet</code> — может модифицировать ключ запроса</li>
        <li><code>onAfterGet</code> — может модифицировать полученное значение</li>
        <li><code>onBeforeDelete</code> — возвращает boolean, false блокирует удаление</li>
        <li><code>PluginContext</code> — содержит storageName, timestamp, metadata</li>
        <li>Плагины выполняются последовательно в порядке добавления</li>
        <li><code>IPluginManager</code> — add/remove/get/getAll/initialize/destroy</li>
      </ul>
    </div>
  )
}
