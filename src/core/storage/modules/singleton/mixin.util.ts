import { BaseStorage } from '../../adapters/base-storage.service'
import { ILogger, StorageSingletonConfig, StorageType } from '../../storage.interface'
import { SingletonKeyGenerator, SingletonManager } from './singleton.util'

export class SingletonMixin {
  static handleSingletonCreation<T extends BaseStorage<any>>(
    config: StorageSingletonConfig,
    storageType: StorageType,
    factory: (finalConfig: StorageSingletonConfig) => T,
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
