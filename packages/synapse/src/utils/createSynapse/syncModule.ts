import type { IStorage, ISyncStorage, Selectors } from '../../core'
import type { Effect } from '../../reactive'
import { Dispatcher, Effects, EffectsModule, FINALIZE, toObservable } from '../../reactive'
import type { Synapse, SynapseModule, SyncSynapseModule } from './synapse.types'
import type { DependencyInput } from './types'
import { waitForDependencies } from './waitForDependencies'

/** Шаг очистки (LIFO). */
type CleanupStep = () => Promise<void> | void

// Контекст фабрики эффектов C-формы: готовое sync-ядро + резолвнутые deps (после waitForDependencies).
export interface SyncEffectsContext<TState extends Record<string, any>, TDispatcher, TSelectors> {
  storage: IStorage<TState>
  dispatcher: TDispatcher
  selectors: TSelectors
  deps: ReadonlyArray<{ storage: IStorage<any> }>
}

type EffectsInput<TEffects> = TEffects | Array<TEffects | Effect> | undefined

// Конфиг C-формы: синхронная конструкция ядра + `dependencies` (гейт старта эффектов) + фабрика `effects`.
export interface SyncSynapseConfig<
  TState extends Record<string, any>,
  TDispatcher extends Dispatcher<TState> | undefined = undefined,
  TSelectors extends Selectors<TState> | undefined = undefined,
  TEffects extends Effects<TState, NonNullable<TDispatcher>, any> | undefined = undefined,
> {
  storage: () => IStorage<TState>
  dispatcher?: (storage: IStorage<TState>) => TDispatcher
  selectors?: (storage: IStorage<TState>) => TSelectors
  dependencies?: DependencyInput[]
  dependencyTimeout?: number
  // Чужие диспетчеры, чьи экшены вливаются в `action$`. Резолвится лениво на старте эффектов;
  // функция-форма не форсит eager-конструкцию чужого стора. Пример: `() => ({ core: coreSynapse.dispatcher })`.
  externalDispatchers?:
    | Record<string, Dispatcher<any>>
    | ((ctx: SyncEffectsContext<TState, TDispatcher, TSelectors>) => Record<string, Dispatcher<any>>)
  // Фабрика эффектов; зовётся только в ready() (клиент) → может быть async (ленивый резолв endpoints).
  effects?: (ctx: SyncEffectsContext<TState, TDispatcher, TSelectors>) => EffectsInput<TEffects> | Promise<EffectsInput<TEffects>>
  // Синхронный хук после конструкции ядра, до первого рендера. Для нормализации persisted-состояния
  // (напр. гашение транзитных флагов). Бежит на каждую конструкцию; ошибка откатывает её (fail-fast).
  postConstruct?: (synapse: Synapse<TState, TDispatcher, TSelectors>) => void
}

/** Раскладывает effects-вход в плоский список module-эффектов + инстансы (для onDestroy). */
function collectEffects(input: EffectsInput<any>): { moduleEffects: Effect[]; instances: Effects<any, any, any>[] } {
  const items = input === undefined ? [] : Array.isArray(input) ? input : [input]
  const moduleEffects: Effect[] = []
  const instances: Effects<any, any, any>[] = []
  for (const item of items) {
    if (item instanceof Effects) {
      instances.push(item)
      moduleEffects.push(...item.getEffects())
    } else if (typeof item === 'function') {
      moduleEffects.push(item as Effect)
    } else {
      throw new Error('createSynapse: каждый элемент "effects" должен быть инстансом Effects или функцией-эффектом.')
    }
  }
  return { moduleEffects, instances }
}

/** LIFO-teardown. */
async function teardown(cleanup: CleanupStep[]): Promise<void> {
  for (let i = cleanup.length - 1; i >= 0; i--) await cleanup[i]()
}

// Синхронная конструкция ядра: storage → READY (initializeSync), dispatcher финализирован,
// селекторы материализованы, state$ всегда. Эффекты НЕ стартуют. Требует sync-хранилища.
function constructSyncCore<TState extends Record<string, any>, TDispatcher, TSelectors>(config: SyncSynapseConfig<any, any, any, any>): {
  synapse: Synapse<TState, TDispatcher, TSelectors>
  cleanup: CleanupStep[]
} {
  const storage = config.storage() as IStorage<TState>
  if (storage.isSync !== true || typeof (storage as Partial<ISyncStorage<TState>>).initializeSync !== 'function') {
    throw new Error('createSynapse: "storage" должен быть синхронным (напр. MemoryStorage) — только он умеет синхронную конструкцию.')
  }

  const cleanup: CleanupStep[] = []
  ;(storage as ISyncStorage<TState>).initializeSync()
  cleanup.push(() => storage.destroy())

  const selectors = config.selectors?.(storage) as (Selectors<TState> & TSelectors) | undefined
  if (selectors) cleanup.push(() => selectors.destroy())

  const dispatcher = config.dispatcher?.(storage) as (Dispatcher<TState> & TDispatcher) | undefined
  if (dispatcher) {
    dispatcher[FINALIZE]()
    cleanup.push(() => dispatcher.destroy())
  }

  const state$ = toObservable(storage)

  let destroyed = false
  const synapse: Synapse<TState, TDispatcher, TSelectors> = {
    storage,
    state$,
    dispatcher: dispatcher as TDispatcher,
    actions: dispatcher as TDispatcher,
    selectors: selectors as TSelectors,
    destroy: async () => {
      if (destroyed) return
      destroyed = true
      await teardown(cleanup)
    },
  }

  // Синхронный post-construct хук (storage READY, dispatcher финализирован) — до первого рендера.
  if (config.postConstruct) {
    try {
      config.postConstruct(synapse)
    } catch (error) {
      // Fail-fast: откатываем уже созданное ядро и пробрасываем.
      void teardown(cleanup).catch(() => {})
      throw error
    }
  }

  return { synapse, cleanup }
}

