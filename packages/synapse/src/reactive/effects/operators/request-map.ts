import { EMPTY, from, Observable, of, OperatorFunction, pipe } from 'rxjs'
import { catchError, mergeMap, switchMap } from 'rxjs/operators'

import { ChunkRequestConsistent, chunkRequestConsistent, ChunkRequestParallel, chunkRequestParallel } from '../utils'

/**
 * Конфигурация для валидации в validateMap
 */
export interface ValidateConfig {
  conditions: boolean[]
  /**
   * Что сделать, если валидация не прошла. Необязательно: если не задано — эффект просто
   * ничего не делает (поток завершается без эмита). Это убирает повторяющийся бойлерплейт
   * `skipAction: () => d.loadX.reset()` там, где сбрасывать нечего.
   */
  skipAction?: (() => any) | any | ((() => any) | any)[]
}

/**
 * Утилиты для запросов в validateMap
 */
export interface ValidateMapRequestUtils {
  chunkRequest: ChunkRequestParallel
  chunkRequestConsistent: ChunkRequestConsistent
}

/**
 * Оператор наложения (flattening) для {@link requestMap} / {@link mutationMap}: задаёт стратегию
 * конкуренции между перекрывающимися срабатываниями (switchMap / exhaustMap / mergeMap / concatMap).
 * Сигнатура совпадает с rxjs-операторами, поэтому их можно передавать напрямую.
 */
export type FlattenOperator = <A, R>(project: (value: A) => Observable<R>) => OperatorFunction<A, R>

/**
 * Общая конфигурация обработки запроса. Используется и для чтения ({@link validateMap}),
 * и для записи ({@link mutationMap}) — единый словарь.
 */
export interface RequestMapConfig<T, Body, TResult> {
  /** Гейт перед запросом: `conditions` все true → запрос; иначе `skipAction` (или no-op). */
  validator?: (value: T) => ValidateConfig
  /**
   * Асинхронная сборка тела запроса ПЕРЕД apiCall (FormData, blob'ы, теги). Результат приходит
   * вторым аргументом в apiCall. Нет prepare → body = undefined. Для чтения обычно не нужен.
   */
  prepare?: (value: T) => Body | Promise<Body>
  /** Вызывается после успешной валидации, перед apiCall. Типичное использование — dispatch loading-статуса. */
  loadingAction?: (value: T) => void
  /** Вызывается при ошибке в apiCall (catchError). Получает ошибку + те же данные что loadingAction/apiCall. */
  errorAction?: (error: any, value: T) => void
  /** Сам запрос: из value (+ собранного prepare тела) строим поток. Успех обрабатывается внутри через apiResult. */
  apiCall: (value: T, body: Body, utils: ValidateMapRequestUtils) => Observable<TResult>
}

/**
 * Общее ядро обработки запроса. Накладывает на поток триггеров единый пайп:
 *   [validator] → loadingAction → [prepare] → apiCall → (apiResult success) / errorAction.
 *
 * Стратегию конкуренции задаёт `flatten`:
 *  - `switchMap`  — последний выигрывает, отменяет in-flight (ЧТЕНИЕ, см. {@link validateMap});
 *  - `exhaustMap` — одиночная операция, дабл-сабмит игнорируется, in-flight НЕ отменяется (формы);
 *  - `mergeMap`   — независимые операции над разными сущностями (реальная параллельность);
 *  - `concatMap`  — строго по очереди.
 *
 * catchError стоит ВНУТРИ проекции flatten — ошибка одного запроса не валит весь поток эффекта
 * (важно для mergeMap: падение одного удаления не убивает остальные).
 * @internal
 */
