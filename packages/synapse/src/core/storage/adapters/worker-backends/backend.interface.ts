/**
 * Внутренний контракт бэкенда стора для {@link WorkerCacheStorage}. Сейчас
 * единственная реализация — {@link SharedWorkerBackend} (SharedWorker live-cache
 * с in-process фолбэком); публичным seam-ом это больше не является.
 *
 * Адаптер выполняет ВСЮ логику ключей/путей сам (getValueByPath/setValueByPath/…)
 * и общается с бэкендом ТОЛЬКО через этот op-набор. Где реально живут данные
 * (SharedWorker-Map / in-process Map) адаптер не знает.
 *
 * Контракт операций (payload → результат):
 * - `getAll()          → Record<string, unknown>` — всё состояние (top-level ключ → значение)
 * - `setAll(state)     → void`                    — заменить всё состояние
 * - `get(key)          → unknown`
 * - `set(key, value)   → void`
 * - `update(entries)   → void`                    — батч set по массиву {key,value}
 * - `delete(key)       → boolean`                 — был ли ключ
 * - `clear()           → void`
 * - `keys()            → string[]`
 * - `has(key)          → boolean`
 *
 * ВАЖНО: любой новый бэкенд обязан отвечать на ЭТОТ набор без изменений адаптера.
 */
export interface WorkerStorageBackend {
  /** Устанавливает соединение с бэкендом (регистрация воркера/SW и т.п.). Идемпотентна. */
  connect(): Promise<void>

  /** Закрывает соединение. Данные бэкенда НЕ стираются (live/offline cache). */
  close(): void

  getAll(): Promise<Record<string, unknown>>
  setAll(state: Record<string, unknown>): Promise<void>
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  update(entries: Array<{ key: string; value: unknown }>): Promise<void>
  delete(key: string): Promise<boolean>
  clear(): Promise<void>
  keys(): Promise<string[]>
  has(key: string): Promise<boolean>
}
