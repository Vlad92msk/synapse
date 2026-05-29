import { ILogger } from '../../storage.interface'
import { StorageKeyType } from '../../utils/storage-key'
import { IAsyncPluginExecutor, IAsyncStoragePlugin, IPluginManager, ISyncPluginExecutor, ISyncStoragePlugin, PluginContext } from './plugin.interface'

// ─── Sync Plugin Module ───────────────────────────────────────────────────────

export class SyncStoragePluginModule implements IPluginManager<ISyncStoragePlugin>, ISyncPluginExecutor {
  private plugins = new Map<string, ISyncStoragePlugin>()

  constructor(
    protected readonly parentExecutor?: ISyncPluginExecutor,
    protected readonly logger?: ILogger,
    protected readonly storageName: string = 'default',
  ) {}

  private createContext(metadata?: Record<string, any>): PluginContext {
    return {
      storageName: this.storageName,
      timestamp: Date.now(),
      metadata,
    }
  }

  public async add(plugin: ISyncStoragePlugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      this.logger?.warn(`Плагин ${plugin.name} уже был зарегистрирован`)
      return
    }

    try {
      await plugin.initialize?.()
      this.plugins.set(plugin.name, plugin)
      this.logger?.info('Плагин добавлен', { name: plugin.name })
    } catch (error) {
      throw error
    }
  }

  public async remove(name: string): Promise<void> {
    const plugin = this.plugins.get(name)
    if (plugin) {
      await plugin.destroy?.()
      this.plugins.delete(name)
      this.logger?.info('Плагин удален', { name })
    }
  }

  public get(name: string): ISyncStoragePlugin | undefined {
    return this.plugins.get(name)
  }

  public getAll(): ISyncStoragePlugin[] {
    return Array.from(this.plugins.values())
  }

  public async initialize(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      await plugin.initialize?.()
    }
  }

  public async destroy(): Promise<void> {
    await Promise.all(Array.from(this.plugins.values()).map((plugin) => plugin.destroy?.() ?? Promise.resolve()))
    this.plugins.clear()
  }

  public executeBeforeSet<T>(value: T, metadata?: Record<string, any>): T {
    let result = value
    const context = this.createContext(metadata)

    if (this.parentExecutor) {
      result = this.parentExecutor.executeBeforeSet(result, metadata)
    }

    for (const plugin of this.plugins.values()) {
      if (plugin.onBeforeSet) {
        try {
          result = plugin.onBeforeSet(result, context)
        } catch (error) {
          this.logger?.error(`Ошибка в плагине ${plugin.name} onBeforeSet`, { error })
          throw error
        }
      }
    }

    return result
  }

  public executeAfterSet<T>(key: StorageKeyType, value: T, metadata?: Record<string, any>): T {
    let result = value
    const context = this.createContext(metadata)

    if (this.parentExecutor) {
      result = this.parentExecutor.executeAfterSet(key, result, metadata)
    }

    for (const plugin of this.plugins.values()) {
      if (plugin.onAfterSet) {
        try {
          result = plugin.onAfterSet(key, result, context)
        } catch (error) {
          this.logger?.error(`Ошибка в плагине ${plugin.name} onAfterSet`, { key, error })
          throw error
        }
      }
    }

    return result
  }

  public executeBeforeGet(key: StorageKeyType, metadata?: Record<string, any>): StorageKeyType {
    let processedKey = key
    const context = this.createContext(metadata)

    if (this.parentExecutor) {
      processedKey = this.parentExecutor.executeBeforeGet(processedKey, metadata)
    }

    for (const plugin of this.plugins.values()) {
      if (plugin.onBeforeGet) {
        try {
          processedKey = plugin.onBeforeGet(processedKey, context)
        } catch (error) {
          this.logger?.error(`Ошибка в плагине ${plugin.name} onBeforeGet`, { key, error })
          throw error
        }
      }
    }

    return processedKey
  }

  public executeAfterGet<T>(key: StorageKeyType, value: T | undefined, metadata?: Record<string, any>): T | undefined {
    let result = value
    const context = this.createContext(metadata)

    if (this.parentExecutor) {
      result = this.parentExecutor.executeAfterGet(key, result, metadata)
    }

    for (const plugin of this.plugins.values()) {
      if (plugin.onAfterGet) {
        try {
          result = plugin.onAfterGet(key, result, context)
        } catch (error) {
          this.logger?.error(`Ошибка в плагине ${plugin.name} onAfterGet`, { key, error })
          throw error
        }
      }
    }

    return result
  }

  public executeBeforeDelete(key: StorageKeyType, metadata?: Record<string, any>): boolean {
    let canDelete = true
    const context = this.createContext(metadata)

    if (this.parentExecutor) {
      canDelete = this.parentExecutor.executeBeforeDelete(key, metadata)
    }

    for (const plugin of this.plugins.values()) {
      if (plugin.onBeforeDelete) {
        try {
          canDelete = plugin.onBeforeDelete(key, context) && canDelete
        } catch (error) {
          this.logger?.error(`Ошибка в плагине ${plugin.name} onBeforeDelete`, { key, error })
          throw error
        }
      }
    }

    return canDelete
  }

  public executeAfterDelete(key: StorageKeyType, metadata?: Record<string, any>): void {
    const context = this.createContext(metadata)

    if (this.parentExecutor) {
      this.parentExecutor.executeAfterDelete(key, metadata)
    }

    for (const plugin of this.plugins.values()) {
      if (plugin.onAfterDelete) {
        try {
          plugin.onAfterDelete(key, context)
        } catch (error) {
          this.logger?.error(`Ошибка в плагине ${plugin.name} onAfterDelete`, { key, error })
          throw error
        }
      }
    }
  }

  public executeOnClear(metadata?: Record<string, any>): void {
    const context = this.createContext(metadata)

    if (this.parentExecutor) {
      this.parentExecutor.executeOnClear(metadata)
    }

    for (const plugin of this.plugins.values()) {
      if (plugin.onClear) {
        try {
          plugin.onClear(context)
        } catch (error) {
          this.logger?.error(`Ошибка в плагине ${plugin.name} onClear`, { error })
          throw error
        }
      }
    }
  }
}

