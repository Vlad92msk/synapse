import { ILogger, StorageSingletonConfig, StorageType } from '../../storage.interface'
import { ConfigMergeStrategy } from './models'

interface SingletonResult<T> {
  instance: T
  isNewInstance: boolean
  appliedConfig: StorageSingletonConfig
  conflicts?: string[]
}

export class SingletonManager {
  private static instances = new Map<string, any>()
  private static configs = new Map<string, StorageSingletonConfig>()
  private static logger?: ILogger

  static setLogger(logger: ILogger): void {
    this.logger = logger
  }

  // Основной метод для создания/получения singleton
  static getOrCreate<T>(key: string, config: StorageSingletonConfig, factory: (finalConfig: StorageSingletonConfig) => T): SingletonResult<T> {
    const existingConfig = this.configs.get(key)
    const existingInstance = this.instances.get(key)

    // Если экземпляр уже существует
    if (existingInstance && existingConfig) {
      const mergeResult = this.mergeConfigurations(existingConfig, config)

      return {
        instance: existingInstance,
        isNewInstance: false,
        appliedConfig: mergeResult.finalConfig,
        conflicts: mergeResult.conflicts,
      }
    }

    // Создаем новый экземпляр
    const instance = factory(config)
    this.instances.set(key, instance)
    this.configs.set(key, { ...config })

    this.logger?.debug(`Created new singleton instance: ${key}`)

    return {
      instance,
      isNewInstance: true,
      appliedConfig: config,
      conflicts: [],
    }
  }

  // Проверка существования singleton
  static exists(key: string): boolean {
    return this.instances.has(key)
  }

  // Получение конфигурации singleton
  static getConfig(key: string): StorageSingletonConfig | undefined {
    return this.configs.get(key)
  }

  // Удаление singleton
  static remove(key: string): boolean {
    const instance = this.instances.get(key)

    if (instance) {
      // Если у экземпляра есть метод destroy - вызываем его
      if (typeof instance.destroy === 'function') {
        instance.destroy()
      }

      this.instances.delete(key)
      this.configs.delete(key)

      this.logger?.debug(`Removed singleton instance: ${key}`)
      return true
    }

    return false
  }

  // Очистка всех singleton
  static clear(): void {
    for (const [key, instance] of this.instances) {
      if (typeof instance.destroy === 'function') {
        instance.destroy()
      }
    }

    this.instances.clear()
    this.configs.clear()

    this.logger?.debug('Cleared all singleton instances')
  }

  // Получение статистики
  static getStats(): {
    instanceCount: number
    instances: string[]
  } {
    return {
      instanceCount: this.instances.size,
      instances: Array.from(this.instances.keys()),
    }
  }

  private static mergeConfigurations(existing: StorageSingletonConfig, incoming: StorageSingletonConfig): { finalConfig: StorageSingletonConfig; conflicts: string[] } {
    const strategy = incoming.singleton?.mergeStrategy || ConfigMergeStrategy.FIRST_WINS
    const warnOnConflict = incoming.singleton?.warnOnConflict ?? true

    switch (strategy) {
      case ConfigMergeStrategy.STRICT:
        return this.strictMerge(existing, incoming)

      case ConfigMergeStrategy.FIRST_WINS:
        return this.firstWinsMerge(existing, incoming, warnOnConflict)

      case ConfigMergeStrategy.DEEP_MERGE:
        return this.deepMerge(existing, incoming)

      case ConfigMergeStrategy.OVERRIDE:
        return this.overrideMerge(existing, incoming)

      case ConfigMergeStrategy.WARN_AND_USE_FIRST:
        return this.warnAndUseFirst(existing, incoming)

      default:
        return this.firstWinsMerge(existing, incoming, warnOnConflict)
    }
  }

  private static strictMerge(existing: StorageSingletonConfig, incoming: StorageSingletonConfig): { finalConfig: StorageSingletonConfig; conflicts: string[] } {
    const conflicts = this.findConflicts(existing, incoming)

    if (conflicts.length > 0) {
      throw new Error(`Strict singleton validation failed for "${existing.name}". Conflicts: ${conflicts.join(', ')}`)
    }

    return { finalConfig: existing, conflicts: [] }
  }

