import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

/**
 * Генерирует llms.txt и llms-full.txt для домашней страницы.
 *
 * llms.txt      — компактный индекс (по стандарту https://llmstxt.org):
 *                 заголовок, краткое описание и сгруппированный список ссылок
 *                 на страницы документации.
 * llms-full.txt — вся англоязычная документация одним файлом, чтобы модель
 *                 могла проглотить её целиком без обхода сайта.
 *
 * Порядок и группировка берутся из реальной навигации сайта
 * (src/pages/docs/data/list.tsx + src/pages/docs/sections/*.tsx),
 * поэтому файлы не разъезжаются с документацией.
 */

const SITE = 'https://synapse-homepage.web.app'
const HOMEPAGE_ROOT = path.resolve(process.cwd())
const DOCS_DIR = path.resolve(HOMEPAGE_ROOT, '..', '..', 'docs', 'en')
const SECTIONS_DIR = path.join(HOMEPAGE_ROOT, 'src', 'pages', 'docs', 'sections')
const DATA_LIST = path.join(HOMEPAGE_ROOT, 'src', 'pages', 'docs', 'data', 'list.tsx')
const OUT_DIR = path.join(HOMEPAGE_ROOT, 'public')

// Человекочитаемые названия «столпов» и групп навигации (i18n-ключи → English).
const PILLARS: Record<string, { order: number; label: string }> = {
    overview: { order: 0, label: 'Overview' },
    state: { order: 1, label: 'State Manager (core)' },
    bll: { order: 2, label: 'Business Logic Layer (createSynapse)' },
    api: { order: 3, label: 'API Client' },
}

// Группа навигации → к какому столпу относится + подзаголовок.
const GROUPS: Record<string, { pillar: keyof typeof PILLARS; label: string }> = {
    overview: { pillar: 'overview', label: 'Overview' },
    create: { pillar: 'state', label: 'Creating storages' },
    data: { pillar: 'state', label: 'Working with data' },
    patterns: { pillar: 'state', label: 'Patterns' },
    'state-recipes': { pillar: 'state', label: 'Recipes' },
    synapse: { pillar: 'bll', label: 'createSynapse' },
    react: { pillar: 'bll', label: 'React' },
    utils: { pillar: 'bll', label: 'Utilities' },
    recipes: { pillar: 'bll', label: 'Recipes' },
    api: { pillar: 'api', label: 'API client' },
    'api-hooks': { pillar: 'api', label: 'API hooks' },
}

interface Entry {
    shortKey: string // хэш в URL: /docs#<shortKey>
    group: string
    fullKey: string
    component: string
    docKey: string // имя markdown-файла без .md
    title: string
    summary: string
    file: string
}

/** Компонент-страница → docKey (имя md-файла) из sections/*.tsx. */
function buildComponentToDocKey(): Record<string, string> {
    const map: Record<string, string> = {}
    for (const file of fs.readdirSync(SECTIONS_DIR)) {
        if (!file.endsWith('.tsx')) continue
        const src = fs.readFileSync(path.join(SECTIONS_DIR, file), 'utf8')
        const comp = src.match(/export const (\w+Page)\b/)?.[1]
        const docKey = src.match(/docKey="([^"]+)"/)?.[1] ?? src.match(/DOC_KEY\s*=\s*'([^']+)'/)?.[1]
        if (comp && docKey) map[comp] = docKey
    }
    return map
}

/** Упорядоченный список fullKey → component из data/list.tsx (порядок = порядок в файле). */
function readNavOrder(): Array<{ fullKey: string; component: string }> {
    const src = fs.readFileSync(DATA_LIST, 'utf8')
    const out: Array<{ fullKey: string; component: string }> = []
    const re = /'([^']+)':\s*<(\w+)\s*\/>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) out.push({ fullKey: m[1], component: m[2] })
    return out
}

const EMOJI = /[\p{Extended_Pictographic}☀-➿️]/gu

