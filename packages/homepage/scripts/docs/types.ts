// Типы для генератора документации

export interface CodeBlock {
    language: string
    code: string
    filename?: string
    meta?: string
}

export interface ListItem {
    content: ContentBlock[] | string // ✅ Может быть массивом блоков или строкой (для задач)
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
        links: Array<{ start: number; end: number; url: string; title?: string }>
    }
}

export interface DiagramBlock {
    code: string;
    title?: string
}

export interface TaskItem {
    content: string
    checked: boolean
}

export type ContentBlock =
    | { type: 'paragraph'; data: Paragraph }
    | { type: 'heading'; data: { text: string; level: number; id: string } }
    | { type: 'list'; data: ListItem[] }
    | { type: 'diagram'; data: DiagramBlock }
    | { type: 'taskList'; data: TaskItem[] }
    | { type: 'table'; data: Table }
    | { type: 'code'; data: CodeBlock }
    | { type: 'blockquote'; data: Blockquote }
    | { type: 'divider'; data: object }
    | { type: 'break'; data: object }
    | { type: 'html'; data: { content: string } }

export interface DocSection {
    id: string
    title: string
    level: number
    content: ContentBlock[]
    metadata?: {
        wordCount: number
        codeBlocksCount: number
        diagramsCount?: number
        hasTable: boolean
        hasBlockquotes: boolean
        hasDiagrams?: boolean
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

// Константы для типов блокквотов
export const BLOCKQUOTE_TYPES = {
    '💡': 'tip',
    '⚠️': 'warning',
    'ℹ️': 'info',
    '📝': 'note',
    '🔎': 'info',
    '🚀': 'tip'
} as const
