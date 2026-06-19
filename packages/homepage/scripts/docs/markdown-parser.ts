import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import type {
    ContentBlock,
    DocSection,
    ListItem,
    Table,
    TableRow,
    Blockquote,
    Paragraph
} from './types'

export class MarkdownParser {
    private createSlug(text: string): string {
        return text
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim()
    }

    private extractTextFromNode(node: any): string {
        if (node.type === 'text') {
            return node.value
        }
        if (node.type === 'inlineCode') {
            return node.value
        }
        if (node.children) {
            return node.children.map((child: any) => this.extractTextFromNode(child)).join('')
        }
        return ''
    }

    private parseFormatting(node: any): Paragraph {
        let text = ''
        const formatting: Paragraph['formatting'] = {
            bold: [],
            italic: [],
            code: [],
            links: []
        }

        const processNode = (node: any): number => {
            switch (node.type) {
                case 'text':
                    const textContent = node.value
                    text += textContent
                    return textContent.length

                case 'strong':
                    const boldStart = text.length
                    let boldLength = 0
                    if (node.children) {
                        for (const child of node.children) {
                            boldLength += processNode(child)
                        }
                    }
                    formatting.bold.push({ start: boldStart, end: boldStart + boldLength })
                    return boldLength

                case 'emphasis':
                    const italicStart = text.length
                    let italicLength = 0
                    if (node.children) {
                        for (const child of node.children) {
                            italicLength += processNode(child)
                        }
                    }
                    formatting.italic.push({ start: italicStart, end: italicStart + italicLength })
                    return italicLength

                case 'inlineCode':
                    const codeStart = text.length
                    const codeContent = node.value
                    text += codeContent
                    formatting.code.push({ start: codeStart, end: codeStart + codeContent.length })
                    return codeContent.length

                case 'link':
                    const linkStart = text.length
                    let linkLength = 0
                    if (node.children) {
                        for (const child of node.children) {
                            linkLength += processNode(child)
                        }
                    }
                    formatting.links.push({
                        start: linkStart,
                        end: linkStart + linkLength,
                        url: node.url || '',
                        title: node.title
                    })
                    return linkLength

                default:
                    if (node.children) {
                        let totalLength = 0
                        for (const child of node.children) {
                            totalLength += processNode(child)
                        }
                        return totalLength
                    }
                    return 0
            }
        }

        if (node.children) {
            for (const child of node.children) {
                processNode(child)
            }
        }

        return { text, formatting }
    }

    private parseTable(tableNode: any): Table {
        if (!tableNode.children) return { headers: [], rows: [] }

        const rows: TableRow[] = []
        let headers: string[] = []

        tableNode.children.forEach((row: any, rowIndex: number) => {
            if (row.type === 'tableRow' && row.children) {
                const cells = row.children
                    .filter((cell: any) => cell.type === 'tableCell')
                    .map((cell: any) => this.extractTextFromNode(cell).trim())

                if (rowIndex === 0) {
                    headers = cells
                    rows.push({ cells, type: 'header' })
                } else {
                    rows.push({ cells, type: 'data' })
                }
            }
        })

        return { headers, rows }
    }

    private parseBlockquote(blockquoteNode: any): Blockquote {
        const content: ContentBlock[] = []
        let emoji: string | undefined
        let type: 'tip' | 'warning' | 'info' | 'note' | undefined

        if (blockquoteNode.children) {
            blockquoteNode.children.forEach((child: any) => {
                const block = this.parseContentBlock(child)
                if (block) {
                    content.push(block)

                    // Определяем тип блокквота по первому параграфу
                    if (block.type === 'paragraph' && !emoji) {
                        const text = block.data.text
                        const emojiMatch = text.match(/^([🎯🚀💾🧮🌐⚛️⚡⚙️🔌✨🎨📦🔧🛠️⭐💡⚠️ℹ️📝🔎])/);
                        if (emojiMatch) {
                            emoji = emojiMatch[1]
                            // Определяем тип по эмодзи
                            switch (emoji) {
                                case '💡':
                                case '🚀':
                                    type = 'tip'
                                    break
                                case '⚠️':
                                    type = 'warning'
                                    break
                                case 'ℹ️':
                                case '🔎':
                                    type = 'info'
                                    break
                                case '📝':
                                    type = 'note'
                                    break
                            }
                        }
                    }
                }
            })
        }

        return { content, type, emoji }
    }

