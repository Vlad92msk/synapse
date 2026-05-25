import { StorageCore } from '../../adapters/storage-core'
import { BaseStorageConfig, ILogger, StorageType } from '../../storage.interface'
import { SingletonKeyGenerator, SingletonManager } from './singleton.util'

export class SingletonMixin {
  static handleSingletonCreation<T extends StorageCore<any>>(
    config: BaseStorageConfig,
    storageType: StorageType,
    factory: (finalConfig: BaseStorageConfig) => T,
    logger?: ILogger,
  ): T {
    // Если singleton не включен, создаем обычный экземпляр
    if (!config.singleton?.enabled) return factory(config)

    // Настраиваем логгер в SingletonManager
    if (logger) {
      SingletonManager.setLogger(logger)
    }

    const key = SingletonKeyGenerator.generate(config, storageType)
    const result = SingletonManager.getOrCreate(key, config, factory)

    // Логируем результат
    if (result.isNewInstance) {
      logger?.debug(`Created new singleton storage: ${key}`)
    } else {
      logger?.debug(`Reusing existing singleton storage: ${key}`)

      if (result.conflicts && result.conflicts.length > 0) {
        logger?.debug(`Configuration conflicts detected: ${result.conflicts.join(', ')}`)
      }
    }

    return result.instance
  }
}
