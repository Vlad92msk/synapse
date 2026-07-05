import { SingletonMixin } from '../modules/singleton/mixin.util'
import { IEventEmitter, ILogger, StorageCapabilities, StorageEvents, StorageType, WorkerStorageConfig } from '../storage.interface'
import { findChangedPaths } from '../utils/state-diff.util'
import { StorageKey, StorageKeyType } from '../utils/storage-key'
import { AsyncBaseStorage } from './async-base-storage.service'
import { getValueByPath, parsePath, removeValueByPath, setValueByPath } from './path.utils'
import { GLOBAL_SUBSCRIPTION_KEY } from './storage-core'
import { SharedWorkerBackend } from './worker-backends/shared-worker-backend'

/**
 * Асинхронное хранилище поверх общего key-value стора внутри SharedWorker.
 *
 * Это тот же принцип, что у {@link MemoryStorage} (данные в `Map`), но `Map` живёт
 * ВНУТРИ SharedWorker и потому разделяется между вкладками. Если SharedWorker
 * недоступен (тесты/SSR/CSP), {@link WorkerChannel} прозрачно откатывается на
 * in-process `Map` — round-trip идентичен MemoryStorage, но БЕЗ межвкладочного
 * шеринга (это даёт только настоящий SharedWorker).
 *
 * Все `do*` реализованы через RPC к стору ({@link WorkerChannel.request}) и повторяют
 * маппинг ключей/путей MemoryStorage (те же `getValueByPath`/`setValueByPath`/
 * `removeValueByPath`), поэтому поведение совпадает с MemoryStorage «ключ-в-ключ».
 *
 * Записи атомарны на уровне ключа (per-key `set`/`update`/`delete`), поэтому
 * конкурентные вкладки не затирают чужие ключи. После мутации из другой вкладки
 * стор рассылает уведомление — адаптер обновляет свой кэш и будит подписчиков.
 */
export class WorkerCacheStorage<T extends Record<string, any>> extends AsyncBaseStorage<T> {
  protected static readonly STORAGE_TYPE: StorageType = 'worker'
  readonly type: StorageType = 'worker'

  /** Живой кэш; `shared` честно отражает, реально ли работает кросс-табный SharedWorker. */
  readonly capabilities: StorageCapabilities

  private readonly channelName: string
  private readonly backend: SharedWorkerBackend
  private unsubscribeMutation?: VoidFunction

  // Коалесцирование refresh'ей: если во время await getAll() приходит ещё одна мутация,
  // не запускаем перекрывающийся refresh (он диффил бы против того же устаревшего `prev`
  // и повторно уведомил бы подписчиков) — помечаем dirty и прогоняем ровно один раз после.
  private refreshInFlight = false
  private refreshDirty = false

  constructor(config: WorkerStorageConfig<T>, eventEmitter?: IEventEmitter, logger?: ILogger) {
    super(config, eventEmitter, logger)
    this.channelName = config.options?.channelName ?? config.name

    this.backend = new SharedWorkerBackend(this.channelName, {
      workerUrl: config.options?.workerUrl,
      requestTimeoutMs: config.options?.requestTimeoutMs,
    })

    // Честный capabilities: shared только если реально поднялся SharedWorker
    // (иначе — in-process фолбэк без кросс-табного шеринга).
    this.capabilities = { shared: this.backend.shared, sync: false }
    if (!this.backend.shared) {
      this.logger?.debug(`WorkerCacheStorage "${this.name}" работает в in-process режиме (SharedWorker недоступен) — без кросс-табного шеринга`)
    }
  }

  static create<T extends Record<string, any>>(config: WorkerStorageConfig<T>, eventEmitter?: IEventEmitter, logger?: ILogger): WorkerCacheStorage<T> {
    return SingletonMixin.handleSingletonCreation(
      config,
      this.STORAGE_TYPE,
      (finalConfig) => new WorkerCacheStorage<T>(finalConfig as WorkerStorageConfig<T>, eventEmitter, logger),
      logger,
    )
  }

