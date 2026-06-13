import type { Observable } from 'rxjs'

import { logError } from '../../_utils/error-handling.util'
import type { Action } from '../dispatcher'
import type { Dispatcher } from '../dispatcher/dispatcher.base'
import { type Effect, EFFECT_OPTIONS, type EffectOptions } from './effects.module'

/**
 * Маркер «продукта `this.effect`» на функции-рецепте. По его отсутствию dev-проверка
 * находит поля-функции, которые забыли обернуть в `this.effect(...)` (иначе они не
 * попадут в реестр и молча не запустятся).
 * @internal
 */
const EFFECT_MARKER = Symbol('synapse.effect.recipe')

/** Имена членов базового класса — не считаются «забытыми эффектами». */
const RESERVED_NAMES = new Set(['onDestroy'])

/**
 * Контекст эффекта в class-стиле — узкий надтип контекста EffectsModule. Рецепт читает
 * только эти два поля; остальное (services, externalStates) приходит через конструктор
 * класса и захватывается замыканием.
 */
export interface EffectCtx<TDispatcher, TExternalDispatchers = Record<string, never>> {
  /** Инстанс нашего class-диспетчера: `ofType(d.loadPosts)` + `d.applyPosts(...)`. */
  dispatcher: TDispatcher
  /** Внешние диспетчеры (их экшены уже влиты в общий `action$`). */
  external: TExternalDispatchers
}

/** Рецепт эффекта: отложенная функция, вызываемая один раз при `EffectsModule.start()`. */
export type EffectRecipe<TState, TDispatcher, TExternalDispatchers> = (
  action$: Observable<Action>,
  state$: Observable<TState>,
  ctx: EffectCtx<TDispatcher, TExternalDispatchers>,
) => Observable<unknown>

/**
 * Публичный class-based слой эффектов. Эффекты объявляются как поля класса через
 * `this.effect(fn)`. Сервисы и внешние сторы передаются через конструктор и
 * захватываются в замыкание рецепта (`this.api`, `this.core$`).
 *
 * @example
 * ```ts
 * class PostsEffects extends Effects<PostsState, PostsDispatcher> {
 *   constructor(private readonly api: PostsEndpoints, private readonly core$: Observable<CoreState>) {
 *     super()
 *   }
 *
 *   readonly loadPosts = this.effect((action$, state$, { dispatcher: d }) =>
 *     action$.pipe(ofType(d.loadPosts), validateMap({ apiCall: () => fromRequest(this.api.getPosts.request()) })))
 *
 *   override onDestroy() { this.socket.disconnect() }
 * }
 * ```
 *
 * **Правило**: сервисы из конструктора (`this.api`) можно *захватывать в замыкание*
 * рецепта, но не дереференсить прямо в инициализаторе поля — parameter properties
 * присваиваются ПОСЛЕ инициализаторов полей derived-класса.
 */
export abstract class Effects<TState extends Record<string, any>, TDispatcher, TExternalDispatchers extends Record<string, Dispatcher<any>> = Record<string, never>> {
  /** Реестр module-совместимых эффектов в порядке объявления полей. */
  readonly #effects: Effect[] = []

  /**
   * Регистрирует рецепт эффекта. Сам рецепт НЕ вызывается при конструировании — он
   * вызывается лениво при `EffectsModule.start()` с реальными потоками. Возвращает тот
   * же `fn`, так что поле остаётся вызываемым рецептом (удобно для юнит-тестов в изоляции).
   *
   * @param fn рецепт `(action$, state$, ctx) => Observable`
   * @param options опции эффекта (например, `resubscribeOnError`)
   */
  protected effect(fn: EffectRecipe<TState, TDispatcher, TExternalDispatchers>, options?: EffectOptions): EffectRecipe<TState, TDispatcher, TExternalDispatchers> {
    // Module-совместимая обёртка: широкий контекст EffectsModule → узкий EffectCtx рецепта.
    const moduleEffect: Effect<TState, TDispatcher> = (action$, state$, context) =>
      fn(action$, state$, {
        dispatcher: context.dispatcher,
        external: context.externalDispatchers as unknown as TExternalDispatchers,
      })

    if (options) {
      ;(moduleEffect as { [EFFECT_OPTIONS]?: EffectOptions })[EFFECT_OPTIONS] = options
    }
    this.#effects.push(moduleEffect)

    // Маркируем сам рецепт, чтобы dev-проверка не приняла его за «забытый эффект».
    ;(fn as { [EFFECT_MARKER]?: true })[EFFECT_MARKER] = true
    return fn
  }

  /**
   * Список module-совместимых эффектов в порядке объявления полей. Сборщик скармливает
   * его в `effectsModule.addEffects(...)`.
   *
   * Попутно (вне production) предупреждает о полях-функциях, не обёрнутых в `this.effect`.
   * @internal
   */
  getEffects(): Effect[] {
    if (process.env.NODE_ENV !== 'production') {
      for (const [name, value] of Object.entries(this)) {
        if (typeof value === 'function' && !(value as { [EFFECT_MARKER]?: true })[EFFECT_MARKER] && !RESERVED_NAMES.has(name)) {
          logError(
            `Effects: поле "${name}" — функция, но не обёрнута в this.effect(...). Эффекты регистрируются только через this.effect, иначе они молча не запустятся.`,
            value,
            null,
            'warn',
          )
        }
      }
    }
    return this.#effects
  }

  /** Опциональный teardown (закрыть сокет и т.п.) — вызывается сборщиком при `synapse.destroy()`. */
  onDestroy?(): void | Promise<void>
}
