import { merge, Observable, of, Subject } from 'rxjs'
import { catchError, retry, shareReplay } from 'rxjs/operators'

import { handleCallbackError } from '../../_utils/error-handling.util'
import type { Subscribable } from '../../core/observable/interop-observable'
import type { IStorage } from '../../core/storage/storage.interface'
import { EFFECTS_RUNNER, type EffectsRunner } from '../../utils/createSynapse/effects-runner'
import type { Action, DispatcherCore } from '../dispatcher'
import { type Effect, EFFECT_NAME, EFFECT_OPTIONS, type EffectContext, type EffectOptions, type ExternalStates, type NormalizedExternalStates } from './effects.types'
import { PreStartActionBuffer } from './preStartActionBuffer'
import { isStorage, toObservable } from './utils'

/**
 * Класс для управления эффектами с поддержкой доступа к состоянию и контексту
 * Основной класс, который следует использовать
 */
export class EffectsModule<
  TState extends Record<string, any> = any,
  TDispatcher = any,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalDispatchers extends Record<string, DispatcherCore<any, any>> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
> {
  private effects: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates>[] = []
  private subscriptions: Array<{ unsubscribe: VoidFunction }> = []
  private running = false
  private action$ = new Subject<Action>()
  private externalStates: NormalizedExternalStates<TExternalStates>

  // Буфер экшенов, задиспатченных ДО start() (маунт-диспатч ребёнка до useEffect провайдера).
  // Создаётся на уровне ЯДРА (constructSyncCore) и инъектится сюда: подписка оттуда живёт с
  // рендера, а не с ленивой конструкции этого модуля — иначе диспатч теряется в непубличном
  // Subject шины ещё до того, как модуль создан. Сливается один раз в action$ при старте.
  private preStartBuffer?: PreStartActionBuffer

  /**
   * Поток состояния
   */
  public readonly state$: Observable<TState>

  /**
   * Создает модуль эффектов
   * @param storage Хранилище состояния
   * @param dispatcher Основной dispatcher текущего synapse
   * @param externalDispatchers Внешние dispatcher'ы из других synapse
   * @param services Сервисы (API-клиенты и т.д.)
   * @param config Глобальная конфигурация для всех эффектов
   * @param externalStates Внешние состояния (Observable'ы от других хранилищ)
   */
  constructor(
    private storage: IStorage<TState>,
    private dispatcher: TDispatcher & { actions: Subscribable<Action> },
    private externalDispatchers: TExternalDispatchers = {} as TExternalDispatchers,
    private services: TServices = {} as TServices,
    private config: TConfig = {} as TConfig,
    externalStates: TExternalStates = {} as TExternalStates,
  ) {
    // Нормализуем externalStates: конвертируем storage → Observable
    this.externalStates = this.normalizeExternalStates(externalStates)

    // Поток состояния. Читаем СИНХРОННЫЙ кэш (`getStateSync`) — он есть у всех хранилищ, включая
    // async (IndexedDB обновляет кэш до нотификации подписчиков). Первое значение уходит сразу на
    // подписке, без микротаска: иначе `withLatestFrom(state$)` молча отбрасывал экшены, проигранные
    // из pre-start буфера в том же синхронном шаге `start()`. Заодно уходят гонки порядка ответов
    // async `getState()`. `shareReplay` (refCount) отдаёт текущее состояние и позднему подписчику;
    // при падении подписчиков до нуля отписывается от стора (как `toObservable`).
    this.state$ = new Observable<TState>((observer) => {
      observer.next(this.storage.getStateSync())
      const unsubscribe = this.storage.subscribeToAll(() => observer.next(this.storage.getStateSync()))
      return () => unsubscribe()
    }).pipe(shareReplay({ bufferSize: 1, refCount: true }))
  }

  /**
   * Нормализует externalStates: конвертирует IStorageBase в Observable, пропускает Observable как есть
   */
  private normalizeExternalStates(states: TExternalStates): NormalizedExternalStates<TExternalStates> {
    const normalized = {} as Record<string, Observable<any>>
    for (const [key, value] of Object.entries(states)) {
      normalized[key] = isStorage(value) ? toObservable(value) : value instanceof Observable ? value : toObservable(value as Subscribable<any>)
    }
    return normalized as NormalizedExternalStates<TExternalStates>
  }

  /**
   * Инъектит буфер pre-start экшенов, собранный на уровне ядра (`constructSyncCore`). Захват там
   * начинается с рендера — раньше, чем этот модуль вообще сконструирован. Буфер сливается один раз
   * в `start()`. Без буфера (напр. синапс без ядерного захвата) модуль работает как обычно.
   */
  setPreStartBuffer(buffer: PreStartActionBuffer): this {
    this.preStartBuffer = buffer
    return this
  }

  /**
   * Подписывается на действия от основного dispatcher'а и внешних dispatcher'ов
   */
  private subscribeToDispatchers() {
    // Основной dispatcher
    const mainSub = this.dispatcher.actions.subscribe((action) => {
      this.action$.next(action)
    })
    this.subscriptions.push(mainSub)

    // Внешние dispatcher'ы
    for (const [_, dispatcher] of Object.entries(this.externalDispatchers)) {
      const subscription = dispatcher.actions.subscribe((action) => {
        this.action$.next(action)
      })
      this.subscriptions.push(subscription)
    }
  }

  add(effect: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates>): this {
    this.effects.push(effect)

    if (this.running) {
      this.subscribeToEffect(effect, this.effects.length - 1)
    }

    return this
  }

  /**
   * Добавляет несколько эффектов
   * @param effects Эффекты для добавления
   * @returns Текущий модуль
   */
  addEffects(effects: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates>[]): this {
    effects.forEach((effect) => this.add(effect))
    return this
  }

  /**
   * Запускает все эффекты
   * @returns Текущий модуль
   */
  async start(): Promise<this> {
    if (this.running) {
      return this
    }
    // Ждем готовности основного хранилища
    await this.storage.waitForReady()

    // Живая подписка на dispatchers (подписки были очищены в stop()) — с этого момента экшены
    // идут в action$ напрямую. Затем гасим ядерный захват и забираем накопленное: между этими
    // двумя синхронными шагами диспатч проскочить не может, поэтому ни дубля, ни потери.
    this.subscribeToDispatchers()
    const buffered = this.preStartBuffer?.drain() ?? []

    // Подписываем эффекты ДО слива буфера, иначе задиспатченные до старта экшены уйдут в никуда.
    // state$ отдаёт текущее состояние синхронно на подписке, поэтому withLatestFrom(state$) уже
    // готов принять проигрываемые экшены. Живые экшены в этот синхронный участок не попадают:
    // диспетчер эмитит их после await (минимум микротаск), т.е. когда все эффекты уже подписаны.
    this.effects.forEach((effect, index) => this.subscribeToEffect(effect, index))

    // Один раз проигрываем экшены, пришедшие до подписки, в исходном порядке.
    for (const action of buffered) {
      this.action$.next(action)
    }

    this.running = true

    return this
  }

  /**
   * Останавливает все эффекты
   * @returns Текущий модуль
   */
  stop(): this {
    this.subscriptions.forEach((sub) => sub.unsubscribe())
    this.subscriptions = []
    // Буфер владеется ядром (constructSyncCore cleanup); к моменту stop() он уже слит drain()'ом.
    // Гасим захват на всякий случай (если start() не доходил до drain) — drain/stop идемпотентны.
    this.preStartBuffer?.stop()
    this.action$.complete()
    this.action$ = new Subject<Action>()
    this.running = false

    return this
  }

  /**
   * Подписывается на конкретный эффект
   * @param effect Эффект для подписки
   */
  private subscribeToEffect(effect: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates>, index = 0): void {
    try {
      const context: EffectContext<TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates> = {
        dispatcher: this.dispatcher,
        externalDispatchers: this.externalDispatchers,
        externalStates: this.externalStates,
        services: this.services,
        config: this.config,
      }

      let stream$ = effect(this.action$.asObservable(), this.state$, context)

      // resubscribeOnError: переподписываемся на поток вместо терминального завершения.
      // Лимит ретраев исчерпан → ошибка уходит в терминальный catchError ниже
      // (эффект умирает, остальные продолжают работать).
      const options = (effect as { [EFFECT_OPTIONS]?: EffectOptions })[EFFECT_OPTIONS]
      const resubscribeOnError = options?.resubscribeOnError
      const resubscribes = !!resubscribeOnError
      if (resubscribeOnError) {
        const config = resubscribeOnError === true ? {} : resubscribeOnError
        stream$ = stream$.pipe(retry({ count: config.count ?? Infinity, delay: config.delay, resetOnSuccess: true }))
      }

      // Имя эффекта (поле class-слоя Effects) — для понятного предупреждения; иначе индекс.
      const effectLabel = (effect as { [EFFECT_NAME]?: string })[EFFECT_NAME] ?? `#${index}`

      const output$ = stream$.pipe(
        catchError((err) => {
          // Поток эффекта дошёл до терминальной ошибки → этот эффект БОЛЬШЕ не реагирует
          // на экшены (остальные живы). Громкое сообщение, чтобы это не прошло незаметно.
          const tail = resubscribes
            ? 'resubscribeOnError исчерпал лимит ретраев.'
            : 'Чтобы эффект переподписывался после ошибки, добавьте { resubscribeOnError: true } в this.effect(fn, …).'
          handleCallbackError(`EffectsModule: эффект "${effectLabel}" УПАЛ и больше не будет реагировать на экшены (поток завершён). ${tail}`, err)
          return of(null)
        }),
      )

      const subscription = output$.subscribe((result) => {
        if (result === null || result === undefined) {
          return
        }

        if (typeof result === 'function') {
          try {
            result()
          } catch (callError) {
            handleCallbackError('EffectsModule: error calling effect result function', callError)
          }
        }
      })

      this.subscriptions.push(subscription)
    } catch (setupError) {
      handleCallbackError('EffectsModule: error setting up effect', setupError)
    }
  }
}

