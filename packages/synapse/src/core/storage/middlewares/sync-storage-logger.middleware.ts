import { loggerConsole } from '../../../_utils'
import { StorageAction, StorageActionType, SyncMiddleware, SyncMiddlewareAPI, SyncNextFunction } from '../utils/middleware-module'
import { LoggerMiddlewareOptions } from './storage-logger.middleware'

/** Логируем только пишущие действия — чтения (`get`/`keys`) не шумят. */
const WRITE_ACTIONS = new Set<StorageActionType>(['set', 'update', 'delete', 'clear', 'reset', 'init'])

/**
 * Sync-версия {@link loggerMiddleware} для Memory/LocalStorage. Dev-only: логирует пишущие
 * действия (тип, ключ, длительность, опционально prev/next состояние). Без i18n/цветов.
 */
export const syncLoggerMiddleware = (options: LoggerMiddlewareOptions = {}): SyncMiddleware => {
  const { collapsed = false, showState = true } = options

  return {
    name: 'sync-logger',
    reducer: (api: SyncMiddlewareAPI) => (next: SyncNextFunction) => (action: StorageAction) => {
      if (!WRITE_ACTIONS.has(action.type)) {
        return next(action)
      }

      const started = Date.now()
      const prevState = showState ? api.getState() : undefined

      try {
        const result = next(action)
        const time = Date.now() - started

        const group = collapsed ? loggerConsole.groupCollapsed : loggerConsole.group
        group(`[synapse storage] ${action.type}${action.key != null ? ` "${String(action.key)}"` : ''} (${time}ms)`)
        loggerConsole.log('action:', action)
        if (showState) {
          loggerConsole.log('prev:', prevState)
          loggerConsole.log('next:', api.getState())
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
