// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

/**
 * Параметры исполнения действия (мемоизация)
 */
export interface ActionExecutionOptions<TParams, TResult> {
  memoize?: (currentArgs: TParams, previousArgs: TParams, previousResult: TResult) => boolean
}

/**
 * Статусы жизненного цикла API-запроса.
 *
 * Сделано const-объектом (а не TS `enum`) намеренно: значения остаются обычными
 * строковыми литералами, поэтому `ApiStatus.Loading` и строка `'loading'`
 * взаимозаменяемы и тип обратно совместим с прежним строковым union'ом. С `enum`
 * это не так — его член не присваивается к литералу и наоборот.
 *
 * `ApiStatus` — одновременно значение (для `ApiStatus.Loading` в коде) и тип
 * (union всех статусов).
 */
export const ApiStatus = {
  Idle: 'idle',
  Loading: 'loading',
  Success: 'success',
  Error: 'error',
  Reset: 'reset',
} as const

export type ApiStatus = (typeof ApiStatus)[keyof typeof ApiStatus]

/**
 * Состояние API-запроса (`this.apiActions` / `this.keyedApiActions`)
 */
export interface ApiRequestState {
  status: ApiStatus
  error: string | null
}