function requestMap<T, Body, TResult>(
  flatten: FlattenOperator,
  { validator, prepare, loadingAction, errorAction, apiCall }: RequestMapConfig<T, Body, TResult>,
): OperatorFunction<T, any> {
  return pipe(
    flatten((pipeData: T) => {
      /**
       * Функция вызова API-метода
       */
      const callApi = () => {
        if (loadingAction) loadingAction(pipeData)

        // нет prepare → пустое тело; иначе резол body (sync/async) перед запросом
        const body$: Observable<Body> = prepare ? from(Promise.resolve(prepare(pipeData))) : of(undefined as Body)

        const apiCall$ = body$.pipe(
          mergeMap((body) =>
            apiCall(pipeData, body, {
              chunkRequest: chunkRequestParallel,
              chunkRequestConsistent: chunkRequestConsistent,
            }),
          ),
        )

        if (!errorAction) return apiCall$

        return apiCall$.pipe(
          catchError((err) => {
            errorAction(err, pipeData)
            return EMPTY
          }),
        )
      }

      /**
       * Если валидацию не используем - сразу вызываем запрос
       */
      if (!validator) return callApi()

      const validateConfig = validator(pipeData)
      const { conditions, skipAction } = validateConfig
      const conditionMet = conditions.every(Boolean)

      /**
       * Если валидация не пройдена - вызываем экшн сброса.
       * skipAction не задан → ничего не делаем (no-op по умолчанию).
       */
      if (!conditionMet) {
        if (skipAction === undefined) return EMPTY
        if (Array.isArray(skipAction)) {
          return of(...skipAction.filter(Boolean).map((action) => (typeof action === 'function' ? action() : action)))
        }
        return of(typeof skipAction === 'function' ? skipAction() : skipAction)
      }

      return callApi()
    }),
  )
}

/**
 * Оператор для ЧТЕНИЯ (запросов-ресурсов): валидация → loading → apiCall, стратегия switchMap
 * («последний выигрывает», отменяет устаревший in-flight запрос). Для записи используйте
 * {@link mutationMap} — switchMap отменял бы in-flight мутацию (потеря ответа уже закоммиченной
 * записи, отмена первого сабмита вместо игнора дубля).
 *
 * @example
 * ```ts
 * action$.pipe(
 *   ofType(d.loadPosts),
 *   validateMap({
 *     validator: ([, { status }]) => ({ conditions: [status !== ApiStatus.Loading] }),
 *     loadingAction: () => d.loadPosts.loading(),
 *     errorAction: (err) => d.loadPosts.failure(getErrorMessage(err)),
 *     apiCall: ([action]) =>
 *       fromRequest(api.getPosts.request(action.payload)).pipe(
 *         apiResult((page) => { d.applyPosts(page); d.loadPosts.success() }),
 *       ),
 *   }),
 * )
 * ```
 */
export function validateMap<T, TResult = any>(config: {
  validator?: (value: T) => ValidateConfig
  loadingAction?: (value: T) => void
  errorAction?: (error: any, value: T) => void
  apiCall: (value: T, utils: ValidateMapRequestUtils) => Observable<TResult>
}): OperatorFunction<T, any> {
  return requestMap(switchMap, {
    validator: config.validator,
    loadingAction: config.loadingAction,
    errorAction: config.errorAction,
    // adapter: публичный apiCall чтения принимает (value, utils); ядро зовёт (value, body, utils)
    apiCall: (value, _body, utils) => config.apiCall(value, utils),
  })
}

/**
 * Оператор для ЗАПИСИ (мутаций). Тот же словарь, что у {@link validateMap}, плюс два понятия:
 *  - `flatten` — стратегия конкуренции (rxjs-оператор). У записи нет одного правильного варианта,
 *    поэтому его выбирает вызывающий под смысл операции:
 *      • `exhaustMap` — одиночная операция (форма create/update): дабл-сабмит игнорируется,
 *        in-flight НЕ отменяется;
 *      • `mergeMap`   — операции над разными сущностями (delete/toggle/repost): параллельность;
 *      • `concatMap`  — строго по очереди.
 *  - `prepare` — асинхронная сборка тела (FormData, blob'ы) перед запросом; результат приходит
 *    вторым аргументом в apiCall.
 *
 * Успех/статусы ведутся ВНУТРИ apiCall через apiResult — единообразно с {@link validateMap}.
 *
 * @example
 * ```ts
 * action$.pipe(
 *   ofType(d.createPost),
 *   mutationMap({
 *     flatten: exhaustMap,
 *     loadingAction: () => d.createPost.loading(),
 *     errorAction: (err) => d.createPost.failure(getErrorMessage(err)),
 *     prepare: (payload) => buildCreateBody(api, payload),
 *     apiCall: (_payload, body) =>
 *       fromRequest(api.createPost.request({ body })).pipe(
 *         apiResult((post) => { d.createPost.success(); d.prependPost(post) }),
 *       ),
 *   }),
 * )
 * ```
 */
export function mutationMap<T, Body = void, TResult = any>({
  flatten,
  validator,
  prepare,
  loadingAction,
  errorAction,
  apiCall,
}: {
  flatten: FlattenOperator
} & RequestMapConfig<T, Body, TResult>): OperatorFunction<T, any> {
  return requestMap(flatten, { validator, prepare, loadingAction, errorAction, apiCall })
}
