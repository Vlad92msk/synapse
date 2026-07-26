// Клиентский полнотекстовый поиск по документации.
//
// Индекс строится из того же structured-docs.json, что уже импортирует
// useDocumentation, — отдельной загрузки/веса нет (бандлер дедуплицирует модуль).
// Секции документов имеют стабильные section.id, ОДИНАКОВЫЕ между языками
// (мастер-маппинг по en в scripts/docs/generate-docs.ts), поэтому попадание в
// русском тексте ведёт ровно в тот же раздел, что и в английском.

import type { ContentBlock, DocContent, DocKey, DocsData, ListItem, Locale } from '@models/docs'

import docsData from '@data/structured-docs.json'

const typedDocsData = docsData as unknown as DocsData

// docKey (имя файла в JSON) → короткий ключ раздела в URL (/docs/<shortKey>).
// Record<DocKey, ...> заставляет TS требовать все разделы: если добавить новый
// документ, docs:generate обновит union DocKey и эта карта перестанет
// компилироваться, пока её не дополнить — защита от рассинхронизации.
export const DOC_KEY_TO_SHORT: Record<DocKey, string> = {
  architecture: 'architecture',
  install: 'install',
  'memory-storage': 'memory',
  'local-storage': 'local',
  'indexeddb-storage': 'indexeddb',
  'worker-cache-storage': 'worker-cache',
  'storage-factory': 'factory',
  'hook-memory': 'hook-memory',
  'hook-local-storage': 'hook-local',
  'hook-indexeddb': 'hook-idb',
  'static-create': 'static',
  'browser-storage': 'browser-storage',
  'reading-data': 'reading-data',
  'writing-data': 'writing-data',
  'delete-has-keys': 'operations',
  subscriptions: 'subscriptions',
  'reactive-reads': 'reactive-reads',
  'use-storage-subscribe': 'use-storage-subscribe',
  'use-storage-observable': 'use-storage-observable',
  'to-observable': 'to-observable',
  'use-subscription': 'use-subscription',
  'selector-system': 'selector-system',
  'create-synapse-basic': 'synapse-basic',
  'create-synapse-dispatcher': 'synapse-dispatcher',
  'create-synapse-effects': 'synapse-effects',
  'dispatcher-detailed': 'dispatcher-detail',
  dependencies: 'dependencies',
  'synapse-ctx': 'synapse-ctx',
  'await-synapse': 'await-synapse',
  'ssr-hydration': 'ssr-hydration',
  middlewares: 'middlewares',
  'shared-worker-middleware': 'shared-worker',
  singleton: 'singleton',
  'persist-migration': 'persist-migration',
  'synapse-awaiter': 'synapse-awaiter',
  'event-bus': 'event-bus',
  'cache-layers': 'cache-layers',
  'api-client': 'api-client',
  'api-use-query': 'api-use-query',
  'api-use-mutation': 'api-use-mutation',
  'api-ssr-pokemon': 'api-ssr-pokemon',
  'custom-fetch-service-worker': 'custom-fetch-service-worker',
  'custom-fetch-fn': 'custom-fetch-fn',
  'pokemon-advanced': 'pokemon-advanced',
  forms: 'forms',
}

export interface SearchSnippet {
  before: string
  match: string
  after: string
}

export interface SearchResult {
  docKey: DocKey
  shortKey: string
  sectionId: string
  docTitle: string
  sectionTitle: string
  locale: Locale
  titleMatched: boolean
  snippet: SearchSnippet | null
  score: number
}

interface IndexEntry {
  docKey: DocKey
  shortKey: string
  sectionId: string
  docTitle: string
  docTitleLower: string
  sectionTitle: string
  sectionTitleLower: string
  body: string
  bodyLower: string
}

// Рекурсивно вытаскивает текст из блока контента (для тела секции).
function blockToText(block: ContentBlock): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return block.data.text
    case 'code':
      return block.data.code
    case 'html':
      return block.data.content ?? ''
    case 'table':
      return block.data.rows.map((row) => row.cells.join(' ')).join('\n')
    case 'blockquote':
      return block.data.content.map(blockToText).join(' ')
    case 'list':
      return listToText(block.data)
    case 'image':
      return [block.data.alt, block.data.title].filter(Boolean).join(' ')
    default:
      return ''
  }
}

function listToText(items: ListItem[]): string {
  return items
    .map((item) => {
      const content = typeof item.content === 'string' ? item.content : Array.isArray(item.content) ? item.content.map(blockToText).join(' ') : ''
      const children = item.children ? listToText(item.children) : ''
      return `${content} ${children}`
    })
    .join(' ')
}

