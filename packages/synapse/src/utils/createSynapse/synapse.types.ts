import type { Observable } from 'rxjs'

import type { IStorage, Selectors } from '../../core'
import type { Dispatcher, Effect, Effects } from '../../reactive'
import type { DependencyInput } from './types'

/**
 * Конфиг новой (class-based) формы сборки — возвращается фабрикой, переданной в
 * `createSynapse(factory)`. В отличие от старого объект-конфига здесь передаются уже
 * сконструированные инстансы class-слоёв (`Dispatcher`/`Selectors`/`Effects`), а не
 * фабричные функции.
 *
 * @template TState     форма состояния хранилища
 * @template TDispatcher инстанс class-диспетчера (или `undefined`, если его нет)
 * @template TSelectors  инстанс class-селекторов (или `undefined`)
 * @template TEffects    инстанс class-эффектов (или `undefined`)
 */
export interface SynapseConfig<
  TState extends Record<string, any>,
  TDispatcher extends Dispatcher<TState> | undefined = undefined,
  TSelectors extends Selectors<TState> | undefined = undefined,
  TEffects extends Effects<TState, NonNullable<TDispatcher>, any> | undefined = undefined,
> {
  /** Хранилище модуля (создаётся в фабрике; формат тот же, что у старого конфига). */
  storage: IStorage<TState>
  /** Зависимости от других synapse — формат не меняется (`waitForDependencies`). */
  dependencies?: DependencyInput[]
  /** Таймаут ожидания готовности зависимостей (мс, по умолчанию 30000). */
  dependencyTimeout?: number
  /** Инстанс class-диспетчера. Финализируется сборщиком (имена экшенов из имён полей). */
  dispatcher?: TDispatcher
  /** Инстанс class-селекторов (уже материализованы конструктором). */
  selectors?: TSelectors
  /** Class-эффекты и/или legacy-функции вперемешку. */
  effects?: TEffects | Array<TEffects | Effect>
  /** Чужие диспетчеры, чьи экшены вливаются в `action$` (вариант коммуникации 3). */
  externalDispatchers?: TEffects extends Effects<any, any, infer TExt> ? TExt : Record<string, Dispatcher<any>>
}

/**
 * Синхронная «SSR-оболочка» модуля — подмножество {@link SynapseConfig} БЕЗ `effects`
 * и `dependencies`. Возвращается опциональной `ssrShell`-фабрикой в
 * `createSynapse(factory, { ssrShell })`.
 *
 * Назначение: дать модулю способ синхронно (без `await` async-фабрики и её зависимостей)
 * подняться из `initialState` на сервере, чтобы провайдер отрендерил `children` в SSR-HTML.
 * Полный стор со всеми зависимостями и эффектами достраивается на клиенте как обычно.
 *
 * Требование: `storage` должен быть синхронным (Memory/LocalStorage) — только он умеет
 * `initializeSync()`. Эффекты/зависимости здесь намеренно недопустимы: на сервере они не нужны.
 */
export interface SynapseShellConfig<
  TState extends Record<string, any>,
  TDispatcher extends Dispatcher<TState> | undefined = undefined,
  TSelectors extends Selectors<TState> | undefined = undefined,
> {
  /** Синхронное хранилище оболочки (Memory/LocalStorage) с `initialState`. */
  storage: IStorage<TState>
  /** Инстанс class-диспетчера (финализируется сборщиком). */
  dispatcher?: TDispatcher
  /** Инстанс class-селекторов. */
  selectors?: TSelectors
}

/**
 * Синхронное «ядро» модуля — уже построенные `storage`/`dispatcher`/`selectors`. Передаётся
 * в `wire` объектной формы {@link SynapseObjectConfig}, чтобы async-обвязка могла к ним обратиться.
 */
export interface SynapseCore<
  TState extends Record<string, any>,
  TDispatcher extends Dispatcher<TState> | undefined = undefined,
  TSelectors extends Selectors<TState> | undefined = undefined,
> {
  storage: IStorage<TState>
  dispatcher: TDispatcher
  selectors: TSelectors
}