/**
 * Ленивый handle C-формы: конструкция main синхронна и мемоизирована (строится при первом обращении
 * к геттеру/`ready()`), эффекты стартуют отдельно в `ready()` после `waitForDependencies`. Расцеп даёт
 * синхронный `handle.selectors`/`.storage`/`.state$` — основа cross-store DI.
 */
export function createSyncSynapseModule<
  TState extends Record<string, any>,
  TDispatcher extends Dispatcher<TState> | undefined,
  TSelectors extends Selectors<TState> | undefined,
>(config: SyncSynapseConfig<TState, any, any, any>): SyncSynapseModule<TState, TDispatcher, TSelectors> {
  type ReadySynapse = Synapse<TState, TDispatcher, TSelectors>

  let main: ReadySynapse | undefined
  let mainCleanup: CleanupStep[] = []
  let effectsCleanup: CleanupStep[] = []
  let readyPromise: Promise<ReadySynapse> | undefined

  // Синхронно строит (или возвращает) main-ядро. НЕ стартует эффекты.
  const ensureMain = (): ReadySynapse => {
    if (!main) {
      const built = constructSyncCore<TState, TDispatcher, TSelectors>(config)
      main = built.synapse
      mainCleanup = built.cleanup
    }
    return main
  }

  // Стартует эффекты на уже построенном main: ждёт deps, конструирует эффекты из ctx, запускает.
  const startEffects = async (core: ReadySynapse): Promise<ReadySynapse> => {
    await waitForDependencies(config.dependencies, config.dependencyTimeout)

    const deps = await Promise.all((config.dependencies ?? []).map((d) => Promise.resolve(d as PromiseLike<{ storage: IStorage<any> }>)))
    const ctx: SyncEffectsContext<TState, TDispatcher, TSelectors> = {
      storage: core.storage,
      dispatcher: core.dispatcher,
      selectors: core.selectors,
      deps,
    }
    // Фабрика эффектов может быть async (ленивый резолв endpoints) — ждём её здесь.
    const input = await config.effects?.(ctx)
    const { moduleEffects, instances } = collectEffects(input)

    // Внешние диспетчеры резолвим лениво здесь же (deps уже готовы → чужой dispatcher финализирован).
    const external = typeof config.externalDispatchers === 'function' ? config.externalDispatchers(ctx) : (config.externalDispatchers ?? {})

    for (const instance of instances) {
      if (instance.onDestroy) effectsCleanup.push(() => instance.onDestroy!())
    }

    if (moduleEffects.length > 0) {
      if (!core.dispatcher) throw new Error('createSynapse: "effects" требуют "dispatcher".')
      const effectsModule = new EffectsModule<TState>(core.storage, core.dispatcher as any, external as any)
      effectsModule.addEffects(moduleEffects)
      effectsCleanup.push(() => {
        effectsModule.stop()
      })
      await effectsModule.start()
    }

    return core
  }

  const handle: SynapseModule<TState, TDispatcher, TSelectors> = {
    ready(options) {
      const core = ensureMain()
      // Серверный прогрев/дегидрация: только конструкция, без эффектов.
      if (options?.withEffects === false) return Promise.resolve(core)
      if (!readyPromise) {
        readyPromise = startEffects(core).catch((error) => {
          // Fail-fast: сбрасываем мемо старта, чтобы повтор мог попробовать снова.
          readyPromise = undefined
          throw error
        })
      }
      return readyPromise
    },

    isReady() {
      return main !== undefined
    },

    getSnapshot() {
      return main
    },

    fork() {
      return createSyncSynapseModule<TState, TDispatcher, TSelectors>(config)
    },

    async destroy() {
      const orderedCleanup = [...mainCleanup, ...effectsCleanup]
      main = undefined
      mainCleanup = []
      effectsCleanup = []
      readyPromise = undefined
      // Сначала эффекты (позже сконструированы), потом ядро — LIFO по общему порядку.
      await teardown(orderedCleanup).catch(() => {})
    },

    then(onFulfilled, onRejected) {
      return handle.ready().then(onFulfilled, onRejected)
    },
  }

  // Синхронные геттеры main-ядра: дают cross-store DI синхронный доступ к чужому стору
  // (`otherModule.selectors` в конструкторе селекторов). Строят main лениво при первом доступе.
  Object.defineProperties(handle, {
    storage: { get: () => ensureMain().storage, enumerable: true },
    state$: { get: () => ensureMain().state$, enumerable: true },
    dispatcher: { get: () => ensureMain().dispatcher, enumerable: true },
    actions: { get: () => ensureMain().dispatcher, enumerable: true },
    selectors: { get: () => ensureMain().selectors, enumerable: true },
  })

  // Свежее throwaway-ядро (не main): per-request изоляция на сервере + первый кадр гидрации.
  handle.buildSyncShell = () => constructSyncCore<TState, TDispatcher, TSelectors>(config).synapse

  return handle as SyncSynapseModule<TState, TDispatcher, TSelectors>
}
