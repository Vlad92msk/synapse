# Этап 2 — Слой управления данными на API покемонов (createSynapse / BLL)

> Рабочий файл для будущих сессий. Делается **по частям**, не за один заход.
> Парный файл — [`REFACTOR_1_EXAMPLES_AND_DOCS.md`](./REFACTOR_1_EXAMPLES_AND_DOCS.md) (чистые примеры слоя State Manager).
> Аудит на корректность (отдельная задача) — [`DOCS_AUDIT_PLAN.md`](./DOCS_AUDIT_PLAN.md).

## Источник истины

**`packages/synapse/src` — единственный источник истины о поведении библиотеки.**
Непонятна сигнатура / опция / порядок инициализации — смотреть в код, не угадывать. Точки входа:

| Импорт | Папка |
|---|---|
| `synapse-storage/core` | `src/core` (storage, selector) |
| `synapse-storage/reactive` | `src/reactive` (dispatcher, effects) |
| `synapse-storage/utils` | `src/utils` (createSynapse, eventBus, awaiter, dehydrate) |
| `synapse-storage/react` | `src/react` (hooks, createSynapseCtx, awaitSynapse) |
| `synapse-storage/api` | `src/api` (ApiClient) |

## Зачем (что отличает этот этап от Этапа 1)

Этап 1 показывает State Manager: «как хранить и менять состояние». Этот этап — про **более
продвинутую технику**: `createSynapse` и весь Business Logic Layer. Это уже не «стейт-менеджер»,
а **способ собрать слой управления данными**: API Client → типы → store → selectors →
dispatcher → effects → `createSynapse`, и поверх — интеграция с React и утилиты.

Идея пользователя: взять **реальный публичный API — PokeAPI (`https://pokeapi.co/api/v2`)** — и
на нём провести стороннего разработчика через полный путь построения слоя бизнес-логики:
как сделать API Client, как замапить ответ, как описать намерения (dispatcher), как обрабатывать
side-effects (effects), как связать всё в `createSynapse` и отдать в React. Это «рецепт», который
раскрывает возможности библиотеки на живом примере, а не на абстрактном счётчике.

## Что уже есть (отправная точка)

В репозитории уже лежат **две** черновые папки (на старте — свериться с реальным составом):

```
packages/examples/src/examples/pokemon-advanced/   // данные + api + демо
  pokemon.types.ts      // PokemonBrief, PokemonDetails, ApiRequestState, PokemonState
  pokemon.api.ts        // ApiClient (getList/getDetails) + мапперы ответа
  pokemon.store.ts      // initialState
  pokemon.settings.ts
  helpers.ts
  index.ts              // экспорт PokemonAdvancedExample
  PokemonAdvancedExample.tsx / PokemonDemo.tsx

packages/examples/src/examples/pokemon-class/       // class-based BLL
  pokemon.dispatcher.ts
  pokemon.effects.ts
  pokemon.selectors.ts
  pokemon.synapse.ts
  index.ts
```

То есть домен сейчас **разрезан между двумя папками**, и неочевидно, как они связаны. Первое
решение этапа — определиться: свести всё в один эталонный модуль или осознанно держать две папки
(данные/демо vs class-based слой) с явной связью. Заодно закрыть находку G3 в
`DOCS_AUDIT_PLAN.md` — проверить, подключён ли `pokemon-class/` где-то (`App.tsx`) или это
устаревший фрагмент, чтобы он не путал читателя.

Этот этап — **довести `pokemon-advanced` до эталона** (чистый, читаемый, полнопокрывающий
возможности библиотеки) и построить вокруг него документацию.

## Цель этапа

1. **Эталонный модуль `pokemon-advanced`**: реалистичная, копируемая архитектура слоя данных.
   Каждый файл — отдельная ответственность, минимум шума, импорты из публичного API.
2. **Покрыть возможности библиотеки** на этом одном домене: ApiClient (кэш/теги), мапперы,
   selectors (производные данные: фильтр по `searchQuery`, избранное), dispatcher (намерения,
   apiActions, watcher), effects (RxJS, протокол состояний запроса), `createSynapse` (сборка,
   async-фабрика, зависимости между модулями).