/**
 * Async-обвязка модуля — зависимости и эффекты, которые нужны только на клиенте. Возвращается
 * функцией `wire` объектной формы {@link SynapseObjectConfig}; на сервере (SSR-оболочка) НЕ исполняется.
 */
export interface SynapseWiring<TState extends Record<string, any>, TEffects extends Effects<TState, any, any> | undefined = undefined> {
  /** Зависимости от других synapse (формат `waitForDependencies`). */
  dependencies?: DependencyInput[]
  /** Таймаут ожидания готовности зависимостей (мс). */
  dependencyTimeout?: number
  /** Class-эффекты и/или legacy-функции. */
  effects?: TEffects | Array<TEffects | Effect>
  /** Чужие диспетчеры, чьи экшены вливаются в `action$`. */
  externalDispatchers?: Record<string, Dispatcher<any>>
}

/**
 * Объектная (структурная) форма {@link createSynapse} — разносит СИНХРОННУЮ сборку ядра
 * (`storage`/`dispatcher`/`selectors`) и АСИНХРОННУЮ обвязку (`wire`: `dependencies`/`effects`).
 *
 * Главный выигрыш: SSR-оболочка **выводится библиотекой автоматически** из sync-ядра — ручной
 * `ssrShell` не нужен, а `name`/`initialState` объявлены один раз (нет расхождения sync/async).
 * `wire` исполняется только при сборке реального стора (клиент) и НЕ бежит на сервере.
 *
 * @example
 * ```ts
 * export const relationsSynapse = createSynapse({
 *   storage: () => new MemoryStorage<RelationsState>({ name: 'relations', initialState }),
 *   dispatcher: (s) => new RelationsDispatcher(s),
 *   selectors: (s) => new RelationsSelectors(s),
 *   wire: async () => ({ effects: new RelationsEffects(await getRelationsEndpoints()) }),
 * })
 * ```
 *
 * Оболочка авто-выводится, только если `storage` синхронный (Memory/LocalStorage). Для async-стора
 * (IndexedDB) синхронного SSR нет — не задавай `{ ssr: true }` у провайдера (как и раньше).
 * Для случаев, где `dispatcher`/`selectors` требуют client-only аргументы, используй функциональную
 * форму с ручным `ssrShell`.
 */
export interface SynapseObjectConfig<
  TState extends Record<string, any>,
  TDispatcher extends Dispatcher<TState> | undefined = undefined,
  TSelectors extends Selectors<TState> | undefined = undefined,
  TEffects extends Effects<TState, NonNullable<TDispatcher>, any> | undefined = undefined,
> {
  /** Синхронный конструктор хранилища. Зовётся заново под каждый стор/оболочку (изоляция). */
  storage: () => IStorage<TState>
  /** Синхронный конструктор class-диспетчера из хранилища. */
  dispatcher?: (storage: IStorage<TState>) => TDispatcher
  /** Синхронный конструктор class-селекторов из хранилища. */
  selectors?: (storage: IStorage<TState>) => TSelectors
  /** Async-обвязка (deps/effects) — только клиент. Получает уже собранное sync-ядро. */
  wire?: (core: SynapseCore<TState, TDispatcher, TSelectors>) => SynapseWiring<TState, TEffects> | Promise<SynapseWiring<TState, TEffects>>
}

/** Опции {@link createSynapse}. */
export interface CreateSynapseOptions<
  TState extends Record<string, any>,
  TDispatcher extends Dispatcher<TState> | undefined = undefined,
  TSelectors extends Selectors<TState> | undefined = undefined,
> {
  /**
   * Синхронная фабрика SSR-оболочки. Задайте для «фоновых» провайдеров без серверных
   * данных (presence/relations/media-player), чтобы они рендерили `children` на сервере.
   * Включается связкой с `createSynapseCtx(module, { ssr: true })`.
   */
  ssrShell?: () => SynapseShellConfig<TState, TDispatcher, TSelectors>
}

