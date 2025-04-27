import { forkJoin, Observable, timer } from 'rxjs'
import { mergeMap } from 'rxjs/operators'

import { chunk } from '../../../utils'

/**
 * Разбиение запроса на порции
 * Отправляется ПАРАЛЛЕЛЬНО n-запросов и дожидается ответа от каждого
 * @param fn - функция в которую передается chunk и возвращается функция api
 * @param arr - массив который нужно поделить
 * @param size - размер порции
 * @param delayMs - задержка между запросами в миллисекундах
 */
export const chunkRequestParallel = <T, R>(fn: (chunk: T[]) => Observable<R>, arr: T[], size: number, delayMs = 0): Observable<R[]> =>
  forkJoin(chunk(arr, size).map((chunkItem, index) => timer(index * delayMs).pipe(mergeMap(() => fn(chunkItem)))))
export type ChunkRequestParallel = typeof chunkRequestParallel
