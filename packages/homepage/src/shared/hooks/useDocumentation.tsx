import { useTranslation } from 'react-i18next'
import { Blockquote, CodeBlock, ContentBlock, DocContent, DocKey, DocsData, DocSection, ListItem, Locale, Paragraph, SectionIdOf, Table } from '@models/docs'

import structuredDocsData from '../../data/structured-docs.json'

const typedDocsData = structuredDocsData as DocsData

export const useDocumentation = () => {
  const { i18n, t } = useTranslation()
  const currentLocale = i18n.language as Locale

  const getAvailableLocale = (): Locale => {
    if (typedDocsData[currentLocale]) {
      return currentLocale
    }

    if (typedDocsData['en']) {
      console.warn(`Documentation for locale '${currentLocale}' not found, using 'en' as fallback`)
      return 'en'
    }

    const availableLocales = Object.keys(typedDocsData)
    if (availableLocales.length > 0) {
      console.warn(`Documentation for locale '${currentLocale}' not found, using '${availableLocales[0]}' as fallback`)
      return availableLocales[0] as Locale
    }

    throw new Error('No documentation available for any locale')
  }

  const activeLocale = getAvailableLocale()

  // Получение конкретного документа
  const getDoc = (docKey: DocKey): DocContent | null => {
    try {
      const doc = typedDocsData[activeLocale]?.[docKey]
      if (!doc) {
        console.warn(`Document '${docKey}' not found for locale '${activeLocale}'`)
        return null
      }
      return doc
    } catch (error) {
      console.error(`Error getting document '${docKey}':`, error)
      return null
    }
  }

  const getSection = <T extends DocKey>(docKey: T, sectionId: SectionIdOf<T>): DocSection | null => {
    try {
      const doc = getDoc(docKey)
      if (!doc) return null

      const section = doc.sections.find((section) => section.id === sectionId)
      if (!section) {
        console.warn(`Section '${sectionId}' not found in document '${docKey}'`)
        return null
      }

      return section
    } catch (error) {
      console.error(`Error getting section '${sectionId}' from document '${docKey}':`, error)
      return null
    }
  }

  const getSectionContent = <T extends DocKey, C extends ContentBlock['type']>(docKey: T, sectionId: SectionIdOf<T>, contentType: C): Extract<ContentBlock, { type: C }>[] => {
    const section = getSection(docKey, sectionId)
    if (!section) return []

    return section.content.filter((block): block is Extract<ContentBlock, { type: C }> => block.type === contentType)
  }

  const getCodeBlocks = <T extends DocKey>(docKey: T, sectionId: SectionIdOf<T>): CodeBlock[] => {
    return getSectionContent(docKey, sectionId, 'code').map((block) => block.data)
  }

  const getTables = <T extends DocKey>(docKey: T, sectionId: SectionIdOf<T>): Table[] => {
    return getSectionContent(docKey, sectionId, 'table').map((block) => block.data)
  }

  const getBlockquotes = <T extends DocKey>(docKey: T, sectionId: SectionIdOf<T>): Blockquote[] => {
    return getSectionContent(docKey, sectionId, 'blockquote').map((block) => block.data)
  }

  const getParagraphs = <T extends DocKey>(docKey: T, sectionId: SectionIdOf<T>): Paragraph[] => {
    return getSectionContent(docKey, sectionId, 'paragraph').map((block) => block.data)
  }

  const getLists = <T extends DocKey>(docKey: T, sectionId: SectionIdOf<T>): ListItem[][] => {
    return getSectionContent(docKey, sectionId, 'list').map((block) => block.data)
  }

  const getBlockquotesByType = <T extends DocKey>(docKey: T, sectionId: SectionIdOf<T>, type: 'tip' | 'warning' | 'info' | 'note'): Blockquote[] => {
    return getBlockquotes(docKey, sectionId).filter((blockquote) => blockquote.type === type)
  }

  // Получение всех section ID для документа
  const getSectionIds = <T extends DocKey>(docKey: T): SectionIdOf<T>[] => {
    const doc = getDoc(docKey)
    if (!doc) return []

    return doc.sections.map((section) => section.id) as SectionIdOf<T>[]
  }

  // Проверка существования секции
  const isSectionAvailable = <T extends DocKey>(docKey: T, sectionId: SectionIdOf<T>): boolean => {
    return !!getSection(docKey, sectionId)
  }

  // Остальные методы без изменений...
  const isDocAvailable = (docKey: DocKey): boolean => {
    return !!typedDocsData[activeLocale]?.[docKey]
  }

  const getAvailableDocs = (): DocKey[] => {
    return Object.keys(typedDocsData[activeLocale] || {}) as DocKey[]
  }

  const getTableOfContents = (docKey: DocKey) => {
    const doc = getDoc(docKey)
    if (!doc) return []

    return doc.sections.map((section) => ({
      id: section.id,
      title: section.title,
      level: section.level,
      wordCount: section.metadata?.wordCount || 0,
      hasCode: (section.metadata?.codeBlocksCount || 0) > 0,
      hasTable: section.metadata?.hasTable || false,
      hasBlockquotes: section.metadata?.hasBlockquotes || false,
    }))
  }

  const searchInDoc = (
    docKey: DocKey,
    query: string,
  ): Array<{
    sectionId: string
    sectionTitle: string
    matches: Array<{
      type: ContentBlock['type']
      content: string
      context: string
    }>
  }> => {
    try {
      const doc = getDoc(docKey)
      if (!doc) return []

      if (!query.trim()) return []

      const results: Array<{
        sectionId: string
        sectionTitle: string
        matches: Array<{
          type: ContentBlock['type']
          content: string
          context: string
        }>
      }> = []

      const normalizedQuery = query.toLowerCase().trim()

      doc.sections.forEach((section) => {
        const sectionMatches: Array<{
          type: ContentBlock['type']
          content: string
          context: string
        }> = []

        section.content.forEach((block) => {
          let searchableContent = ''

          switch (block.type) {
            case 'paragraph':
              searchableContent = block.data.text
              break
            case 'code':
              searchableContent = block.data.code
              break
            case 'heading':
              searchableContent = block.data.text
              break
            case 'list':
              if (Array.isArray(block.data)) {
                searchableContent = block.data.map((item) => (typeof item.content === 'string' ? item.content : '')).join(' ')
              }
              break
            case 'table':
              searchableContent = block.data.rows.map((row) => row.cells.join(' ')).join(' ')
              break
          }

          if (searchableContent.toLowerCase().includes(normalizedQuery)) {
            const queryIndex = searchableContent.toLowerCase().indexOf(normalizedQuery)
            const contextStart = Math.max(0, queryIndex - 50)
            const contextEnd = Math.min(searchableContent.length, queryIndex + query.length + 50)

            sectionMatches.push({
              type: block.type,
              content: searchableContent,
              context: searchableContent.slice(contextStart, contextEnd),
            })
          }
        })

        if (sectionMatches.length > 0) {
          results.push({
            sectionId: section.id,
            sectionTitle: section.title,
            matches: sectionMatches,
          })
        }
      })

      return results
    } catch (error) {
      console.error(`Error searching in document '${docKey}':`, error)
      return []
    }
  }

  return {
    // Основные типизированные методы
    getDoc,
    getSection,
    getSectionContent,

    // Специализированные типизированные методы
    getCodeBlocks,
    getTables,
    getBlockquotes,
    getParagraphs,
    getLists,
    getBlockquotesByType,

    // Новые типизированные утилиты
    getSectionIds,
    isSectionAvailable,

    // Обычные утилиты
    getTableOfContents,
    searchInDoc,
    isDocAvailable,
    getAvailableDocs,

    // Информация о состоянии
    currentLocale,
    activeLocale,
    t,
  }
}
