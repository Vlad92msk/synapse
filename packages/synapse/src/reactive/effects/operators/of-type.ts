import { combineLatest, Observable, of, OperatorFunction } from 'rxjs'
import { filter, map, take } from 'rxjs/operators'

import { logError } from '../../../_utils/error-handling.util'
import type { Action, DispatchFunction, ExtractResultType, WatcherFunction } from '../../dispatcher'
import type { TypedAction } from '../effects.types'

/**
 * Оператор для фильтрации действий по типу с сохранением типа payload
 */
export function ofType<T extends DispatchFunction<any, any> | WatcherFunction<any>>(
  actionFn: T,
): OperatorFunction<Action, TypedAction<T extends WatcherFunction<infer R> ? R : ExtractResultType<T>>> {
  const { actionType } = actionFn

  if (!actionType) {
    logError('ofType: action function does not have actionType property', actionFn, null, 'warn')
    return filter(() => false) as any
  }

  // Определяем тип payload в зависимости от типа функции
  type PayloadType = T extends WatcherFunction<infer R> ? R : ExtractResultType<T>

  // Улучшенная реализация с явными типами
  return (source$: Observable<Action>): Observable<TypedAction<PayloadType>> => {
    return source$.pipe(filter((action): action is TypedAction<PayloadType> => action !== undefined && action.type === actionType))
  }
}

/**
 * Оператор для фильтрации действий по нескольким типам с объединением типов payload
 * @param actionFns Массив функций действий
 */
export function ofTypes<T extends DispatchFunction<any, any>[]>(actionFns: [...T]): OperatorFunction<Action, TypedAction<ExtractResultType<T[number]>>> {
  // Получаем типы действий
  const actionTypes = actionFns.map((fn) => fn.actionType).filter(Boolean)

  if (actionTypes.length === 0) {
    logError('ofTypes: no valid action types found in array', actionFns, null, 'warn')
    return filter(() => false) as OperatorFunction<Action, TypedAction<ExtractResultType<T[number]>>>
  }

  // Union тип для payload из всех действий
  type CombinedPayloadType = ExtractResultType<T[number]>

  // Улучшенная реализация с явными типами
  return (source$: Observable<Action>): Observable<TypedAction<CombinedPayloadType>> => {
    return source$.pipe(filter((action): action is TypedAction<CombinedPayloadType> => action !== undefined && actionTypes.includes(action.type)))
  }
}

/**
 * Оператор для ожидания выполнения всех указанных действий.
 *
 * **Важно:** Использует `combineLatest` — Observable не эмитит, пока КАЖДЫЙ из
 * указанных action не будет диспатчнут хотя бы один раз. Если хотя бы один action
 * никогда не будет вызван, поток зависнет навсегда без уведомления.
 * Убедитесь, что все указанные actions гарантированно будут диспатчнуты,
 * либо используйте `ofTypes` с ручной агрегацией при необходимости таймаута.
 *
 * @param actionFns Массив функций действий
 */
export function ofTypesWaitAll<T extends DispatchFunction<any, any>[]>(actionFns: [...T]) {
  return (source$: Observable<Action>): Observable<{ [K in keyof T]: TypedAction<ExtractResultType<T[K]>> }> => {
    // Создаем потоки для каждого типа действия
    const actionTypes = actionFns.map((fn) => fn.actionType).filter(Boolean)

    if (actionTypes.length === 0) {
      logError('ofTypesWaitAll: no valid action types found in array', actionFns, null, 'warn')
      return of([]) as any
    }

    // Для каждого типа действия создаем поток,
    // который берет первое срабатывание
    const actionStreams = actionTypes.map((type, index) =>
      source$.pipe(
        filter((action) => action.type === type),
        take(1),
        map((action) =>
          // Сохраняем ассоциацию с индексом, чтобы соответствовать
          // порядку в исходном массиве actionFns
          ({ index, action }),
        ),
      ),
    )

    // Ждем, пока все потоки выдадут значения, и сортируем результаты
    // по индексу для сохранения порядка
    return combineLatest(actionStreams).pipe(
      map((results) => {
        // Сортируем по индексу
        results.sort((a, b) => a.index - b.index)
        // Убираем индекс и возвращаем только действия
        return results.map((r) => r.action) as any
      }),
    )
  }
}
