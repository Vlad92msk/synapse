# ROADMAP: реализация class-based BL-слоя

> Требования — `_fable/PROPOSAL.md` (декларация согласована 2026-06-12).
> Здесь — этапы разработки, тест-кейсы и критерии готовности каждого этапа.

## Стратегия тестирования

**Unit + интеграционные тесты, без e2e.** Библиотека не имеет собственного UI-приложения —
её контракт это публичный API, который целиком проверяется на уровне кода:

| Слой | Вид тестов | Окружение |
|---|---|---|
| Storage (Memory/Local/IndexedDB), SelectorModule, Dispatcher, EffectsModule | unit | node (+ jsdom для localStorage, fake-indexeddb для IndexedDB) |
| Базовые классы (`Dispatcher`/`Selectors`/`Effects`) | unit | node |
| Сборщик `createSynapse(factory)`, cross-synapse связи | интеграционные (несколько модулей вместе) | node |
| React-слой (`useSelector`, `createSynapseCtx`, `useObservable`) | компонентные | jsdom + @testing-library/react |
| RxJS-операторы и эффекты с таймингами (debounce, retry) | unit с `TestScheduler` | node (TestScheduler входит в rxjs/testing, доп. пакетов не нужно) |

**Стек**: Vitest (ESM-нативный — пакет ESM-only, Jest потребовал бы возни с трансформацией),
`@testing-library/react` (React 19), `jsdom`, `fake-indexeddb`, `@vitest/coverage-v8`.

Раскладка файлов: тесты рядом с кодом — `src/**/__tests__/*.test.ts(x)`.
Конфиг: `packages/synapse/vitest.config.ts` (две среды через `environmentMatchGlobs`:
node по умолчанию, jsdom для `react/` и `localStorage`-тестов).

**Принцип**: каждый этап начинается с тестов на затрагиваемое существующее поведение
(если их ещё нет) и заканчивается зелёным прогоном всех предыдущих этапов.

---

## Этап 0 — Тестовая инфраструктура + страховочные тесты ядра

Ядро сейчас не покрыто вообще. До любых изменений фиксируем текущее поведение тестами —
это страховка от незаметных поломок на следующих этапах.

**Задачи**
1. `vitest.config.ts`, скрипты `test`/`test:watch`/`test:coverage` (уже добавлены в package.json).
2. Тесты на существующее ядро (без изменений кода библиотеки).

**Тест-кейсы**

`core/storage` (Memory / Local / IndexedDB — общий контракт IStorage, прогон по трём реализациям):
- [ ] initialize() → waitForReady() резолвится; initStatus отражает готовность
- [ ] getState/getStateSync возвращают initialState до изменений
- [ ] update(fn) иммутабелен: старая ссылка стейта не мутирует; changedPaths корректны
- [ ] subscribe(selector, cb) дёргается только при изменении выбранного среза
- [ ] subscribeToAll: уведомление на любое изменение; отписка работает
- [ ] два update в одном микротаске → подписчик получает консистентный финальный снапшот
- [ ] destroy(): подписки сняты, повторные вызовы безопасны
- [ ] LocalStorage: персистентность между «сессиями» (новый инстанс с тем же name читает данные)
- [ ] IndexedDB (fake-indexeddb): асинхронная инициализация, персистентность, параллельные update

`core/selector` (SelectorModule):
- [ ] простой селектор: мемоизация по ссылке стейта; пересчёт только при изменении затронутых top-level ключей (changedPaths-фильтрация)
- [ ] результат, равный предыдущему (equals), сохраняет старую ссылку — подписчики не уведомляются
- [ ] combined: reselect-мемоизация по ссылкам аргументов; microtask-батчинг залпа уведомлений
- [ ] combined поверх SelectorAPI из ДРУГОГО SelectorModule (cross-store) — реактивность работает
- [ ] именованный селектор кэшируется (повторный createSelector с тем же name → тот же API)
- [ ] subscribe шлёт текущее значение синхронно при подписке
- [ ] destroy() модуля: все подписки на storage сняты
- [ ] custom equals / deepEquals

