# Plugins (ISyncStoragePlugin / IAsyncStoragePlugin)

> [Back to Main](../../README.md)

Plugins intercept storage operations via lifecycle hooks. Can transform data, block operations, log.

## Plugin Interface

```typescript
import type { ISyncStoragePlugin, PluginContext, StorageKeyType } from 'synapse-storage/core'

// For sync storages (MemoryStorage, LocalStorage)
interface ISyncStoragePlugin {
  name: string                    // unique plugin name
  initialize?(): Promise<void>    // called on add
  destroy?(): Promise<void>       // called on remove

  // SET hooks
  onBeforeSet?<T>(value: T, context: PluginContext): T        // transform value
  onAfterSet?<T>(key: StorageKeyType, value: T, context: PluginContext): T

  // GET hooks
  onBeforeGet?(key: StorageKeyType, context: PluginContext): StorageKeyType  // modify key
  onAfterGet?<T>(key: StorageKeyType, value: T | undefined, context: PluginContext): T | undefined

  // DELETE hooks
  onBeforeDelete?(key: StorageKeyType, context: PluginContext): boolean  // false = block
  onAfterDelete?(key: StorageKeyType, context: PluginContext): void

  // CLEAR hook
  onClear?(context: PluginContext): void
}

// Context available in every hook
interface PluginContext {
  storageName: string
  timestamp: number
  metadata?: Record<string, any>
}

// For async storages (IndexedDB) — IAsyncStoragePlugin
// Same interface, but hooks return Promise<T>
```

## Creating a Plugin

```typescript
// Example 1: Logger — logs all operations
class LoggerPlugin implements ISyncStoragePlugin {
  name = 'logger'

  onBeforeSet<T>(value: T, context: PluginContext): T {
    console.log(`[set] storage="${context.storageName}"`, value)
    return value  // IMPORTANT: return value (can be modified)
  }

  onBeforeDelete(key: StorageKeyType, context: PluginContext): boolean {
    console.log(`[delete] key="${key}"`)
    return true   // true = allow, false = block
  }
}

// Example 2: Protected keys — blocks deletion of certain keys
class ProtectedKeysPlugin implements ISyncStoragePlugin {
  name = 'protected-keys'
  private protectedKeys: Set<string>

  constructor(keys: string[]) {
    this.protectedKeys = new Set(keys)
  }

  onBeforeDelete(key: StorageKeyType): boolean {
    return !this.protectedKeys.has(String(key))  // false = block
  }
}

// Example 3: Timestamp — automatically adds _updatedAt
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

## Connecting to Storage

```typescript
import { MemoryStorage, SyncStoragePluginModule } from 'synapse-storage/core'

// 1. Create plugin module
const pluginModule = new SyncStoragePluginModule(
  undefined,        // parentExecutor (for chains)
  undefined,        // logger
  'my-store',       // storageName (for PluginContext)
)

// 2. Add plugins
await pluginModule.add(new LoggerPlugin())
await pluginModule.add(new ProtectedKeysPlugin(['config']))
await pluginModule.add(new TimestampPlugin())

// 3. Pass module to storage
const storage = new MemoryStorage<MyState>({
  name: 'my-store',
  initialState: { ... },
}, pluginModule)  // <-- second constructor argument

await storage.initialize()

// Now all operations pass through plugins:
storage.set('user', { name: 'Bob' })
// → LoggerPlugin.onBeforeSet (logs)
// → TimestampPlugin.onBeforeSet (adds _updatedAt)
// → writes to storage
// → LoggerPlugin.onAfterSet

storage.remove('config')
// → ProtectedKeysPlugin.onBeforeDelete → false → deletion blocked
```

## Managing Plugins (IPluginManager)

```typescript
// SyncStoragePluginModule implements IPluginManager<ISyncStoragePlugin>

// Add plugin (calls plugin.initialize())
await pluginModule.add(new LoggerPlugin())

// Remove plugin (calls plugin.destroy())
await pluginModule.remove('logger')

// Get plugin by name
const logger = pluginModule.get('logger')  // ISyncStoragePlugin | undefined

// Get all plugins
const all = pluginModule.getAll()  // ISyncStoragePlugin[]

// Initialize all plugins
await pluginModule.initialize()

// Destroy all plugins
await pluginModule.destroy()

// For IndexedDB: AsyncStoragePluginModule + IAsyncStoragePlugin
```

## Execution Order

```typescript
// Plugins execute sequentially in the order they were added
await pluginModule.add(pluginA)  // first
await pluginModule.add(pluginB)  // second

storage.set('key', value)
// 1. pluginA.onBeforeSet(value) → transformedA
// 2. pluginB.onBeforeSet(transformedA) → transformedB
// 3. write transformedB to storage
// 4. pluginA.onAfterSet(key, transformedB)
// 5. pluginB.onAfterSet(key, transformedB)

// onBeforeDelete: if any returns false — deletion is blocked
```
