import type { Selectors } from '../../core/selector/selectors.base'
import type { IStorage } from '../../core/storage/storage.interface'
import type { Dispatcher } from '../../reactive/dispatcher/dispatcher.base'
import type { EffectFunctionLike, EffectsLike } from './effects-runner'
import type { SyncSynapseModule, SyncSynapseOptions } from './synapse.types'
import { createSyncSynapseModule, type SyncEffectsContext } from './syncModule'
import type { DependencyInput } from './types'

/** Выводит форму состояния из типа хранилища: `IStorage<T>` → `T`. Даёт вывести `TState` из `storage: () => new MemoryStorage<State>()`. */
type StateOf<TStorage> = TStorage extends IStorage<infer TState> ? TState : never

/**
 * Что может вернуть фабрика `effects`: инстанс(ы) `Effects`/функции-эффекты из `synapse-storage/reactive`,
 * возможно асинхронно (ленивый резолв endpoints). Типы структурные — `.d.ts` ядра не ссылается на rxjs.
 */
type SyncEffectsItems = EffectsLike | EffectFunctionLike | Array<EffectsLike | EffectFunctionLike> | undefined
type SyncEffectsResult = SyncEffectsItems | Promise<SyncEffectsItems>

/**
 * Реализация {@link createSynapse} (основная сигнатура).
 *
 * Создаёт ленивый class-based synapse (C-форма): синхронная конструкция ядра
 * (`storage`/`dispatcher`/`selectors`) + `dependencies` (гейт старта эффектов) + фабрика `effects`.
 * Возвращает {@link SyncSynapseModule} — с синхронным доступом к main-ядру (`.selectors` и т.д.)
 * для cross-store DI. `TState` выводится из `storage: () => new MemoryStorage<State>()`.
 *
 * @example
 * ```ts
 * export const postsSynapse = createSynapse({
 *   storage: () => new MemoryStorage<PostsState>({ name: 'posts', initialState }),
 *   dispatcher: (s) => new PostsDispatcher(s),
 *   selectors: (s) => new PostsSelectors(s, coreSynapse.selectors),   // cross-store DI
 *   dependencies: [coreSynapse],
 *   effects: async () => new PostsEffects(await getPostsEndpoints(), coreSynapse.state$),
 * })
 * ```
 */
function createSynapseImpl<
  TStorage extends IStorage<any>,
  TDispatcher extends Dispatcher<StateOf<TStorage>> | undefined = undefined,
  TSelectors extends Selectors<StateOf<TStorage>> | undefined = undefined,
>(
  config: {
    storage: () => TStorage
    dispatcher?: (storage: TStorage) => TDispatcher
    selectors?: (storage: TStorage) => TSelectors
    dependencies?: DependencyInput[]
    dependencyTimeout?: number
    externalDispatchers?: Record<string, Dispatcher<any>> | ((ctx: SyncEffectsContext<StateOf<TStorage>, TDispatcher, TSelectors>) => Record<string, Dispatcher<any>>)
    effects?: (ctx: SyncEffectsContext<StateOf<TStorage>, TDispatcher, TSelectors>) => SyncEffectsResult
  },
  options?: SyncSynapseOptions<StateOf<TStorage>, TDispatcher, TSelectors>,
): SyncSynapseModule<StateOf<TStorage>, TDispatcher, TSelectors> {
  // postConstruct приходит вторым аргументом (контекстно типизируется) — вливаем в конфиг.
  return createSyncSynapseModule<StateOf<TStorage>, TDispatcher, TSelectors>({ ...(config as any), postConstruct: options?.postConstruct })
}

/**
 * Явно-типизированная C-форма — когда `TState` неудобно выводить из фабрики `storage`. Те же поля,
 * но генерики задаются вручную; `postConstruct` — вторым аргументом (контекстная типизация).
 *
 * @example
 * ```ts
 * const accounts = createSynapse.of<AccountsState, AccountsDispatcher, AccountsSelectors>(
 *   { storage: () => new LocalStorage({ name: 'accounts', initialState }), dispatcher: (s) => new AccountsDispatcher(s) },
 *   { postConstruct: ({ actions }) => actions.resetTransient() },
 * )
 * ```
 */
function of<TState extends Record<string, any>, TDispatcher extends Dispatcher<TState> | undefined = undefined, TSelectors extends Selectors<TState> | undefined = undefined>(
  config: {
    storage: () => IStorage<TState>
    dispatcher?: (storage: IStorage<TState>) => TDispatcher
    selectors?: (storage: IStorage<TState>) => TSelectors
    dependencies?: DependencyInput[]
    dependencyTimeout?: number
    externalDispatchers?: Record<string, Dispatcher<any>> | ((ctx: SyncEffectsContext<TState, TDispatcher, TSelectors>) => Record<string, Dispatcher<any>>)
    effects?: (ctx: SyncEffectsContext<TState, TDispatcher, TSelectors>) => SyncEffectsResult
  },
  options?: SyncSynapseOptions<TState, TDispatcher, TSelectors>,
): SyncSynapseModule<TState, TDispatcher, TSelectors> {
  return createSyncSynapseModule<TState, TDispatcher, TSelectors>({ ...config, postConstruct: options?.postConstruct } as any)
}

/**
 * Создаёт ленивый class-based synapse (C-форма). Основная сигнатура выводит `TState` из фабрики
 * `storage`; `createSynapse.of<TState, TDispatcher, TSelectors>(…)` — явно-типизированный вариант.
 *
 * Собирается чистым выражением (`Object.assign` под `#__PURE__`), а не присваиванием
 * `createSynapse.of = …` на верхнем уровне модуля: иначе бандлеры считают модуль имеющим
 * side effect и не могут выкинуть его (вместе с reactive-слоем и rxjs) при неиспользовании.
 */
export const createSynapse = /*#__PURE__*/ Object.assign(createSynapseImpl, { of })
