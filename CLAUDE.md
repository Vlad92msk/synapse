# synapse — карта репозитория

Монорепо (yarn workspaces, `packages/*`) библиотеки **synapse-storage** — state management + API-клиент
(RxJS, React-хуки, SSR). Язык кода-комментариев, JSDoc, CHANGELOG и коммитов — **русский**.

```
packages/
  synapse/    # сама библиотека (npm: synapse-storage) — основная работа здесь
  homepage/   # сайт документации (vite-react-ssg, Firebase hosting)
  examples/   # демо-приложение на vite (зависит от synapse-storage: "*") — только сборка как валидация
docs/{en,ru}/ # исходники документации (Markdown, en — мастер-локаль); сайт генерится из них
scripts/release.sh  # релиз: npm + деплой сайта
tasks/, TASK_*.md   # рабочие заметки/задачи пользователя (не код)
```

## packages/synapse — библиотека

Entry points (`package.json#exports`, каждый — `src/<name>/index.ts`): `.` (всё), `./core`, `./api`,
`./reactive`, `./react`, `./utils`. ESM-only, сборка `rslib` bundleless (структура `dist` = структура `src`).

| Каталог `src/` | Что внутри |
|---|---|
| `core/storage/` | хранилища: `adapters/` (Memory, LocalStorage, IndexedDB, WorkerCache), `middlewares/`, `modules/`, `utils/` |
| `core/selector/` | система селекторов |
| `api/` | ApiClient: `api.module.ts` (клиент), `components/endpoint.ts` (запрос, кэш, дедуп, retry, теги), `components/query-storage.ts` (кэш), `utils/fetch-base-query.ts` (fetch, таймаут, разбор тела), `utils/api-error.ts` (`ApiError`), `types/` |
| `reactive/dispatcher/` | Dispatcher (экшены, middlewares) |
| `reactive/effects/` | Effects: `operators/` (`ofType`, `validateMap`/`mutationMap` в `request-map.ts`, `apiResult`, selectors), `utils/` (`fromRequest`, `toObservable`, chunkRequest*) |
| `react/` | `hooks/` (useApiQuery, useApiMutation, useSelector, useStorage*…), `utils/` (createSynapseCtx, awaitSynapse) |
| `utils/createSynapse/` | `createSynapse` — сборка storage + dispatcher + effects |
| `_utils/` | внутренние хелперы (error-handling и пр.), не экспортируются |

Ключевые контракты API-слоя: любой неуспех запроса — `ApiError` (`meta.status`, тело в `originalError`;
сеть/таймаут/упавший `prepareHeaders` — `status 0`); 204/пустое тело — успех с `data: undefined`; отмена —
`AbortError`, не ошибка; ошибки, доставленные вызывающему, библиотека не логирует; глобальный retry — только
идемпотентные методы; ключ кэша — `<endpoint>::{p,h(хеши),r(path/format)}`; бинарные ответы не кэшируются.

### Команды (из `packages/synapse`)
- `yarn test` — **гейт**: `typecheck` (`tsconfig.test.json`, весь `src` вместе с тестами) + `vitest run`. Должен быть зелёным.
- `npx vitest run <путь>` — один файл; `yarn build` — сборка в `dist`.
- `npx eslint <файлы>` — lint (правило `no-use-before-define`: хелперы объявлять выше использования).
  `yarn lint`/`fix` гоняет весь src; `prettier --check` падает на паре старых тестов — не наше.

### Тесты
- Лежат в `src/**/__tests__/*.test.ts(x)` рядом с модулем; type-level — `*.test-d.ts` (vitest typecheck).
- Среда по умолчанию `node`; для DOM/localStorage/React — docblock `// @vitest-environment jsdom` в начале файла.
  IndexedDB — `import 'fake-indexeddb/auto'` в самом тесте. Setup: `vitest.setup.ts` (jest-dom матчеры).
