import { Observable } from 'rxjs'

import type { RequestResponseModify } from '../../../api/types/endpoint.interface'
import type { QueryResult } from '../../../api/types/query.interface'

/**
 * Конвертирует `RequestResponseModify` в Observable с поддержкой отмены запроса.
 *
 * **Зачем нужен:**
 * `RequestResponseModify` — thenable-объект (имеет `.then()`), поэтому RxJS `from()`
 * может конвертировать его в Observable напрямую. Однако при таком подходе теряется
 * возможность отмены: когда RxJS отписывается от Observable (switchMap, takeUntil,
 * unsubscribe), Promise продолжает висеть — HTTP-запрос не абортится.
 *
 * `fromRequest` создаёт Observable с teardown-функцией, которая вызывает `req.abort()`
 * при отписке. Это гарантирует, что при переключении на новый запрос (switchMap)
 * или остановке эффектов предыдущий HTTP-запрос будет реально отменён.
 *
 * Abort вызывается только если запрос ещё не завершился — при нормальном завершении
 * (resolve/reject) teardown не абортит, чтобы не влиять на внутреннее состояние endpoint'а.
 *
 * @example
 * ```ts
 * import { fromRequest } from 'synapse-storage/reactive'
 *
 * // Вместо:
 * from(getList.request({ limit: 20, offset: 0 }))
 *
 * // Используйте:
 * fromRequest(getList.request({ limit: 20, offset: 0 }))
 *
 * // В эффекте с validateMap:
 * apiCall: ([_action, _state, { pageSize }]) =>
 *   fromRequest(getList.request({ limit: pageSize, offset: 0 })).pipe(
 *     apiResult((data) => {
 *       dispatcher.dispatch.applyList(data)
 *     }),
 *   ),
 * ```
 */
export function fromRequest<T>(req: RequestResponseModify<T>): Observable<QueryResult<T, Error>> {
  return new Observable((subscriber) => {
    let settled = false

    req
      .wait()
      .then((result) => {
        settled = true
        if (!subscriber.closed) {
          subscriber.next(result)
          subscriber.complete()
        }
      })
      .catch((err) => {
        settled = true
        if (!subscriber.closed) {
          subscriber.error(err)
        }
      })

    return () => {
      if (!settled) {
        req.abort()
      }
    }
  })
}
