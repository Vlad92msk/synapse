import { StorageAction } from '../utils/middleware-module'
import { WorkerChannel } from '../utils/worker-channel.util'
import { createSyncSharedStateMiddleware } from './shared-state.factory'

/**
 * Кросс-табная синхронизация через SharedWorker (sync-хранилища), с прозрачным
 * фолбэком на BroadcastChannel. Тонкая обёртка над {@link createSyncSharedStateMiddleware}.
 */
export const syncSharedWorkerMiddleware = createSyncSharedStateMiddleware({
  name: 'sync-shared-worker',
  label: 'syncSharedWorkerMiddleware',
  createChannel: (channelName) => new WorkerChannel<StorageAction>(channelName),
})
