import type { Selectors } from '../../core'
import type { Dispatcher, Effects } from '../../reactive'
import { createSynapseModule } from './factory'
import type { CreateSynapseOptions, SynapseConfig, SynapseModule } from './synapse.types'

/**
 * Создаёт ленивый class-based synapse из фабрики-конфига.
 *
 * Фабрика возвращает {@link SynapseConfig} с уже сконструированными class-слоями
 * (`Dispatcher`/`Selectors`/`Effects`). Возвращается {@link SynapseModule}-handle:
 * фабрика исполняется один раз при первом `await`/`ready()`, повторные `await` делят
 * один промис, `destroy()` сбрасывает мемоизацию (handle пересоздаваемый).
 *
 * @example
 * ```ts
 * const postsSynapse = createSynapse(() => {
 *   const storage = new MemoryStorage<PostsState>({ name: 'posts', initialState })
 *   return {
 *     storage,
 *     dispatcher: new PostsDispatcher(storage),
 *     selectors: new PostsSelectors(storage),
 *     effects: new PostsEffects(api),
 *   }
 * })
 *
 * const { dispatcher, selectors } = await postsSynapse
 * ```
 *
 * Опциональный второй аргумент `{ ssrShell }` включает синхронный серверный рендер для
 * «фоновых» провайдеров без серверных данных (см. {@link CreateSynapseOptions}):
 *
 * @example
 * ```ts
 * export const presenceSynapse = createSynapse(
 *   async () => { const core = await getCoreSynapse(); ... return { storage, dependencies: [core], dispatcher, selectors, effects } },
 *   { ssrShell: () => {
 *       const storage = new MemoryStorage({ name: 'presence', initialState })
 *       return { storage, selectors: new PresenceSelectors(storage), dispatcher: new PresenceDispatcher(storage) }
 *     } },
 * )
 * ```
 */
export function createSynapse<
  TState extends Record<string, any>,
  TDispatcher extends Dispatcher<TState> | undefined = undefined,
  TSelectors extends Selectors<TState> | undefined = undefined,
  TEffects extends Effects<TState, NonNullable<TDispatcher>, any> | undefined = undefined,
>(
  factory: () => SynapseConfig<TState, TDispatcher, TSelectors, TEffects> | Promise<SynapseConfig<TState, TDispatcher, TSelectors, TEffects>>,
  options?: CreateSynapseOptions<TState, TDispatcher, TSelectors>,
): SynapseModule<TState, TDispatcher, TSelectors> {
  return createSynapseModule<TState, TDispatcher, TSelectors>(factory, options)
}
