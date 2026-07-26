// Auto-generated types for structured documentation
// Generated at: 2026-07-26T18:46:58.482Z
// Master locale: en

export type Locale = 'en' | 'ru'

export type DocKey = 'api-client' | 'api-ssr-pokemon' | 'api-use-mutation' | 'api-use-query' | 'architecture' | 'await-synapse' | 'browser-storage' | 'cache-layers' | 'create-synapse-basic' | 'create-synapse-dispatcher' | 'create-synapse-effects' | 'custom-fetch-fn' | 'custom-fetch-service-worker' | 'delete-has-keys' | 'dependencies' | 'dispatcher-detailed' | 'event-bus' | 'forms' | 'hook-indexeddb' | 'hook-local-storage' | 'hook-memory' | 'indexeddb-storage' | 'install' | 'local-storage' | 'memory-storage' | 'middlewares' | 'persist-migration' | 'pokemon-advanced' | 'reactive-reads' | 'reading-data' | 'selector-system' | 'shared-worker-middleware' | 'singleton' | 'ssr-hydration' | 'static-create' | 'storage-factory' | 'subscriptions' | 'synapse-awaiter' | 'synapse-ctx' | 'to-observable' | 'use-storage-observable' | 'use-storage-subscribe' | 'use-subscription' | 'worker-cache-storage' | 'writing-data'