  protected async doInitialize(): Promise<this> {
    try {
      this.logger?.debug(`Initializing WorkerCacheStorage "${this.name}"`)

      await this.backend.connect()
      this.subscribeToStoreMutations()
      this.initializeMiddlewares()
      await this.initializeWithMiddlewares()

      this.logger?.debug(`WorkerCacheStorage "${this.name}" initialized successfully`)
      return this
    } catch (error) {
      this.logger?.error('Error initializing WorkerCacheStorage', { error })
      throw error
    }
  }

  // ─── Cross-tab subscription hook (R3) ────────────────────────────────────────

  /**
   * Подписка на мутации из ДРУГИХ вкладок/экземпляров. Воркер рассылает STORE_MUTATION
   * после каждой мутирующей операции; payload несёт только `{op}`, поэтому мы просто
   * перечитываем полное состояние, обновляем `_stateCache` и будим подписчиков (как
   * при локальной записи). Без этого хука `subscribe()` и tagIndex в QueryStorage
   * устаревали бы для записей, сделанных другими вкладками.
   */
  private subscribeToStoreMutations(): void {
    this.unsubscribeMutation = this.backend.onMutation(() => {
      this.scheduleRefresh()
    })
  }

  /**
   * Сериализует refresh'и: пока один в полёте, следующие мутации лишь взводят `dirty`,
   * и после завершения текущего прогоняется ровно один догоняющий refresh. Так каждый
   * refresh диффит против актуального `_stateCache`, а не против устаревшего снапшота —
   * нет дублей уведомлений подписчиков одними и теми же значениями.
   */
  private scheduleRefresh(): void {
    if (this.refreshInFlight) {
      this.refreshDirty = true
      return
    }
    this.refreshInFlight = true
    void this.runRefreshLoop()
  }

  private async runRefreshLoop(): Promise<void> {
    try {
      do {
        this.refreshDirty = false
        await this.refreshFromRemoteMutation()
      } while (this.refreshDirty)
    } catch (error) {
      this.logger?.error('Error refreshing state after remote mutation', { error })
    } finally {
      this.refreshInFlight = false
    }
  }

  private async refreshFromRemoteMutation(): Promise<void> {
    const prev = this._stateCache
    const state = await this.getRawState()
    this._stateCache = state

    const changed = findChangedPaths((prev ?? {}) as T, state)
    if (changed.size === 0) return

    const changedPaths = Array.from(changed)

    // Пер-ключевые подписчики: top-level ключи + полные пути (как в update()).
    const topLevelKeys = new Set<string>()
    for (const path of changedPaths) {
      topLevelKeys.add(path.split('.')[0])
    }
    for (const key of topLevelKeys) {
      this.notifySubscribers(key, (state as Record<string, any>)[key])
    }
    for (const path of changedPaths) {
      if (!topLevelKeys.has(path)) {
        this.notifySubscribers(path, getValueByPath(state, path))
      }
    }

    this.notifySubscribers(GLOBAL_SUBSCRIPTION_KEY, {
      type: StorageEvents.STORAGE_UPDATE,
      changedPaths,
      source: 'worker',
    })
  }

  // ─── do* (зеркалит MemoryStorage, но асинхронно через RPC) ───────────────────

  protected async doGet(key: StorageKeyType): Promise<any> {
    if (key === '') return this.backend.getAll()

    if (key instanceof StorageKey && key.isUnparseable()) {
      return this.backend.get(key.valueOf())
    }

    const parts = parsePath(key)
    if (parts.length === 1) {
      return this.backend.get(parts[0])
    }

    // Вложенный путь: читаем только нужный top-level ключ, затем спускаемся по пути.
    const rootValue = await this.backend.get(parts[0])
    if (rootValue === undefined) return undefined
    return getValueByPath(rootValue, parts.slice(1).join('.'))
  }

