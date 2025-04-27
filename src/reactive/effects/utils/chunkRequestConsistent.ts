import { Observable, of } from 'rxjs'
import { concatAll, delay, mergeMap, toArray } from 'rxjs/operators'

import { chunk } from '../../../utils'

/**
 * Разбиение запроса на порции
 * Отправляется ПОСЛЕДОВАТЕЛЬНО n-запросов и дожидается ответа от каждого
 * @param fn - функция в которую передается chunk и возвращается функция api
 * @param arr - массив который нужно поделить
 * @param size - размер порции
 * @param delayMs - задержка между запросами в миллисекундах
 */
export const chunkRequestConsistent = <T, R>(fn: (chunk: T[]) => Observable<R>, arr: T[], size: number, delayMs = 0): Observable<R[]> => {
  const chunks = chunk(arr, size).map((chunkItem) => of(chunkItem).pipe(delay(delayMs), mergeMap(fn)))
  return of(...chunks).pipe(concatAll(), toArray())
}
export type ChunkRequestConsistent = typeof chunkRequestConsistent