3. **Документация `docs/ru`** для блоков BLL построена вокруг этого примера. Разделы сайдбара:
   - `createSynapse` — `create-synapse-basic`, `create-synapse-dispatcher`,
     `create-synapse-effects`, `dispatcher-detailed`, `dependencies`.
   - `React` — `synapse-ctx`, `await-synapse` (как отдать pokemon-synapse в компоненты, SSR).
   - `Утилиты` — `synapse-awaiter`, `event-bus` (где уместно — на том же домене).
   - `Рецепты` — `pokemon-advanced` (итоговая страница, собирающая всё вместе).
   - `API Client` — `api-client` (на pokemonApiClient).
4. Решить судьбу `pokemon-class/` (оставить как альтернативу class-based / удалить как дубль).

## Эталонная форма

Как в Этапе 1: **никаких `<pre>{`...`}</pre>` с дублированием кода** внутри `.tsx`. Объясняющие
код-блоки — в `.md`. В примере — настоящий рабочий код, разложенный по файлам по ответственности.
Импорты только из `synapse-storage/*`. Демо-компонент (`PokemonDemo`) — компактный, показывает
работу, но не перевешивает смысл архитектуры.

Целевой состав модуля (уточнить по факту реализации в `src`):

```
pokemon.types.ts        — доменные типы + форма состояния запроса
pokemon.api.ts          — ApiClient (baseQuery, cache, endpoints) + мапперы
pokemon.store.ts        — storage + initialState
pokemon.selectors.ts    — производные значения (список с учётом searchQuery, favorites, флаги loading)
pokemon.dispatcher.ts   — намерения: загрузить список/детали, поиск, избранное (action/apiActions/watcher)
pokemon.effects.ts      — side-effects: вызовы api по экшенам, запись результата, обработка ошибок
pokemon.synapse.ts      — createSynapse(factory): собирает storage+selectors+dispatcher+effects
index.ts                — публичные экспорты
PokemonDemo.tsx         — минимальный UI поверх synapse (через React-слой)
```

## Порядок работы (для каждой сессии)

1. Сверить текущий `pokemon-advanced/` с реализацией в `src` (имена методов dispatcher/effects,
   опции ApiClient, форма `createSynapse`-фабрики). Источник истины — `src`.
2. Привести модуль к эталону: разнести ответственности, убрать шум/`<pre>`-дубли, проверить
   импорты из публичного API.
3. Написать/обновить `docs/ru/<file>.md` для соответствующего раздела BLL **на этом домене**,
   чтобы страницы ссылались на один и тот же pokemon-пример, а не на разрозненные.
4. Проверить `example-links.ts` (для `pokemon-advanced` это ссылка на папку — `TREE`).
5. `yarn docs:generate` в `packages/homepage` после правок текста (**JSON руками не править**).
6. Typecheck (lint сломан — проверяем типами); демо должно собираться и работать.

> Порядок прохождения разделов: `api-client` → `create-synapse-basic` →
> `create-synapse-dispatcher` → `create-synapse-effects` → `dispatcher-detailed` →
> `dependencies` → `synapse-ctx` → `await-synapse` → `synapse-awaiter`/`event-bus` →
> `pokemon-advanced` (итог). Можно дробить по одной странице за сессию.

## Definition of Done (этап закрыт, когда)

- [x] `pokemon-advanced` доведён до эталона: чистые файлы по ответственности, без `<pre>`-дублей,
      импорты из публичного API, компактное демо.
- [x] Модуль раскрывает ключевые возможности BLL (ApiClient, selectors, dispatcher, effects,
      createSynapse, связи модулей) на одном домене.
- [x] `docs/ru` для блоков `createSynapse` / `React` / `Утилиты` / `Рецепты` / `API Client`
      опираются на pokemon-пример и согласованы с кодом. **(EN-проход — отдельная задача.)**
- [x] Судьба `pokemon-class/` решена: **удалён**, BLL-файлы сведены в единый `pokemon-advanced`.
- [x] `example-links.ts` актуален; `yarn docs:generate` прогнан; typecheck зелёный.