  private static firstWinsMerge(existing: StorageSingletonConfig, incoming: StorageSingletonConfig, warn: boolean): { finalConfig: StorageSingletonConfig; conflicts: string[] } {
    const conflicts = this.findConflicts(existing, incoming)

    if (warn && conflicts.length > 0) {
      this.logger?.warn(`Singleton config conflicts for "${existing.name}":`, conflicts)
      this.logger?.warn('Using existing configuration')
    }

    return { finalConfig: existing, conflicts }
  }

  private static deepMerge(existing: StorageSingletonConfig, incoming: StorageSingletonConfig): { finalConfig: StorageSingletonConfig; conflicts: string[] } {
    const conflicts = this.findConflicts(existing, incoming)

    const mergedConfig: StorageSingletonConfig = {
      ...existing,
      initialState: this.deepMergeObjects(existing.initialState || {}, incoming.initialState || {}),
    }

    this.logger?.debug(`Deep merged singleton config for "${existing.name}"`)

    return { finalConfig: mergedConfig, conflicts }
  }

  private static overrideMerge(existing: StorageSingletonConfig, incoming: StorageSingletonConfig): { finalConfig: StorageSingletonConfig; conflicts: string[] } {
    const conflicts = this.findConflicts(existing, incoming)

    const mergedConfig: StorageSingletonConfig = {
      ...incoming,
      name: existing.name, // name никогда не перезаписываем
    }

    this.logger?.warn(`Overriding singleton config for "${existing.name}"`)

    return { finalConfig: mergedConfig, conflicts }
  }

  private static warnAndUseFirst(existing: StorageSingletonConfig, incoming: StorageSingletonConfig): { finalConfig: StorageSingletonConfig; conflicts: string[] } {
    const conflicts = this.findConflicts(existing, incoming)

    if (conflicts.length > 0) {
      this.logger?.warn(`Configuration conflicts detected for singleton "${existing.name}":`)
      this.logger?.warn('Existing config:', existing)
      this.logger?.warn('Incoming config:', incoming)
      this.logger?.warn('Using existing configuration')
    }

    return { finalConfig: existing, conflicts }
  }

  private static findConflicts(config1: StorageSingletonConfig, config2: StorageSingletonConfig): string[] {
    const conflicts: string[] = []

    // Проверяем initialState
    if (config1.initialState && config2.initialState) {
      const stateConflicts = this.findObjectConflicts(config1.initialState, config2.initialState, 'initialState')
      conflicts.push(...stateConflicts)
    } else if (config1.initialState !== config2.initialState) {
      conflicts.push('initialState: one is undefined')
    }

    // Проверяем middlewares (базовая проверка)
    if (!!config1.middlewares !== !!config2.middlewares) {
      conflicts.push('middlewares: configuration differs')
    }

    return conflicts
  }

  private static findObjectConflicts(obj1: any, obj2: any, path: string): string[] {
    const conflicts: string[] = []

    const allKeys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})])

    for (const key of allKeys) {
      const currentPath = `${path}.${key}`
      const val1 = obj1?.[key]
      const val2 = obj2?.[key]

      if (val1 === val2) continue

      if (val1 === undefined || val2 === undefined) {
        conflicts.push(`${currentPath}: missing in one config`)
      } else if (typeof val1 !== typeof val2) {
        conflicts.push(`${currentPath}: type mismatch (${typeof val1} vs ${typeof val2})`)
      } else if (typeof val1 === 'object' && val1 !== null && val2 !== null) {
        conflicts.push(...this.findObjectConflicts(val1, val2, currentPath))
      } else {
        conflicts.push(`${currentPath}: value mismatch (${val1} vs ${val2})`)
      }
    }

    return conflicts
  }

  private static deepMergeObjects(target: any, source: any): any {
    const result = { ...target }

    for (const key in source) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMergeObjects(target[key] || {}, source[key])
      } else {
        result[key] = source[key]
      }
    }

    return result
  }
}

// Хелпер для генерации ключа singleton
export class SingletonKeyGenerator {
  static generate(config: StorageSingletonConfig, storageType: StorageType): string {
    // Если указан кастомный ключ
    if (config.singleton?.key) {
      return config.singleton.key
    }

    // Стандартный ключ: тип + имя
    return `${storageType}_${config.name}`
  }
}
