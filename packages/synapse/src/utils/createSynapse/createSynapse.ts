import type { IStorage, Selectors } from '../../core'
import type { Dispatcher, Effects } from '../../reactive'
import { createSynapseModule } from './factory'
import type { CreateSynapseOptions, SynapseConfig, SynapseModule, SynapseObjectConfig, SynapseShellConfig } from './synapse.types'

/**
 * Создаёт ленивый class-based synapse. Две формы:
 *
 * 1. **Функциональная** — `createSynapse(factory, { ssrShell? })`. Фабрика возвращает
 *    {@link SynapseConfig} с уже сконструированными class-слоями. SSR-оболочку задаёшь вручную
 *    через `ssrShell` (см. ниже).
 * 2. **Объектная** — `createSynapse({ storage, dispatcher?, selectors?, wire? })` (см.
 *    {@link SynapseObjectConfig}). Разносит синхронное ядро и async-обвязку; **SSR-оболочка
 *    выводится автоматически** — ручной `ssrShell` не нужен. Рекомендуется для новых модулей,
 *    особенно «фоновых» провайдеров.
 *
 * Возвращается {@link SynapseModule}-handle: фабрика исполняется один раз при первом `await`/`ready()`,
 * повторные `await` делят один промис, `destroy()` сбрасывает мемоизацию (handle пересоздаваемый).
 *
 * @example Функциональная форма
 * ```ts
 * const postsSynapse = createSynapse(() => {
 *   const storage = new MemoryStorage<PostsState>({ name: 'posts', initialState })
 *   return { storage, dispatcher: new PostsDispatcher(storage), selectors: new PostsSelectors(storage), effects: new PostsEffects(api) }
 * })
 * ```
 *
 * @example Объектная форма (авто-вывод SSR-оболочки)
 * ```ts
 * export const relationsSynapse = createSynapse({
 *   storage: () => new MemoryStorage<RelationsState>({ name: 'relations', initialState }),
 *   dispatcher: (s) => new RelationsDispatcher(s),
 *   selectors: (s) => new RelationsSelectors(s),
 *   wire: async () => ({ effects: new RelationsEffects(await getRelationsEndpoints()) }),
 * })
 * // ssrShell выводится сам из storage/dispatcher/selectors — писать его не нужно.
 * ```
 *
 * @example Функциональная форма + ручной `ssrShell` (escape hatch)
 * ```ts
 * export const presenceSynapse = createSynapse(
 *   async () => { const core = await getCoreSynapse(); return { storage, dependencies: [core], dispatcher, selectors, effects } },
 *   { ssrShell: () => { const storage = new MemoryStorage({ name: 'presence', initialState }); return { storage, selectors: new PresenceSelectors(storage), dispatcher: new PresenceDispatcher(storage) } } },
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
): SynapseModule<TState, TDispatcher, TSelectors>
export function createSynapse<
  TState extends Record<string, any>,
  TDispatcher extends Dispatcher<TState> | undefined = undefined,
  TSelectors extends Selectors<TState> | undefined = undefined,
  TEffects extends Effects<TState, NonNullable<TDispatcher>, any> | undefined = undefined,
>(config: SynapseObjectConfig<TState, TDispatcher, TSelectors, TEffects>): SynapseModule<TState, TDispatcher, TSelectors>
export function createSynapse<
  TState extends Record<string, any>,
  TDispatcher extends Dispatcher<TState> | undefined = undefined,
  TSelectors extends Selectors<TState> | undefined = undefined,
  TEffects extends Effects<TState, NonNullable<TDispatcher>, any> | undefined = undefined,
>(
  factoryOrConfig:
    | (() => SynapseConfig<TState, TDispatcher, TSelectors, TEffects> | Promise<SynapseConfig<TState, TDispatcher, TSelectors, TEffects>>)
    | SynapseObjectConfig<TState, TDispatcher, TSelectors, TEffects>,
  options?: CreateSynapseOptions<TState, TDispatcher, TSelectors>,
): SynapseModule<TState, TDispatcher, TSelectors> {
  // Функциональная форма — как раньше.
  if (typeof factoryOrConfig === 'function') {
    return createSynapseModule<TState, TDispatcher, TSelectors>(factoryOrConfig, options)
  }

  // Объектная форма: собираем factory (sync-ядро + await wire) и АВТО-ssrShell (только sync-ядро).
  const config = factoryOrConfig

  const buildCore = (storage: IStorage<TState>) => ({
    storage,
    dispatcher: config.dispatcher?.(storage) as TDispatcher,
    selectors: config.selectors?.(storage) as TSelectors,
  })

  const factory = async (): Promise<SynapseConfig<TState, TDispatcher, TSelectors, TEffects>> => {
    const core = buildCore(config.storage())
    const wiring = config.wire ? await config.wire(core) : undefined
    return { ...core, ...(wiring ?? {}) } as SynapseConfig<TState, TDispatcher, TSelectors, TEffects>
  }

  // Оболочка = то же sync-ядро из свежего storage, без wire. Для async-хранилища buildSyncShell
  // бросит понятную ошибку (у него синхронного SSR нет) — как и при ручном ssrShell.
  const ssrShell = (): SynapseShellConfig<TState, TDispatcher, TSelectors> => buildCore(config.storage())

  return createSynapseModule<TState, TDispatcher, TSelectors>(factory, { ssrShell })
}
