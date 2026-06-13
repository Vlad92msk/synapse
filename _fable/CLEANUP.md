# CLEANUP: аудит и удаление legacy после реализации

> Отдельная задача после завершения этапов 0-6 (`_fable/ROADMAP.md`) и миграции sn_client.
> Цель: не держать в библиотеке ничего лишнего ради обратной совместимости.

## Процесс (три шага, не одним махом)

1. **Этап 6 (релиз minor)**: всё legacy помечается `@deprecated` в JSDoc с указанием замены
   (`@deprecated используй createSynapse(factory) — см. MIGRATION.md`). Ничего не удаляется.
   IDE начинает зачёркивать старые вызовы у потребителей — мягкая навигация к новому API.
2. **Миграция sn_client** (все 8 синапсов) на новый API. Это одновременно боевая валидация:
   если какой-то модуль не мигрируется красиво — значит в новом API дыра, чиним до удаления legacy.
3. **Релиз major (v5.0.0)**: удаление всего из списка ниже + повторный аудит
   («поиск лишнего» — см. чеклист в конце). TASK.md явно допускает semver major.

## Кандидаты на удаление (для major)

Решение по каждому принимается после миграции sn_client — колонка «условие».

| # | Что | Где | Чем заменено | Условие удаления |
|---|---|---|---|---|
| 1 | `createSynapse(config)` — все перегрузки с объектом-конфигом + реализация старого пайплайна | `utils/createSynapse/createSynapse.ts` (~160 строк) | `createSynapse(factory)` | sn_client мигрирован |
| 2 | Типы старого конфига: `CreateSynapseConfig*`, `SynapseStore*`, `ExtractDispatchType`, `AnySynapseStore` | `utils/createSynapse/types.ts` (~130 строк) | `SynapseConfig`/`Synapse`/`SynapseModule` | вместе с №1 |
| 3 | `validateSynapseConfig` — почти весь (дублирует то, что теперь гарантирует TS) | `utils/createSynapse/validate.ts` (89 строк) | instanceof-чеки в новом пайплайне | вместе с №1 |
| 4 | `createSynapseAwaiter` | `utils/createSynapseAwaiter.ts` (~100 строк) | `SynapseModule`-handle (PromiseLike + ready/isReady) | sn_client не использует напрямую → проверить grep'ом |
| 5 | `createDispatcher` (фабрика с объектом-реестром) + цикл материализации рецептов | `dispatcher.module.ts:574-651` (~80 строк) | базовый класс `Dispatcher` | sn_client мигрирован |
| 6 | `defineAction` / `defineWatcher` + типы `ActionRecipe`/`WatcherRecipe` | `standalone.ts:18-135` | `this.action` / `this.watcher` | вместе с №5 (рецепты нужны только createDispatcher) |
| 7 | `createApiActions` / `createKeyedApiActions` | `standalone.ts:201-297` | `this.apiActions` / `this.keyedApiActions` | вместе с №5. **НЕ удалять** `ApiStatus`/`ApiRequestState` — это публичные типы стейта |
| 8 | Старая сигнатура `createSynapseCtx(promise)` (жадная) | `react/` | сигнатура с handle | sn_client мигрирован |
| 9 | Типы `ISelectorCreator` / `SelectorCreatorFunction` (контракт createSelectorsFn) | `selector.interface.ts:77-106` | конструкторы class-селекторов | вместе с №1 |
| 10 | Сужение generic'ов `Effect`/`EffectsModule`: слоты `TServices`/`TConfig` (services переехали в конструкторы классов) | `effects.module.ts:25-54, 342-394` | `Effects`-класс | смелее остальных — ломает сигнатуру движка; делать последним, отдельным решением |

Итого удаляемого: **~700-800 строк** — сопоставимо с добавляемым в этапах 1-5.
Библиотека после major по объёму останется примерно той же, но с одним способом делать каждую вещь.

## Что НЕ трогаем (ядро, на котором стоит новый API)

`MemoryStorage`/`LocalStorage`/`IndexedDB` + `IStorage`, `ApiClient`, `SelectorModule`,
`EffectsModule` (кроме №10), `DispatcherCore`, операторы (`ofType`, `ofTypes`, `validateMap`,
`apiResult`, `fromRequest`, `selectorObject`, `combineEffects`), `useSelector`,
`toObservable`, `waitForDependencies`, middleware-механизм.

## Сопутствующая чистка в sn_client (userland, не библиотека)

После миграции в приложении отмирают собственные обёртки:
- `src/store/createFeatureSynapse.ts` → встроено в `createSynapse(factory)`
- `src/store/useSynapse.ts`, `useSynapseSelector.ts`, `useSynapseActions.ts`,
  `useKeyedSliceSelector.ts` → проверить, закрывают ли их `useSelector` + keyed-селекторы +
  `useObservable`; что не закрывают — кандидат на фичу библиотеки, а не на сохранение обёртки
- ручной lazy-singleton в `core.synapse.ts:24-29`

## Повторный аудит «поиск лишнего» (чеклист к major)

- [ ] grep по `@deprecated` — всё помеченное удалено
- [ ] grep экспортов: каждый публичный экспорт либо используется в sn_client/examples/доках, либо удаляется
- [ ] `packages/examples` — все примеры переписаны на новый API (старые примеры = реклама старого пути)
- [ ] README/доки — ни одного упоминания удалённых API
- [ ] мёртвый код после удалений: `validate.ts`-остатки, неиспользуемые типы, `_utils`-хелперы без потребителей (knip или ts-prune прогон)
- [ ] `exports` в package.json: убрать/добавить entry points по факту (`/utils` может опустеть; решение по `/bl` — ROADMAP этап 6)
- [ ] bundle-size до/после (rslib output) — зафиксировать в release notes
- [ ] финальный прогон тестов: кейсы этапа 0, привязанные к удалённым API, переносятся на новые эквиваленты, а не удаляются молча (страховка поведения остаётся)

## Риск

Библиотека опубликована в npm (`synapse-storage`, public). Если есть внешние потребители
помимо sn_client — major с удалениями им потребует миграции; смягчение: deprecated-период
в minor-релизе + MIGRATION.md. Известный потребитель один (sn_client), так что цикл
deprecate → migrate → delete можно пройти быстро.
