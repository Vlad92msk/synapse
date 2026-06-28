# Этап 1 — Чистые согласованные примеры (State Manager) + актуализация `docs/ru`

> Рабочий файл для будущих сессий. Делается **по частям**, не за один заход.
> Парный файл — [`REFACTOR_2_CREATESYNAPSE_POKEMON.md`](./REFACTOR_2_CREATESYNAPSE_POKEMON.md) (Business Logic Layer на API покемонов).
> Аудит на корректность (отдельная задача) — [`DOCS_AUDIT_PLAN.md`](./DOCS_AUDIT_PLAN.md).

## Источник истины

**`packages/synapse/src` — единственный источник истины о поведении библиотеки.**
Если что-то непонятно (сигнатура, имя метода, опция, порядок инициализации) — смотреть в код,
а не угадывать. Точки входа, которые импортирует сторонний разработчик:

| Импорт | Папка |
|---|---|
| `synapse-storage/core` | `src/core` (storage, selector) |
| `synapse-storage/reactive` | `src/reactive` (dispatcher, effects) |
| `synapse-storage/utils` | `src/utils` (createSynapse, eventBus, awaiter) |
| `synapse-storage/react` | `src/react` (hooks, createSynapseCtx) |
| `synapse-storage/api` | `src/api` (ApiClient) |

## Зачем (проблема, которую решаем)

Сейчас `packages/examples` — это «склад»: каждый файл-пример мешает три разных вещи и
читается тяжело. Открой `packages/examples/src/examples/MemoryStorageExample.tsx` — увидишь
характерный антипаттерн:

1. **Реальный полезный код** (создание `storage`, логика) — то, что нужно пользователю.
2. **Огромные блоки `<pre>{`...`}</pre>`** — тот же код, продублированный строкой ради показа
   на экране. Это и есть «много кода в шаблоне», ради которого пример нечитаем.
3. **Демо-UI**: кнопки, `cardStyle`, `codeBlock`, логи.

Из-за этого:
- Пользователь не может просто «скопировать и вставить» — сначала надо мысленно вырезать шум.
- Каждый раздел доки живёт сам по себе: «Создание хранилищ» и «Работа с данными» построены на
  разных выдуманных стейтах (`CounterState`, `UserState` и т.п.). Прочитав один раздел, нельзя
  продолжить тот же пример в следующем — приходится начинать с нуля.

## Цель этапа

1. **Каждый пример = только то, что копируется в проект.** Минимум, без дублирующих `<pre>`-строк
   с кодом, без лишнего UI-шума. Демо может остаться, но компактное и не мешающее чтению.
2. **Сквозной пример через разделы.** Один и тот же домен проходит через «Создание хранилищ» →
   «Работа с данными» → «Паттерны». Создал хранилище в разделе создания — в разделе работы с
   данными используешь **его же**, а не новый. Знания и код накапливаются, а не обнуляются.
3. **`docs/ru` синхронизирована** с обновлёнными примерами (код-блоки в `.md` = код примера).

Охват этапа — **слой State Manager (core)**: блоки сайдбара `create`, `data`, `patterns`
(см. `DOC_NAV` в `packages/homepage/src/pages/docs/components/docs-sidebar/data/list.ts`).
BLL/createSynapse — это Этап 2.

## Сквозной домен (по умолчанию — Todo-list)

Пользователь сказал «переключение темы, todo-list или что угодно — не важно». Берём за основу
**Todo-list**: список задач естественно требует массивов, производных значений (счётчики
активных/выполненных, фильтр) и хорошо ложится на паттерны (логирующий middleware, persist,
singleton) — в отличие от тривиального переключателя темы. Где по смыслу нужен **второй** стор
(напр. в Singleton или для контраста sync/async) — добавляем маленький `theme`/`counter` стор.

> Это решение можно поменять при старте — главное, чтобы домен был **один** на все три раздела.

Предлагаемая форма общего домена (вынести из конкретного примера в переиспользуемый модуль):

```
packages/examples/src/examples/todo/
  todo.types.ts     // Todo, TodoState, Filter
  todo.store.ts     // создание хранилища + (опц.) селекторы — переиспользуется во всех разделах
```

Тип-черновик (уточнить по факту):

```ts
export interface Todo { id: string; title: string; done: boolean }
export type Filter = 'all' | 'active' | 'completed'
export interface TodoState { todos: Todo[]; filter: Filter }
```

## Эталонная форма «чистого примера»

Цель — файл, который не стыдно показать как «вот, скопируй». Принципы:

- **Никаких `<pre>{`...`}</pre>` с дублированием кода.** Объясняющие код-блоки живут в `.md`,
  а не строкой внутри `.tsx`. В примере остаётся настоящий рабочий код.
- **Импорты — только из публичного API** (`synapse-storage/core` и т.д.), не из относительных
  путей внутрь `src`. Так пишет сторонний пользователь.
