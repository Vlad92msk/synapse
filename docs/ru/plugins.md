# Plugins (ISyncStoragePlugin / IAsyncStoragePlugin)

> [Назад к оглавлению](./README.md)

Плагины перехватывают операции хранилища через хуки жизненного цикла. Могут трансформировать данные, блокировать операции, логировать.

## Интерфейс плагина

```typescript
import type { ISyncStoragePlugin, PluginContext, StorageKeyType } from 'synapse-storage/core'

// Для синхронных хранилищ (MemoryStorage, LocalStorage)
interface ISyncStoragePlugin {
  name: string                    // уникальное имя плагина
  initialize?(): Promise<void>    // вызывается при добавлении
  destroy?(): Promise<void>       // вызывается при удалении

  // Хуки SET
  onBeforeSet?<T>(value: T, context: PluginContext): T        // трансформация значения
  onAfterSet?<T>(key: StorageKeyType, value: T, context: PluginContext): T

  // Хуки GET
  onBeforeGet?(key: StorageKeyType, context: PluginContext): StorageKeyType  // модификация ключа
  onAfterGet?<T>(key: StorageKeyType, value: T | undefined, context: PluginContext): T | undefined

  // Хуки DELETE
  onBeforeDelete?(key: StorageKeyType, context: PluginContext): boolean  // false = блокировать
  onAfterDelete?(key: StorageKeyType, context: PluginContext): void

  // Хук CLEAR
  onClear?(context: PluginContext): void
}

// Контекст, доступный в каждом хуке
interface PluginContext {
  storageName: string
  timestamp: number
  metadata?: Record<string, any>
}

// Для асинхронных хранилищ (IndexedDB) — IAsyncStoragePlugin
// Тот же интерфейс, но хуки возвращают Promise<T>
```

## Создание плагина

```typescript
// Пример 1: Логгер — логирует все операции
class LoggerPlugin implements ISyncStoragePlugin {
  name = 'logger'

  onBeforeSet<T>(value: T, context: PluginContext): T {
    console.log(`[set] storage="${context.storageName}"`, value)
    return value  // ВАЖНО: возвращаем значение (можно модифицировать)
  }

  onBeforeDelete(key: StorageKeyType, context: PluginContext): boolean {
    console.log(`[delete] key="${key}"`)
    return true   // true = разрешить, false = заблокировать
  }
}

// Пример 2: Защищённые ключи — блокирует удаление определённых ключей
class ProtectedKeysPlugin implements ISyncStoragePlugin {
  name = 'protected-keys'
  private protectedKeys: Set<string>

  constructor(keys: string[]) {
    this.protectedKeys = new Set(keys)
  }

  onBeforeDelete(key: StorageKeyType): boolean {
    return !this.protectedKeys.has(String(key))  // false = заблокировать
  }
}

// Пример 3: Метка времени — автоматически добавляет _updatedAt
class TimestampPlugin implements ISyncStoragePlugin {
  name = 'timestamp'

  onBeforeSet<T>(value: T): T {
    if (typeof value === 'object' && value !== null) {
      return { ...value, _updatedAt: Date.now() } as T
    }
    return value
  }
}
```

## Подключение к хранилищу

```typescript
import { MemoryStorage, SyncStoragePluginModule } from 'synapse-storage/core'

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
// → запись в хранилище
// → LoggerPlugin.onAfterSet

storage.remove('config')
// → ProtectedKeysPlugin.onBeforeDelete → false → удаление заблокировано
```

## Управление плагинами (IPluginManager)

```typescript
// SyncStoragePluginModule реализует IPluginManager<ISyncStoragePlugin>

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

// Для IndexedDB: AsyncStoragePluginModule + IAsyncStoragePlugin
```

## Порядок выполнения

```typescript
// Плагины выполняются последовательно в порядке добавления
await pluginModule.add(pluginA)  // первый
await pluginModule.add(pluginB)  // второй

storage.set('key', value)
// 1. pluginA.onBeforeSet(value) → transformedA
// 2. pluginB.onBeforeSet(transformedA) → transformedB
// 3. запись transformedB в хранилище
// 4. pluginA.onAfterSet(key, transformedB)
// 5. pluginB.onAfterSet(key, transformedB)

// onBeforeDelete: если хотя бы один вернёт false — удаление блокируется
```
