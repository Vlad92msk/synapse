// Auto-generated types for structured documentation
// Generated at: 2026-06-28T12:26:13.205Z
// Master locale: en

export type Locale = 'en' | 'ru'

export type DocKey = 'api-client' | 'api-ssr-pokemon' | 'api-use-mutation' | 'api-use-query' | 'architecture' | 'await-synapse' | 'create-synapse-basic' | 'create-synapse-dispatcher' | 'create-synapse-effects' | 'delete-has-keys' | 'dependencies' | 'dispatcher-detailed' | 'event-bus' | 'forms' | 'hook-indexeddb' | 'hook-local-storage' | 'hook-memory' | 'indexeddb-storage' | 'install' | 'local-storage' | 'memory-storage' | 'middlewares' | 'persist-migration' | 'pokemon-advanced' | 'reactive-reads' | 'reading-data' | 'selector-system' | 'singleton' | 'ssr-hydration' | 'static-create' | 'storage-factory' | 'subscriptions' | 'synapse-awaiter' | 'synapse-ctx' | 'writing-data'


// ✅ ТОЧНЫЕ ТИПЫ ДЛЯ SECTION ID
export interface DocSectionIds {
  'api-client': 'apiclient-http-client-with-caching' | 'imports' | 'creating-the-apiclient-pokemonapits' | 'response-mappers' | 'request-performing-a-request' | 'queryoptions-request-options' | 'requestdefinition-describing-an-endpoints-request' | 'caching-and-tags' | 'getendpoints-direct-access-to-the-endpoints' | 'waitwithcallbacks-callbacks-per-status' | 'abort-aborting-a-request' | 'subscribe-subscribing-to-the-endpoint-state' | 'lifecycle' | 'cache-invalidation-bus-endpointoncacheinvalidate' | 'synchronous-cache-read-endpointgetcachedsync' | 'ssr-dehydrate-hydrate'
  'api-ssr-pokemon': 'pokmon-ssr-server-render-client-pagination' | 'the-idea' | 'shared-api-factory' | 'server-warm-the-cache-and-dehydrate' | 'client-hydrate-and-render' | 'the-component-first-page-from-cache-pagination-on-the-client' | 'prewarming-several-pages' | 'gotchas' | 'nextjs-app-router' | 'see-also'
  'api-use-mutation': 'useapimutation-react-hook-for-mutations' | 'import' | 'usage' | 'return-value' | 'mutate-vs-mutateasync' | 'invalidating-related-queries' | 'notes' | 'see-also'
  'api-use-query': 'useapiquery-react-hook-for-get-requests' | 'import' | 'usage' | 'return-value' | 'options' | 'ssr-no-loading-flash-after-hydration' | 'auto-refetch-on-cache-invalidation' | 'notes' | 'see-also'
  'architecture': 'two-layers-state-manager-and-business-logic-layer' | 'layer-1-state-manager-where-the-state-lives' | 'layer-2-business-logic-layer-how-logic-manages-the-state' | 'why-this-separation-matters'
  'await-synapse': 'awaitsynapse' | 'creating' | 'withsynapseready-hoc-how-the-demo-module-is-lifted' | 'usesynapseready-hook' | 'programmatic-api' | 'relation-to-createsynapseawaiter'
  'create-synapse-basic': 'createsynapse-basic' | 'storage-and-state-pokemonstorets' | 'selectors-pokemonselectorsts' | 'assembly-createsynapsefactory' | 'the-return-value' | 'usage-in-react' | 'async-initialization-in-the-factory'
  'create-synapse-dispatcher': 'createsynapse-dispatcher' | 'dispatcher-pokemondispatcherts' | 'thisaction' | 'thiswatcher' | 'signal-and-apiactions' | 'assembly' | 'the-return-value' | 'react-createsynapsectx'
  'create-synapse-effects': 'createsynapse-effects' | 'effects-pokemoneffectsts' | 'thiseffect' | 'oftype-oftypes' | 'reading-state-in-an-effect-selectorobject-selectormap' | 'handling-requests-validatemap-reads-mutationmap-writes' | 'assembly' | 'return-value'
  'delete-has-keys': 'remove-has-keys-clear-reset' | 'haskey-check-whether-a-key-exists' | 'keys-get-all-keys' | 'removekey-remove-a-specific-key' | 'clear-clear-the-storage' | 'reset-reset-to-initialstate' | 'clear-vs-reset-whats-the-difference'
  'dependencies': 'cross-module-dependencies' | 'the-real-case-pokemon-settingsstorage' | 'four-patterns-of-cross-module-communication' | 'initialization-order'
  'dispatcher-detailed': 'dispatcher-in-detail' | 'standalone-use' | 'dispatcher-surface' | 'thisaction' | 'thissignal' | 'thisapiactions-callable-group-lifecycle' | 'thiswatcher' | 'reserved-field-names' | 'usage'
  'event-bus': 'createeventbus-event-bus' | 'imports' | 'creating' | 'actionspublish-publishing-an-event' | 'actionssubscribe-subscribing-to-events' | 'actionsgeteventhistory-event-history' | 'actionsgetactivesubscriptions-active-subscriptions' | 'actionsclearevents-clearing-events' | 'destroy' | 'example-pokemon-publishes-other-modules-listen' | 'relation-to-createsynapse-the-bus-as-an-externaldispatcher' | 'see-also'
  'forms': 'forms-the-recipe-form-state-on-a-synapse-storage' | 'honest-scope-what-this-is-and-isnt' | 'state-shape' | 'writing-a-field' | 'level-1-a-basic-form-memorystorage' | 'level-2-validation-as-a-middleware' | 'level-3-draft-persistence-cross-tab-sync' | 'level-4-ssr-server-rendered-form' | 'submit-flow' | 'dynamic-array-fields-brief' | 'see-also'
  'hook-indexeddb': 'usecreatestorage-indexeddb' | 'usage' | 'when-to-use' | 'when-not-to-use'
  'hook-local-storage': 'usecreatestorage-localstorage' | 'usage' | 'when-to-use' | 'when-not-to-use'
  'hook-memory': 'usecreatestorage-memory' | 'usecreatestorage' | 'reading-state-usestoragesubscribe' | 'when-to-use' | 'when-not-to-use'
  'indexeddb-storage': 'indexeddbstorage' | 'creating' | 'synchronous-vs-asynchronous-api' | 'when-to-use' | 'when-not-to-use' | 'working-with-data' | 'persist-migrations-and-ssr'
  'install': 'install'
  'local-storage': 'localstorage' | 'creating' | 'when-to-use' | 'when-not-to-use' | 'working-with-data' | 'destroy-and-clearondestroy' | 'persist-migrations-and-ssr'
  'memory-storage': 'memorystorage' | 'domain' | 'creating' | 'when-to-use' | 'when-not-to-use' | 'working-with-data' | 'lifecycle'
  'middlewares': 'middlewares' | 'configuration' | '1-batching-middleware' | '2-shallowcompare-middleware' | '3-shallowcompare-a-custom-comparator' | '4-combining-middlewares' | '5-broadcastmiddleware-cross-tab-synchronization' | '6-logger-middleware-dev-only' | '7-custom-middleware' | 'types'
  'persist-migration': 'persist-migrations-version-migrate' | 'how-it-works' | 'bumping-the-version-without-migrate' | 'migrate-runs-once' | 'ssr-hydration' | 'types' | 'see-also'
  'pokemon-advanced': 'pokemon-advanced-the-recipe-the-whole-data-layer-on-pokeapi' | 'module-structure' | 'data-flow' | '1-types-and-state-shape-pokemontypests' | '2-apiclient-mappers-pokemonapits' | '3-external-settings-pokemonsettingsts' | '4-selectors-pokemonselectorsts' | '5-dispatcher-pokemondispatcherts' | '6-effects-pokemoneffectsts' | '7-assembly-pokemonsynapsets' | '8-react-pokemonadvancedexampletsx-pokemondemotsx' | 'the-5-state-request-protocol' | 'map-capability-page'
  'reactive-reads': 'reactive-reads-controlled-re-renders' | 'usestoragesubscribe-the-default' | 'usestorageobservable-the-rxjs-path' | 'usestorageref-you-control-the-re-renders' | 'toobservable-outside-react'
  'reading-data': 'reading-data-getgetstate' | 'getkey-reading-a-single-field' | 'getstate-the-entire-state' | 'getstatesync-synchronous-read-from-cache' | 'haskey-keys-checking-and-listing'
  'selector-system': 'selectors' | '1-the-selectors-class' | '2-thisselect-simple' | '3-thiscombine-combined' | '4-reactive-selector-selector' | '5-useselector-react-hook-current-value' | '6-programmatic-access-to-a-selector'
  'singleton': 'singleton-pattern' | 'enabling-singleton' | 'merge-strategies-mergestrategy' | 'custom-key-singletonkey' | 'singleton-in-react' | 'full-singletonoptions-configuration'
  'ssr-hydration': 'ssr-hydration-hydrate' | 'server-client-flow' | 'hydration-before-initialize' | 'hydration-after-initialize' | 'with-persist-migrations' | 'react-createsynapse' | 'types' | 'see-also'
  'static-create': 'static-create' | 'usage' | 'new-create-or-storagefactory'
  'storage-factory': 'storagefactory' | 'typed-methods' | 'universal-create' | 'when-to-use' | 'when-not-to-use'
  'subscriptions': 'subscriptions-subscribe' | '1-subscribekey-callback' | '2-subscribeselector-callback' | '3-subscribetoallcallback' | '4-usestoragesubscribe-react-hook'
  'synapse-awaiter': 'createsynapseawaiter-framework-independent-awaiter' | 'imports-and-creation' | 'programmatic-surface' | 'ssr-sync-fast-path' | 'usage-in-react-without-the-wrapper'
  'synapse-ctx': 'createsynapsectx' | 'creating-the-context' | 'using-the-hooks-in-child-components' | 'hoc-contextsynapse' | 'usesynapsestate-only-with-effects' | 'reactive-reads-in-a-component' | 'cleanup' | 'three-variants-of-createsynapsectx' | 'ssr-server-rendering-seeded-sync-stores'
  'writing-data': 'writing-data-setupdate' | 'setkey-value-set-a-value-by-key' | 'updateupdater-change-several-fields-at-once' | 'set-vs-update-when-to-use-which' | 'reset-reset-to-initialstate'
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
export const AVAILABLE_DOC_KEYS: DocKey[] = ['api-client', 'api-ssr-pokemon', 'api-use-mutation', 'api-use-query', 'architecture', 'await-synapse', 'create-synapse-basic', 'create-synapse-dispatcher', 'create-synapse-effects', 'delete-has-keys', 'dependencies', 'dispatcher-detailed', 'event-bus', 'forms', 'hook-indexeddb', 'hook-local-storage', 'hook-memory', 'indexeddb-storage', 'install', 'local-storage', 'memory-storage', 'middlewares', 'persist-migration', 'pokemon-advanced', 'reactive-reads', 'reading-data', 'selector-system', 'singleton', 'ssr-hydration', 'static-create', 'storage-factory', 'subscriptions', 'synapse-awaiter', 'synapse-ctx', 'writing-data']
export const MASTER_LOCALE: Locale = 'en'
