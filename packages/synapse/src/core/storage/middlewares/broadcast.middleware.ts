import { StorageAction } from '../utils/middleware-module'
import { SyncBroadcastChannel } from '../utils/broadcast.util'
import { createSharedStateMiddleware } from './shared-state.factory'

/**
 * Кросс-табная синхронизация через BroadcastChannel (async-хранилища).
 * Тонкая обёртка над {@link createSharedStateMiddleware} — вся логика в фабрике.
 */
export const broadcastMiddleware = createSharedStateMiddleware({
  name: 'broadcast',
  label: 'broadcastMiddleware',
  createChannel: (channelName) => new SyncBroadcastChannel<StorageAction>(channelName),
})