function buildLocaleIndex(locale: Locale): IndexEntry[] {
  const docs = typedDocsData[locale]
  if (!docs) return []

  const entries: IndexEntry[] = []

  Object.entries(docs).forEach(([docKey, doc]) => {
    // Пропускаем документы, которых нет в навигации (напр. README в ru) —
    // на них некуда вести редирект.
    const shortKey = DOC_KEY_TO_SHORT[docKey as DocKey]
    if (!shortKey) return

    const { title: docTitle, sections } = doc as DocContent
    const docTitleLower = docTitle.toLowerCase()

    sections.forEach((section) => {
      const body = section.content.map(blockToText).join(' ').replace(/\s+/g, ' ').trim()
      entries.push({
        docKey: docKey as DocKey,
        shortKey,
        sectionId: section.id,
        docTitle,
        docTitleLower,
        sectionTitle: section.title,
        sectionTitleLower: section.title.toLowerCase(),
        body,
        bodyLower: body.toLowerCase(),
      })
    })
  })

  return entries
}

// Ленивый кэш индекса по локали (строится при первом реальном запросе).
const indexCache = new Map<Locale, IndexEntry[]>()

function getLocaleIndex(locale: Locale): IndexEntry[] {
  let index = indexCache.get(locale)
  if (!index) {
    index = buildLocaleIndex(locale)
    indexCache.set(locale, index)
  }
  return index
}

const SNIPPET_BEFORE = 40
const SNIPPET_AFTER = 90

function makeSnippet(text: string, textLower: string, query: string): SearchSnippet | null {
  const idx = textLower.indexOf(query)
  if (idx < 0) return null

  const start = Math.max(0, idx - SNIPPET_BEFORE)
  const end = Math.min(text.length, idx + query.length + SNIPPET_AFTER)

  let before = text.slice(start, idx)
  const match = text.slice(idx, idx + query.length)
  let after = text.slice(idx + query.length, end)

  // Обрезаем «половинки» слов по краям и добавляем многоточие.
  if (start > 0) before = `…${before.replace(/^\S*\s/, '')}`
  if (end < text.length) after = `${after.replace(/\s\S*$/, '')}…`

  return { before, match, after }
}

function queryLocale(query: string, locale: Locale): SearchResult[] {
  const results: SearchResult[] = []

  for (const entry of getLocaleIndex(locale)) {
    const titleMatched = entry.sectionTitleLower.includes(query)
    const bodyIdx = entry.bodyLower.indexOf(query)
    const docMatched = entry.docTitleLower.includes(query)

    if (!titleMatched && bodyIdx < 0 && !docMatched) continue

    let score = 0
    if (entry.sectionTitleLower.startsWith(query)) score += 120
    else if (titleMatched) score += 70
    if (docMatched) score += 20
    if (bodyIdx >= 0) score += Math.max(4, 30 - bodyIdx / 40)

    results.push({
      docKey: entry.docKey,
      shortKey: entry.shortKey,
      sectionId: entry.sectionId,
      docTitle: entry.docTitle,
      sectionTitle: entry.sectionTitle,
      locale,
      titleMatched,
      snippet: bodyIdx >= 0 ? makeSnippet(entry.body, entry.bodyLower, query) : null,
      score,
    })
  }

  return results
}

/**
 * Поиск по документации. Сначала ищет в текущей локали; если совпадений нет
 * (напр. русский запрос на англоязычной версии) — ищет в остальных локалях,
 * чтобы результат всё равно нашёлся. Переход работает независимо от языка:
 * section.id одинаковы между локалями.
 */
export function searchDocs(rawQuery: string, locale: Locale, limit = 8): SearchResult[] {
  const query = rawQuery.trim().toLowerCase()
  if (query.length < 2) return []

  let results = queryLocale(query, locale)

  if (results.length === 0) {
    for (const other of Object.keys(typedDocsData) as Locale[]) {
      if (other === locale) continue
      results = results.concat(queryLocale(query, other))
    }
  }

  // Один результат на раздел (по docKey+sectionId) — берём лучший по score.
  const bySection = new Map<string, SearchResult>()
  for (const result of results) {
    const key = `${result.docKey}#${result.sectionId}`
    const existing = bySection.get(key)
    if (!existing || result.score > existing.score) bySection.set(key, result)
  }

  return Array.from(bySection.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
