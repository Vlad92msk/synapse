import { StorageStatus } from '../core'
import type { SynapseModule } from './createSynapse/index'

export interface DehydrateModuleOptions<TState extends Record<string, any>> {
  // Серверные данные под запрос. Накладываются поверх initialState форка shallow-мерджем
  // верхнего уровня, поэтому можно передавать только изменённые поля. Вложенные объекты
  // заменяются целиком: правишь подполе api.x — передавай весь api.
  state?: Partial<TState>
  // Прогреть основной handle снапшотом для синхронного SSR-рендера. Только для синхронно
  // готовых (READY) сторов (Memory/LocalStorage); у async-сторов (IndexedDB) синхронного
  // серверного рендера нет — прогрев пропускается.
  ssr?: boolean
}

// Server-safe дегидрация модуля: сериализуемый снапшот стора для пропа dehydratedState.
// В отличие от замыкания dehydrate из createSynapseCtx — без React-зависимостей, импортируется
// в серверный (RSC / 'server only') модуль.
export const dehydrateModule = async <TState extends Record<string, any>, TDispatcher, TSelectors>(
  synapseModule: SynapseModule<TState, TDispatcher, TSelectors>,
  options?: DehydrateModuleOptions<TState>,
): Promise<TState> => {
  const { state, ssr = false } = options ?? {}

  // Per-request форк: собственный стор, не пересекается с другими запросами.
  // ready({ withEffects: false }) — собираем стор для снапшота БЕЗ запуска эффектов: на
  // сервере они не нужны и потенциально вредны (см. ready()/buildSynapse withEffects).
  const fork = synapseModule.fork()
  const forked = await fork.ready({ withEffects: false })
  // hydrate заменяет состояние целиком, поэтому мерджим поверх текущего, иначе частичный
  // state занулил бы непереданные поля. await покрывает и async-сторы (IndexedDB), иначе
  // getStateSync() снял бы снапшот до завершения гидрации.
  if (state) await forked.storage.hydrate({ ...forked.storage.getStateSync(), ...state })
  const snapshot = forked.storage.getStateSync()
  await fork.destroy()

  if (ssr) {
    // Прогрев main handle тоже через ready({ withEffects: false }): серверу нужны только
    // READY-storage + state для resolveSyncReady → getStoreIfReady → seedHydration. Эффекты
    // не стартуем — main handle при ssr живёт между запросами и не destroy-ится, его эффекты
    // «висели» бы навсегда.
    const main = await synapseModule.ready({ withEffects: false })
    if (main.storage.initStatus.status === StorageStatus.READY) {
      await main.storage.hydrate(snapshot)
    }
  }

  return snapshot
}
