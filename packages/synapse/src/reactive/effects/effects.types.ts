import type { Observable } from 'rxjs'

import type { Subscribable } from '../../core/observable/interop-observable'
import type { IStorageBase } from '../../core/storage/storage.interface'
import type { Action, ActionsResult, DispatcherCore, DispatchFunction, TypedAction } from '../dispatcher'

// TypedAction живёт в диспетчере (ядро без rxjs); реэкспорт — для совместимости импортов.
export type { TypedAction }

/**
 * Тип для внешних состояний — Observable, хранилище (IStorageBase) или поток ядра (`synapse.state$`),
 * которые автоматически конвертируются в Observable
 */
export type ExternalStates = Record<string, Observable<any> | IStorageBase<any> | Subscribable<any>>

/**
 * Внешние состояния в том виде, в каком их видит эффект: хранилища (`IStorageBase<S>`) уже
 * сконвертированы `EffectsModule` в `Observable<S>`, Observable'ы — как есть.
 */
export type NormalizedExternalStates<T extends ExternalStates> = {
  [K in keyof T]: T[K] extends IStorageBase<infer S> ? Observable<S> : T[K] extends Observable<any> ? T[K] : T[K] extends Subscribable<infer V> ? Observable<V> : T[K]
}

/**
 * Контекст эффекта — объект с зависимостями, передаваемый третьим аргументом
 */
export interface EffectContext<
  TDispatcher = any,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalDispatchers extends Record<string, DispatcherCore<any, any>> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
> {
  /** Основной dispatcher текущего synapse */
  dispatcher: TDispatcher
  /** Внешние dispatcher'ы из других synapse */
  externalDispatchers: TExternalDispatchers
  /** Внешние состояния — Observable'ы (переданные хранилища уже сконвертированы в Observable) */
  externalStates: NormalizedExternalStates<TExternalStates>
  /** Сервисы (API-клиенты и т.д.) */
  services: TServices
  /** Глобальная конфигурация для эффектов */
  config: TConfig
}

/**
 * Тип для эффекта с доступом к состоянию и контексту — основной тип
 */
export type Effect<
  TState extends Record<string, any> = any,
  TDispatcher = any,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalDispatchers extends Record<string, DispatcherCore<any, any>> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
> = (action$: Observable<Action>, state$: Observable<TState>, context: EffectContext<TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates>) => Observable<unknown>

/**
 * Опции конкретного эффекта. Прикрепляются к функции-эффекту через {@link EFFECT_OPTIONS}
 * (это делает `Effects.effect(fn, options)` из базового класса). EffectsModule читает их
 * при подписке.
 */
export interface EffectOptions {
  /**
   * Переподписаться на поток при непойманной ошибке вместо терминального завершения.
   *
   * - `true` — бесконечный немедленный resubscribe;
   * - `{ count, delay }` — лимит ретраев и задержка (мс) между ними (см. rxjs `retry`).
   *
   * По умолчанию (опция не задана) — текущее поведение: ошибка завершает эффект,
   * остальные продолжают работать.
   */
  resubscribeOnError?: boolean | { count?: number; delay?: number }
}

/**
 * Symbol-маркер, под которым опции эффекта ({@link EffectOptions}) хранятся на функции-эффекте.
 * @internal
 */
export const EFFECT_OPTIONS = Symbol('synapse.effect.options')

/**
 * Symbol-маркер с именем эффекта (имя поля class-слоя `Effects`). Проставляется
 * `Effects.getEffects()` для диагностики — EffectsModule использует его, чтобы в
 * предупреждении об упавшем эффекте назвать конкретный эффект.
 * @internal
 */
export const EFFECT_NAME = Symbol('synapse.effect.name')

/**
 * Тип для получения типов действий диспетчера
 */
export type DispatcherActions<T> = T extends DispatcherCore<any, infer A> ? ActionsResult<A> : Record<string, DispatchFunction<any, any>>