// ✅ ТОЧНЫЕ ТИПЫ ДЛЯ SECTION ID
export interface DocSectionIds {
  'api-client': 'apiclient-http-client-with-caching' | 'why' | 'when-to-use' | 'when-you-dont-need-it' | 'imports' | 'creating-the-apiclient-pokemonapits' | 'response-mappers' | 'request-performing-a-request' | 'queryoptions-request-options' | 'requestdefinition-describing-an-endpoints-request' | 'caching-and-tags' | 'all-client-options-commented' | 'getendpoints-direct-access-to-the-endpoints' | 'waitwithcallbacks-callbacks-per-status' | 'abort-aborting-a-request' | 'subscribe-subscribing-to-the-endpoint-state' | 'lifecycle' | 'cache-invalidation-bus-endpointoncacheinvalidate' | 'synchronous-cache-read-endpointgetcachedsync' | 'ssr-dehydrate-hydrate'
  'api-ssr-pokemon': 'pokmon-ssr-server-render-client-pagination' | 'the-idea' | 'shared-api-factory' | 'server-warm-the-cache-and-dehydrate' | 'client-hydrate-and-render' | 'the-component-first-page-from-cache-pagination-on-the-client' | 'prewarming-several-pages' | 'gotchas' | 'nextjs-app-router' | 'see-also'
  'api-use-mutation': 'useapimutation-react-hook-for-mutations' | 'when-to-use-it-when-you-dont-need-it' | 'import' | 'usage' | 'return-value' | 'mutate-vs-mutateasync' | 'invalidating-related-queries' | 'notes' | 'see-also'
  'api-use-query': 'useapiquery-react-hook-for-get-requests' | 'when-to-use-when-you-dont-need-it' | 'import' | 'usage' | 'return-value' | 'options-commented' | 'ssr-no-loading-flash-after-hydration' | 'auto-refetch-on-cache-invalidation' | 'notes' | 'see-also'
  'architecture': 'two-layers-state-manager-and-business-logic-layer' | 'layer-1-state-manager-where-the-state-lives' | 'layer-2-business-logic-layer-how-logic-manages-the-state' | 'why-this-separation-matters'
  'await-synapse': 'awaitsynapse' | 'when-to-use' | 'when-its-not-needed' | 'creating' | 'withsynapseready-hoc-how-the-demo-module-is-lifted' | 'usesynapseready-hook' | 'programmatic-api' | 'relation-to-createsynapseawaiter'
  'browser-storage': 'browserstorage-server-safe' | 'why' | 'when-to-use' | 'when-you-dont-need-it' | 'how-it-differs-from-the-other-storages' | 'usage' | 'client-only-middleware' | 'all-parameters-commented' | 'options' | 'see-also'
  'cache-layers': 'caching-layers' | 'the-request-path' | 'layer-1-application-cache-storage' | 'layer-2-transport-basequeryfetchfn' | 'layer-3-network-your-serviceworker-cache-api' | 'other-libraries-do-the-same' | 'choosing-a-setup' | 'devtools-network-cheat-sheet' | 'see-also'
  'create-synapse-basic': 'createsynapse-basic' | 'storage-and-state-pokemonstorets' | 'selectors-pokemonselectorsts' | 'assembly-createsynapseconfig' | 'the-return-value' | 'usage-in-react' | 'async-lives-in-the-effects-factory' | 'full-shape-every-config-field' | 'a-realistic-large-project-module-cross-store-di-several-apis-a-socket' | 'extras-dx'
  'create-synapse-dispatcher': 'createsynapse-dispatcher' | 'why' | 'when-to-use-when-its-not-needed' | 'dispatcher-pokemondispatcherts' | 'thisaction' | 'thiswatcher' | 'signal-and-apiactions' | 'assembly' | 'the-return-value' | 'react-createsynapsectx' | 'see-also'
  'create-synapse-effects': 'createsynapse-effects' | 'why' | 'when-to-use-when-its-not-needed' | 'effects-pokemoneffectsts' | 'thiseffect' | 'oftype-oftypes' | 'reading-state-in-an-effect-selectorobject-selectormap' | 'handling-requests-validatemap-reads-mutationmap-writes' | 'assembly' | 'return-value' | 'see-also'
  'custom-fetch-fn': 'custom-basequeryfetchfn' | 'when-it-makes-sense' | 'configuration' | 'auth-retry-example' | 'cache-and-tags-work-on-top' | 'no-library-extension-needed' | 'when-to-use' | 'see-also'
  'custom-fetch-service-worker': 'custom-fetch-intercepting-serviceworker' | 'when-you-need-it' | 'how-it-works' | 'registering-the-serviceworker' | 'the-serviceworker-script' | 'how-it-differs-from-workercachestorage' | 'network-behavior' | 'when-to-use' | 'see-also'
  'delete-has-keys': 'remove-has-keys-clear-reset' | 'haskey-check-whether-a-key-exists' | 'keys-get-all-keys' | 'removekey-remove-a-single-key' | 'clear-clear-everything' | 'reset-reset-to-initialstate' | 'clear-vs-reset-whats-the-difference' | 'see-also'
  'dependencies': 'cross-module-dependencies' | 'when-you-need-dependencies-when-you-dont' | 'the-real-case-pokemon-settingsstorage' | 'four-patterns-of-cross-module-communication' | 'initialization-order' | 'see-also'
  'dispatcher-detailed': 'dispatcher-in-detail' | 'standalone-use' | 'dispatcher-surface' | 'thisaction' | 'thissignal' | 'thisapiactions-callable-group-lifecycle' | 'thiswatcher' | 'reserved-field-names' | 'usage' | 'see-also'
  'event-bus': 'createeventbus-event-bus' | 'when-to-use' | 'when-not-needed' | 'imports' | 'creating' | 'actionspublish-publishing-an-event' | 'actionssubscribe-subscribing-to-events' | 'actionsgeteventhistory-event-history' | 'actionsgetactivesubscriptions-active-subscriptions' | 'actionsclearevents-clearing-events' | 'destroy' | 'example-pokemon-publishes-other-modules-listen' | 'relation-to-createsynapse-the-bus-as-an-externaldispatcher' | 'see-also'
  'forms': 'forms-the-recipe-form-state-on-a-synapse-storage' | 'when-to-use' | 'when-not-needed' | 'honest-scope-what-this-is-and-isnt' | 'state-shape' | 'writing-a-field' | 'level-1-a-basic-form-memorystorage' | 'level-2-validation-as-a-middleware' | 'level-3-draft-persistence-cross-tab-sync' | 'level-4-ssr-server-rendered-form' | 'submit-flow' | 'dynamic-array-fields-brief' | 'see-also'
  'hook-indexeddb': 'usecreatestorage-indexeddb' | 'why' | 'when-to-use' | 'when-not-to-use' | 'usage' | 'all-parameters-commented' | 'lifecycle-options' | 'see-also'
  'hook-local-storage': 'usecreatestorage-localstorage' | 'why' | 'when-to-use' | 'when-not-to-use' | 'usage' | 'all-parameters-commented' | 'lifecycle-options' | 'see-also'
  'hook-memory': 'usecreatestorage-memory' | 'why' | 'when-to-use' | 'when-not-to-use' | 'usage' | 'all-parameters-commented' | 'lifecycle-options' | 'see-also'
  'indexeddb-storage': 'indexeddbstorage' | 'why' | 'when-to-use' | 'when-not-to-use' | 'how-it-differs-from-neighboring-storages' | 'usage' | 'all-parameters-commented' | 'synchronous-vs-asynchronous-api' | 'working-with-data' | 'persist-migrations-and-ssr' | 'see-also'
  'install': 'install' | 'installing-the-package' | 'optional-peer-dependencies' | 'imports-by-layer-sub-entrypoints' | 'see-also'
  'local-storage': 'localstorage' | 'why' | 'when-to-use' | 'when-not-to-use' | 'how-it-differs-from-neighboring-storages' | 'usage' | 'all-parameters-commented' | 'destroy-and-clearondestroy' | 'working-with-data' | 'persist-migrations-and-ssr' | 'see-also'
  'memory-storage': 'memorystorage' | 'why' | 'when-to-use' | 'when-not-to-use' | 'how-it-differs-from-the-neighboring-storages' | 'domain' | 'usage' | 'all-parameters-commented' | 'working-with-data' | 'lifecycle' | 'see-also'
  'middlewares': 'middlewares' | 'why' | 'when-to-use' | 'when-you-dont-need-it' | 'configuration' | '1-batching-middleware' | '2-shallowcompare-middleware' | '3-shallowcompare-a-custom-comparator' | '4-combining-middlewares' | '5-broadcastmiddleware-cross-tab-synchronization' | '6-logger-middleware-dev-only' | '7-custom-middleware' | 'types' | 'see-also'
  'persist-migration': 'persist-migrations-version-migrate' | 'why' | 'when-to-use' | 'when-not-to-use' | 'how-it-works' | 'bumping-the-version-without-migrate' | 'migrate-runs-once' | 'ssr-hydration' | 'types' | 'see-also'
  'pokemon-advanced': 'pokemon-advanced-the-recipe-the-whole-data-layer-on-pokeapi' | 'module-structure' | 'data-flow' | '1-types-and-state-shape-pokemontypests' | '2-apiclient-mappers-pokemonapits' | '3-external-settings-pokemonsettingsts' | '4-selectors-pokemonselectorsts' | '5-dispatcher-pokemondispatcherts' | '6-effects-pokemoneffectsts' | '7-assembly-pokemonsynapsets' | '8-react-pokemonadvancedexampletsx-pokemondemotsx' | 'the-5-state-request-protocol' | 'map-capability-page'
  'reactive-reads': 'reactive-reads-controlled-re-renders' | 'why' | 'what-to-pick' | 'reading-without-a-re-render-is-not-a-hook' | 'when-you-dont-need-it' | 'see-also'
  'reading-data': 'reading-data-get-getstate-getstatesync' | 'getkey-a-single-top-level-field' | 'getstate-the-entire-state' | 'getstatesync-state-from-cache-without-await' | 'haskey-keys-checking-and-listing' | 'see-also'
  'selector-system': 'selectors' | '1-the-selectors-class' | '2-thisselect-simple' | '3-thiscombine-combined' | '4-reactive-selector-selector' | '5-useselector-react-hook-current-value' | '6-programmatic-access-to-a-selector'
  'shared-worker-middleware': 'sharedworkermiddleware' | 'why' | 'when-to-use' | 'when-not-needed' | 'two-factories-which-to-take' | 'usage' | 'n-stores-over-one-sharedworker' | 'what-exactly-gets-synchronized' | 'fallback-and-ssr' | 'all-parameters-commented' | 'options' | 'types' | 'see-also'
  'singleton': 'singleton-pattern' | 'why' | 'when-to-use' | 'when-its-not-needed' | 'enabling-singleton' | 'merge-strategies-mergestrategy' | 'custom-key-singletonkey' | 'singleton-in-react' | 'full-singletonoptions-configuration' | 'options' | 'see-also'
  'ssr-hydration': 'ssr-hydration-hydrate' | 'why' | 'when-to-use' | 'when-not-to-use' | 'server-client-flow' | 'hydration-before-initialize' | 'hydration-after-initialize' | 'with-persist-migrations' | 'react-createsynapse' | 'types' | 'see-also'
  'static-create': 'static-create' | 'why' | 'when-to-use-it' | 'when-you-dont-need-it' | 'usage' | 'new-create-or-storagefactory' | 'see-also'
  'storage-factory': 'storagefactory' | 'why' | 'when-to-use' | 'when-not-to-use' | 'typed-methods' | 'universal-create' | 'all-parameters-commented' | 'see-also'
  'subscriptions': 'subscriptions-subscribe' | '1-subscribekey-callback-a-single-key' | '2-subscribeselector-callback-a-computed-value' | '3-subscribetoallcallback-any-change' | '4-usestoragesubscribe-react-hook' | 'see-also'
  'synapse-awaiter': 'createsynapseawaiter-framework-independent-awaiter' | 'why' | 'when-to-use-it' | 'when-you-dont-need-it' | 'imports-and-creation' | 'programmatic-surface' | 'ssr-sync-fast-path' | 'usage-in-react-without-the-wrapper' | 'see-also'
  'synapse-ctx': 'createsynapsectx' | 'when-to-use-it' | 'when-you-dont-need-it' | 'creating-the-context' | 'using-the-hooks-in-child-components' | 'hoc-contextsynapse' | 'usesynapsestate-only-with-effects' | 'reactive-reads-in-a-component' | 'cleanup' | 'three-variants-of-createsynapsectx' | 'ssr-server-rendering-seeded-sync-stores' | 'ssr-data-less-background-providers'
  'to-observable': 'toobservable' | 'why' | 'when-to-use-when-you-dont-need-it' | 'signature' | 'selector-a-slice-instead-of-the-whole-state' | 'equals-how-slices-are-compared' | 'in-effects' | 'all-parameters-commented' | 'parameters' | 'notes' | 'see-also'
  'use-storage-observable': 'usestorageobservable-useobservable' | 'why' | 'when-to-use-when-you-dont-need-it' | 'signatures' | 'basic-usage' | 'operators-on-top-of-the-stream' | 'why-debounce-here' | 'about-deps-what-goes-in' | 'example-debounced-search' | 'example-a-notification-aggregator' | 'all-parameters-commented' | 'parameters' | 'notes' | 'see-also'
  'use-storage-subscribe': 'usestoragesubscribe' | 'why' | 'when-to-use-when-you-dont-need-it' | 'signature' | 'basic-usage' | 'object-and-array-slices-equals' | 'all-parameters-commented' | 'options' | 'notes' | 'see-also'
  'use-subscription': 'usesubscription' | 'why' | 'when-to-use-when-you-dont-need-it' | 'signature' | 'basic-usage' | 'when-usesubscription-vs-useobservable' | 'example-a-notification-aggregator' | 'all-parameters-commented' | 'options' | 'about-deps' | 'teardown-and-memory' | 'see-also'
  'worker-cache-storage': 'workercachestorage' | 'creating' | 'live-cross-tab-cache' | 'tag-invalidation-api-cache' | 'pitfalls-and-limitations' | 'when-to-use' | 'types'
  'writing-data': 'writing-data-set-update' | 'setkey-value-replace-one-field' | 'updateupdater-change-several-fields-at-once' | 'set-vs-update-which-to-choose' | 'reset-reset-to-initialstate' | 'see-also'
}