- **Минимальный демо-UI** (если нужен запуск): пара кнопок/инпут. Стили — общий минимум из
  `styles.ts`, без раздувания. Демо не должно перевешивать смысл примера.
- **Осмысленные имена, короткие комментарии** только там, где неочевидно.
- Логика стора отделена от рендера: создание `storage`/селекторов — наверху или в `todo.store.ts`,
  компонент только использует.

Ориентир «до/после»: сейчас `MemoryStorageExample.tsx` ~190 строк, из них больше половины — это
`<pre>`-строки. После рефактора полезного кода останется ~30–50 строк, остальное переедет в `.md`.

## Какие примеры входят в этап

Из `DOC_NAV`, блоки `create` / `data` / `patterns`. Сверять с
`packages/homepage/src/pages/docs/data/example-links.ts` (там маппинг docKey → файл примера):

**Создание хранилищ:** `MemoryStorageExample`, `LocalStorageExample`, `IndexedDBExample`,
`FactoryExample`, `HookExample` (memory), `HookLocalStorageExample`, `HookIndexedDBExample`,
`StaticCreateExample`. (`PersistMigrationExample`, `HydrateExample` — в App есть, в сайдбаре нет;
см. находку G1 в `DOCS_AUDIT_PLAN.md` — решить заодно, добавлять ли их в навигацию.)

**Работа с данными:** `ReadingDataExample`, `WritingDataExample`, `DeleteHasKeysExample`,
`SubscriptionPatternsExample`, `SelectorSystemExample` (+ `ReactiveSelectorExample`).

**Паттерны:** `MiddlewaresExample`, `SingletonExample`.

> Все эти примеры нужно перевести на **один** общий todo-домен (где это осмысленно), чтобы
> читатель шёл по ним как по одной истории.

## Порядок работы (для каждой сессии)

1. Открыть три артефакта сразу: пример (`*.tsx`), его `.md` в `docs/ru/`, реализацию в `src`.
2. Завести/обновить общий `todo/` модуль, если ещё нет.
3. Переписать пример к эталонной форме: убрать `<pre>`-дубли, перевести на todo-домен,
   оставить минимальный демо-UI.
4. Синхронизировать `docs/ru/<file>.md`: код-блоки = код примера; добавить, если не хватает,
   короткое «когда брать / когда НЕ брать».
5. Проверить ссылку в `example-links.ts` — ведёт на существующий файл.
6. После правок текста доки: `yarn docs:generate` в `packages/homepage` (перегенерит
   `structured-docs.json`; **JSON руками не править**).
7. Прогнать typecheck (lint в репо сломан — проверяем типами). Примеры должны собираться.

## Definition of Done (этап закрыт, когда)

- [x] Во всех примерах блоков `create`/`data`/`patterns` нет дублирующих `<pre>`-строк с кодом.
- [x] Эти примеры построены на **одном** общем todo-домене (переиспользуют `todo/` модуль).
- [x] Читатель может пройти «Создание → Работа с данными → Паттерны», достраивая один пример.
- [x] `docs/ru/*.md` для этих разделов согласованы с кодом примеров.
- [x] `example-links.ts` ведёт на существующие файлы; `yarn docs:generate` прогнан.
- [x] Typecheck зелёный, примеры собираются.

## Заметки / прогресс

> Здесь фиксировать, какие примеры уже переписаны, какие решения приняты (домен, форма),
> и на чём остановились — чтобы следующая сессия продолжила, а не начала заново.

### Сессия 1 (2026-06-27) — слой «Создание хранилищ» закрыт

**Домен:** взят todo-list (как и предлагалось). Вынесен в переиспользуемый модуль
`packages/examples/src/examples/todo/`:
- `todo.types.ts` — `Todo`, `Filter`, `TodoState`, `initialTodoState`, `createTodo`, `filterTodos`.
- `todo.store.ts` — **канонический** `todoStorage` (MemoryStorage). Его переиспользуют разделы
  «Работа с данными» и «Паттерны» (там дописывать селекторы/действия, не плодить новые сторы).
- `TodoDemo.tsx` — демо-обвязка: хук `useTodoState(storage)` (init + subscribe) и презентационный
  `TodoList`, который пишет напрямую в переданное хранилище. Типизирован через `IStorage<TodoState>`
  (union sync/async) — компилируется и для Memory/Local, и для IndexedDB.

**Решение по форме примера:** «создание» вынесено в `todo.store.ts` / в начало файла, компонент =
только `useTodoState` + `<TodoList>`. Никаких `<pre>`-дублей. Операции (read/write/subscribe) НЕ
повторяются в каждом примере создания — они уедут/уже есть в разделе «Работа с данными», на них
стоят ссылки из доки.

**Переписаны примеры (8/8 раздела create):** `MemoryStorageExample` (использует канонический
`todoStorage`), `LocalStorageExample`, `IndexedDBExample`, `FactoryExample` (демо = `createMemory`),
`HookExample`, `HookLocalStorageExample`, `HookIndexedDBExample`, `StaticCreateExample`. Все на todo,
`<pre>`-блоки убраны.