/**
 * Готовый synapse — результат запуска фабрики (`SynapseModule.ready()`).
 */
export interface Synapse<TState extends Record<string, any>, TDispatcher, TSelectors> {
  storage: IStorage<TState>
  /** Поток состояния — присутствует ВСЕГДА, даже без эффектов. */
  state$: Observable<TState>
  /** Инстанс class-диспетчера (полный тип). `undefined`, если диспетчера нет. */
  dispatcher: TDispatcher
  /** Алиас диспетчера: его поля и есть dispatch-функции. */
  actions: TDispatcher
  /** Инстанс class-селекторов. `undefined`, если селекторов нет. */
  selectors: TSelectors
  destroy(): Promise<void>
}

/**
 * Ленивый синглтон-handle. Фабрика исполняется один раз при первом `await`/`ready()`,
 * а не на импорте — это поглощает userland-обёртку `createFeatureSynapse` и чинит
 * SSR-боль жадного запуска при импорте.
 *
 * Handle — пересоздаваемый: `destroy()` сбрасывает мемоизацию, следующий `ready()`
 * заново исполняет фабрику.
 */
export interface SynapseModule<TState extends Record<string, any>, TDispatcher, TSelectors> extends PromiseLike<Synapse<TState, TDispatcher, TSelectors>> {
  /**
   * Первый вызов запускает фабрику и весь пайплайн; повторные — отдают тот же промис.
   *
   * `withEffects` (по умолчанию `true`) — запускать ли RxJS-эффекты:
   * - `true` (клиент) — полноценный запуск со стартом эффектов;
   * - `false` (серверный прогрев дегидрации, см. {@link import('../dehydrateModule').dehydrateModule})
   *   собирает стор целиком (storage/dispatcher/selectors/state$) для снапшота и SSR-seed,
   *   но пропускает `effectsModule.start()`.
   *
   * Мемо-семантика: прогрев (`withEffects: false`) тоже мемоизируется, но последующий честный
   * `ready()` (с эффектами) пересоберёт стор и запустит эффекты — инвариант «клиентский
   * `ready()` обязан стартовать эффекты» соблюдён.
   */
  ready(options?: { withEffects?: boolean }): Promise<Synapse<TState, TDispatcher, TSelectors>>
  /** Запущена ли фабрика и успешно ли резолвился synapse. */
  isReady(): boolean
  /**
   * Синхронный доступ к уже собранному synapse (или `undefined`, если ещё не готов).
   * Нужен SSR-биндингу: позволяет отдать стор на первом синхронном рендере без `await`.
   */
  getSnapshot(): Synapse<TState, TDispatcher, TSelectors> | undefined
  /**
   * Синхронно строит SSR-оболочку из `ssrShell`-фабрики (см. {@link SynapseShellConfig}):
   * поднимает стор из `initialState` без `await`, без зависимостей и эффектов. Возвращает
   * НОВЫЙ инстанс на каждый вызов (request-изоляция на сервере; throwaway на первый кадр
   * гидрации на клиенте) — НЕ мемоизируется. `undefined`, если `ssrShell` не задана.
   *
   * Использует `createSynapseCtx` при `ssr: true`, чтобы отрендерить `children` на сервере.
   *
   * **Присутствует только если у модуля задана `ssrShell`** (или объектная форма `createSynapse`).
   * Иначе метода нет — `typeof module.buildSyncShell === 'function'` служит честным признаком
   * «модуль умеет синхронный SSR».
   */
  buildSyncShell?(): Synapse<TState, TDispatcher, TSelectors> | undefined
  /**
   * Создаёт независимый handle из той же фабрики. Каждый fork — со своим жизненным циклом
   * и состоянием (общего стора нет). Нужен для per-request изоляции на сервере (SSR):
   * `dehydrate` форкает модуль, чтобы параллельные запросы не делили состояние.
   */
  fork(): SynapseModule<TState, TDispatcher, TSelectors>
  /** Останавливает модуль (LIFO-teardown) и сбрасывает мемоизацию (пересоздаваемость). */
  destroy(): Promise<void>
}
