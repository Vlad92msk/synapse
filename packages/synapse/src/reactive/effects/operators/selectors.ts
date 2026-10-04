import type { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

/**
 * Создает Observable с выбранными данными из состояния
 * @param state$ Поток состояния
 * @param selectors Селекторы для выбора частей состояния
 * @returns Observable с массивом выбранных значений
 */
export function selectorMap<TState, TResults extends any[]>(
  state$: Observable<TState>,
  ...selectors: { [K in keyof TResults]: (state: TState) => TResults[K] }
): Observable<TResults> {
  return state$.pipe(
    map((state) => {
      return selectors.map((selector) => selector(state)) as TResults
    }),
  )
}

/**
 * Создает именованный объект вместо массива
 * @param state$ Поток состояния
 * @param selectors Объект с селекторами
 * @returns Observable с объектом выбранных значений
 */
export function selectorObject<TState, TResult extends Record<string, any>>(
  state$: Observable<TState>,
  selectors: { [K in keyof TResult]: (state: TState) => TResult[K] },
): Observable<TResult> {
  return state$.pipe(
    map((state) => {
      const result = {} as TResult
      for (const [key, selector] of Object.entries(selectors)) {
        result[key as keyof TResult] = selector(state)
      }
      return result
    }),
  )
}