  protected async doSet(key: StorageKeyType, value: any): Promise<void> {
    // Whole-state запись остаётся на setAll (гидрация/reset/init).
    if (key === '') {
      await this.backend.setAll(value)
      return
    }

    // Атомарный per-key set — конкурентные вкладки не затирают чужие ключи (R2).
    if (key instanceof StorageKey && key.isUnparseable()) {
      await this.backend.set(key.valueOf(), value)
      return
    }

    const parts = parsePath(key)
    if (parts.length === 1) {
      await this.backend.set(parts[0], value)
      return
    }

    // Вложенный путь: read-modify-write ТОЛЬКО корневого ключа (не всего состояния).
    const rootKey = parts[0]
    const rootValue = await this.backend.get(rootKey)
    const newRoot = setValueByPath(rootValue, parts.slice(1).join('.'), value)
    await this.backend.set(rootKey, newRoot)
  }

  protected async doUpdate(updates: Array<{ key: StorageKeyType; value: any }>): Promise<void> {
    const entries: Array<{ key: string; value: unknown }> = []
    // Вложенные пути группируем по корню — читаем каждый корень один раз.
    const nestedByRoot = new Map<string, Array<{ path: string; value: any }>>()

    for (const { key, value } of updates) {
      if (key instanceof StorageKey && key.isUnparseable()) {
        entries.push({ key: key.valueOf(), value })
        continue
      }

      const parts = parsePath(key)
      if (parts.length === 1) {
        entries.push({ key: parts[0], value })
      } else {
        const rootKey = parts[0]
        if (!nestedByRoot.has(rootKey)) nestedByRoot.set(rootKey, [])
        nestedByRoot.get(rootKey)!.push({ path: parts.slice(1).join('.'), value })
      }
    }

    for (const [rootKey, patches] of nestedByRoot) {
      let rootValue = await this.backend.get(rootKey)
      for (const { path, value } of patches) {
        rootValue = setValueByPath(rootValue, path, value)
      }
      entries.push({ key: rootKey, value: rootValue })
    }

    if (entries.length > 0) {
      // Атомарный per-key батч (set по каждому ключу), а не clear+setAll (R2).
      await this.backend.update(entries)
    }
  }

  protected async doDelete(key: StorageKeyType): Promise<boolean> {
    if (key instanceof StorageKey && key.isUnparseable()) {
      return this.backend.delete(key.valueOf())
    }

    const parts = parsePath(key)
    if (parts.length === 1) {
      // Атомарное per-key удаление (R2).
      return this.backend.delete(parts[0])
    }

    // Вложенный путь: read-modify-write ТОЛЬКО корневого ключа.
    const rootKey = parts[0]
    const rootValue = await this.backend.get(rootKey)
    if (rootValue === undefined) return false

    const { state: newRoot, removed } = removeValueByPath(rootValue, parts.slice(1).join('.'))
    if (!removed) return false

    await this.backend.set(rootKey, newRoot)
    return true
  }

  protected async doClear(): Promise<void> {
    await this.backend.clear()
  }

  protected async doKeys(): Promise<string[]> {
    return this.backend.keys()
  }

  protected async doHas(key: StorageKeyType): Promise<boolean> {
    const value = await this.doGet(key)
    return value !== undefined
  }

  /**
   * Живой кэш НЕ очищается при destroy: данные живут в воркере и разделяются между
   * вкладками — уничтожение адаптера одной вкладкой не должно стирать общий кэш.
   * Поэтому переопределяем performCleanup (как IndexedDBStorage), пропуская doClear(),
   * но ОБЯЗАТЕЛЬНО прогоняя cleanup мидлвар (иначе их каналы/таймеры текут — R8).
   */
  protected async performCleanup(): Promise<void> {
    await this.doDestroy()
    await this.cleanupMiddlewares()
  }

  protected async doDestroy(): Promise<void> {
    // Отписываемся от мутаций и закрываем бэкенд; данные в сторе остаются (live-cache).
    this.unsubscribeMutation?.()
    this.unsubscribeMutation = undefined
    this.backend.close()
  }
}
