import type { Observable } from 'rxjs'

import type { Action } from '../dispatcher'

/**
 * Буфер экшенов «до старта эффектов».
 *
 * Подписывается на диспетчер в момент КОНСТРУКЦИИ ядра (`constructSyncCore`) — синхронно на
 * рендере провайдера, ДО маунт-эффектов детей — и копит экшены, пока `EffectsModule.start()`
 * не подпишет эффекты. Тогда буфер сливается один раз в `action$` в исходном порядке.
 *
 * Почему на уровне ЯДРА, а не `EffectsModule`: последний конструируется лениво в
 * `ready() → startEffects` (после `useEffect` провайдера, т.е. уже ПОСЛЕ маунт-диспатча
 * ребёнка). Подписка оттуда гонку не закрывает — экшен теряется в непубличном `Subject`
 * шины ещё до того, как модуль вообще создан.
 *
 * Слив идёт в приватный `action$` эффект-модуля, а НЕ обратно в публичную `dispatcher.actions`,
 * поэтому watchers/middleware повторно не триггерятся.
 */
export class PreStartActionBuffer {
  private buffer: Action[] = []
  private subscription: { unsubscribe: VoidFunction } | null = null
  // Верхняя граница — страховка от утечки, если start() так и не позвали (эффекты не стартовали).
  private static readonly LIMIT = 10_000

  constructor(source: Observable<Action>) {
    this.subscription = source.subscribe((action) => {
      if (this.subscription && this.buffer.length < PreStartActionBuffer.LIMIT) {
        this.buffer.push(action)
      }
    })
  }

  /**
   * Гасит захват и возвращает накопленное (в исходном порядке). Идемпотентно: повторный вызов
   * вернёт пустой массив. Вызывается из `EffectsModule.start()` после того, как повешена живая
   * подписка на диспетчер — синхронно, без окна на дубль/потерю.
   */
  drain(): Action[] {
    this.stop()
    const drained = this.buffer
    this.buffer = []
    return drained
  }

  /** Гасит подписку без слива (teardown ядра, если эффекты так и не стартовали). */
  stop(): void {
    this.subscription?.unsubscribe()
    this.subscription = null
  }
}