    private parseContentBlock(node: any): ContentBlock | null {
        switch (node.type) {
            case 'paragraph':
                return {
                    type: 'paragraph',
                    data: this.parseFormatting(node)
                }

            case 'heading':
                return {
                    type: 'heading',
                    data: {
                        text: this.extractTextFromNode(node),
                        level: node.depth, // ✅ Сохраняем оригинальный уровень заголовка
                        id: this.createSlug(this.extractTextFromNode(node))
                    }
                }

            case 'list':
                const listData = this.parseList(node)

                // Проверяем, является ли это task list
                if (listData.length > 0 && 'checked' in listData[0]) {
                    return {
                        type: 'taskList',
                        //@ts-ignore
                        data: listData
                    }
                }

                // Обычный список
                return {
                    type: 'list',
                    data: listData as ListItem[]
                }

            case 'table':
                return {
                    type: 'table',
                    data: this.parseTable(node)
                }

            case 'code':
                // ✅ ДОБАВИТЬ ПРОВЕРКУ НА ДИАГРАММЫ
                if (this.isDiagramLanguage(node.lang)) {
                    return {
                        type: 'diagram',
                        data: {
                            code: node.value,
                            title: this.extractTitleFromMeta(node.meta)
                        }
                    }
                }

                // Обычный блок кода
                return {
                    type: 'code',
                    data: {
                        language: node.lang || 'text',
                        code: node.value,
                        filename: this.extractFilenameFromMeta(node.meta),
                        meta: node.meta
                    }
                }

            case 'blockquote':
                return {
                    type: 'blockquote',
                    data: this.parseBlockquote(node)
                }

            case 'thematicBreak':
                return {
                    type: 'divider',
                    data: {}
                }

            case 'break':
                return {
                    type: 'break',
                    data: {}
                }

            case 'html':
                return {
                    type: 'html',
                    data: { content: node.value }
                }

            default:
                return null
        }
    }

    /**
     * Проверяет, является ли язык блока кода диаграммой
     */
    private isDiagramLanguage(lang?: string): boolean {
        if (!lang) return false

        const diagramLanguages = [
            'mermaid',
            'plantuml',
            'puml',
            'graphviz',
            'dot',
            'flowchart',
            'sequence'
        ]

        return diagramLanguages.includes(lang.toLowerCase())
    }