// Вспомогательные типы для извлечения section ID
export type SectionIdOf<T extends DocKey> = DocSectionIds[T]
export type AllSectionIds = DocSectionIds[DocKey]

// Utility type для проверки принадлежности section ID к документу
export type ValidSectionId<TDoc extends DocKey, TSection extends string> = 
    TSection extends DocSectionIds[TDoc] ? TSection : never


export interface CodeBlock {
  language: string
  code: string
  filename?: string
  meta?: string
}

export interface ListItem {
  content: ContentBlock[] | string // ✅ Обновлено для поддержки форматирования
  level: number
  type: 'ordered' | 'unordered'
  children?: ListItem[]
  checked?: boolean // Для task lists
}

export interface TableRow {
  cells: string[]
  type: 'header' | 'data'
}

export interface Table {
  headers: string[]
  rows: TableRow[]
  caption?: string
}

export interface Link {
  text: string
  url: string
  title?: string
}

export interface Blockquote {
  content: ContentBlock[]
  type?: 'tip' | 'warning' | 'info' | 'note'
  emoji?: string
}

export interface Paragraph {
  text: string
  formatting: {
    bold: Array<{ start: number; end: number }>
    italic: Array<{ start: number; end: number }>
    code: Array<{ start: number; end: number }>
    strikethrough: Array<{ start: number; end: number }> // ✅ НОВОЕ
    links: Array<{ start: number; end: number; url: string; title?: string }>
  }
}

