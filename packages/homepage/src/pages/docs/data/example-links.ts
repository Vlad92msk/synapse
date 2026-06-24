import { DocKey, Locale } from '@models/docs'

// Ссылки на запускаемые примеры в репозитории. Намеренно НЕ парсятся из .md
// (генератор вырезает навигационную строку с README.md), а хранятся отдельно и
// рендерятся в DocPage. Если у документа нет примера — записи просто нет.

const BLOB = 'https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples'
const TREE = 'https://github.com/Vlad92msk/synapse/tree/master/packages/examples/src/examples'

export interface ExampleLink {
  url: string
  /** Короткая подпись для документов с несколькими примерами. */
  label?: Record<Locale, string>
}

export const exampleLinks: Partial<Record<DocKey, ExampleLink[]>> = {
  'api-client': [{ url: `${BLOB}/ApiClientExample.tsx` }],
  'await-synapse': [{ url: `${BLOB}/AwaitSynapseExample.tsx` }],
  'create-synapse-basic': [{ url: `${BLOB}/CreateSynapseBasicExample.tsx` }],
  'create-synapse-dispatcher': [{ url: `${BLOB}/CreateSynapseDispatcherExample.tsx` }],
  'create-synapse-effects': [{ url: `${BLOB}/CreateSynapseEffectsExample.tsx` }],
  'delete-has-keys': [{ url: `${BLOB}/DeleteHasKeysExample.tsx` }],
  'dependencies': [{ url: `${BLOB}/DependenciesExample.tsx` }],
  'dispatcher-detailed': [{ url: `${BLOB}/DispatcherDetailedExample.tsx` }],
  'event-bus': [{ url: `${BLOB}/EventBusExample.tsx` }],
  'hook-indexeddb': [{ url: `${BLOB}/HookIndexedDBExample.tsx` }],
  'hook-local-storage': [{ url: `${BLOB}/HookLocalStorageExample.tsx` }],
  'hook-memory': [{ url: `${BLOB}/HookExample.tsx` }],
  'indexeddb-storage': [{ url: `${BLOB}/IndexedDBExample.tsx` }],
  'local-storage': [{ url: `${BLOB}/LocalStorageExample.tsx` }],
  'memory-storage': [{ url: `${BLOB}/MemoryStorageExample.tsx` }],
  'middlewares': [{ url: `${BLOB}/MiddlewaresExample.tsx` }],
  'persist-migration': [{ url: `${BLOB}/PersistMigrationExample.tsx` }],
  'pokemon-advanced': [{ url: `${TREE}/pokemon-advanced` }],
  'reading-data': [{ url: `${BLOB}/ReadingDataExample.tsx` }],
  'selector-system': [
    { url: `${BLOB}/SelectorSystemExample.tsx`, label: { ru: 'Селекторы', en: 'Selectors' } },
    { url: `${BLOB}/ReactiveSelectorExample.tsx`, label: { ru: 'Реактивные селекторы', en: 'Reactive selectors' } },
  ],
  'singleton': [{ url: `${BLOB}/SingletonExample.tsx` }],
  'ssr-hydration': [{ url: `${BLOB}/HydrateExample.tsx` }],
  'static-create': [{ url: `${BLOB}/StaticCreateExample.tsx` }],
  'storage-factory': [{ url: `${BLOB}/FactoryExample.tsx` }],
  'subscriptions': [{ url: `${BLOB}/SubscriptionPatternsExample.tsx` }],
  'synapse-awaiter': [{ url: `${BLOB}/SynapseAwaiterExample.tsx` }],
  'synapse-ctx': [
    { url: `${BLOB}/SynapseCtxExample.tsx`, label: { ru: 'Базовый', en: 'Basic' } },
    { url: `${BLOB}/SynapseCtxSsrExample.tsx`, label: { ru: 'SSR', en: 'SSR' } },
  ],
  'writing-data': [{ url: `${BLOB}/WritingDataExample.tsx` }],
}