`reactive/dispatcher` (текущие createDispatcher / defineAction / createApiActions):
- [ ] createAction: payload экшена = возвращаемое значение handler'а; actionType = `[storeName]key`
- [ ] deferred type assignment: имя из ключа объекта; dispatch до назначения типа бросает понятную ошибку
- [ ] action$ эмитит один раз на dispatch, после middleware
- [ ] middleware: порядок композиции, доступ к getState/storage
- [ ] memoize-опция: повторный вызов с теми же params отдаёт кэш
- [ ] watcher: ленивая подписка, share(), shouldTrigger, notifyAfterSubscribe, эмит в общий action$
- [ ] createApiActions: init несёт payload и сбрасывает статус в idle; loading/success/failure/reset пишут ApiRequestState по пути accessor'а
- [ ] createKeyedApiActions: статусы по ключу, failure({key, error})
- [ ] destroy(): action$ завершается

`reactive/effects` (EffectsModule):
- [ ] эффект вызывается один раз при start(), получает (action$, state$, context)
- [ ] экшены основного и внешних диспетчеров мультиплексируются в один action$
- [ ] state$: текущее значение + эмит на каждое изменение storage
- [ ] externalStates: IStorage нормализуется в Observable (shareReplay)
- [ ] Observable эффекта эмитит функцию → она вызывается
- [ ] непойманная ошибка: эффект умирает, остальные продолжают работать (текущее поведение — фиксируем как baseline для этапа 2)
- [ ] stop()/start(): пересоздание action$, эффекты переподписываются, старые подписки сняты
- [ ] горячий add() на запущенном модуле
- [ ] операторы: ofType/ofTypes (фильтрация по actionType), validateMap (validator/skipAction/loading/error/apiCall), apiResult, selectorObject, fromRequest (abort при отписке)

`utils/createSynapse` (текущая форма с конфигом):
- [ ] полный жизненный цикл: dependencies → storage.initialize → selectors → dispatcher → effects.start
- [ ] waitForDependencies: ожидание Promise<Synapse>, raw storage, {storage}; таймаут с понятной ошибкой
- [ ] результат: storage/selectors/actions/dispatcher/state$/destroy
- [ ] destroy() вызывает cleanup (текущий FIFO-порядок фиксируем как baseline — изменится в этапе 4)

`react` (текущие хуки):
- [ ] useSelector: ререндер только при изменении значения селектора; withLoading
- [ ] createSynapseCtx: Provider гейтит детей до готовности, хуки отдают selectors/actions

**DoD**: все кейсы зелёные; coverage ядра ≥ 70% строк; CI-скрипт `yarn test` проходит из корня.

---

## Этап 1 — `Dispatcher<TState>` (базовый класс)

PROPOSAL §1.1–1.3, §2.1.

**Задачи**
1. Переименовать текущий `Dispatcher` → `DispatcherCore`, сохранить экспорт-алиас (BC).
2. Вынести `resolvePath`/`setByPath` из standalone.ts в общий внутренний модуль.
3. Новый `dispatcher.base.ts`: abstract `Dispatcher<TState>` — конструктор `(storage, options?)`,
   фабрики `this.action` / `this.signal` / `this.apiActions` (вызываемая группа) /
   `this.keyedApiActions` / `this.watcher`, финализация (скан полей + `_assignType`),
   ленивая само-финализация, делегаты `use`/`destroy`, `action$`, реестры `dispatch`/`watchers`.

**Тест-кейсы**
- [ ] поле `this.action((store, p) => ...)` после финализации: actionType = `[storeName]имяПоля`, dispatch работает, payload = результат handler'а
- [ ] `this.signal<P>(desc)`: payload = аргумент, description в meta
- [ ] `this.apiActions`: группа вызываемая — `d.loadPosts(params)` диспатчит init (idle + payload насквозь); `.loading/.success/.failure/.reset` пишут статусы по пути accessor'а; actionTypes `loadPosts` / `loadPosts:loading` / ...
- [ ] `ofType(d.loadPosts)` ловит ТОЛЬКО init; `ofType(d.loadPosts.success)` — только success
- [ ] `this.keyedApiActions`: статус по ключу, изоляция ключей
- [ ] `this.watcher`: селектор-вотчер эмитит в action$, shouldTrigger/notifyAfterSubscribe
- [ ] финализация сборщиком: имена назначены до старта эффектов
- [ ] ленивая само-финализация: первый dispatch без сборщика финализирует и проходит
- [ ] dispatch строго до любой финализации невозможен только в окне конструктора — понятная ошибка с подсказкой
- [ ] dev-проверки: поле-алиас (`readonly x = this.y`) → ошибка с именами обоих полей; коллизия с зарезервированным именем (`dispatch`, `action$`, ...) → ошибка
- [ ] `options.type` переопределяет имя поля
- [ ] middleware через конструктор и через `use()`; memoize-опция
- [ ] наследование: `class Base extends Dispatcher` → `class Child extends Base` — поля обоих уровней финализируются
- [ ] совместимость: инстанс класса работает как `createDispatcherFn`-результат внутри СТАРОГО `createSynapse(config)` (`'dispatch' in d`, `d.actions` для EffectsModule)
- [ ] регресс: этап 0 зелёный (createDispatcher поверх DispatcherCore не сломан)