// ─── Async Plugin Module ──────────────────────────────────────────────────────

export class AsyncStoragePluginModule implements IPluginManager<IAsyncStoragePlugin>, IAsyncPluginExecutor {
  private plugins = new Map<string, IAsyncStoragePlugin>()

  constructor(
    protected readonly parentExecutor?: IAsyncPluginExecutor,
    protected readonly logger?: ILogger,
    protected readonly storageName: string = 'default',
  ) {}

  private createContext(metadata?: Record<string, any>): PluginContext {
    return {
      storageName: this.storageName,
      timestamp: Date.now(),
      metadata,
    }
  }

  public async add(plugin: IAsyncStoragePlugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      this.logger?.warn(`Плагин ${plugin.name} уже был зарегистрирован`)
      return
    }

    try {
      await plugin.initialize?.()
      this.plugins.set(plugin.name, plugin)
      this.logger?.info('Плагин добавлен', { name: plugin.name })
    } catch (error) {
      throw error
    }
  }

  public async remove(name: string): Promise<void> {
    const plugin = this.plugins.get(name)
    if (plugin) {
      await plugin.destroy?.()
      this.plugins.delete(name)
      this.logger?.info('Плагин удален', { name })
    }
  }

  public get(name: string): IAsyncStoragePlugin | undefined {
    return this.plugins.get(name)
  }

  public getAll(): IAsyncStoragePlugin[] {
    return Array.from(this.plugins.values())
  }

  public async initialize(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      await plugin.initialize?.()
    }
  }

  public async destroy(): Promise<void> {
    await Promise.all(Array.from(this.plugins.values()).map((plugin) => plugin.destroy?.() ?? Promise.resolve()))
    this.plugins.clear()
  }

  public async executeBeforeSet<T>(value: T, metadata?: Record<string, any>): Promise<T> {
    let result = value
    const context = this.createContext(metadata)

    if (this.parentExecutor) {
      result = await this.parentExecutor.executeBeforeSet(result, metadata)
    }

    for (const plugin of this.plugins.values()) {
      if (plugin.onBeforeSet) {
        try {
          result = await plugin.onBeforeSet(result, context)
        } catch (error) {
          this.logger?.error(`Ошибка в плагине ${plugin.name} onBeforeSet`, { error })
          throw error
        }
      }
    }

    return result
  }

  public async executeAfterSet<T>(key: StorageKeyType, value: T, metadata?: Record<string, any>): Promise<T> {
    let result = value
    const context = this.createContext(metadata)

    if (this.parentExecutor) {
      result = await this.parentExecutor.executeAfterSet(key, result, metadata)
    }

    for (const plugin of this.plugins.values()) {
      if (plugin.onAfterSet) {
        try {
          result = await plugin.onAfterSet(key, result, context)
        } catch (error) {
          this.logger?.error(`Ошибка в плагине ${plugin.name} onAfterSet`, { key, error })
          throw error
        }
      }
    }

    return result
  }

  public async executeBeforeGet(key: StorageKeyType, metadata?: Record<string, any>): Promise<StorageKeyType> {
    let processedKey = key
    const context = this.createContext(metadata)

    if (this.parentExecutor) {
      processedKey = await this.parentExecutor.executeBeforeGet(processedKey, metadata)
    }

    for (const plugin of this.plugins.values()) {
      if (plugin.onBeforeGet) {
        try {
          processedKey = await plugin.onBeforeGet(processedKey, context)
        } catch (error) {
          this.logger?.error(`Ошибка в плагине ${plugin.name} onBeforeGet`, { key, error })
          throw error
        }
      }
    }

    return processedKey
  }

  public async executeAfterGet<T>(key: StorageKeyType, value: T | undefined, metadata?: Record<string, any>): Promise<T | undefined> {
    let result = value
    const context = this.createContext(metadata)

    if (this.parentExecutor) {
      result = await this.parentExecutor.executeAfterGet(key, result, metadata)
    }
    for (const plugin of this.plugins.values()) {
      if (plugin.onAfterGet) {
        try {
          result = await plugin.onAfterGet(key, result, context)
        } catch (error) {
          this.logger?.error(`Ошибка в плагине ${plugin.name} onAfterGet`, { key, error })
          throw error
        }
      }
    }

    return result
  }

  public async executeBeforeDelete(key: StorageKeyType, metadata?: Record<string, any>): Promise<boolean> {
    let canDelete = true
    const context = this.createContext(metadata)

    if (this.parentExecutor) {
      canDelete = await this.parentExecutor.executeBeforeDelete(key, context)
    }

    for (const plugin of this.plugins.values()) {
      if (plugin.onBeforeDelete) {
        try {
          canDelete = (await plugin.onBeforeDelete(key, context)) && canDelete
        } catch (error) {
          this.logger?.error(`Ошибка в плагине ${plugin.name} onBeforeDelete`, { key, error })
          throw error
        }
      }
    }

    return canDelete
  }

  public async executeAfterDelete(key: StorageKeyType, metadata?: Record<string, any>): Promise<void> {
    const context = this.createContext(metadata)

    if (this.parentExecutor) {
      await this.parentExecutor.executeAfterDelete(key, context)
    }

    for (const plugin of this.plugins.values()) {
      if (plugin.onAfterDelete) {
        try {
          await plugin.onAfterDelete(key, context)
        } catch (error) {
          this.logger?.error(`Ошибка в плагине ${plugin.name} onAfterDelete`, { key, error })
          throw error
        }
      }
    }
  }

  public async executeOnClear(metadata?: Record<string, any>): Promise<void> {
    const context = this.createContext(metadata)

    if (this.parentExecutor) {
      await this.parentExecutor.executeOnClear(context)
    }

    for (const plugin of this.plugins.values()) {
      if (plugin.onClear) {
        try {
          await plugin.onClear(context)
        } catch (error) {
          this.logger?.error(`Ошибка в плагине ${plugin.name} onClear`, { error })
          throw error
        }
      }
    }
  }
}

/** @deprecated Use AsyncStoragePluginModule */
export class StoragePluginModule extends AsyncStoragePluginModule {}