## Заметки / прогресс

> Фиксировать: какие файлы модуля приведены к эталону, какие страницы доки переписаны,
> решение по `pokemon-class/`, и на чём остановились.

### Сессия 1 (2026-06-27) — консолидация модуля

- **Решение по G3 / двум папкам:** `pokemon-class/` **удалён**; его 4 BLL-файла
  (`pokemon.dispatcher.ts`, `pokemon.selectors.ts`, `pokemon.effects.ts`,
  `pokemon.synapse.ts`, через `git mv`) перенесены в единый модуль `pokemon-advanced/`.
  Раньше домен был разрезан и связан циклически (демо из `pokemon-advanced` импортировал
  слой из `pokemon-class`, а классы — типы/api обратно). Теперь один модуль = эталон.
- Импорты в перенесённых файлах переведены с `../pokemon-advanced/*` на `./*`; комментарии
  очищены от привязки к «этап 4 ROADMAP». `index.ts` теперь реэкспортирует BLL.
- `pokemon.synapse.ts`: имя storage `pokemon-class` → `pokemon-advanced`.
- `PokemonAdvancedExample.tsx`: убраны все `<pre>`-дубли кода (эталон — объяснения в `.md`),
  осталась компактная UI-обёртка + `PokemonDemo`. Импорт демо — из `./pokemon.synapse`.
- Typecheck (`yarn workspace examples typecheck`) — зелёный. Lint не трогаем (сломан).

**Состав `pokemon-advanced/` сейчас:** types / api / store / settings / helpers /
selectors / dispatcher / effects / synapse / index / PokemonAdvancedExample / PokemonDemo.

**Остаётся (следующие сессии):** документация `docs/ru` для блоков BLL на этом домене
(`api-client` → `create-synapse-basic` → … → `pokemon-advanced`), `example-links.ts`
(ссылка `TREE` на папку), `yarn docs:generate`. В `structured-docs.json` ещё живут старые
упоминания `pokemon-class` — уйдут при перегенерации после правок `.md`.

### Сессия 2 (2026-06-27) — страница `api-client`

- **Решение (через вопрос пользователю):** страница `api-client` привязана **полностью к
  `pokemon-advanced/pokemon.api.ts`** — канонический `pokemonApiClient` (`getList`/`getDetails`,
  сырые типы ответа, мапперы `mapListResponse`/`mapDetailsResponse`, `initPokemonApi`,
  `PokemonApiEndpoints`). Раньше страница использовала расходящийся `pokemonApi`
  (`getPokemonList`/`getPokemonById`).
- `docs/ru/api-client.md` переписан целиком: добавлены секции «Создание (`pokemon.api.ts`)»
  и «Мапперы ответа», все примеры ниже используют единые имена эндпоинтов; добавлены связки
  на [Effects] и [Pokemon пример] (один ментальный модель).
- **Судьба `ApiClientExample.tsx`:** оставлен как **интерактивная песочница** (живые demo
  request/cache/abort/subscribe, которых нет в статичном модуле). `example-links.ts` для
  `api-client` теперь даёт 2 ссылки: «Канонический модуль» (`pokemon.api.ts`) +
  «Интерактивная песочница» (`ApiClientExample.tsx`). Сам `.tsx` не трогал.
- `yarn homepage:docs` прогнан (RU-секция `api-client` обновлена); typecheck homepage +
  examples — зелёные.
- **Хвост:** `docs/en/api-client.md` пока **не синхронизирован** (расходится по именам) —
  обновить в EN-проход. `pokemon-advanced.md` всё ещё описывает старую структуру
  `pokemon-class/` — поправится, когда дойдём до этой страницы.

### Сессия 3 (2026-06-27) — страница `create-synapse-basic`

- `docs/ru/create-synapse-basic.md` переписан на домен pokemon: реальные `pokemon.store.ts`
  (storage + initialState) и `pokemon.selectors.ts` (`PokemonSelectors`, репрезентативный
  субсет: simple + combine), затем **минимальная форма** `createSynapse` (только
  storage + selectors, с явной пометкой «dispatcher/effects — на следующих страницах»).