**DoD**: кейсы зелёные + строгая типизация без any в пользовательском коде (компилируемые type-тесты через `expectTypeOf` Vitest).

---

## Этап 2 — `Effects<TState, TDispatcher, TExternalDispatchers?>`

PROPOSAL §1.4, §2.3 + опция ресабскрайба (§7 п.8).

**Задачи**
1. `effects.base.ts`: abstract `Effects`, `this.effect(fn)` (реестр + Symbol-маркер),
   `getEffects()`, опциональный `onDestroy()`.
2. Dev-проверка «поле-функция с сигнатурой эффекта без обёртки this.effect» → warning.
3. `resubscribeOnError` в EffectsModule: `this.effect(fn, { resubscribeOnError: true })` —
   retry с лимитом/бэкоффом вместо терминального catchError.

**Тест-кейсы**
- [ ] `this.effect(fn)`: fn НЕ вызывается при конструировании; вызывается один раз при start() с (action$, state$, ctx)
- [ ] ctx.dispatcher — инстанс class-диспетчера: `ofType(d.loadPosts)` + `d.applyPosts(...)` из эффекта
- [ ] сервисы из конструктора доступны в замыкании (`this.api`) в момент исполнения
- [ ] внешний стор как конструкторный Observable (`core$`) — эффект реагирует на чужой стейт
- [ ] ctx.external: экшен внешнего диспетчера ловится ofType (влит в action$)
- [ ] эффект, эмитящий функцию → функция вызывается
- [ ] ошибка в одном эффекте не убивает остальные; с `resubscribeOnError` поток переподписывается (лимит ретраев соблюдается; TestScheduler)
- [ ] stop()/start() синапса: эффекты класса переподписываются корректно
- [ ] `onDestroy()` вызывается при destroy синапса (до уничтожения storage)
- [ ] смешанный массив `effects: [инстанс, legacyFn]` — оба работают
- [ ] dev-warning «забыл this.effect»
- [ ] юнит-тестируемость эффекта в изоляции: `new PostsEffects(mock).loadPosts(of(action), of(state), fakeCtx)`

**DoD**: кейсы зелёные; этапы 0–1 зелёные.

---

## Этап 3 — `Selectors<TState>` (+ keyed) и `SelectorAPI.$`

PROPOSAL §1.5, §2.2, §8.1 (Observable-часть), §8.2.

**Задачи**
1. `selectors.base.ts`: abstract `Selectors` (eager; принимает IStorage или ISelectorModule;
   владение модулем → destroy), `this.select`, `this.combine`, `this.keyed`.
2. `removeSelector(id)` в SelectorModule (точечная очистка — для keyed-кэша и destroy класса на общем модуле).
3. `SelectorAPI.$: Observable<T>`.

**Тест-кейсы**
- [x] поля — настоящие SelectorAPI сразу после конструирования; select/selectSync/subscribe работают
- [x] `this.combine([this.x], fn)`: порядок полей — обращение к необъявленному полю не компилируется (type-тест)
- [x] cross-store: `this.combine([this.core.profile], ...)` пересчитывается при изменении чужого стора
- [x] private-поля (промежуточные селекторы) не видны снаружи, но работают как deps
- [x] `this.keyed(fn)`: один SelectorAPI на ключ (кэш); обновление ключа A не уведомляет подписчиков ключа B; destroy класса чистит кэш
- [x] `selector.$`: эмит текущего значения при подписке + при каждом реальном изменении; совместим с pipe(debounceTime)
- [x] destroy(): свой модуль уничтожается; чужой (переданный) — нет
- [x] removeSelector: точечная отписка, остальные селекторы модуля живы
- [x] совместимость: инстанс класса как результат `createSelectorsFn` в старом createSynapse(config)