/** Чистит навигационные артефакты, осмысленные только в GitHub-репозитории. */
function stripNav(content: string): string {
    let c = content
    // Языковой / «домой» блок-цитата в шапке.
    c = c.replace(/^>.*(?:\[Главная\]|\[Back to Main\]|README\.md).*\r?\n?/gm, '')
    // Завершающая навигационная секция «куда дальше».
    c = c.replace(/\n#{1,6}\s*(?:Куда дальше|Where to go next|What['’]s next|Next steps)[\s\S]*$/i, '\n')
    return c.trimStart()
}

/** Заголовок (первый H1) и краткое описание (frontmatter.description или первый абзац). */
function extractMeta(frontMatter: Record<string, any>, body: string): { title: string; summary: string } {
    const title = (frontMatter.title || body.match(/^#\s+(.+)$/m)?.[1] || '')
        .replace(EMOJI, '')
        .replace(/\s+/g, ' ')
        .trim()

    let summary: string = frontMatter.description || ''
    if (!summary) {
        const afterH1 = body.replace(/^#\s+.+$/m, '')
        for (const raw of afterH1.split('\n')) {
            const line = raw.trim()
            if (!line || line.startsWith('#') || line.startsWith('>') || line.startsWith('```') || line.startsWith('|') || line.startsWith('-')) continue
            summary = line
            break
        }
    }
    // Первое предложение, без markdown-разметки, до ~160 символов.
    summary = summary
        .replace(EMOJI, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // ссылки → текст
        .replace(/[*`_]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    const dot = summary.indexOf('. ')
    if (dot > 40) summary = summary.slice(0, dot + 1)
    if (summary.length > 160) summary = summary.slice(0, 157).trimEnd() + '…'
    return { title, summary }
}

function build(): void {
    const compToDoc = buildComponentToDocKey()
    const nav = readNavOrder()

    const entries: Entry[] = []
    for (const { fullKey, component } of nav) {
        const parts = fullKey.split('.') // nav.sections.<group>.<shortKey>
        const group = parts[2]
        const shortKey = parts.slice(3).join('.')
        const docKey = compToDoc[component]
        if (!docKey) {
            console.warn(`⚠️  Нет docKey для компонента ${component} (${fullKey})`)
            continue
        }
        const file = path.join(DOCS_DIR, `${docKey}.md`)
        if (!fs.existsSync(file)) {
            console.warn(`⚠️  Файл документации не найден: ${docKey}.md`)
            continue
        }
        const { data, content } = matter(fs.readFileSync(file, 'utf8'))
        const body = stripNav(content)
        const { title, summary } = extractMeta(data, body)
        entries.push({ shortKey, group, fullKey, component, docKey, title, summary, file })
    }

    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

    writeIndex(entries)
    writeFull(entries)

    console.log(`\n✅ Сгенерировано ${entries.length} записей`)
    console.log(`   📄 ${path.join(OUT_DIR, 'llms.txt')}`)
    console.log(`   📄 ${path.join(OUT_DIR, 'llms-full.txt')}`)
}

/** Компактный индекс llms.txt. */
function writeIndex(entries: Entry[]): void {
    const lines: string[] = []
    lines.push('# Synapse Storage')
    lines.push('')
    lines.push(
        '> Framework-agnostic TypeScript toolkit for state management and API requests. ' +
            'Three independent layers: a core state manager (memory / localStorage / IndexedDB adapters, ' +
            'selectors, subscriptions, RxJS), a business-logic layer (`createSynapse`: dispatcher + effects), ' +
            'and an API client with React hooks (useQuery / useMutation) and SSR support. ' +
            'npm package: `synapse-storage`.',
    )
    lines.push('')
    lines.push('- Homepage: ' + SITE)
    lines.push('- Docs: ' + SITE + '/docs')
    lines.push('- npm: https://www.npmjs.com/package/synapse-storage')
    lines.push('- Full documentation as one file: ' + SITE + '/llms-full.txt')
    lines.push('')

    // Группируем по столпам в заданном порядке.
    const byPillar = new Map<string, Entry[]>()
    for (const e of entries) {
        const pillar = GROUPS[e.group]?.pillar ?? 'overview'
        if (!byPillar.has(pillar)) byPillar.set(pillar, [])
        byPillar.get(pillar)!.push(e)
    }
    const pillarKeys = [...byPillar.keys()].sort((a, b) => (PILLARS[a]?.order ?? 99) - (PILLARS[b]?.order ?? 99))

    for (const pillar of pillarKeys) {
        lines.push(`## ${PILLARS[pillar]?.label ?? pillar}`)
        lines.push('')
        for (const e of byPillar.get(pillar)!) {
            const url = `${SITE}/docs#${e.shortKey}`
            lines.push(`- [${e.title}](${url})${e.summary ? `: ${e.summary}` : ''}`)
        }
        lines.push('')
    }

    fs.writeFileSync(path.join(OUT_DIR, 'llms.txt'), lines.join('\n').trimEnd() + '\n')
}

/** Полная документация одним файлом llms-full.txt. */
function writeFull(entries: Entry[]): void {
    const parts: string[] = []
    parts.push('# Synapse Storage — full documentation')
    parts.push('')
    parts.push(`Source: ${SITE}/docs · npm: synapse-storage · Generated: ${new Date().toISOString().slice(0, 10)}`)
    parts.push('')
    parts.push('---')
    parts.push('')

    for (const e of entries) {
        const { content } = matter(fs.readFileSync(e.file, 'utf8'))
        const body = stripNav(content).trim()
        parts.push(`<!-- source: docs/en/${e.docKey}.md · url: ${SITE}/docs#${e.shortKey} -->`)
        parts.push(body)
        parts.push('')
        parts.push('---')
        parts.push('')
    }

    fs.writeFileSync(path.join(OUT_DIR, 'llms-full.txt'), parts.join('\n').trimEnd() + '\n')
}

build()