- Секции «Возвращаемое значение» / «React» / «Async-инициализация» приведены к актуальному
  API из `synapse.types.ts`: добавлены `state$` (есть всегда), `getSnapshot()`,
  `dispatcher/actions = undefined` в базовой форме. Запись без диспетчера показана через
  `storage.set/update` напрямую. Перекрёстные ссылки на dispatcher/effects/selectors/pokemon.
- **Судьба `CreateSynapseBasicExample.tsx` (Todo):** оставлен как «минимальная песочница»
  (runnable storage + selectors). `example-links.ts` для `create-synapse-basic` → 2 ссылки:
  «Сборка модуля» (`pokemon.synapse.ts`) + «Минимальная песочница» (`CreateSynapseBasicExample.tsx`).
  Сам `.tsx` не трогал.
- `yarn homepage:docs` + typecheck homepage — зелёные.
- **Хвост (EN):** `docs/en/create-synapse-basic.md` пока не синхронизирован (как и остальные
  EN-страницы этой цепочки) — отдельный EN-проход.

### Сессия 4 (2026-06-27) — страница `create-synapse-dispatcher`

- `docs/ru/create-synapse-dispatcher.md` переписан на домен pokemon: реальный
  `PokemonDispatcher` (`action` / `signal` / `apiActions` / `watcher`), сверен с
  `dispatcher.base.ts`. Показаны `this.action` (payload = return → `selectPokemon`/
  `toggleFavorite`/`setSearchQuery`), `this.watcher` (`watchFavoriteCount` через
  `store.dispatcher.watchers.X()`), кратко `signal`/`apiActions` со ссылкой на
  [dispatcher-detailed]. Сборка — storage + selectors + dispatcher (effects — следующая
  страница). Возвращаемое значение/React сверены с API.
- **Песочница `CreateSynapseDispatcherExample.tsx` (Cart):** оставлена как secondary-ссылка.
  `example-links.ts` → «Диспетчер модуля» (`pokemon.dispatcher.ts`) + «Песочница (Cart)».
- `yarn homepage:docs` + typecheck homepage — зелёные.
- **Хвост (EN):** `docs/en/create-synapse-dispatcher.md` не синхронизирован — EN-проход.

### Сессия 5 (2026-06-27) — страница `create-synapse-effects`

- `docs/ru/create-synapse-effects.md` переписан на домен pokemon: реальный `PokemonEffects`
  (`loadList`/`loadDetails` через `this.effect` + `ofType` + `withLatestFrom` +
  `validateMap`/`apiResult`/`fromRequest`), сверен с `pokemon.effects.ts` и сигнатурами в
  `reactive/effects/effects.module.ts`. Добавлена секция «Чтение состояния в эффекте»
  (`selectorObject`/`selectorMap` + подмешивание `this.settings$`). Гейты валидатора показаны
  на реальных условиях (`listStatus !== 'loading'`, `selectedId !== null`).
- Концептуальные блоки сохранены: `this.effect`/`ctx`, правило parameter-properties,
  `ofType`/`ofTypes`, словарь `validateMap` vs `mutationMap` (switchMap vs flatten/prepare,
  «почему не validateMap для записи»). `mutationMap`-пример оставлен абстрактным (create/remove
  post) — в pokemon-домене мутаций нет, это иллюстрация записи.
- Сборка показана реальная (`pokemon.synapse.ts`): async-пролог `initPokemonApi`, `dependencies`,
  эффекты получают `pokemonApiClient.getEndpoints()` + `toObservable(settingsStorage)`.
- **`example-links.ts`** для `create-synapse-effects` → 2 ссылки: «Эффекты модуля»
  (`pokemon.effects.ts`) + «Песочница (Search)» (`CreateSynapseEffectsExample.tsx`, debounce+switchMap).
- `yarn homepage:docs` прогнан; typecheck homepage + examples — зелёные.
- **Хвост (EN):** `docs/en/create-synapse-effects.md` не синхронизирован — отдельный EN-проход.

