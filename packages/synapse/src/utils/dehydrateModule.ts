import { StorageStatus } from '../core'
import type { SynapseModule } from './createSynapse/index'

// ─────────────────────────────────────────────────────────────────────────────
// Четыре уровня, которые тут крутятся (держать раздельно, иначе всё путается):
//
//   1. Module (handle)  — ленивая обёртка над фабрикой. Ещё НЕ стор. Умеет .ready()/.fork().
//                         `externalSynapseModule` — синглтон (живёт всю жизнь процесса, общий на
//                         всех); `synapseModule` — форк этого синглтона (новый handle под ОДИН запрос).
//   2. Synapse (instance) — собранный живой стор: { storage, dispatcher, selectors, state$ }.
//                         Результат `handle.ready()`. `synapse` — instance форка; `mainSynapse` —
//                         instance синглтона (общий на всех).
//   3. Storage          — контейнер состояния внутри instance: кэш, подписчики, middleware.
//   4. State (snapshot) — плоский объект данных типа TState. Результат `storage.getStateSync()`.
//                         Именно он уходит по сети пропом `dehydratedState`.
//
// Дегидрация = вынуть уровень 4 (голые данные) из живого стора, отбросив машинерию уровней 2–3,
// чтобы данные пережили JSON и уехали клиенту.
// ─────────────────────────────────────────────────────────────────────────────

export interface DehydrateModuleOptions<TState extends Record<string, any>> {
  // Серверные данные под запрос
  state?: Partial<TState>
  // Подготовить синглтон к синхронному SSR-рендеру: собрать его и залить snapshot. Только для
  // синхронно готовых (READY) сторов (Memory/LocalStorage); у async-сторов (IndexedDB)
  // синхронного серверного рендера нет — шаг пропускается.
  ssr?: boolean
}

// Server-safe дегидрация модуля: снимает сериализуемый снапшот состояния (уровень 4) для пропа
// dehydratedState. В отличие от замыкания dehydrate из createSynapseCtx — без React-зависимостей,
// импортируется в серверный (RSC / 'server only') модуль.
export const dehydrateModule = async <TState extends Record<string, any>, TDispatcher, TSelectors>(
  externalSynapseModule: SynapseModule<TState, TDispatcher, TSelectors>,
  options?: DehydrateModuleOptions<TState>,
): Promise<TState> => {
  const { state, ssr = false } = options ?? {}

  // Форк: изоляция под запрос
  // fork() берёт ту же фабрику и делает НОВЫЙ независимый handle (уровень 1)
  const synapseModule = externalSynapseModule.fork()

  // Создаем экземпляр Synapse (без модуля эффектов)
  const synapse = await synapseModule.ready({ withEffects: false })

  // Мердж initialState форка + серверные данные
  if (state) await synapse.storage.hydrate({ ...synapse.storage.getStateSync(), ...state })

  // Достаем смерженный объект из хранилища
  const snapshot = synapse.storage.getStateSync()

  // Уничтожаем synapseModule
  await synapseModule.destroy()

  if (ssr) {
    // Задача - не передать куда-то данные, а сделать externalSynapseModule готовым к рендеру (чтобы не было спиннера) в Provider
    const mainSynapse = await externalSynapseModule.ready({ withEffects: false })
    // READY — только у синхронных сторов; у async (IndexedDB) синхронного SSR нет, шаг пропускается.
    if (mainSynapse.storage.initStatus.status === StorageStatus.READY) {
      await mainSynapse.storage.hydrate(snapshot)
    }
  }

  return snapshot
}
