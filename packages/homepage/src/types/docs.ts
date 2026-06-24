// Auto-generated types for structured documentation
// Generated at: 2026-06-24T18:45:32.958Z
// Master locale: en

export type Locale = 'en' | 'ru'

export type DocKey = 'api-client' | 'architecture' | 'await-synapse' | 'create-synapse-basic' | 'create-synapse-dispatcher' | 'create-synapse-effects' | 'delete-has-keys' | 'dependencies' | 'dispatcher-detailed' | 'event-bus' | 'hook-indexeddb' | 'hook-local-storage' | 'hook-memory' | 'indexeddb-storage' | 'local-storage' | 'memory-storage' | 'middlewares' | 'persist-migration' | 'pokemon-advanced' | 'reading-data' | 'selector-system' | 'singleton' | 'ssr-hydration' | 'static-create' | 'storage-factory' | 'subscriptions' | 'synapse-awaiter' | 'synapse-ctx' | 'writing-data'


// ✅ ТОЧНЫЕ ТИПЫ ДЛЯ SECTION ID
export interface DocSectionIds {
  'api-client': 'apiclient-http-client-with-caching' | 'imports' | 'creating-an-apiclient' | 'request-performing-a-request' | 'queryoptions-request-options' | 'requestdefinition-an-endpoints-request-description' | 'caching-and-tags' | 'getendpoints-direct-access-to-endpoints' | 'waitwithcallbacks-callbacks-by-status' | 'abort-aborting-a-request' | 'subscribe-subscribing-to-an-endpoints-state' | 'lifecycle'
  'architecture': 'two-layers-state-manager-and-business-logic-layer' | 'layer-1-state-manager-where-the-state-lives' | 'layer-2-business-logic-layer-how-logic-manages-the-state' | 'why-this-separation-matters'
  'await-synapse': 'awaitsynapse' | 'creating' | 'withsynapseready-hoc' | 'usesynapseready-hook' | 'programmatic-api' | 'relation-to-createsynapseawaiter'
  'create-synapse-basic': 'createsynapse-basic' | 'creating' | 'return-value' | 'usage-in-react' | 'async-initialization-in-the-factory'
  'create-synapse-dispatcher': 'createsynapse-dispatcher' | 'creating' | 'thisaction' | 'thiswatcher' | 'return-value' | 'react-createsynapsectx'
  'create-synapse-effects': 'createsynapse-effects' | 'creating' | 'thiseffect' | 'oftype-oftypes' | 'handling-requests-validatemap-reads-mutationmap-writes' | 'return-value'
  'delete-has-keys': 'remove-has-keys-clear-reset' | 'haskey-check-whether-a-key-exists' | 'keys-get-all-keys' | 'removekey-remove-a-specific-key' | 'clear-clear-the-storage' | 'reset-reset-to-initialstate' | 'clear-vs-reset-whats-the-difference'
  'dependencies': 'cross-module-dependencies' | 'dependency-auth-module' | 'dependent-storage-settings-cross-store-selector' | 'four-patterns-of-cross-module-communication' | 'initialization-order'
  'dispatcher-detailed': 'dispatcher-in-detail' | 'creating' | 'dispatcher-surface' | 'thisaction' | 'thissignal' | 'thisapiactions-callable-group-lifecycle' | 'thiswatcher' | 'reserved-field-names' | 'usage'
  'event-bus': 'createeventbus-event-bus' | 'imports' | 'creating' | 'actionspublish-publishing-an-event' | 'actionssubscribe-subscribing-to-events' | 'actionsgeteventhistory-event-history' | 'actionsgetactivesubscriptions-active-subscriptions' | 'actionsclearevents-clearing-events' | 'destroy' | 'example-communication-between-modules'
  'hook-indexeddb': 'usecreatestorage-indexeddb' | 'usage' | 'full-example'
  'hook-local-storage': 'usecreatestorage-localstorage' | 'usage' | 'full-example'
  'hook-memory': 'usecreatestorage-memory' | 'usecreatestorage' | 'usestoragesubscribe' | 'full-example'
  'indexeddb-storage': 'indexeddbstorage' | 'creating' | 'writing-data-asynchronous' | 'reading-data-asynchronous' | 'checking-removing-resetting-asynchronous' | 'subscriptions-the-same-for-all-types' | 'differences-from-memorystoragelocalstorage' | 'persist-migrations-and-ssr'
  'local-storage': 'localstorage' | 'creating' | 'writing-data' | 'reading-data' | 'checking-removing-resetting' | 'subscriptions' | 'differences-from-memorystorage' | 'destroy-and-clearondestroy' | 'persist-migrations-and-ssr'
  'memory-storage': 'memorystorage' | 'creating' | 'writing-data' | 'reading-data' | 'checking-removing-resetting' | 'subscriptions' | 'lifecycle'
  'middlewares': 'middlewares' | 'configuration' | '1-batching-middleware' | '2-shallowcompare-middleware' | '3-shallowcompare-a-custom-comparator' | '4-combining-middlewares' | '5-broadcastmiddleware-cross-tab-synchronization' | '6-logger-middleware-dev-only' | '7-custom-middleware' | 'types'
  'persist-migration': 'persist-migrations-version-migrate' | 'how-it-works' | 'bumping-the-version-without-migrate' | 'migrate-is-called-once' | 'ssr-hydration' | 'types' | 'see-also'
  'pokemon-advanced': 'pokemon-advanced-a-full-architecture-example' | 'project-structure' | '1-types' | '2-external-settings-a-dependency' | '3-apiclient' | '4-selectors-class-selectors' | '5-dispatcher-class-dispatcher-action-signal-apiactions-watcher' | '6-effects-class-effects-validatemap-apiresult' | '7-createsynapse-wiring-it-all-together' | 'the-5-state-request-protocol' | 'key-utilities'
  'reading-data': 'reading-data-getgetstate' | 'getkey-reading-a-single-field' | 'getstate-the-entire-state' | 'getstatesync-synchronous-read-from-cache' | 'haskey-keys-checking-and-listing'
  'selector-system': 'selectors' | '1-the-selectors-class' | '2-thisselect-simple' | '3-thiscombine-combined' | '4-reactive-selector-selector' | '5-useselector-react-hook-current-value' | '6-programmatic-access-to-a-selector'
  'singleton': 'singleton-pattern' | 'enabling-singleton' | 'merge-strategies-mergestrategy' | 'custom-key-singletonkey' | 'singleton-in-react' | 'full-singletonoptions-configuration'
  'ssr-hydration': 'ssr-hydration-hydrate' | 'hydration-before-initialize' | 'hydration-after-initialize' | 'with-persist-migrations' | 'react-createsynapse' | 'types' | 'see-also'
  'static-create': 'static-create' | 'usage'
  'storage-factory': 'storagefactory' | 'typed-methods' | 'universal-create'
  'subscriptions': 'subscriptions-subscribe' | '1-subscribekey-callback' | '2-subscribeselector-callback' | '3-subscribetoallcallback' | '4-usestoragesubscribe-react-hook'
  'synapse-awaiter': 'createsynapseawaiter-framework-agnostic-awaiter' | 'imports' | 'creating' | 'isready-getstatus-geterror' | 'getstoreifready' | 'waitforready' | 'onready-onerror' | 'destroy' | 'usage-in-a-react-component'
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
export const AVAILABLE_DOC_KEYS: DocKey[] = ['api-client', 'architecture', 'await-synapse', 'create-synapse-basic', 'create-synapse-dispatcher', 'create-synapse-effects', 'delete-has-keys', 'dependencies', 'dispatcher-detailed', 'event-bus', 'hook-indexeddb', 'hook-local-storage', 'hook-memory', 'indexeddb-storage', 'local-storage', 'memory-storage', 'middlewares', 'persist-migration', 'pokemon-advanced', 'reading-data', 'selector-system', 'singleton', 'ssr-hydration', 'static-create', 'storage-factory', 'subscriptions', 'synapse-awaiter', 'synapse-ctx', 'writing-data']
export const MASTER_LOCALE: Locale = 'en'