**Следующая страница по порядку:** `dispatcher-detailed` (полная поверхность Dispatcher:
apiActions-группа, signal, watcher, правило `ofType` на init-вызове).

### Сессия 6 (2026-06-27) — страница `dispatcher-detailed`

- `docs/ru/dispatcher-detailed.md` переписан на домен pokemon: вся поверхность `Dispatcher`
  показана на реальном `PokemonDispatcher`, сверена с `dispatcher.base.ts` (RESERVED_NAMES,
  сигнатуры `action`/`signal`/`apiActions`/`keyedApiActions`/`watcher`, `meta`/`memoize`).
  `this.action` — `selectPokemon` (return=payload), `applyPokemonDetails` (payload void),
  `toggleFavorite` (+meta), `setSearchQuery` (+memoize). `signal` — `loadMore`. `apiActions` —
  `loadList`/`loadDetails` + правило `ofType` ловит только init (+ссылка на Effects).
  `watcher` — `watchFavoriteCount` (meta + notifyAfterSubscribe) и `watchSelected` (shouldTrigger).
- `keyedApiActions` оставлен как **вариант** (домен pokemon его не использует) — гипотетический
  `detailsByIdRequest: Record<string, ApiRequestState>`, помечено как гипотетическое.
- Автономное использование показано на `new PokemonDispatcher(storage)`; раздел «Использование»
  сверен с API (`dispatch.X.actionType`/`.meta`, `watchers.X()`, `actions.subscribe`, `destroy`).
- **`example-links.ts`** для `dispatcher-detailed` → 2 ссылки: «Диспетчер модуля»
  (`pokemon.dispatcher.ts`) + «Песочница (Counter)» (`DispatcherDetailedExample.tsx`).
- `yarn homepage:docs` прогнан; typecheck homepage + examples — зелёные.
- **Хвост (EN):** `docs/en/dispatcher-detailed.md` не синхронизирован — EN-проход.

**Следующая страница по порядку:** `dependencies` (createSynapse: async-фабрика,
`dependencies`/`dependencyTimeout`, связи между модулями — на pokemon + settingsStorage).

### Сессия 7 (2026-06-27) — страница `dependencies`

- `docs/ru/dependencies.md` переписан на домен pokemon: реальный случай — pokemon зависит от
  `settingsStorage` (сырое `IStorage`, не synapse-handle). Показаны `pokemon.settings.ts` +
  `pokemon.synapse.ts` (`dependencies: [settingsStorage]`, `dependencyTimeout: 10000`, async-пролог
  `initPokemonApi`, `toObservable(settingsStorage)` в эффекты). Сверено с `synapse.types.ts`
  (`SynapseConfig`), `types.ts` (`DependencyInput = IStorage | SynapseDependency | PromiseLike`),
  `waitForDependencies.ts` (default 30000, текст ошибки таймаута).
- Уточнено, чем может быть зависимость (сырое хранилище / другой synapse-handle / PromiseLike).
- 4 паттерна общения сохранены; явно помечено, что pokemon использует **паттерн 1**
  (`toObservable`), а паттерны 2–4 (cross-store селекторы, `externalDispatchers`, медиатор)
  показаны на Auth→Settings из песочницы.
- **`example-links.ts`** для `dependencies` → 2 ссылки: «Сборка модуля» (`pokemon.synapse.ts`) +
  «Песочница (Auth → Settings)» (`DependenciesExample.tsx`).
- `yarn homepage:docs` прогнан; typecheck homepage + examples — зелёные.
- **Хвост (EN):** `docs/en/dependencies.md` не синхронизирован — EN-проход.

**Следующая страница по порядку:** `synapse-ctx` (React: createSynapseCtx — как отдать
`pokemonSynapse` в компоненты, Provider/хуки/SSR).

### Сессия 8 (2026-06-27) — страница `synapse-ctx`