export interface DiagramBlock {
    code: string; 
    title?: string
}

// ✅ НОВЫЙ ТИП ДЛЯ ИЗОБРАЖЕНИЙ
export interface Image {
    url: string
    alt: string
    title?: string
    width?: number
    height?: number
}

export type ContentBlock =
  | { type: 'paragraph'; data: Paragraph }
  | { type: 'heading'; data: { text: string; level: number; id: string } }
  | { type: 'list'; data: ListItem[] }
  | { type: 'taskList'; data: any[] }
  | { type: 'diagram'; data: DiagramBlock }
  | { type: 'table'; data: Table }
  | { type: 'code'; data: CodeBlock }
  | { type: 'blockquote'; data: Blockquote }
  | { type: 'image'; data: Image } // ✅ НОВОЕ
  | { type: 'divider'; data: {} }
  | { type: 'break'; data: {} }
  | { type: 'html'; data: { content: string } }

export interface DocSection {
  id: string
  title: string
  level: number
  content: ContentBlock[]
  metadata?: {
    wordCount: number
    codeBlocksCount: number
    hasTable: boolean
    hasBlockquotes: boolean
  }
}

export interface DocContent {
  title: string
  description?: string
  sections: DocSection[]
  features?: string[]
  frontMatter?: Record<string, any>
  metadata: {
    lastModified: string
    wordCount: number
    readingTime: number
    sectionsCount: number
    codeBlocksCount: number
  }
}

