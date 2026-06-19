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
   * Создаёт независимый handle из той же фабрики. Каждый fork — со своим жизненным циклом
   * и состоянием (общего стора нет). Нужен для per-request изоляции на сервере (SSR):
   * `dehydrate` форкает модуль, чтобы параллельные запросы не делили состояние.
   */
  fork(): SynapseModule<TState, TDispatcher, TSelectors>
  /** Останавливает модуль (LIFO-teardown) и сбрасывает мемоизацию (пересоздаваемость). */
  destroy(): Promise<void>
}
