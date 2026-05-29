import { useState, useEffect } from 'react'
import { MemoryStorage, SyncStoragePluginModule } from 'synapse-storage/core'
import type { ISyncStoragePlugin, PluginContext, StorageKeyType } from 'synapse-storage/core'
import { useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

// ─── Plugin implementations ────────────────────────────────────────────────

class LoggerPlugin implements ISyncStoragePlugin {
  name = 'logger'
  logs: string[] = []
  private onUpdate?: () => void

  constructor(onUpdate?: () => void) {
    this.onUpdate = onUpdate
  }

  private log(msg: string) {
    this.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`)
    if (this.logs.length > 15) this.logs.shift()
    this.onUpdate?.()
  }

  async initialize() { this.log('Plugin initialized') }
  async destroy() { this.log('Plugin destroyed') }

  onBeforeSet<T>(value: T, context: PluginContext): T {
    this.log(`beforeSet: storage="${context.storageName}"`)
    return value
  }

  onAfterSet<T>(key: StorageKeyType, value: T, _ctx: PluginContext): T {
    this.log(`afterSet: key="${key}"`)
    return value
  }

  onBeforeGet(key: StorageKeyType, _ctx: PluginContext): StorageKeyType {
    this.log(`beforeGet: key="${key}"`)
    return key
  }

  onAfterGet<T>(key: StorageKeyType, value: T | undefined, _ctx: PluginContext): T | undefined {
    this.log(`afterGet: key="${key}", found=${value !== undefined}`)
    return value
  }

  onBeforeDelete(key: StorageKeyType, _ctx: PluginContext): boolean {
    this.log(`beforeDelete: key="${key}" → allowed`)
    return true
  }

  onAfterDelete(key: StorageKeyType, _ctx: PluginContext): void {
    this.log(`afterDelete: key="${key}"`)
  }

  onClear(_ctx: PluginContext): void {
    this.log('onClear')
  }
}

class ProtectedKeysPlugin implements ISyncStoragePlugin {
  name = 'protected-keys'
  private protectedKeys: Set<string>
  blockedLog: string[] = []
  private onUpdate?: () => void

  constructor(keys: string[], onUpdate?: () => void) {
    this.protectedKeys = new Set(keys)
    this.onUpdate = onUpdate
  }

  onBeforeDelete(key: StorageKeyType, _ctx: PluginContext): boolean {
    if (this.protectedKeys.has(String(key))) {
      this.blockedLog.push(`Blocked delete "${key}" at ${new Date().toLocaleTimeString()}`)
      if (this.blockedLog.length > 10) this.blockedLog.shift()
      this.onUpdate?.()
      return false // блокируем удаление
    }
    return true
  }
}

class TimestampPlugin implements ISyncStoragePlugin {
  name = 'timestamp'

  onBeforeSet<T>(value: T, _ctx: PluginContext): T {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return { ...value, _updatedAt: Date.now() } as T
    }
    return value
  }
}

// ─── Demo ──────────────────────────────────────────────────────────────────

let loggerRef: LoggerPlugin
let protectedRef: ProtectedKeysPlugin

const pluginModule = new SyncStoragePluginModule(undefined, undefined, 'plugin-demo')

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
}, pluginModule)

function PluginDemo() {
  const [, forceUpdate] = useState(0)
  const rerender = () => forceUpdate((c) => c + 1)
  const [ready, setReady] = useState(false)

  const user = useStorageSubscribe(pluginStorage, (s) => s.user)
  const settings = useStorageSubscribe(pluginStorage, (s) => s.settings)
  const systemConfig = useStorageSubscribe(pluginStorage, (s) => s.systemConfig)

  useEffect(() => {
    ;(async () => {
      loggerRef = new LoggerPlugin(rerender)
      protectedRef = new ProtectedKeysPlugin(['systemConfig'], rerender)

      await pluginModule.add(loggerRef)
      await pluginModule.add(protectedRef)
      await pluginModule.add(new TimestampPlugin())
      await pluginStorage.initialize()
      setReady(true)
    })()
  }, [])

  if (!ready) return <div>Initializing...</div>

  return (
    <div>
      <p>State:</p>
      <pre style={{ ...codeBlock, fontSize: 11 }}>{JSON.stringify({ user, settings, systemConfig }, null, 2)}</pre>

      <div style={buttonRow}>
        <button onClick={() => pluginStorage.set('user', { name: 'Bob', role: 'viewer' })}>
          set user → Bob
        </button>
        <button onClick={() => pluginStorage.set('settings', { theme: 'dark' })}>
          set theme → dark
        </button>
        <button onClick={() => pluginStorage.remove('settings')}>
          remove settings (ok)
        </button>
        <button onClick={() => pluginStorage.remove('systemConfig')}>
          remove systemConfig (blocked)
        </button>
        <button onClick={() => { pluginStorage.get('user') }}>
          get user
        </button>
        <button onClick={() => pluginStorage.reset()}>
          reset
        </button>
      </div>

      {loggerRef && loggerRef.logs.length > 0 && (
        <div>
          <p>Logger plugin log:</p>
          <pre style={{ ...codeBlock, fontSize: 11, maxHeight: 150, overflow: 'auto' }}>
            {loggerRef.logs.join('\n')}
          </pre>
        </div>
      )}

      {protectedRef && protectedRef.blockedLog.length > 0 && (
        <div>
          <p>Protected keys blocked:</p>
          <pre style={{ ...codeBlock, fontSize: 11, color: '#c62828' }}>
            {protectedRef.blockedLog.join('\n')}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────

export function PluginsExample() {
  return (
    <div style={cardStyle}>
      <h2>Plugins (ISyncStoragePlugin / IAsyncStoragePlugin)</h2>
      <p>
        Плагины перехватывают операции хранилища через хуки жизненного цикла.
        Можно трансформировать данные, блокировать операции, логировать.
      </p>

      {/* ─── Интерфейс ───────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Интерфейс плагина</h3>
      <pre style={codeBlock}>{`import type { ISyncStoragePlugin, PluginContext, StorageKeyType } from 'synapse-storage/core'

// Для sync-хранилищ (MemoryStorage, LocalStorage)
interface ISyncStoragePlugin {
  name: string                    // уникальное имя плагина
  initialize?(): Promise<void>    // вызывается при добавлении
  destroy?(): Promise<void>       // вызывается при удалении

  // SET hooks
  onBeforeSet?<T>(value: T, context: PluginContext): T        // трансформация значения
  onAfterSet?<T>(key: StorageKeyType, value: T, context: PluginContext): T

  // GET hooks
  onBeforeGet?(key: StorageKeyType, context: PluginContext): StorageKeyType  // модификация ключа
  onAfterGet?<T>(key: StorageKeyType, value: T | undefined, context: PluginContext): T | undefined

  // DELETE hooks
  onBeforeDelete?(key: StorageKeyType, context: PluginContext): boolean  // false = блокировать
  onAfterDelete?(key: StorageKeyType, context: PluginContext): void

  // CLEAR hook
  onClear?(context: PluginContext): void
}

// Контекст, доступный в каждом хуке
interface PluginContext {
  storageName: string
  timestamp: number
  metadata?: Record<string, any>
}

// Для async-хранилищ (IndexedDB) — IAsyncStoragePlugin
// Тот же интерфейс, но хуки возвращают Promise<T>`}</pre>

      {/* ─── Создание плагина ─────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Создание плагина</h3>
      <pre style={codeBlock}>{`// Пример 1: Logger — логирует все операции
class LoggerPlugin implements ISyncStoragePlugin {
  name = 'logger'

  onBeforeSet<T>(value: T, context: PluginContext): T {
    console.log(\`[set] storage="\${context.storageName}"\`, value)
    return value  // ВАЖНО: вернуть value (можно модифицированный)
  }

  onBeforeDelete(key: StorageKeyType, context: PluginContext): boolean {
    console.log(\`[delete] key="\${key}"\`)
    return true   // true = разрешить, false = заблокировать
  }
}

// Пример 2: Protected keys — блокирует удаление определённых ключей
class ProtectedKeysPlugin implements ISyncStoragePlugin {
  name = 'protected-keys'
  private protectedKeys: Set<string>

  constructor(keys: string[]) {
    this.protectedKeys = new Set(keys)
  }

  onBeforeDelete(key: StorageKeyType): boolean {
    return !this.protectedKeys.has(String(key))  // false = блокировать
  }
}

// Пример 3: Timestamp — автоматически добавляет _updatedAt
class TimestampPlugin implements ISyncStoragePlugin {
  name = 'timestamp'

  onBeforeSet<T>(value: T): T {
    if (typeof value === 'object' && value !== null) {
      return { ...value, _updatedAt: Date.now() } as T
    }
    return value
  }
}`}</pre>

      {/* ─── Подключение к хранилищу ──────────────────────────────────── */}
      <h3 style={sectionTitle}>Подключение к хранилищу</h3>
      <pre style={codeBlock}>{`import { MemoryStorage, SyncStoragePluginModule } from 'synapse-storage/core'

// 1. Создаём модуль плагинов
const pluginModule = new SyncStoragePluginModule(
  undefined,        // parentExecutor (для цепочек)
  undefined,        // logger
  'my-store',       // storageName (для PluginContext)
)

// 2. Добавляем плагины
await pluginModule.add(new LoggerPlugin())
await pluginModule.add(new ProtectedKeysPlugin(['config']))
await pluginModule.add(new TimestampPlugin())

// 3. Передаём модуль в хранилище
const storage = new MemoryStorage<MyState>({
  name: 'my-store',
  initialState: { ... },
}, pluginModule)  // <-- второй аргумент конструктора

await storage.initialize()

// Теперь все операции проходят через плагины:
storage.set('user', { name: 'Bob' })
// → LoggerPlugin.onBeforeSet (логирует)
// → TimestampPlugin.onBeforeSet (добавляет _updatedAt)
// → записывает в хранилище
// → LoggerPlugin.onAfterSet

storage.remove('config')
// → ProtectedKeysPlugin.onBeforeDelete → false → удаление заблокировано`}</pre>

      {/* ─── Управление плагинами ─────────────────────────────────────── */}
      <h3 style={sectionTitle}>Управление плагинами (IPluginManager)</h3>
      <pre style={codeBlock}>{`// SyncStoragePluginModule реализует IPluginManager<ISyncStoragePlugin>

// Добавить плагин (вызывает plugin.initialize())
await pluginModule.add(new LoggerPlugin())

// Удалить плагин (вызывает plugin.destroy())
await pluginModule.remove('logger')

// Получить плагин по имени
const logger = pluginModule.get('logger')  // ISyncStoragePlugin | undefined

// Получить все плагины
const all = pluginModule.getAll()  // ISyncStoragePlugin[]

// Инициализировать все плагины
await pluginModule.initialize()

// Уничтожить все плагины
await pluginModule.destroy()

// Для IndexedDB: AsyncStoragePluginModule + IAsyncStoragePlugin`}</pre>

      {/* ─── Live demo ───────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Live demo</h3>
      <p style={{ fontSize: 12, color: '#666' }}>
        3 плагина: Logger (логирует), ProtectedKeys (блокирует удаление systemConfig),
        Timestamp (добавляет _updatedAt к объектам).
      </p>
      <PluginDemo />

      {/* ─── Порядок выполнения ───────────────────────────────────────── */}
      <h3 style={sectionTitle}>Порядок выполнения</h3>
      <pre style={codeBlock}>{`// Плагины выполняются последовательно в порядке добавления
await pluginModule.add(pluginA)  // первый
await pluginModule.add(pluginB)  // второй

storage.set('key', value)
// 1. pluginA.onBeforeSet(value) → transformedA
// 2. pluginB.onBeforeSet(transformedA) → transformedB
// 3. запись transformedB в хранилище
// 4. pluginA.onAfterSet(key, transformedB)
// 5. pluginB.onAfterSet(key, transformedB)

// onBeforeDelete: если любой вернёт false — удаление блокируется`}</pre>
    </div>
  )
}