/**
 * Раннер эффектов для rxjs-free ядра (`createSynapse`): ядро не импортирует EffectsModule,
 * а берёт этот раннер с самих функций-эффектов (см. utils/createSynapse/effects-runner.ts).
 */
const runEffects: EffectsRunner = (effects, ctx) => {
  const effectsModule = new EffectsModule<any>(ctx.storage, ctx.dispatcher as any, ctx.externalDispatchers as any)
  if (ctx.preStartBuffer) effectsModule.setPreStartBuffer(ctx.preStartBuffer)
  effectsModule.addEffects(effects as Effect[])
  return {
    start: () => effectsModule.start(),
    stop: () => {
      effectsModule.stop()
    },
  }
}

/**
 * Помечает функцию-эффект раннером, чтобы `createSynapse` мог её запустить.
 * @internal
 */
export function markEffect<T extends (...args: any[]) => unknown>(effect: T): T {
  ;(effect as { [EFFECTS_RUNNER]?: EffectsRunner })[EFFECTS_RUNNER] = runEffects
  return effect
}

/**
 * Вспомогательная функция для создания типизированного эффекта
 */
export function createEffect<
  TState extends Record<string, any>,
  TDispatcher = any,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalDispatchers extends Record<string, DispatcherCore<any, any>> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
>(
  effect: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates>,
): Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates> {
  return markEffect(effect)
}

/**
 * Объединяет несколько эффектов в один
 * @param effects Эффекты для объединения
 * @returns Объединенный эффект
 */
export function combineEffects<
  TState extends Record<string, any>,
  TDispatcher = any,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalDispatchers extends Record<string, DispatcherCore<any, any>> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
>(
  ...effects: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates>[]
): Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates> {
  return markEffect((action$, state$, context) => {
    const outputs = effects.map((effect) => {
      try {
        return effect(action$, state$, context)
      } catch (error) {
        handleCallbackError('combineEffects: error in one of combined effects', error)
        return of(null)
      }
    })
    return merge(...outputs)
  })
}
