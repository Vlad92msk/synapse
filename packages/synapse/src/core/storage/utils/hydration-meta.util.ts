// Мета-метка свежести снапшота для мердж-по-свежести в `hydrate` (аналог TanStack Query
// `dehydratedAt`/`dataUpdatedAt`). Едет вместе со снапшотом как обычный enumerable-ключ
// (переживает JSON/RSC-границу), но в само состояние стора НЕ попадает — `splitHydrationMeta`
// снимает её перед записью, чтобы селекторы не видели служебное поле.

import { isEqual } from './state-diff.util'

/** Служебный ключ метки времени дегидрации на снапшоте. */
export const HYDRATION_META_KEY = '__hydratedAt' as const

export type HydrationStamped<T> = T & { [HYDRATION_META_KEY]?: number }

/** Ставит метку свежести на снапшот (по умолчанию — текущее время). */
export const stampHydration = <T extends Record<string, any>>(state: T, at: number = Date.now()): HydrationStamped<T> => ({
  ...state,
  [HYDRATION_META_KEY]: at,
})

/** Отделяет метку свежести от полезного состояния. `hydratedAt === undefined` для немаркированных снапшотов (legacy). */
export const splitHydrationMeta = <T extends Record<string, any>>(state: T): { hydratedAt: number | undefined; state: T } => {
  if (!(HYDRATION_META_KEY in state)) return { hydratedAt: undefined, state }
  const { [HYDRATION_META_KEY]: hydratedAt, ...rest } = state as HydrationStamped<T>
  return { hydratedAt: typeof hydratedAt === 'number' ? hydratedAt : undefined, state: rest as T }
}

export type HydrateStrategy = 'replace' | 'merge'

/** План гидрации: что записать и кого уведомить. Чистый расчёт — общий для sync/async сторов. */
export interface HydrationPlan<T> {
  /** Нужно ли писать состояние (false → снапшот устарел / без изменений). */
  apply: boolean
  /** Что записать: для `replace` — payload целиком; для `merge` — смерженный объект. */
  merged: T
  /** Реально изменившиеся верхнеуровневые ключи (для точечной нотификации). */
  changedKeys: string[]
  /** Новое значение `_hydratedAt` (только `replace`, только когда `apply`). */
  nextHydratedAt?: number
  /** Обновления `_hydratedAtByKey` (только `merge`; применять всегда, даже при `apply: false`). */
  keyStampUpdates?: Record<string, number>
}

/**
 * Считает план гидрации по стратегии и меткам свежести. Ничего не мутирует — вызывающий сам
 * пишет состояние и обновляет метки (sync/async различаются лишь способом записи).
 *
 * - `replace`: гейт по всему снапшоту (`hydratedAt <= _hydratedAt` → skip); применяем payload целиком.
 * - `merge`: пер-ключевой гейт (устаревший ключ пропускаем, свежие применяем); в `merged` попадают
 *   только реально изменившиеся ключи поверх текущего состояния; ключи вне снапшота не трогаются.
 */
export const planHydration = <T extends Record<string, any>>(args: {
  strategy: HydrateStrategy
  hydratedAt: number | undefined
  payload: T
  current: T
  lastHydratedAt: number | undefined
  hydratedAtByKey: Record<string, number>
}): HydrationPlan<T> => {
  const { strategy, hydratedAt, payload, current, lastHydratedAt, hydratedAtByKey } = args

  if (strategy === 'replace') {
    if (hydratedAt !== undefined && lastHydratedAt !== undefined && hydratedAt <= lastHydratedAt) {
      return { apply: false, merged: payload, changedKeys: [] }
    }
    return { apply: true, merged: payload, changedKeys: Object.keys(payload), nextHydratedAt: hydratedAt }
  }

  // merge: пер-ключевой мердж со свежестью по ключу.
  const changedKeys: string[] = []
  const keyStampUpdates: Record<string, number> = {}
  const applied: Record<string, any> = {}

  for (const key of Object.keys(payload)) {
    const keyStamp = hydratedAtByKey[key]
    if (hydratedAt !== undefined && keyStamp !== undefined && hydratedAt <= keyStamp) continue // ключ устарел
    if (hydratedAt !== undefined) keyStampUpdates[key] = hydratedAt
    if (!isEqual((current as Record<string, any>)[key], (payload as Record<string, any>)[key])) {
      applied[key] = (payload as Record<string, any>)[key]
      changedKeys.push(key)
    }
  }

  const merged = (changedKeys.length ? { ...current, ...applied } : current) as T
  return { apply: changedKeys.length > 0, merged, changedKeys, keyStampUpdates }
}