- Сеть мокается через `baseQuery.fetchFn`. Где важна семантика тела (пустое тело, одноразовый поток,
  обрыв, abort) — использовать **настоящий `Response`/`ReadableStream`**, а не объект-заглушку.
- Образцы: `api/__tests__/api-client.test.ts` (createApi + MemoryStorage), `api/__tests__/api-error.test.ts`
  (сквозной fetchBaseQuery → Endpoint → fromRequest → apiResult), `react/__tests__/api-hooks.test.tsx`.
- Vitest падает на unhandled rejection — это ловит утечки промисов, не глушить.
- Баг, найденный но не исправленный, фиксируется `it.fails(...)` (гейт зелёный, после фикса → `it`).

## Изменение публичного поведения — чек-лист
1. Код + тесты в `packages/synapse`, `yarn test` зелёный.
2. Документация **в обеих локалях**: `docs/en/<тема>.md` и `docs/ru/<тема>.md` (держать в синхроне).
3. `packages/synapse/CHANGELOG.md` — новая секция сверху: `## [x.y.z] - YYYY-MM-DD — заголовок`, по-русски,
   с «поведенческое изменение / миграция», если есть.
4. Версия — вручную в `packages/synapse/package.json` (не `npm version`). Единственный источник версии:
   сайт читает её оттуда при сборке.

## Документация и homepage
- Источник — `docs/{en,ru}/*.md`. `cd packages/homepage && yarn docs:generate` → `src/data/structured-docs.json`,
  `src/data/section-mapping.json`, `src/types/docs.ts` (генерятся, руками не править; коммитить вместе с md).
  `yarn docs:llms` → `public/llms.txt`, `public/llms-full.txt`, `public/llms/`. Оба запускаются в `dev`/`build`.
- Новая страница доков = md в обеих локалях + `src/pages/docs/sections/<x>.tsx` (`<DocPage docKey="…"/>`),
  экспорт в `sections/index.ts`, запись в `src/pages/docs/data/list.tsx`, пункт сайдбара
  `src/pages/docs/components/docs-sidebar/data/list.ts`, i18n-заголовки `nav.sections.<group>.<key>` в
  `src/i18n/config.ts` (ru и en), `DOC_KEY_TO_SHORT` в `src/shared/components/search/searchIndex.ts`
  (иначе не скомпилируется), при наличии демо — `src/pages/docs/data/example-links.ts`.
- Три вида идентификаторов раздела: short key (URL `/docs/<key>`) ≠ docKey (имя md-файла) ≠ i18n key.
- Страницы сайта: `src/pages/home` (лендинг), `src/pages/docs` (доки); поиск Cmd+K — `src/shared/components/search`.
- `yarn build` проверяет пререндер (`docs:check-prerender`); деплой — `yarn deploy` (Firebase).

## Релиз
`yarn release` (корень) = `scripts/release.sh`: сначала валидация (тесты lib → build lib → build examples →
build homepage), потом необратимое (npm publish + деплой сайта). `yarn release:dry` — без публикации.
Версию скрипт не меняет. Публикация и деплой — только по явной просьбе пользователя.

## Потребитель: sn_client
Библиотека обкатывается на `/Users/vlad/web_dev/sn_client` (Next.js, yarn 1). Неопубликованную версию
ставить тарболом: `cd packages/synapse && yarn build && npm pack` → положить `.tgz` в корень sn_client →
`yarn add ./synapse-storage-X.Y.Z.tgz`. Проверка там — `yarn -s tsc --noEmit` (`next lint` сломан).
Ловушка yarn 1: пересобранный тарбол с **тем же именем файла** не переустанавливается (берётся старый из кэша/lock,
даже после `cache clean`) — давать новое имя (`…-r2.tgz`) и проверять, что в `node_modules/synapse-storage/dist` новый код.
В sn_client часто есть незакоммиченная работа пользователя — трогать только нужные файлы.