**Синхронизированы доки (8/8, `docs/ru`):** memory-storage, local-storage, indexeddb-storage,
storage-factory, hook-memory, hook-local-storage, hook-indexeddb, static-create. У каждой: создание
на todo-домене (совпадает с примером), блок «Когда брать / Когда не брать», операции вынесены
ссылками в раздел «Работа с данными». `yarn docs:generate` прогнан.

**Проверки:** `yarn typecheck` (examples) — зелёный; `type-check` (homepage) — зелёный.

### Сессия 2 (2026-06-27) — слой «Работа с данными» закрыт

**Селекторы в общий модуль:** в `todo.store.ts` добавлен класс `TodoSelectors` (`todos`, `filter`,
`visibleTodos` = `combine([todos, filter])`, `activeCount`, `completedCount`) + экспортирован
синглтон `todoSelectors = new TodoSelectors(todoStorage)`. Конструируется на загрузке модуля
(до `initialize()`) — `SelectorModule` это допускает, `useSelector` отдаёт `undefined` до готовности.

**Переписаны примеры (6/6 раздела data):** `ReadingDataExample`, `WritingDataExample`,
`DeleteHasKeysExample`, `SubscriptionPatternsExample`, `SelectorSystemExample`, `ReactiveSelectorExample`
— все на канонический `todoStorage`/`todoSelectors` через `useTodoState` + `<TodoList>`. `<pre>`-дубли
с кодом убраны (живые демки + лог результатов вместо строковых код-блоков).
- `ReactiveSelectorExample` переведён с прежнего `createSynapse`/`Dispatcher` (это слой BLL, Этап 2) на
  чистый core-слой: `todoSelectors.activeCount.$` как источник, изменения гонятся прямой записью в
  `todoStorage`. `useObservable`/`useSubscription`/standalone-подписка сохранены.

**Синхронизированы доки (5/5, `docs/ru`):** reading-data, writing-data, delete-has-keys, subscriptions,
selector-system — переведены на todo-домен (`TodoState = { todos: Todo[]; filter: Filter }`), код-блоки
согласованы с примерами. В selector-system основные секции (select/combine/keyed/.$/useSelector/
программный доступ) на todo; cross-store и «в эффектах» оставлены как концептуальные (Posts/Search).
`yarn docs:generate` прогнан (structured-docs.json перегенерён).

**Проверки:** examples `yarn typecheck` — зелёный; homepage `yarn type-check` — зелёный.
`example-links.ts` — имена файлов не менялись, правок не требуется.

### Сессия 3 (2026-06-27) — слой «Паттерны» закрыт

**Переписаны примеры (2/2 раздела patterns):** `MiddlewaresExample`, `SingletonExample` — переведены
на домен `TodoState`. Middleware/singleton конфигурируются при создании стора, поэтому канонический
`todoStorage` тут не переиспользуется напрямую — заведены отдельные todo-сторы (тот же тип/демки
`TodoList`/`useTodoState`). `<pre>`-дубли убраны, остались живые демки.
- `MiddlewaresExample`: live-демки logger / batching / shallowCompare / broadcast на TodoState.
- `SingletonExample`: basic (один экземпляр на имя) / custom key / shared-state двух компонентов.

**Синхронизированы доки (2/2, `docs/ru`):** middlewares, singleton — на todo-домен.
- `middlewares.md`: встроенные секции (config/batching/shallowCompare/custom comparator/combined/
  broadcast/logger) на TodoState; секция «своя middleware» (A валидация / B нормализация / C аудит)
  переписана под todo; Типы без изменений.
- `singleton.md`: все сниппеты на TodoState (mergeStrategy/custom key/React/SingletonOptions).
  В доке оставлены mergeStrategy и full-config как справочник (в live-примере их нет — намеренно).

**Проверки:** examples `yarn typecheck` — зелёный; homepage `yarn type-check` — зелёный;
`yarn docs:generate` прогнан. `example-links.ts` — имена файлов не менялись.

**Что осталось (следующие сессии):**
- **`example-links.ts`** — все ссылки на месте, файлы существуют (имена не менялись). Доп. правок не
  требуется для create.
- **`docs/en`** — ✅ синхронизирован с `docs/ru` для всего Этапа 1 (create + data + patterns).
  Create-доки были перенесены ранее; data (reading-data/writing-data/delete-has-keys/subscriptions/
  selector-system) и patterns (middlewares/singleton) перенесены на todo-домен в сессии 4
  (англ. проза + англ. комментарии в коде, заголовки в стиле `> [Back to Main]`). `yarn docs:generate`
  прогнан, homepage typecheck зелёный.
- **G1 из DOCS_AUDIT_PLAN** (`PersistMigrationExample`/`HydrateExample` в App, но не в сайдбаре) — не
  решался, вынести отдельно.