export interface DocsData {
  [locale: string]: {
    [filename: string]: DocContent
  }
}

// Constants
export const AVAILABLE_LOCALES: Locale[] = ['en', 'ru']
export const AVAILABLE_DOC_KEYS: DocKey[] = ['api-client', 'api-ssr-pokemon', 'api-use-mutation', 'api-use-query', 'architecture', 'await-synapse', 'browser-storage', 'cache-layers', 'create-synapse-basic', 'create-synapse-dispatcher', 'create-synapse-effects', 'custom-fetch-fn', 'custom-fetch-service-worker', 'delete-has-keys', 'dependencies', 'dispatcher-detailed', 'event-bus', 'forms', 'hook-indexeddb', 'hook-local-storage', 'hook-memory', 'indexeddb-storage', 'install', 'local-storage', 'memory-storage', 'middlewares', 'persist-migration', 'pokemon-advanced', 'reactive-reads', 'reading-data', 'selector-system', 'shared-worker-middleware', 'singleton', 'ssr-hydration', 'static-create', 'storage-factory', 'subscriptions', 'synapse-awaiter', 'synapse-ctx', 'to-observable', 'use-storage-observable', 'use-storage-subscribe', 'use-subscription', 'worker-cache-storage', 'writing-data']
export const MASTER_LOCALE: Locale = 'en'