**DoD**: кейсы зелёные; этапы 0–2 зелёные. ✅ (120 тестов, build + d.ts зелёные)

> **Замечание по реализации.** Eager cross-store (`readonly x = this.combine([this.core.y], ...)`,
> где `core` — параметр конструктора подкласса) требует, чтобы инициализаторы полей выполнялись
> ПОСЛЕ присваивания parameter properties. При `target: ES2022` это даёт нативная семантика class
> fields только при `useDefineForClassFields: false` — флаг выставлен в `tsconfig.json`. Потребители
> класса-наследника должны иметь тот же флаг (либо инициализировать cross-store селекторы в теле
> конструктора). Зафиксировать в миграционном гайде (этап 6).
>
> `keyed`-селекторы по умолчанию используют `deepEquals`: соседние ключи живут под общим родителем,
> а storage при обновлении пере-клонирует всю ветку (`createLazyClone`+`structuredClone`) — ссылка
> соседнего ключа не сохраняется, поэтому `===` не дал бы изоляцию «A не будит B».

---

## Этап 4 — Сборщик: перегрузка `createSynapse(factory)` + `SynapseModule`

PROPOSAL §1.6, §2.4, §7 п.1/п.9.

**Задачи**
1. Перегрузка `createSynapse`: `typeof arg === 'function'` → новый пайплайн, объект → старый (без изменений).
2. `SynapseModule`-handle: PromiseLike, `ready()` (ленивый мемоизированный запуск),
   `isReady()`, `destroy()` со сбросом мемоизации (пересоздаваемость).
3. Пайплайн: validate → waitForDependencies → storage.initialize → финализация диспетчера →
   `state$` всегда → EffectsModule(+externalDispatchers) → LIFO-cleanup → fail-fast.

**Тест-кейсы**
- [ ] перегрузка: `createSynapse({...})` (старая) и `createSynapse(async () => ({...}))` (новая) сосуществуют; типы выводятся в обеих
- [ ] ленивость: фабрика НЕ исполняется до первого ready()/await; исполняется ровно один раз при параллельных await
- [ ] результат: storage / state$ (ВСЕГДА, даже без эффектов) / dispatcher (полный тип) / actions (=dispatcher) / selectors / destroy
- [ ] частичные конфиги: storage-only; storage+selectors; storage+dispatcher (без эффектов)
- [ ] dependencies: новый handle в старом конфиге и старый Promise<Synapse> в новом — обе стороны
- [ ] externalDispatchers: чужие экшены доходят до эффектов; тип сверяется с generic'ом Effects (type-тест)
- [ ] fail-fast: ошибка в фабрике / initialize / эффектах → rejection ready(); никакой тихой частичной инициализации
- [ ] LIFO-teardown: порядок stop effects → onDestroy → destroy dispatcher → selectors → storage (проверка фактического порядка через шпионов)
- [ ] пересоздание: destroy() → ready() заново исполняет фабрику; старые подписки мертвы, новые работают
- [ ] интеграционный сценарий «posts+core» (мини-копия реального: core-синапс, posts с externalSelectors-конструктором, эффект на core.state$, реакция на чужой экшен)
- [ ] интеграционный сценарий «шина» (вариант 4 из PROPOSAL §3): два модуля общаются через event-bus-синапс

**DoD**: кейсы зелёные; этапы 0–3 зелёные; компилируемый пример «pokemon» в новом стиле в `packages/examples` (можно рядом со старым).

---

## Этап 5 — React-слой

PROPOSAL §2.5, §8.1 (хуки).

**Задачи**
1. `createSynapseCtx` принимает handle (вторая сигнатура): ленивый запуск при первом монтировании Provider'а.
2. `useObservable(source$ | factory, initialValue, deps?)`, `useSubscription(factory, deps)`.

