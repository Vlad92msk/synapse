import { loggerConsole } from '../../../_utils'
import { AsyncMiddleware, AsyncMiddlewareAPI, AsyncNextFunction, StorageAction, StorageActionType } from '../utils/middleware-module'

export interface LoggerMiddlewareOptions {
  /** Сворачивать группу лога (console.groupCollapsed). По умолчанию `false`. */
  collapsed?: boolean
  /**
   * Печатать prev/next состояние. По умолчанию `true`. Включает доп. `getState()` на
   * каждое пишущее действие — поэтому middleware только для dev.
   */
  showState?: boolean
}

/** Логируем только пишущие действия — чтения (`get`/`keys`) не шумят. */
const WRITE_ACTIONS = new Set<StorageActionType>(['set', 'update', 'delete', 'clear', 'reset', 'init'])

/**
 * Dev-only middleware: логирует пишущие действия storage (тип, ключ, длительность и,
 * опционально, prev/next состояние). Намеренно минимален — без i18n/цветов (для полноценного
 * dev-лога диспетчера есть `loggerDispatcherMiddleware`). Подключайте только в dev:
 *
 * ```ts
 * middlewares: (getDefault) => (import.meta.env.DEV ? [getDefault().logger()] : [])
 * ```
 */
export const loggerMiddleware = (options: LoggerMiddlewareOptions = {}): AsyncMiddleware => {
  const { collapsed = false, showState = true } = options

  return {
    name: 'logger',
    reducer: (api: AsyncMiddlewareAPI) => (next: AsyncNextFunction) => async (action: StorageAction) => {
      if (!WRITE_ACTIONS.has(action.type)) {
        return next(action)
      }

      const started = Date.now()
      const prevState = showState ? await api.getState() : undefined

      try {
        const result = await next(action)
        const time = Date.now() - started

        const group = collapsed ? loggerConsole.groupCollapsed : loggerConsole.group
        group(`[synapse storage] ${action.type}${action.key != null ? ` "${String(action.key)}"` : ''} (${time}ms)`)
        loggerConsole.log('action:', action)
        if (showState) {
          loggerConsole.log('prev:', prevState)
          loggerConsole.log('next:', await api.getState())
        }
        loggerConsole.groupEnd()

        return result
      } catch (error) {
        loggerConsole.error(`[synapse storage] ${action.type} FAILED`, error)
        throw error
      }
    },
  }
}
