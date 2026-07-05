import { SyncBroadcastChannel } from '../utils/broadcast.util'
import { StorageAction } from '../utils/middleware-module'
import { createSyncSharedStateMiddleware } from './shared-state.factory'

/**
 * Кросс-табная синхронизация через BroadcastChannel (sync-хранилища).
 * Тонкая обёртка над {@link createSyncSharedStateMiddleware} — вся логика в фабрике.
 */
export const syncBroadcastMiddleware = createSyncSharedStateMiddleware({
  name: 'sync-broadcast',
  label: 'syncBroadcastMiddleware',
  createChannel: (channelName) => new SyncBroadcastChannel<StorageAction>(channelName),
})