**Тест-кейсы** (jsdom + @testing-library/react)
- [x] createSynapseCtx(handle): фабрика не вызывается на импорте; вызывается при mount; loadingComponent до готовности; дети получают selectors/actions
- [x] два Provider'а одного handle → один запуск фабрики (синглтон)
- [x] unmount Provider'а не убивает синглтон (поведение фиксируем явно)
- [x] useSelector поверх class-селекторов: ререндер только при изменении значения
- [x] useObservable: initialValue до первого эмита; debounceTime-цепочка (fake timers); смена deps пересоздаёт цепочку; отписка на unmount
- [x] useSubscription: side-effect вызывается, отписка на unmount
- [x] StrictMode: двойной mount не дублирует подписки/запуски

**DoD**: кейсы зелёные; этапы 0–4 зелёные. ✅ (152 теста, tsc + build + d.ts зелёные)

> **Замечание по реализации.** `createSynapseCtx` принимает handle через ту же
> `createSynapseAwaiter` (handle — `PromiseLike`, adopt'ится через `Promise.resolve`),
> поэтому фабрика стартует в микротаске первого mount, а не на импорте. `cleanupSynapse`
> для handle делегирует очистку `handle.destroy()` (LIFO-teardown + сброс мемоизации),
> а не `synapse.destroy()` — это даёт пересоздаваемость при повторном mount. Синглтон
> обеспечен мемоизацией `handle.ready()`: даже несколько awaiter'ов дадут один запуск.

---

## Этап 6 — Финализация релиза

**Задачи**
1. [x] Экспорты из корня + решение по entry `synapse-storage/bl` (открытый вопрос §7 п.10).
2. [x] Документация: README-раздел нового API, правила (`ofType(group)` = init; сервисы только
   в замыканиях инициализаторов; зарезервированные имена), миграционный гайд
   `createSynapse(config)` → `createSynapse(factory)` на примере posts.
3. [x] Прогон полного покрытия, ревизия dev-проверок (все ошибки — с понятными сообщениями).
4. [x] Версия: semver **minor** (ломающих изменений нет — старый API не тронут).

**DoD**: `yarn build` + `yarn test` зелёные; примеры компилируются; миграционный гайд проверен на одном реальном модуле sn_client (вручную). ✅ (build + 152 теста + examples typecheck зелёные; v4.2.0; sn_client — внешняя ручная валидация вне этого репо)

**Решения этапа**
- **Entry `synapse-storage/bl` НЕ добавляется** (§7 п.10 закрыт). Новый class-слой
  распределён по существующим семантическим entry (`Selectors`→`/core`,
  `Dispatcher`/`Effects`→`/reactive`, `createSynapse`→`/utils`, хуки→`/react`) и
  реэкспортируется из корня. Отдельный бакет дублировал бы символы и расколол бы ментальную
  модель; добавить алиас позже тривиально, если понадобится.
- **Ревизия dev-проверок** — все три базовых класса дают понятные сообщения:
  `Dispatcher` (зарезервированное имя / поле-алиас → throw), `Effects` (поле-функция без
  `this.effect` → warn вне production). Менять нечего.
- **Версия 4.2.0** (minor); CHANGELOG-секция «class-based BL-слой» добавлена.
- **Покрытие**: BL-директории `core/selector` 95%, `reactive/dispatcher` 85%,
  `reactive/effects` 76%, `react/*` 82–85%. Общие 69.3% строк тянет вниз пред-существующий
  `api/`-клиент (вне объёма этой работы).

---

## Этап 7 — Удаление legacy (отдельный цикл, после миграции sn_client)

План, кандидаты на удаление (~700-800 строк) и чеклист повторного аудита — `_fable/CLEANUP.md`.
Процесс: `@deprecated`-маркеры в этапе 6 (minor) → полная миграция sn_client (боевая
валидация нового API) → major-релиз v5.0.0 с удалениями.

---

## Зависимости этапов

```
0 → 1 → 2 → 4 → 5 → 6
     └→ 3 ──┘
```
Этап 3 (Selectors) не зависит от 2 (Effects) — можно делать параллельно/в любом порядке после 1.

## Не входит в объём (после релиза)

- SSR-гидрация через Provider `hydrate` (PROPOSAL §8.4)
- Агрегированный isSourceReady для cross-store combined (PROPOSAL §7 п.6)
- Декораторный сахар (`@action`)
