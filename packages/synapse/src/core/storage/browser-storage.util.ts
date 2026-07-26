import { MemoryStorage } from './adapters/memory-storage.service'
import type { ISyncStorage, SyncStorageConfig } from './storage.interface'

/** Опции {@link browserStorage}. */
export interface BrowserStorageOptions<T extends Record<string, any>> {
  // Клиентская фабрика sync-хранилища (LocalStorage и т.п.); зовётся ТОЛЬКО в браузере. Клиент-специфику
  // (напр. `syncBroadcastMiddleware`) добавляй здесь: `client: (cfg) => new LocalStorage({ ...cfg, middlewares })`.
  client: (config: SyncStorageConfig<T>) => ISyncStorage<T>
  /** Переопределение проверки «сервер». По умолчанию `typeof window === 'undefined'`. */
  isServer?: () => boolean
}

/**
 * Server-safe фабрика sync-хранилища для C-формы: на сервере → `MemoryStorage` из `initialState`
 * (клиентская фабрика не зовётся), в браузере → `options.client(config)`. Убирает per-module
 * ветку `isServer`; browser-only хранилища (LocalStorage) больше не крешат серверную конструкцию.
 *
 * @example
 * ```ts
 * storage: browserStorage({ name: 'accounts', initialState }, { client: (cfg) => new LocalStorage(cfg) })
 * ```
 */
export function browserStorage<T extends Record<string, any>>(config: SyncStorageConfig<T>, options: BrowserStorageOptions<T>): () => ISyncStorage<T> {
  const isServer = options.isServer ?? (() => typeof window === 'undefined')
  return () => (isServer() ? new MemoryStorage<T>(config) : options.client(config))
}
