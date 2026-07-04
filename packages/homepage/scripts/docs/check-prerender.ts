import fs from 'fs'
import path from 'path'

import { DOC_NAV } from '../../src/pages/docs/components/docs-sidebar/data/list'

/**
 * Пост-билд гард: после `vite-react-ssg build` проверяем, что КАЖДЫЙ раздел доки
 * действительно пререндерился в статический HTML с реальным контентом — а не в
 * пустой SPA-каркас. Именно это раньше ломало чтение доков ботами/агентами:
 * сервер отдавал `<div id="root">` без текста.
 *
 * Падаем (exit 1), если для какого-то /docs/<key> файла нет или в нём слишком
 * мало видимого текста (значит контент не отрендерился на сервере).
 */

const BUILD_DIR = path.resolve(process.cwd(), 'build')

// Порог видимого текста. Пустой каркас (только шапка/навигация) — ~760–5000 симв.
// Реальная страница раздела — от нескольких тысяч. Берём консервативно.
const MIN_VISIBLE_CHARS = 2000

/** Грубо вырезает теги/скрипты/стили и меряет длину видимого текста. */
function visibleTextLength(html: string): number {
    const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    return text.length
}

const keys = DOC_NAV.flatMap((pillar) => pillar.groups)
    .flatMap((group) => group.items)
    .map((item) => item.key)

const errors: string[] = []

for (const key of keys) {
    const file = path.join(BUILD_DIR, 'docs', key, 'index.html')
    if (!fs.existsSync(file)) {
        errors.push(`нет пререндер-файла: build/docs/${key}/index.html`)
        continue
    }
    const len = visibleTextLength(fs.readFileSync(file, 'utf8'))
    if (len < MIN_VISIBLE_CHARS) {
        errors.push(`build/docs/${key}/index.html: видимого текста ${len} < ${MIN_VISIBLE_CHARS} — контент не отрендерился`)
    }
}

// Главная и индекс доков тоже должны существовать.
for (const rel of ['index.html', 'docs/index.html']) {
    if (!fs.existsSync(path.join(BUILD_DIR, rel))) errors.push(`нет пререндер-файла: build/${rel}`)
}

if (errors.length) {
    console.error('\n❌ Проверка пререндера не пройдена:')
    for (const e of errors) console.error(`   • ${e}`)
    console.error('\nПроверьте includedRoutes в vite.config.ts и SSR-безопасность соответствующих разделов.')
    process.exit(1)
}

console.log(`✅ Пререндер: ${keys.length} разделов + главная + /docs — все со статическим контентом`)
