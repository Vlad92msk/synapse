import type { Observable } from 'rxjs'

import type { IStorage } from '../../core'

/**
 * Handle C-формы: как {@link SynapseModule}, но с СИНХРОННЫМ доступом к main-ядру. Конструкция
 * расцеплена со стартом эффектов, поэтому `storage`/`selectors`/`dispatcher`/`state$` доступны
 * синхронно (main строится лениво при первом обращении). Это и даёт cross-store DI:
 * `otherModule.selectors` можно передать в конструктор чужих селекторов синхронно.
 */
export interface SyncSynapseModule<TState extends Record<string, any>, TDispatcher, TSelectors> extends SynapseModule<TState, TDispatcher, TSelectors> {
  readonly storage: IStorage<TState>
  readonly state$: Observable<TState>
  readonly dispatcher: TDispatcher
  /** Алиас `dispatcher`. */
  readonly actions: TDispatcher
  /** Селекторы main-ядра — их и берут cross-store DI. */
  readonly selectors: TSelectors
}

/**
 * Опции C-формы — ВТОРОЙ аргумент {@link createSynapse}. `postConstruct` живёт здесь (а не в
 * объект-конфиге), чтобы его колбэк контекстно типизировался уже выведенными `TDispatcher`/`TSelectors`
 * (в одном литерале с `dispatcher: (s) => …` он получил бы implicit any).
 */
export interface SyncSynapseOptions<TState extends Record<string, any>, TDispatcher, TSelectors> {
  // Синхронный хук после конструкции ядра, до первого рендера. Для нормализации persisted-состояния
  // (напр. гашение транзитных флагов). Пример: `{ postConstruct: ({ actions }) => actions.resetTransient() }`.
  postConstruct?: (synapse: Synapse<TState, TDispatcher, TSelectors>) => void
}

/** Готовый synapse — результат `SynapseModule.ready()` (или синхронной конструкции C-формы). */
export interface Synapse<TState extends Record<string, any>, TDispatcher, TSelectors> {
  storage: IStorage<TState>
  /** Поток состояния — присутствует ВСЕГДА, даже без эффектов. */
  state$: Observable<TState>
  /** Инстанс class-диспетчера (`undefined`, если нет). */
  dispatcher: TDispatcher
  /** Алиас `dispatcher`: его поля и есть dispatch-функции. */
  actions: TDispatcher
  /** Инстанс class-селекторов (`undefined`, если нет). */
  selectors: TSelectors
  destroy(): Promise<void>
}

/**
 * Ленивый пересоздаваемый handle. Конструкция/эффекты запускаются при первом `await`/`ready()`, а не
 * на импорте; повторные `await` делят один промис; `destroy()` сбрасывает мемоизацию.
 */
export interface SynapseModule<TState extends Record<string, any>, TDispatcher, TSelectors> extends PromiseLike<Synapse<TState, TDispatcher, TSelectors>> {
  /**
   * Первый вызов строит ядро и (при `withEffects: true`, по умолчанию) стартует эффекты; повторные —
   * тот же промис. `withEffects: false` — серверный прогрев дегидрации: собирает стор без старта
   * эффектов (см. {@link import('../dehydrateModule').dehydrateModule}).
   */
  ready(options?: { withEffects?: boolean }): Promise<Synapse<TState, TDispatcher, TSelectors>>
  /** Построено ли main-ядро. */
  isReady(): boolean
  /** Синхронный доступ к собранному main (или `undefined`). Нужен SSR-биндингу на первом кадре. */
  getSnapshot(): Synapse<TState, TDispatcher, TSelectors> | undefined
  /**
   * Синхронно строит СВЕЖЕЕ throwaway-ядро из `initialState` (не main): без эффектов и зависимостей.
   * Новый инстанс на каждый вызов (per-request изоляция на сервере, throwaway на первый кадр гидрации).
   */
  buildSyncShell?(): Synapse<TState, TDispatcher, TSelectors> | undefined
  /** Независимый handle из той же фабрики — свой стор и жизненный цикл (per-request изоляция на сервере). */
  fork(): SynapseModule<TState, TDispatcher, TSelectors>
  /** Останавливает модуль (LIFO-teardown) и сбрасывает мемоизацию. */
  destroy(): Promise<void>
}
