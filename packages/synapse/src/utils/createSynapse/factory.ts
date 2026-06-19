import type { IStorage } from '../../core'
import { Selectors } from '../../core'
import type { Effect } from '../../reactive'
import { Dispatcher, Effects, EffectsModule, FINALIZE, toObservable } from '../../reactive'
import type { Synapse, SynapseConfig, SynapseModule } from './synapse.types'
import { waitForDependencies } from './waitForDependencies'

/** Шаг очистки, накапливаемый в порядке конструирования; выполняется в LIFO. */
type CleanupStep = () => Promise<void> | void

/**
 * Минимальная runtime-валидация конфига фабрики (`instanceof`-проверки). Полная
 * типизация — на уровне TS; здесь только страховка от грубых ошибок в рантайме.
 */
function validateFactoryConfig(config: SynapseConfig<any, any, any, any>): void {
  if (!config || typeof config !== 'object') {
    throw new Error('createSynapse(factory): фабрика должна вернуть объект-конфиг.')
  }
  const storage = config.storage as IStorage<any> | undefined
  if (!storage || typeof storage.initialize !== 'function' || typeof storage.waitForReady !== 'function') {
    throw new Error('createSynapse(factory): "storage" обязателен и должен быть IStorage.')
  }
  if (config.dispatcher && !(config.dispatcher instanceof Dispatcher)) {
    throw new Error('createSynapse(factory): "dispatcher" должен быть инстансом класса Dispatcher.')
  }
  if (config.selectors && !(config.selectors instanceof Selectors)) {
    throw new Error('createSynapse(factory): "selectors" должен быть инстансом класса Selectors.')
  }
}

/**
 * Раскладывает `effects` (инстанс, функция или их смесь) в плоский список
 * module-совместимых эффектов + список инстансов `Effects` (для `onDestroy`).
 */
function collectEffects(input: SynapseConfig<any, any, any, any>['effects']): { moduleEffects: Effect[]; instances: Effects<any, any, any>[] } {
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
      throw new Error('createSynapse(factory): каждый элемент "effects" должен быть инстансом Effects или функцией-эффектом.')
    }
  }

  return { moduleEffects, instances }
}

/** Выполняет накопленные шаги очистки в обратном порядке (LIFO). */
async function teardown(cleanup: CleanupStep[]): Promise<void> {
  for (let i = cleanup.length - 1; i >= 0; i--) {
    await cleanup[i]()
  }
}

/**
 * Полный пайплайн запуска (один раз на `ready()`):
 *
 * 1. `config = await factory()` — async-пролог (await чужих synapse, API-клиенты)
 * 2. минимальная runtime-валидация (instanceof)
 * 3. `await waitForDependencies(...)`
 * 4. `await storage.initialize()`
 * 5. `dispatcher[FINALIZE]()` — имена экшенов из имён полей
 * 6. селекторы уже материализованы конструктором — шага нет
 * 7. `state$ = toObservable(storage)` — всегда
 * 8. `EffectsModule(...)` → `addEffects` → `await start()`
 * 9. teardown в LIFO: stop effects → onDestroy → destroy dispatcher → selectors → storage
 *
 * Любая ошибка любого шага → откат уже созданного (partial teardown) и проброс наверх
 * (никакой тихой частичной инициализации).
 *
 * `withEffects: false` (серверный путь дегидрации, см. {@link SynapseModule.ready}) собирает
 * стор целиком (storage/dispatcher/selectors/state$), но ПРОПУСКАЕТ шаг 8 — эффекты не
 * стартуют. Нужен только снапшот состояния + READY-storage для SSR-seed; запуск эффектов
 * на сервере — лишняя работа (форк) либо «висящие» подписки (синглтон main handle).
 */
async function buildSynapse<TState extends Record<string, any>, TDispatcher, TSelectors>(
  factory: () => SynapseConfig<any, any, any, any> | Promise<SynapseConfig<any, any, any, any>>,
  options?: { withEffects?: boolean },
): Promise<Synapse<TState, TDispatcher, TSelectors>> {
  const { withEffects = true } = options ?? {}
  const config = await factory()
  validateFactoryConfig(config)

  const cleanup: CleanupStep[] = []

  try {
    await waitForDependencies(config.dependencies, config.dependencyTimeout)

    const storage = config.storage as IStorage<TState>
    await storage.initialize()
    cleanup.push(() => storage.destroy())

    const selectors = config.selectors as (Selectors<TState> & TSelectors) | undefined
    if (selectors) {
      cleanup.push(() => selectors.destroy())
    }

    const dispatcher = config.dispatcher as (Dispatcher<TState> & TDispatcher) | undefined
    if (dispatcher) {
      dispatcher[FINALIZE]()
      cleanup.push(() => dispatcher.destroy())
    }

    // state$ — всегда, даже без эффектов.
    const state$ = toObservable(storage)

    const { moduleEffects, instances } = collectEffects(config.effects)

    // onDestroy инстансов нужен на teardown в любом случае (даже без запуска эффектов).
    const registerInstanceCleanup = () => {
      for (const instance of instances) {
        if (instance.onDestroy) {
          cleanup.push(() => instance.onDestroy!())
        }
      }
    }

    if (withEffects && moduleEffects.length > 0) {
      if (!dispatcher) {
        throw new Error('createSynapse(factory): "effects" требуют "dispatcher".')
      }

      const effectsModule = new EffectsModule<TState>(storage, dispatcher as any, (config.externalDispatchers ?? {}) as any)
      effectsModule.addEffects(moduleEffects)

      // onDestroy инстансов — перед stop в порядке teardown: пушим onDestroy раньше stop,
      // LIFO-обход выполнит stop первым, затем onDestroy.
      registerInstanceCleanup()
      cleanup.push(() => {
        effectsModule.stop()
      })

      await effectsModule.start()
    } else {
      // withEffects: false (серверная дегидрация) либо эффектов нет — EffectsModule не
      // конструируется и не стартует; регистрируем только onDestroy инстансов на teardown.
      registerInstanceCleanup()
    }

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

    return synapse
  } catch (error) {
    // Fail-fast: откатываем уже созданное и пробрасываем ошибку.
    await teardown(cleanup).catch(() => {})
    throw error
  }
}

