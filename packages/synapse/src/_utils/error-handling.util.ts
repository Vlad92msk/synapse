import type { ILogger } from '../core/storage/storage.interface'
import { loggerConsole } from './logger-console.util'

/**
 * Базовый класс ошибок Synapse.
 * Позволяет отличать ошибки библиотеки от прочих через `instanceof`.
 */
export class SynapseError extends Error {
  constructor(
    message: string,
    public readonly context?: string,
    public readonly cause?: unknown,
  ) {
    super(context ? `[${context}] ${message}` : message)
    this.name = 'SynapseError'
  }
}

/**
 * Категории обработки ошибок в Synapse:
 *
 * - CRITICAL:   Ошибки конфигурации/инициализации → log + throw (fail fast)
 * - OPERATION:  Ошибки CRUD-операций → log + rethrow (вызывающий код решает)
 * - CALLBACK:   Ошибки в пользовательских callback'ах → log + swallow (не крашим приложение)
 * - CLEANUP:    Ошибки при destroy/unsubscribe → log + swallow (best-effort)
 */

type LogMethod = 'error' | 'warn'

/**
 * Логирует ошибку через ILogger (если есть) или через console-fallback.
 */
export function logError(message: string, error: unknown, logger?: ILogger | null, level: LogMethod = 'error'): void {
  const meta = { error: error instanceof Error ? error.message : String(error) }
  if (logger) {
    logger[level](message, meta)
  } else {
    loggerConsole[level](`[Synapse] ${message}`, error)
  }
}

/**
 * OPERATION pattern: логирует и пробрасывает ошибку.
 * Для CRUD-операций (get, set, update, delete) и инициализации.
 */
export function handleOperationError(context: string, error: unknown, logger?: ILogger | null): never {
  logError(context, error, logger)
  throw error
}

/**
 * CALLBACK pattern: логирует и проглатывает ошибку.
 * Для пользовательских callback'ов, подписчиков, эффектов.
 * Ошибка в одном callback'е не должна ломать остальные.
 */
export function handleCallbackError(context: string, error: unknown, logger?: ILogger | null): void {
  logError(context, error, logger)
}

/**
 * CLEANUP pattern: логирует предупреждение и продолжает.
 * Для destroy(), unsubscribe() и прочих cleanup-операций.
 */
export function handleCleanupError(context: string, error: unknown, logger?: ILogger | null): void {
  logError(context, error, logger, 'warn')
}

/**
 * Обёртка для безопасного вызова callback'а (CALLBACK pattern).
 * Возвращает результат или undefined при ошибке.
 */
export function safeCallback<T>(fn: () => T, context: string, logger?: ILogger | null): T | undefined {
  try {
    return fn()
  } catch (error) {
    handleCallbackError(context, error, logger)
    return undefined
  }
}

/**
 * Обёртка для promise в fire-and-forget сценариях (CLEANUP pattern).
 */
export function safePromise(promise: Promise<unknown>, context: string, logger?: ILogger | null): void {
  promise.catch((error) => handleCleanupError(context, error, logger))
}