    /**
     * Извлекает заголовок диаграммы из метаданных
     */
    private extractTitleFromMeta(meta?: string): string | undefined {
        if (!meta) return undefined

        // Поддерживаем разные форматы:
        // ```mermaid title="My Diagram"
        // ```mermaid {title: "My Diagram"}
        const titlePatterns = [
            /title=["']([^"']+)["']/,
            /title:\s*["']([^"']+)["']/,
            /{[^}]*title:\s*["']([^"']+)["'][^}]*}/
        ]

        for (const pattern of titlePatterns) {
            const match = meta.match(pattern)
            if (match) {
                return match[1]
            }
        }

        return undefined
    }

    private extractFilenameFromMeta(meta?: string): string | undefined {
        if (!meta) return undefined
        const filenameMatch = meta.match(/(?:title|filename)=["']?([^"'\s]+)["']?|^([^\s]+)/)
        return filenameMatch ? (filenameMatch[1] || filenameMatch[2]) : undefined
    }

    private parseList(listNode: any, level: number = 0): ListItem[] {
        if (!listNode.children) return []

        const isOrdered = listNode.ordered
        const items: any[] = []
        let hasTaskItems = false

        listNode.children.forEach((item: any) => {
            if (item.type === 'listItem') {
                // remark-gfm добавляет свойство checked для task items
                if (typeof item.checked === 'boolean') {
                    hasTaskItems = true
                    let content = ''

                    // Извлекаем контент из параграфов
                    item.children?.forEach((child: any) => {
                        if (child.type === 'paragraph') {
                            content += this.extractTextFromNode(child).trim()
                        }
                    })

                    items.push({
                        content: content.trim(),
                        checked: item.checked
                    })
                } else {
                    // ✅ ИСПРАВЛЕНИЕ: Обрабатываем форматирование для обычных списков
                    let contentBlocks: ContentBlock[] = []
                    let children: any[] = []

                    item.children?.forEach((child: any) => {
                        if (child.type === 'paragraph') {
                            // Вместо простого текста сохраняем форматированный контент
                            const paragraphBlock = this.parseContentBlock(child)
                            if (paragraphBlock) {
                                contentBlocks.push(paragraphBlock)
                            }
                        } else if (child.type === 'list') {
                            children = this.parseList(child, level + 1) as any[]
                        }
                    })

                    if (contentBlocks.length > 0) {
                        items.push({
                            content: contentBlocks, // ✅ Теперь это массив ContentBlock
                            level,
                            type: isOrdered ? 'ordered' : 'unordered',
                            children: children.length > 0 ? children : undefined
                        })
                    }
                }
            }
        })

        // Если есть task items, возвращаем как task list
        if (hasTaskItems) {
            return items
        }

        // Обычный список
        return items as ListItem[]
    }

    private calculateSectionMetadata(content: ContentBlock[]) {
        let wordCount = 0
        let codeBlocksCount = 0
        let diagramsCount = 0
        let tasksCount = 0
        let hasTable = false
        let hasBlockquotes = false
        let hasTasks = false

        const countWordsInList = (items: ListItem[]): number => {
            return items.reduce((sum, item) => {
                let count = 0

                // ✅ ОБНОВЛЕННАЯ ЛОГИКА: обрабатываем разные типы контента
                if (typeof item.content === 'string') {
                    // Простой текст (task lists)
                    count = item.content.split(/\s+/).filter(word => word.length > 0).length
                } else if (Array.isArray(item.content)) {
                    // Массив блоков контента
                    count = this.calculateSectionMetadata(item.content).wordCount
                }

                if (item.children) {
                    count += countWordsInList(item.children)
                }
                return sum + count
            }, 0)
        }

        content.forEach(block => {
            switch (block.type) {
                case 'paragraph':
                    wordCount += block.data.text.split(/\s+/).filter(word => word.length > 0).length
                    break
                case 'heading':
                    wordCount += block.data.text.split(/\s+/).filter(word => word.length > 0).length
                    break
                case 'code':
                    codeBlocksCount++
                    break
                case 'taskList':
                    hasTasks = true
                    tasksCount += block.data.length
                    block.data.forEach((task) => {
                        wordCount += task.content.split(/\s+/).filter(word => word.length > 0).length
                    })
                    break
                case 'diagram':
                    diagramsCount++
                    break
                case 'table':
                    hasTable = true
                    // Считаем слова в таблице
                    block.data.rows.forEach(row => {
                        row.cells.forEach(cell => {
                            wordCount += cell.split(/\s+/).filter(word => word.length > 0).length
                        })
                    })
                    break
                case 'blockquote':
                    hasBlockquotes = true
                    // Рекурсивно считаем слова в блокквоте
                    wordCount += this.calculateSectionMetadata(block.data.content).wordCount
                    break
                case 'list':
                    wordCount += countWordsInList(block.data)
                    break
            }
        })

        return {
            wordCount,
            codeBlocksCount,
            diagramsCount,
            tasksCount,
            hasTable,
            hasBlockquotes,
            hasTasks
        }
    }

    /**
     * Извлекает секции из markdown контента
     */
    extractSections(content: string): DocSection[] {
        const tree = remark().use(remarkGfm).parse(content)
        const sections: DocSection[] = []
        let currentSection: Partial<DocSection> | null = null

        if (tree.children) {
            for (const node of tree.children) {
                if (node.type === 'heading') {
                    const title = this.extractTextFromNode(node)
                    const level = node.depth

                    // ✅ Определяем, нужно ли создать новую секцию или добавить заголовок как контент
                    const shouldCreateNewSection = this.shouldCreateNewSection(level, currentSection)

                    if (shouldCreateNewSection) {
                        // Сохраняем предыдущую секцию
                        if (currentSection && currentSection.content) {
                            sections.push({
                                id: currentSection.id || '',
                                title: currentSection.title || '',
                                level: currentSection.level || 1,
                                content: currentSection.content,
                                metadata: this.calculateSectionMetadata(currentSection.content)
                            })
                        }

                        // Начинаем новую секцию
                        currentSection = {
                            id: this.createSlug(title),
                            title,
                            level,
                            content: []
                        }
                    } else {
                        // Добавляем заголовок как часть контента текущей секции
                        if (currentSection && currentSection.content) {
                            currentSection.content.push({
                                type: 'heading',
                                data: {
                                    text: title,
                                    level: level, // ✅ Сохраняем оригинальный уровень
                                    id: this.createSlug(title)
                                }
                            })
                        }
                    }
                } else if (currentSection && currentSection.content) {
                    // Добавляем контент в текущую секцию
                    const block = this.parseContentBlock(node)
                    if (block) {
                        currentSection.content.push(block)
                    }
                }
            }
        }

        // Сохраняем последнюю секцию
        if (currentSection && currentSection.content) {
            sections.push({
                id: currentSection.id || '',
                title: currentSection.title || '',
                level: currentSection.level || 1,
                content: currentSection.content,
                metadata: this.calculateSectionMetadata(currentSection.content)
            })
        }

        return sections
    }

    /**
     * Определяет, нужно ли создавать новую секцию для заголовка
     */
    private shouldCreateNewSection(headingLevel: number, currentSection: Partial<DocSection> | null): boolean {
        // Если нет текущей секции, создаем новую
        if (!currentSection) {
            return true
        }

        // Если заголовок того же уровня или выше по иерархии, создаем новую секцию
        // Например: h1 всегда создает новую секцию, h2 создает новую если текущая h1 или h2
        // if (headingLevel <= (currentSection.level || 1)) {
        //     return true
        // }

        // Для подзаголовков (h3, h4, h5, h6) внутри секции h1 или h2
        // можно настроить логику. Например, всегда включать их в контент:
        // return false

        // Альтернативный вариант - создавать новые секции только для h1 и h2:
        return headingLevel <= 2
    }

    /**
     * Извлекает фичи из контента
     */
    extractFeatures(content: string): string[] {
        const features: string[] = []
        const lines = content.split('\n')

        for (const line of lines) {
            const patterns = [
                /^[\s\-]*([🎯🚀💾🧮🌐⚛️⚡⚙️🔌✨🎨📦🔧🛠️⭐])\s*\*\*([^*]+)\*\*\s*[-–—]\s*(.+)/,
                /^#{1,6}\s*([🎯🚀💾🧮🌐⚛️⚡⚙️🔌✨🎨📦🔧🛠️⭐])\s*(.+)/,
            ]

            for (const pattern of patterns) {
                const match = line.match(pattern)
                if (match) {
                    const [, emoji, title, description] = match
                    features.push(description ? `${title.trim()}: ${description.trim()}` : title.trim())
                    break
                }
            }
        }

        return features
    }
}