/**
 * Создаёт ленивый пересоздаваемый handle поверх фабрики. Фабрика исполняется один раз
 * при первом `ready()`/`await`; параллельные `await` делят один промис.
 */
export function createSynapseModule<TState extends Record<string, any>, TDispatcher, TSelectors>(
  factory: () => SynapseConfig<any, any, any, any> | Promise<SynapseConfig<any, any, any, any>>,
): SynapseModule<TState, TDispatcher, TSelectors> {
  let pending: Promise<Synapse<TState, TDispatcher, TSelectors>> | undefined
  let settled: Synapse<TState, TDispatcher, TSelectors> | undefined
  // Был ли текущий мемоизированный запуск собран С эффектами. Нужен для апгрейда
  // прогрев(без эффектов) → честный ready() (см. ниже).
  let startedWithEffects = false
  // Прогретые (без эффектов) запуски, вытесненные апгрейдом до честного ready(). Не рушим их
  // сразу: они могли «утечь» наружу через getSnapshot()/awaiter и ещё обслуживать рендер до
  // переключения на новый стор. Уничтожаем все скопом на destroy() handle.
  const supersededWarmRuns = new Set<Promise<Synapse<TState, TDispatcher, TSelectors>>>()

  // Единый запуск пайплайна с мемоизацией.
  //
  // Семантика withEffects:
  // - `ready()` / `ready({ withEffects: true })` — обычный путь: фабрика + эффекты, мемо
  //   (pending/settled), повторные вызовы отдают тот же промис.
  // - `ready({ withEffects: false })` — серверный прогрев: собирает стор БЕЗ эффектов, тоже
  //   мемоизируется — повторные серверные прогревы main handle переиспользуют стор, а
  //   getSnapshot() отдаёт READY-handle для синхронного SSR-seed.
  // - Апгрейд (святой клиентский инвариант): если мемо-запуск собран БЕЗ эффектов, а затем
  //   зовут честный `ready()` (с эффектами) — стор пересобирается с эффектами. Прогретый стор
  //   при этом ПРОДОЛЖАЕТ обслуживать getSnapshot() (settled не зануляется), пока новый запуск
  //   не зарезолвится; затем settled свапается. Прогретый стор НЕ рушим сразу (он мог утечь в
  //   awaiter/рендер) — копим в supersededWarmRuns и уничтожаем на destroy() handle. Так
  //   getSnapshot() не «проваливается» в undefined (иначе SSR-провайдер показал бы
  //   loadingComponent → hydration mismatch), и при этом гарантируем: после
  //   `ready({ withEffects: false })` последующий `ready()` всегда вернёт инстанс с запущенными
  //   эффектами. Обратно НЕ пересобираем: `withEffects: false` поверх уже запущенного стора
  //   отдаёт существующий (эффекты — безопасный супер-сет).
  const start = (withEffects: boolean) => {
    const needsUpgrade = withEffects && pending !== undefined && !startedWithEffects

    if (!pending || needsUpgrade) {
      // Устаревший прогретый запуск (если это апгрейд) — переедет в supersededWarmRuns по готовности нового.
      const stale = needsUpgrade ? pending : undefined
      const run = buildSynapse<TState, TDispatcher, TSelectors>(factory, { withEffects })
      pending = run
      startedWithEffects = withEffects
      run.then(
        (synapse) => {
          // Учитываем только если этот запуск всё ещё актуален (не вытеснен destroy/апгрейдом).
          if (pending === run) {
            settled = synapse
            // Свап завершён — помечаем прогретый запуск на уничтожение при destroy() handle.
            if (stale) supersededWarmRuns.add(stale)
          }
        },
        () => {
          // Fail-fast: возвращаем прежний мемо-запуск (или undefined вне апгрейда), чтобы
          // следующий ready() мог повторить попытку; settled (прогретый стор) продолжает
          // обслуживать getSnapshot(). При апгрейде сбрасываем флаг — повтор снова попробует
          // запустить эффекты.
          if (pending === run) {
            pending = stale
            if (stale !== undefined) startedWithEffects = false
          }
        },
      )
    }
    return pending
  }

  const handle: SynapseModule<TState, TDispatcher, TSelectors> = {
    ready(options) {
      const { withEffects = true } = options ?? {}
      return start(withEffects)
    },

    isReady() {
      return settled !== undefined
    },

    getSnapshot() {
      return settled
    },

    fork() {
      // Независимый handle из той же фабрики — со своим стором и жизненным циклом.
      return createSynapseModule<TState, TDispatcher, TSelectors>(factory)
    },

    async destroy() {
      const run = pending
      const orphans = [...supersededWarmRuns]
      pending = undefined
      settled = undefined
      startedWithEffects = false
      supersededWarmRuns.clear()

      // Сначала прибираем вытесненные апгрейдом прогретые сторы (если были).
      for (const orphan of orphans) {
        try {
          await (await orphan).destroy()
        } catch {
          // Прогретый запуск упал — разрушать нечего.
        }
      }

      if (!run) return
      try {
        const synapse = await run
        await synapse.destroy()
      } catch {
        // Фабрика/пайплайн упали — разрушать нечего.
      }
    },

    then(onFulfilled, onRejected) {
      return handle.ready().then(onFulfilled, onRejected)
    },
  }

  return handle
}
