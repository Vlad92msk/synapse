import type { IStorage } from '../storage'
import type { ISelectorModule, SelectorAPI, SelectorOptions } from './selector.interface'
import { deepEquals, SelectorModule } from './selector.module'

/**
 * Определяет, передан ли в конструктор готовый модуль селекторов или storage.
 * Модуль распознаётся по методу `createSelector` (у `IStorage` его нет).
 */
function isSelectorModule<TState extends Record<string, any>>(source: IStorage<TState> | ISelectorModule<TState>): source is ISelectorModule<TState> {
  return typeof (source as ISelectorModule<TState>).createSelector === 'function'
}

/**
 * Публичный class-based слой селекторов. Селекторы объявляются как поля класса через
 * фабрики `this.select` / `this.combine` / `this.keyed` — поля сразу настоящие
 * `SelectorAPI` (eager-материализация, никаких рецептов).
 *
 * Внешние селекторы (cross-store) передаются параметрами конструктора подкласса:
 * parameter properties присваиваются ДО инициализаторов полей, поэтому `this.core`
 * в полях доступен корректно.
 *
 * Внутреннее состояние базы — hard-private (`#`-поля/методы): их имена в отдельном
 * namespace и НЕ конфликтуют с полями-селекторами подкласса (можно объявить селектор
 * `track`, `module` и т.п.). Зарезервированы лишь `protected`/публичные члены
 * (`select`/`combine`/`keyed`/`destroy`) — их именами селекторы называть нельзя.
 *
 * @example
 * ```ts
 * class PostsSelectors extends Selectors<PostsState> {
 *   constructor(storage: IStorage<PostsState>, private readonly core: CoreSelectors) {
 *     super(storage)
 *   }
 *
 *   private readonly api = this.select((s) => s.api)
 *   readonly list           = this.select((s) => s.list)
 *   readonly isPostsLoading = this.combine([this.api], (a) => a.postsRequest.status === 'loading')
 *   // cross-store: пересчитывается при изменении чужого стора
 *   readonly currentUserId  = this.combine([this.core.profile], (p) => p?.user_info?.id ?? null)
 * }
 * ```
 */
export abstract class Selectors<TState extends Record<string, any>> {
  /** Модуль, поверх которого работает class-слой. */
  readonly #module: ISelectorModule<TState>

  /** Владеем ли мы модулем (создали из storage) — только тогда destroy уничтожает его целиком. */
  readonly #ownsModule: boolean

  /** id всех созданных нами селекторов — для точечной очистки общего (чужого) модуля. */
  readonly #ownSelectorIds: string[] = []

  /** Кэши keyed-фабрик — очищаются при destroy. */
  readonly #keyedCaches: Array<Map<any, SelectorAPI<any>>> = []

  /** Принимает `storage` (создаёт и владеет своим `SelectorModule`) либо готовый модуль. */
  constructor(source: IStorage<TState> | ISelectorModule<TState>) {
    if (isSelectorModule<TState>(source)) {
      this.#module = source
      this.#ownsModule = false
    } else {
      this.#module = new SelectorModule<TState>(source)
      this.#ownsModule = true
    }
  }

  /** Простой селектор: мемоизация по ссылке стейта + трекинг затронутых ключей. */
  protected select<R>(selector: (state: TState) => R, options?: SelectorOptions<R>): SelectorAPI<R> {
    return this.#track(this.#module.createSelector(selector, options))
  }

  /** Combined-селектор; зависимости — любые `SelectorAPI`, в т.ч. из других сторов. */
  protected combine<Deps extends unknown[], R>(deps: { [K in keyof Deps]: SelectorAPI<Deps[K]> }, fn: (...args: Deps) => R, options?: SelectorOptions<R>): SelectorAPI<R> {
    return this.#track(this.#module.createSelector(deps, fn, options))
  }

  /**
   * Параметрический (keyed) селектор: один `SelectorAPI` на ключ (кэш по ключу).
   *
   * Слайсы соседних ключей живут под общим родителем (`s.byTarget[key]`), а storage при
   * обновлении пере-клонирует всю ветку — поэтому ссылка соседнего ключа не сохраняется.
   * Чтобы обновление ключа A не уведомляло подписчиков ключа B, keyed-селекторы по
   * умолчанию сравнивают значения структурно (`deepEquals`). Опции можно переопределить.
   */
  protected keyed<K extends string | number, R>(fn: (key: K) => (state: TState) => R, options?: SelectorOptions<R>): (key: K) => SelectorAPI<R> {
    const cache = new Map<K, SelectorAPI<R>>()
    this.#keyedCaches.push(cache)

    return (key: K): SelectorAPI<R> => {
      let api = cache.get(key)
      if (!api) {
        api = this.#track(this.#module.createSelector(fn(key), { equals: deepEquals, ...options }))
        cache.set(key, api)
      }
      return api
    }
  }

  /**
   * Уничтожает свой модуль (только если владеет им). Если модуль передан снаружи —
   * удаляет из него лишь свои селекторы, чужие не трогает.
   */
  destroy(): void {
    if (this.#ownsModule) {
      this.#module.destroy()
    } else {
      for (const id of this.#ownSelectorIds) {
        this.#module.removeSelector(id)
      }
    }
    this.#keyedCaches.forEach((cache) => cache.clear())
  }

  /** Регистрирует id селектора для последующей точечной очистки общего модуля. */
  #track<R>(api: SelectorAPI<R>): SelectorAPI<R> {
    this.#ownSelectorIds.push(api.getId())
    return api
  }
}
