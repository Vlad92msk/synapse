import { storageStream } from '../../core/observable/storage-stream'
import type { Selectors } from '../../core/selector/selectors.base'
import type { IStorage, ISyncStorage } from '../../core/storage/storage.interface'
import { type Dispatcher, FINALIZE } from '../../reactive/dispatcher/dispatcher.base'
import { PreStartActionBuffer } from '../../reactive/effects/preStartActionBuffer'
import { type EffectFunctionLike, type EffectsLike, type EffectsRunner, getEffectsRunner, isEffectsLike, type RunningEffects } from './effects-runner'
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

type EffectsInput = EffectsLike | EffectFunctionLike | Array<EffectsLike | EffectFunctionLike> | undefined

// Конфиг C-формы: синхронная конструкция ядра + `dependencies` (гейт старта эффектов) + фабрика `effects`.
export interface SyncSynapseConfig<
  TState extends Record<string, any>,
  TDispatcher extends Dispatcher<TState> | undefined = undefined,
  TSelectors extends Selectors<TState> | undefined = undefined,
> {
  storage: () => IStorage<TState>
  dispatcher?: (storage: IStorage<TState>) => TDispatcher
  selectors?: (storage: IStorage<TState>) => TSelectors
  dependencies?: DependencyInput[]
  dependencyTimeout?: number
  // Чужие диспетчеры, чьи экшены вливаются в `action$`. Резолвится лениво на старте эффектов;
  // функция-форма не форсит eager-конструкцию чужого стора. Пример: `() => ({ core: coreSynapse.dispatcher })`.
  externalDispatchers?: Record<string, Dispatcher<any>> | ((ctx: SyncEffectsContext<TState, TDispatcher, TSelectors>) => Record<string, Dispatcher<any>>)
  // Фабрика эффектов; зовётся только в ready() (клиент) → может быть async (ленивый резолв endpoints).
  effects?: (ctx: SyncEffectsContext<TState, TDispatcher, TSelectors>) => EffectsInput | Promise<EffectsInput>
  // Синхронный хук после конструкции ядра, до первого рендера. Для нормализации persisted-состояния
  // (напр. гашение транзитных флагов). Бежит на каждую конструкцию; ошибка откатывает её (fail-fast).
  postConstruct?: (synapse: Synapse<TState, TDispatcher, TSelectors>) => void
}

/**
 * Раскладывает effects-вход в плоский список module-эффектов + инстансы (для onDestroy) и находит
 * раннер (его приносят сами эффекты из `synapse-storage/reactive`, см. effects-runner.ts).
 */
function collectEffects(input: EffectsInput): { moduleEffects: EffectFunctionLike[]; instances: EffectsLike[]; runner?: EffectsRunner } {
  const items = input === undefined ? [] : Array.isArray(input) ? input : [input]
  const moduleEffects: EffectFunctionLike[] = []
  const instances: EffectsLike[] = []
  for (const item of items) {
    if (isEffectsLike(item)) {
      instances.push(item)
      moduleEffects.push(...item.getEffects())
    } else if (typeof item === 'function') {
      moduleEffects.push(item)
    } else {
      throw new Error('createSynapse: каждый элемент "effects" должен быть инстансом Effects или функцией-эффектом.')
    }
  }
  let runner: EffectsRunner | undefined
  for (const effect of moduleEffects) {
    runner = getEffectsRunner(effect)
    if (runner) break
  }
  if (moduleEffects.length > 0 && !runner) {
    throw new Error(
      'createSynapse: не удалось запустить "effects" — функции-эффекты должны быть созданы через ' + '`Effects`/`createEffect`/`combineEffects` из "synapse-storage/reactive".',
    )
  }
  return { moduleEffects, instances, runner }
}

/** LIFO-teardown. */
async function teardown(cleanup: CleanupStep[]): Promise<void> {
  for (let i = cleanup.length - 1; i >= 0; i--) await cleanup[i]()
}