- `docs/ru/synapse-ctx.md` переписан на домен pokemon: `createSynapseCtx(pokemonSynapse)`,
  хуки `useSynapseSelectors`/`useSynapseActions` на реальных селекторах/экшенах
  (`filteredList`/`isListLoading`/`searchQuery`/`favoriteCount`; `selectPokemon`/`setSearchQuery`/
  `loadList`). Поверхность сверена с `react/utils/createSynapseCtx.tsx` (хуки
  `useSynapseStorage/Selectors/Actions/State$`, `contextSynapse`, `dehydrate`, `cleanupSynapse`;
  опции `loadingComponent`/`ssr`; проп `dehydratedState`).
- **Важно:** сам модуль pokemon потребляет synapse не через ctx, а ручным `await` + проп
  (`PokemonAdvancedExample.tsx` → `pokemonSynapse.then(setStore)`), это случай `await-synapse`.
  В тексте добавлена ссылка-разводка: ctx (провайдер) vs await-synapse (ручной await), чтобы не
  вводить читателя в заблуждение.
- SSR-секция сохранена целиком (точна), домены в коде переведены на pokemon (`PokemonCtx`,
  `dehydrate({ initialState: { pokemonList } })`, `dehydrateModule(pokemonSynapse, ...)`); помечено,
  что запускаемый SSR-пример — на домене Posts.
- **`example-links.ts`** для `synapse-ctx` не трогал (уже 2 ссылки: Базовый/Settings + SSR/Posts).
- `yarn homepage:docs` прогнан; typecheck homepage + examples — зелёные.
- **Хвост (EN):** `docs/en/synapse-ctx.md` не синхронизирован — EN-проход.

**Следующая страница по порядку:** `await-synapse` (React/SSR: createSynapseAwaiter — ручной подъём
`pokemonSynapse`, как в `PokemonAdvancedExample.tsx`).

### Сессия 9 (2026-06-27) — страница `await-synapse`

- **Решение (через вопрос пользователю):** `PokemonAdvancedExample.tsx` **отрефакторен** с ручного
  `useState`+`useEffect`+`pokemonSynapse.then()` на `awaitSynapse` (HOC `withSynapseReady`).
  Теперь pokemon-модуль идиоматично использует именно ту утилиту, которую документирует страница,
  и стал её **каноническим примером**. `pokemonAwaiter` создаётся на уровне модуля,
  `PokemonContent` берёт готовый стор через `getStoreIfReady()!` и грузит список в `useEffect`,
  экспорт — `pokemonAwaiter.withSynapseReady(PokemonContent)`. Это закрывает заметку из synapse-ctx
  («await-synapse — её и использует демо в модуле»), теперь буквально верную.
- `docs/ru/await-synapse.md` переписан на домен pokemon: `awaitSynapse(pokemonSynapse, …)`, HOC
  показан ровно как в демо-модуле, `useSynapseReady` на `store.storage.getStateSync().pokemonList`,
  программный API на pokemon-намерениях. Сверено с `react/utils/awaitSynapse.tsx` и
  `utils/createSynapseAwaiter.ts` (поверхность методов, дефолтные loading/error). Подчёркнута
  связка: создавать awaiter на уровне модуля; ctx (провайдер) vs await (ручной). Ссылки на
  `synapse-awaiter` (vanilla + SSR sync-fast-path) и `pokemon-advanced` (итог).
- **`example-links.ts`** для `await-synapse` → 2 ссылки: «Канонический модуль»
  (`pokemon-advanced/PokemonAdvancedExample.tsx`) + «Песочница (Timer)» (`AwaitSynapseExample.tsx`).
- `yarn homepage:docs` прогнан; typecheck examples + homepage (`type-check`) — зелёные.
- **Хвост (EN):** `docs/en/await-synapse.md` не синхронизирован — EN-проход.

**Следующая страница по порядку:** `synapse-awaiter` (Утилиты: фреймворк-независимый
`createSynapseAwaiter`, SSR sync-fast-path), затем `event-bus` и итоговый `pokemon-advanced`.

### Сессия 10 (2026-06-27) — страница `synapse-awaiter`

- `docs/ru/synapse-awaiter.md` переписан на домен pokemon: `createSynapseAwaiter(pokemonSynapse)`,
  программная поверхность на pokemon-намерениях (`waitForReady` → `loadList`, `onReady`/`onError`
  на `pokemonList.length`). Сверено с `utils/createSynapseAwaiter.ts` и SSR-тестом
  `__tests__/createSynapseAwaiter.ssr.test.ts`.
