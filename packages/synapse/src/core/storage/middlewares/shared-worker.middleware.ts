import { StorageAction } from '../utils/middleware-module'
import { WorkerChannel } from '../utils/worker-channel.util'
import { createSharedStateMiddleware } from './shared-state.factory'

/**
 * Кросс-табная синхронизация через SharedWorker (async-хранилища), с прозрачным
 * фолбэком на BroadcastChannel. Тонкая обёртка над {@link createSharedStateMiddleware}.
 */
export const sharedWorkerMiddleware = createSharedStateMiddleware({
  name: 'shared-worker',
  label: 'sharedWorkerMiddleware',
  createChannel: (channelName) => new WorkerChannel<StorageAction>(channelName),
})
