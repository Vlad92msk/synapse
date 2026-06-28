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
  'api-client': [
    { url: `${BLOB}/pokemon-advanced/pokemon.api.ts`, label: { ru: 'Канонический модуль', en: 'Canonical module' } },
    { url: `${BLOB}/ApiClientExample.tsx`, label: { ru: 'Интерактивная песочница', en: 'Interactive sandbox' } },
  ],
  'await-synapse': [{ url: `${BLOB}/pokemon-advanced/PokemonAdvancedExample.tsx` }],
  'create-synapse-basic': [{ url: `${BLOB}/pokemon-advanced/pokemon.synapse.ts` }],
  'create-synapse-dispatcher': [{ url: `${BLOB}/pokemon-advanced/pokemon.dispatcher.ts` }],
  'create-synapse-effects': [{ url: `${BLOB}/pokemon-advanced/pokemon.effects.ts` }],
  'delete-has-keys': [{ url: `${BLOB}/DeleteHasKeysExample.tsx` }],
  'dependencies': [{ url: `${BLOB}/pokemon-advanced/pokemon.synapse.ts` }],
  'dispatcher-detailed': [{ url: `${BLOB}/pokemon-advanced/pokemon.dispatcher.ts` }],
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