- **Позиционирование:** страница подаётся как **примитив под `awaitSynapse`** — явно сказано, что
  React-обёртка проксирует отсюда всю поверхность методов; убрано дублирование (HOC/хук остаются
  на [await-synapse]). Уникальное для этой страницы вынесено в фокус: фреймворк-независимость
  (Node/RN/воркеры) и **SSR sync-fast-path** (`await pokemonSynapse.ready()` → awaiter резолвится
  синхронно, `getStoreIfReady()` готов на первом `renderToString`). Полный SSR-поток (dehydrate→
  hydrate) — ссылкой на `synapse-ctx`.
- Версия в заметке про sync-fast-path **снята** (была `5.0.1`, в пакете уже `5.0.3`) — описано как
  поведение, без пина версии. Ручной React-вариант через подписки сохранён как иллюстрация «без
  обёртки», с разводкой: в реальном React — `awaitSynapse`, vanilla-awaiter — где React нет / нужен
  fast-path.
- **`example-links.ts`** для `synapse-awaiter` не трогал: pokemon-модуль использует React-обёртку
  `awaitSynapse`, а не vanilla-awaiter, поэтому канонического pokemon-файла тут нет — остаётся одна
  ссылка на песочницу `SynapseAwaiterExample.tsx` (как у `synapse-ctx`). `.tsx` не трогал.
- `yarn homepage:docs` прогнан; homepage `type-check` — зелёный (код-примеров не менял).
- **Хвост (EN):** `docs/en/synapse-awaiter.md` не синхронизирован — EN-проход.

**Следующая страница по порядку:** `event-bus` (Утилиты), затем итоговый `pokemon-advanced` (рецепт,
собирающий весь модуль воедино).

### Сессия 11 (2026-06-27) — страница `event-bus`

- `docs/ru/event-bus.md` переписан на домен pokemon **где уместно**: API-референс шины (publish/
  subscribe/getEventHistory/getActiveSubscriptions/clearEvents/destroy) сверен с
  `utils/createEventBus.ts` и приведён к актуальной форме возврата из `synapse.types.ts`
  (`actions === dispatcher` — один инстанс `EventBusDispatcher`; `selectors: undefined`;
  `state$` есть всегда; `destroy(): Promise<void>`). Примеры payload'ов переведены на pokemon-события
  (`POKEMON_SELECTED`/`POKEMON_*`/`FAVORITE_TOGGLED`).
- Позиционирование: шина подана как развязка между модулями на нашем домене — pokemon публикует
  доменные события, `analytics`/`toaster` слушают, не импортируя синапс. Добавлены пояснения о
  внутренней механике (подписка на срез `state.events`, `handleCallbackError`, autoCleanup-подрезка
  по `maxEvents`, teardown в `destroy`). Добавлена секция «шина как externalDispatcher» со ссылкой на
  «вариант коммуникации 3» из [dependencies]. Блок «См. также» → dependencies / create-synapse-basic /
  pokemon-advanced.
- **Важно:** эталонный pokemon-модуль шину НЕ зашивает (event-bus — опциональная интеграция поверх),
  поэтому канонического pokemon-файла у страницы нет. `example-links.ts` для `event-bus` **не трогал**
  — остаётся одна ссылка на песочницу `EventBusExample.tsx` (как у `synapse-awaiter`). `.tsx` не трогал.
- `yarn homepage:docs` прогнан (RU `event-bus` обновлён); homepage `type-check` — зелёный
  (код-примеров не менял).
- **Хвост (EN):** `docs/en/event-bus.md` не синхронизирован — отдельный EN-проход.

**Следующая страница по порядку:** итоговый `pokemon-advanced` (рецепт, собирающий весь модуль
воедино; всё ещё описывает старую структуру `pokemon-class/` — переписать на единый модуль).

### Сессия 12 (2026-06-27) — страница `pokemon-advanced` (итог цепочки)