// Синхронная конструкция ядра: storage → READY (initializeSync), dispatcher финализирован,
// селекторы материализованы, state$ всегда. Эффекты НЕ стартуют. Требует sync-хранилища.
//
// `captureForEffects`: вешать ли с этого момента pre-start буфер на диспетчер. Нужен только
// клиентскому main, который позже стартует эффекты (`ready()`) — чтобы маунт-диспатч, пришедший
// ДО подписки эффектов, не потерялся. Серверный throwaway-shell (SSR/дегидрация) эффекты не
// стартует → буфер не вешаем, чтобы не копить впустую.
function constructSyncCore<TState extends Record<string, any>, TDispatcher, TSelectors>(
  config: SyncSynapseConfig<any, any, any>,
  captureForEffects = false,
): {
  synapse: Synapse<TState, TDispatcher, TSelectors>
  cleanup: CleanupStep[]
  preStartBuffer?: PreStartActionBuffer
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

  // Захват pre-start экшенов начинаем СРАЗУ после финализации диспатчера (синхронно, на рендере) —
  // до маунт-эффектов детей. Буфер отдаётся EffectsModule в startEffects и сливается на start().
  let preStartBuffer: PreStartActionBuffer | undefined
  if (captureForEffects && dispatcher) {
    preStartBuffer = new PreStartActionBuffer(dispatcher.actions)
    cleanup.push(() => preStartBuffer?.stop())
  }

  // Поток состояния ядра — interop без rxjs (в rxjs: `toObservable(storage)` из reactive).
  const state$ = storageStream(storage)

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

  return { synapse, cleanup, preStartBuffer }
}

/**
 * Ленивый handle C-формы: конструкция main синхронна и мемоизирована (строится при первом обращении
 * к геттеру/`ready()`), эффекты стартуют отдельно в `ready()` после `waitForDependencies`. Расцеп даёт
 * синхронный `handle.selectors`/`.storage`/`.state$` — основа cross-store DI.
 */
export function createSyncSynapseModule<TState extends Record<string, any>, TDispatcher extends Dispatcher<TState> | undefined, TSelectors extends Selectors<TState> | undefined>(
  config: SyncSynapseConfig<TState, any, any>,
): SyncSynapseModule<TState, TDispatcher, TSelectors> {
  type ReadySynapse = Synapse<TState, TDispatcher, TSelectors>

  let main: ReadySynapse | undefined
  let mainCleanup: CleanupStep[] = []
  let effectsCleanup: CleanupStep[] = []
  let readyPromise: Promise<ReadySynapse> | undefined
  // Буфер маунт-диспатчей main-ядра. Захват стартует с конструкции main (рендер), сливается в
  // EffectsModule на старте эффектов. Только для main: shell/сервер эффекты не стартуют.
  let mainPreStartBuffer: PreStartActionBuffer | undefined

  // Синхронно строит (или возвращает) main-ядро. НЕ стартует эффекты.
  const ensureMain = (): ReadySynapse => {
    if (!main) {
      // Буфер нужен только если у синапса вообще есть эффекты (иначе некому сливать).
      const built = constructSyncCore<TState, TDispatcher, TSelectors>(config, config.effects != null)
      main = built.synapse
      mainCleanup = built.cleanup
      mainPreStartBuffer = built.preStartBuffer
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
    const { moduleEffects, instances, runner } = collectEffects(input)

    // Внешние диспетчеры резолвим лениво здесь же (deps уже готовы → чужой dispatcher финализирован).
    const external = typeof config.externalDispatchers === 'function' ? config.externalDispatchers(ctx) : (config.externalDispatchers ?? {})

    for (const instance of instances) {
      if (instance.onDestroy) effectsCleanup.push(() => instance.onDestroy!())
    }

    if (moduleEffects.length > 0 && runner) {
      if (!core.dispatcher) throw new Error('createSynapse: "effects" требуют "dispatcher".')
      // Отдаём буфер, собранный ядром с рендера: диспатчи до этого старта (маунт) не потеряются.
      const running: RunningEffects = runner(moduleEffects, {
        storage: core.storage,
        dispatcher: core.dispatcher,
        externalDispatchers: external,
        preStartBuffer: mainPreStartBuffer,
      })
      effectsCleanup.push(() => {
        running.stop()
      })
      await running.start()
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
      mainPreStartBuffer = undefined
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