- `docs/ru/pokemon-advanced.md` переписан целиком как **капстоун-рецепт**: убрана старая структура
  `pokemon-class/` + `pokemon-advanced/`, теперь один модуль `pokemon-advanced/` с таблицей
  «файл = ответственность» (сверено с реальным составом папки). Storage-имя поправлено на
  `pokemon-advanced` (было `pokemon-class`), добавлены пропавшие экшены (`applyPokemonDetails`/
  `setSearchQuery`/`toggleFavorite`), `readonly`-поля, реальный React-слой на `awaitSynapse`
  (HOC `withSynapseReady`, `getStoreIfReady`) + `PokemonDemo` (`useSelector`/`store.actions`/
  `watchers.watchFavoriteCount`).
- Добавлены: ASCII-диаграмма **потока данных** (UI → dispatcher → effects → api/мапперы →
  applyX → storage → selectors → UI), сохранён «протокол запроса с 5 состояниями».
- Каждый раздел (типы/api/settings/selectors/dispatcher/effects/synapse/React) даёт стрелку
  `→ детально:` на свою страницу. В конце — таблица **«возможность → страница»**, замыкающая всю
  цепочку (api-client … event-bus). Все код-выдержки сверены с файлами модуля, длинные тела
  свёрнуты в `/* … */` со ссылкой на детальную страницу.
- `example-links.ts` для `pokemon-advanced` — уже `TREE` на папку модуля, **не трогал**.
- `yarn homepage:docs` прогнан (RU `pokemon-advanced`: 13 секций / 11 код-блоков); homepage
  `type-check` — зелёный (код-примеров не менял).
- **Хвост (EN):** `docs/en/pokemon-advanced.md` не синхронизирован (11 секций / 10 блоков, старая
  структура) — уходит в общий EN-проход вместе со всей цепочкой.

**Статус цепочки RU:** все страницы блоков BLL (`api-client` → `create-synapse-basic` →
`create-synapse-dispatcher` → `create-synapse-effects` → `dispatcher-detailed` → `dependencies` →
`synapse-ctx` → `await-synapse` → `synapse-awaiter` → `event-bus` → `pokemon-advanced`) переписаны
на pokemon-домен и сверены с `src`. **Осталось по этапу:** общий EN-проход (все `docs/en/*` из
цепочки расходятся по именам/структуре).

### Сессия 13 (2026-06-27) — EN-проход по цепочке BLL

- **Контекст:** EN-проход был начат в этой же сессии (~16:00), но прерван (выключился MacBook).
  До прерывания успели синхронизировать на pokemon-домен **5 страниц** `docs/en/`:
  `api-client`, `create-synapse-basic`, `create-synapse-dispatcher`, `event-bus`, `pokemon-advanced`.
- **Доделано в этой сессии (6 оставшихся `docs/en/*`):** `create-synapse-effects`,
  `dispatcher-detailed`, `dependencies`, `synapse-ctx`, `await-synapse`, `synapse-awaiter` —
  переписаны как зеркало уже-канонических RU-страниц на pokemon-домен. Сохранён EN-заголовок
  `> [Back to Main](../../README.md)` (конвенция EN-страниц, не дублируем RU-шапку с GitHub-ссылками).
  Английская концептуальная проза, где была хорошей, переиспользована; примеры переведены на
  pokemon (`PokemonEffects`/`loadList`/`loadDetails`, `PokemonDispatcher`, `settingsStorage`,
  `pokemonSynapse`/`pokemonAwaiter`, SSR-секции на pokemon + пометка «запускаемый пример — Posts»).
  `synapse-awaiter` переструктурирован под новую RU-форму (примитив под `awaitSynapse`,
  фокус на фреймворк-независимости + SSR sync-fast-path; пин версии `5.0.1` снят).
- `.tsx`/`example-links.ts` **не трогал** — EN-проход чисто текстовый. `yarn homepage:docs`
  прогнан (EN: 29 docs / 199 секций / 161 блок); homepage `type-check` — зелёный.
- **Статус этапа:** EN-цепочка BLL синхронизирована с RU полностью (11/11 страниц). Хвостов «EN не
  синхронизирован» из сессий 2–12 больше нет.
