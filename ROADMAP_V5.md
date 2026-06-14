# Synapse — план работ на цикл v5

> Единый рабочий документ. Сведены воедино:
> - `STORAGE_AUDIT.md` (аудит `core/storage` от 2026-06-13: дефекты, мёртвый код, дедупликация, тесты);
> - `FOLLOWUPS.md` (итоги переосмысления API: острые углы DX, чистка sn_client, идеи, чеклист релиза).
>
> Контекст: ROADMAP (этапы 0–6) + миграция core-store на sn_client + CLEANUP (этап 7) — **завершены**.
> Ниже — следующий цикл, разбитый на этапы в порядке исполнения.

---

## Карта этапов

| Этап | Тема | Объём | Зависимости |
|------|------|-------|-------------|
| 0 | Архитектурное решение: plugins → middlewares ✅ | storage core | разблокирует 1, влияет на 1.2/1.3 |
| 1 | Корректность storage (баги) ✅ | storage core | частично зависит от 0 |
| 2 | Удаление мёртвого кода ✅ | storage core | после 0 |
| 3 | Дедупликация / упрощение ✅ | storage core | — |
| 4 | Тесты storage ✅ | storage core | после 1–3 |
| 5 | DX библиотеки (хуки, селекторы, эффекты) ✅ | /reactive · /react | — |
| 6 | Сопутствующая чистка sn_client (userland) | sn_client | после 5 |
| 7 | Фичи на следующий цикл | библиотека | — |
| 8 | Чеклист релиза v5 | package/build | в конце |

Сквозная договорённость: «ничего срочно переписывать всё» — точечные правки. Архитектура storage в целом здоровая (см. §«Что хорошо, не трогать» в конце).

---

## Этап 0 — Архитектурное решение: plugins → только middlewares ✅ ВЫПОЛНЕНО

**Решение: убрать plugin-систему из ядра, оставить middlewares единственной точкой расширения.**

> Выполнено: удалён `modules/plugin/`, параметр `pluginExecutor` и все вызовы
> `executeBefore/AfterSet/AfterGet/BeforeDelete/AfterDelete/OnClear` убраны из
> sync/async-базы, всех адаптеров, `storage-factory`, `core/storage/index`,
> `useCreateStorage` и `api/example.ts`. Дефекты 1.2/1.3 закрылись автоматически.
> Breaking-change зафиксирован в CHANGELOG (5.0.0). Все 177 тестов зелёные, build/lint/tsc чисты.

Обоснование:
- Middlewares строго мощнее: контроль цепочки, short-circuit (`VALUE_NOT_CHANGED`, отмена delete), доступ к `dispatch`/`getState`/`do*`, порядок. Реально используются (batching, shallowCompare, broadcast).
- Plugins — слабое подмножество (хуки before/after на set/get/delete/clear). При этом:
  - сейчас **не используются** нигде в приложении (в `api/example.ts` закомментированы);
  - имеют мёртвый хук `onBeforeGet` (см. 1.3);
  - не покрывают `update` симметрично (см. 1.2);
  - дублируют целый модуль ×2 (sync/async) в бандле.
- Проверка кейсом «валидация форм»: на middleware делается полнее (доступ ко всему стейту → кросс-полевая валидация, short-circuit, работает и на `update`). Плагинный `onBeforeSet` так не может.

Если нужна эргономика «простых хуков» — это тонкий хелпер, собирающий middleware из колбэков `{ onBeforeSet, onAfterSet }`, **без** отдельной подсистемы и дублирования sync/async-менеджеров.

### План удаления (поверхность `pluginExecutor`)
1. удалить `modules/plugin/plugin.service.ts` и `modules/plugin/plugin.interface.ts`;
2. `adapters/sync-base-storage.service.ts` и `adapters/async-base-storage.service.ts` — убрать параметр конструктора `pluginExecutor` и все вызовы `executeBeforeSet/AfterSet/AfterGet/BeforeDelete/AfterDelete/OnClear` (значения проходят насквозь);
3. `adapters/{memory,local,indexed-DB}.service.ts` — убрать `pluginExecutor` из конструкторов, `create()` и `IndexedDBStorage.createStorages`;
4. `utils/storage-factory.util.ts` — убрать `pluginExecutor` из всех сигнатур;
5. `core/storage/index.ts` — убрать реэкспорт `plugin.interface`/`plugin.service`;
6. `react/hooks/useCreateStorage.ts` — убрать `pluginExecutor` из перегрузок и реализации;
7. `api/example.ts` — почистить закомментированные упоминания.

⚠️ **Breaking change по позиционным аргументам:** `pluginExecutor` сейчас 2-й позиционный параметр в `create()`/конструкторах — после удаления остальные сдвинутся. Позиционно его никто не передаёт (только `useCreateStorage`/`StorageFactory` пробрасывают), но API публичное → отметить в CHANGELOG как breaking, выпустить мажором.

> Последствие для Этапа 1: после удаления плагинов дефекты **1.2** и **1.3** закрываются автоматически (это plugin-хуки). Если по какой-то причине plugins решат **оставить** — тогда 1.2/1.3 чинить вручную.

---

## Этап 1 — Корректность storage (баги) ✅ ВЫПОЛНЕНО

> Выполнено: 1.1 решён флагом `clearOnDestroy?: boolean` (дефолт `false` для localStorage,
> `true` для memory; `LocalStorage.doDestroy`/`MemoryStorage.doDestroy` больше не чистят
> данные напрямую — очистка гейтится в `SyncBaseStorage.performCleanup`). 1.2/1.3 закрылись
> Этапом 0 (плагинов нет — проверено grep'ом). 1.4: трекинг `keyVersions` перенесён в
> `AsyncBaseStorage` (sync больше не платит), чистится на `remove`/`clear`/`reset`. 1.5:
> `get()` больше не эмитит `STORAGE_SELECT`. CHANGELOG обновлён (breaking-поведение localStorage).
> Все 178 тестов зелёные, build/lint/tsc чисты.

### 1.1 — LocalStorage стирает данные при `destroy()` (асимметрия с IndexedDB) ✅ — флаг `clearOnDestroy`
- `SyncBaseStorage.performCleanup()` (`adapters/sync-base-storage.service.ts:67`) → `this.doClear()`.
- `LocalStorage.doDestroy()` (`adapters/local-storage.service.ts:126`) → снова `doClear()`.
- `IndexedDBStorage` специально переопределил `performCleanup` (`adapters/indexed-DB.service.ts:717`), чтобы НЕ чистить на destroy.
- `useCreateStorage` (`react/hooks/useCreateStorage.ts:92`) ставит `destroyOnUnmount` по умолчанию `true` для всего, кроме indexedDB.

Поведение **известное и задокументированное** (тест `__tests__/storage.test.ts:201` его обходит) — не скрытый баг, а сознательное решение. Но два «персистентных» хранилища с противоположной семантикой destroy — источник сюрпризов.
→ Решить осознанно: либо выровнять (LocalStorage тоже не чистит на destroy), либо явный флаг `clearOnDestroy?: boolean`.

### 1.2 — `update()` вызывает `executeBeforeSet`, но не `executeAfterSet` — **Средний** ✅ (снят Этапом 0)
- `set()`: `executeBeforeSet` → middleware → `executeAfterSet` (`sync-base:159-170`, `async-base:161-172`).
- `update()`: только `executeBeforeSet` (`sync-base:222`, `async-base:229`).
- Плагин, трансформирующий значение в `onAfterSet`, молча не сработает на `update`.
→ Если плагины остаются — выровнять или явно задокументировать, что плагины не применяются к batch-update.

### 1.3 — `onBeforeGet` / `executeBeforeGet` — мёртвый хук — **Средний** ✅ (снят Этапом 0)
- Реализован в plugin-модулях и интерфейсах (`plugin.service.ts:111/322`, `plugin.interface.ts`), но нигде не вызывается: `get()` зовёт только `executeAfterGet`.
→ Если плагины остаются — подключить в `get()` либо удалить из интерфейса/реализаций.

### 1.4 — `keyVersions` растёт неограниченно + лишняя работа для sync ✅ — **Средний**
- `StorageCore.notifySubscribers` (`adapters/storage-core.ts:145`) на каждый вызов делает `keyVersions.set(...)` и никогда не удаляет.
- Нужно только для защиты от race в **async** `subscribeByKey` (`async-base:441`). Для sync (`sync-base:424`) версии не читаются.
- Для долгоживущих приложений с динамическими ключами (кэш-ключи API) Map растёт навсегда → утечка; для sync — чистый оверхед.
→ Инкрементировать версии только где используются (async), и/или чистить на `remove`.

### 1.5 — `get()` эмитит событие на каждом чтении ✅ — **Минорный, но системный**
- `STORAGE_SELECT` эмитится в каждом `get()` (`sync-base:141`, `async-base:143`); в async это `await emitEvent` на горячем пути чтения.
→ Чтения не должны генерировать события по умолчанию (или хотя бы не ждать emit).

---

## Этап 2 — Удаление мёртвого кода ✅ ВЫПОЛНЕНО

> Выполнено: удалён файл `utils/storage.utils.ts` целиком (нигде не импортировался —
> проверено grep'ом, реэкспорта из `index.ts` не было). Из `StorageEvents` убраны
> `STORAGE_DELETE` и `STORAGE_PATCH` (нигде не эмитятся). Удалено мёртвое поле `depth`
> и его инкремент/декремент в обоих классах middleware-модуля (`Async`/`Sync`).
> `onBeforeGet` и plugin-система сняты ещё Этапом 0. Все 178 тестов зелёные, build/lint/tsc чисты.

- **`utils/storage.utils.ts`** (`pathUtils` + `dataUtils`, ~85 строк) — не импортируется нигде. Полностью мёртвый. ✅ удалён
- **`StorageEvents.STORAGE_DELETE` и `STORAGE_PATCH`** (`storage.interface.ts:37-38`) — объявлены, но никогда не эмитятся (`remove` шлёт `STORAGE_UPDATE`). Вводят в заблуждение подписчиков `subscribeToAll`. ✅ удалены
- **`depth`** в `AsyncMiddlewareModule`/`SyncMiddlewareModule` (`middleware-module.ts:89,228`) — инкремент/декремент есть, чтения нет. Мёртвое поле. ✅ удалено
- **`onBeforeGet`** — см. 1.3 (удалён в Этапе 0).
- **Plugin-система целиком** — удалена в Этапе 0.

---

## Этап 3 — Дедупликация / упрощение ✅ ВЫПОЛНЕНО

> Выполнено: 3.1 — единственный реальный дубль (идентичный shallow-comparator,
> скопированный в sync- и async-middleware shallow-compare) вынесен в общий
> `shallowEqual` в `utils/state-diff.util.ts`; оба middleware переиспользуют его как
> дефолт. Остальные «параллельные реализации» из 3.1 (`dataUtils`, `pathUtils`) —
> мёртвый код, снят Этапом 2. 3.4 — `cache.util.ts` перенесён в `api/utils/`
> (единственный потребитель — `api/components/query-storage.ts`); из `CacheMetadata`
> убраны ISO-дубликаты таймстемпов (`*DateTime`), ISO считается лениво статиком
> `CacheUtils.formatDateTime` (для логов/дебага) — заодно снят латентный баг
> `updateMetadata`, не обновлявший ISO-дубль. 3.2/3.3 — зафиксированы как осознанные
> решения «не трогать» (см. ниже). Все 178 тестов зелёные, build/lint/tsc чисты.

### 3.1 — Несколько параллельных реализаций equality/clone/path ✅
- Глубокое сравнение: `state-diff.isEqual`, comparator в `shallow-compare` (×2 sync/async), `dataUtils` (мёртвый).
- Клонирование: `createLazyClone` (structuredClone), `dataUtils.clone` (JSON), `{...state}`.
- Пути: `adapters/path.utils.ts` (parsePath/getValueByPath/setValueByPath), `utils/path-selector.util.ts` (extractPath), `utils/storage.utils.ts` (мёртвый).
→ Сделано: дубль был один — **shallow-comparator ×2** (sync/async middleware), вынесен в общий `shallowEqual`. `dataUtils`/`pathUtils`/`storage.utils.ts` уже мертвы и удалены Этапом 2. Остальное — НЕ дубли, а разные задачи: `isEqual` (deep) ≠ `shallowEqual` (1 уровень); `createLazyClone` (lazy structuredClone) ≠ `{...state}` (shallow); `path.utils` (parse/get/set по строке) ≠ `path-selector` (Proxy-извлечение пути из функции). `selector.deepEquals` оставлен в своём слое (`/core/selector`) — слияние со storage нарушило бы разделение слоёв (см. финал).

### 3.2 — Две параллельные системы детекта изменений — РЕШЕНИЕ: оставить, это разные слои ✅
- `update()` сам делает diff через `findChangedPaths` + `isEqual` (`sync-base:206,247`).
- `shallowCompareMiddleware` делает своё кэш-сравнение, но **только для `set`** (`action.type !== 'set'` → пропуск). На `update` не работает.
→ Решено: это НЕ избыточность. Базовый класс владеет diff'ом `update` (всегда включён, нужен для корректной адресной нотификации подписчиков по путям). Middleware — opt-in дедупликация повторного `set` тем же значением (перф, подключается пользователем). Разные слои/назначение — не сливаем. То, что middleware не трогает `update`, корректно: `update` уже сам диффит.

### 3.3 — sync/async код почти полностью дублирован — РЕШЕНИЕ: оставить ✅
- `sync-base`/`async-base` (≈480/507 строк) — один алгоритм, отличие только в `await`. То же с middleware-модулями, broadcast, batching, shallow-compare.
- Осознанный размен (избегаем async-обёрток в sync-пути), но ~2× кода в бандле.
→ Решено оставить как есть: бандл некритичен (см. Этап 8 — externals/bundle:false), а генерация sync из async / общий «runner»-core усложнили бы поддержку ради ~КБ. Кандидат на пересмотр только если бандл станет критичным.

### 3.4 — `cache.util.ts` лежит не в том слое — **Низкий** ✅
- `CacheUtils`/`CacheEntry` используются **только** в `api/components/query-storage.ts` (бизнес-логика), не в самом storage.
- `CacheMetadata` хранил и числовые таймстемпы, и их ISO-дубликаты (`createdAtDateTime`/`updatedAtDateTime`/`expiresAtDateTime`) — удвоение payload.
→ Сделано: файл перенесён в `api/utils/cache.util.ts`; ISO-дубликаты убраны из payload, ISO считается лениво статиком `CacheUtils.formatDateTime` (для дебага). Публичного API не затрагивает (не реэкспортировался).

---

## Этап 4 — Тесты storage ✅ ВЫПОЛНЕНО

> Выполнено: набор `__tests__/storage.test.ts` расширен **52 → 72 теста**. Добавлено:
> прямой CRUD по трём реализациям (`set/get/remove/has/keys/clear/reset`), удаление
> вложенного пути, сырые (`isUnparseable`) ключи round-trip, реальная отписка
> селектора, `update` без изменений → нет нотификации; middlewares — `shallowCompare`
> (был), `batching` (склейка серии `set` в одну запись, last-wins) и проброс кастомного
> middleware через `config.middlewares`; Singleton — один инстанс на имя, `FIRST_WINS`
> (не бросает, побеждает первый), `STRICT` (бросает на конфликте), очистка реестра на
> `destroy`. Lifecycle/ошибки (не-READY бросает, провал `doInitialize` → ERROR) — были.
>
> **Вскрыт и исправлен дефект:** `IndexedDBStorage.doDelete` по вложенному пути/индексу
> массива отсчитывал путь к родителю от корня state (`parts.slice(0, -1)`), но в IndexedDB
> каждый top-level ключ — отдельная запись стора, а `rootValue` уже соответствует
> `parts[0]`. → родитель не находился, `remove('user.name')`/`remove('tags.1')` были
> no-op (молча `false`). Исправлено на `parts.slice(1, -1)` (симметрично `doGet`), есть
> тесты. Зафиксировано в CHANGELOG.
>
> Замечен (но НЕ чинился — вне объёма этапа) латентный нюанс: при `batching` `getStateSync()`
> (`_stateCache`) может быть устаревшим — кэш обновляется в момент `set`, до отложенной
> записи; свежее `get(key)` корректно. Кандидат на отдельную правку. Все 198 тестов
> зелёные, build/lint/tsc чисты.

Сейчас один файл `__tests__/storage.test.ts` — контрактные тесты по трём реализациям (`describe.each`). Базовый CRUD-набор (set/get/remove/has/keys/clear/reset + строковые/вложенные подписки) **добавлен**.

Что было добавлено (исходный список пробелов, по убыванию важности):

**Базовый CRUD напрямую** (сейчас всё через `update`):
- `set`/`get` round-trip одиночного ключа; `remove` → `undefined` подписчику; `has`, `keys`; `clear` → пусто;
- **`reset()`** → возврат к `initialState` (не тестируется совсем, легко ошибиться).

**Пути и формы подписки:**
- `set('user.name', v)` / `get('user.name')` — вложенный путь;
- `subscribe('user.name', cb)` — строковая подписка + доставка начального значения;
- удаление вложенного пути и элемента массива (`doDelete` в IndexedDB имеет отдельную ветку для массивов — не покрыта);
- «сырые»/непарсируемые ключи (`StorageKey` с `isUnparseable`).

**Middlewares (0 тестов):**
- `shallowCompare`: повторный `set` тем же значением → подписчик НЕ уведомляется;
- `batching`: серия `set` склеивается;
- проброс кастомных middlewares через `config.middlewares(getDefault => [...])`;
- `update` без изменений → нет уведомления.

**Lifecycle / ошибки:**
- провал `initialize()` → статус `ERROR`, `waitForReady()` реджектит, `onStatusChange` → ERROR;
- вызов API до `READY` → `ensureReady()` бросает;
- отписка селектора реально прекращает уведомления (для `subscribe`, не только `subscribeToAll`).

**Singleton (тестов нет):**
- два `create` с `singleton.enabled` + одно имя → один инстанс;
- `ConfigMergeStrategy.FIRST_WINS` / `STRICT` (бросает) / `DEEP_MERGE`;
- `destroy` синглтона убирает из реестра.

> Часть тестов вскроет дефекты Этапа 1 (1.2 `executeAfterSet`, `reset`, рост `keyVersions`) — это ожидаемо.

---

## Этап 5 — DX библиотеки ✅ ВЫПОЛНЕНО

> Выполнено: **5.1** — `Selectors.combine` в dev-режиме (`NODE_ENV !== 'production'`)
> бросает понятный `SynapseError`, если любая зависимость не `SelectorAPI` (типичный
> признак — `undefined` от parameter-property при `useDefineForClassFields:true`); указывает
> на фикс (флаг tsconfig / инициализация в конструкторе). **5.2** — подтверждено: хуки-утилиты
> над synapse (`createSynapseCtx`, `awaitSynapse`, `createSynapseAwaiter`) принимают сам
> `SynapseModule`-handle напрямую (он `PromiseLike`), обёртка `() => x.ready()` не нужна;
> зафиксировано тестами `awaitSynapse(handle)` / `createSynapseCtx(handle)`. **5.3** —
> `ValidateConfig.skipAction` теперь опционален: при непройденной валидации без `skipAction`
> эффект просто ничего не делает (`EMPTY`) — убран бойлерплейт `skipAction: () => d.loadX.reset()`
> там, где сбрасывать нечего. **5.4** — предупреждение об упавшем эффекте сделано «громким»:
> называет эффект по имени поля class-слоя (через символ `EFFECT_NAME`, проставляемый
> `Effects.getEffects()`; фолбэк — индекс), явно сообщает, что эффект больше не реагирует
> на экшены, и подсказывает `{ resubscribeOnError: true }`. Тесты 198 → 203 зелёные,
> build/lint/tsc чисты.

### 5.1 — `useDefineForClassFields: false` — скрытая ловушка ✅
Cross-store eager-селекторы (`readonly x = this.combine([this.core.y], ...)`, где `core` — параметр конструктора) работают только при `useDefineForClassFields: false`. При дефолтном `true` (target ES2022) поле-зависимость окажется `undefined` в момент инициализатора — **тихо**, без ошибки.
→ В dev-режиме в `Selectors.combine` бросать понятную ошибку, если любой dep === undefined на момент вызова («похоже, cross-store селектор инициализируется до присваивания parameter property — включите `useDefineForClassFields:false` или инициализируйте в теле конструктора»). Сейчас это только в документации.

### 5.2 — Бойлерплейт `getXSynapse = () => xSynapse.ready()` ✅
В каждом модуле sn_client рядом с `createSynapse(...)` появляется обёртка, чтобы скормить хукам контракт `() => Promise<S>`.
→ Дать перегрузку React-хуков, принимающую сам handle (`SynapseModule`): `useSynapse(xSynapse)` внутри вызывает `.ready()`. (`createSynapseCtx(handle)` уже это умеет — распространить на остальные хуки.)
> Разблокирует п. 6 (перевод `core.hooks.ts`/`CoreProvider.tsx` на библиотечные хуки).

### 5.3 — `loadX.reset()` как `skipAction` — повторяющийся паттерн ✅
Почти в каждом эффекте `validator.skipAction: () => d.loadX.reset()`. Не критично — кандидат на хелпер/дефолт.
→ Сделано: `ValidateConfig.skipAction` теперь опционален. Если валидация не прошла и `skipAction` не задан — эффект ничего не делает (`EMPTY`), а не требует фиктивный экшн.

### 5.4 — Изоляция ошибок эффектов ✅
По умолчанию непойманная ошибка убивает конкретный эффект (остальные живы); есть `this.effect(fn, { resubscribeOnError: true })`. Dev-warning о «тихо умершем» эффекте стоит сделать громче — сейчас легко не заметить, что эффект отвалился.
→ Сделано: сообщение `catchError` в `EffectsModule.subscribeToEffect` называет эффект (имя поля class-слоя через `EFFECT_NAME`, фолбэк — индекс `#N`), явно сообщает «УПАЛ и больше не будет реагировать на экшены» и подсказывает `{ resubscribeOnError: true }`.

---

## Этап 6 — Сопутствующая чистка sn_client (userland, не библиотека)

После миграции core часть собственных обёрток приложения, вероятно, отмерла (см. также `_fable/CLEANUP.md` §«Сопутствующая чистка»):
- `src/store/createFeatureSynapse.ts` — встроено в `createSynapse(factory)`.
- `src/store/useSynapse.ts`, `useSynapseSelector.ts`, `useSynapseActions.ts`, `useKeyedSliceSelector.ts` — проверить, закрывают ли их библиотечные `useSelector` + keyed-селекторы + `useObservable`. Что не закрывают — кандидат на фичу библиотеки, а не на обёртку.
- Ручной lazy-singleton в core заменён на `createSynapse(factory).ready()` — обёртки больше не нужны.
- `core.hooks.ts`/`CoreProvider.tsx` всё ещё через userland-обёртки `useSynapse*` — кандидаты на перевод на библиотечные хуки (зависит от 5.2).

---

## Этап 7 — Фичи библиотеки ✅ ВЫПОЛНЕНО (дефолт 5.0.0)

> Реализованы четыре аддитивные фичи (без ломающих изменений), вошли в дефолт 5.0.0.
> Тесты 203 → 228 зелёные, build/lint/tsc чисты. Подробности в CHANGELOG (§«Новые фичи
> библиотеки (этап 7)»).

- **persist-migration** для localStorage/IndexedDB ✅ — поля конфига `version?: number` +
  `migrate?: (oldState, oldVersion) => T`. На `initialize()` сохранённая версия схемы
  сравнивается с текущей; ниже → `migrate`, результат записывается, версия фиксируется.
  Версия хранится рядом с данными (localStorage — sidecar-ключ; IndexedDB — reserved-запись,
  исключённая из `getState()`/`keys()`, переживает `clear()`/`set('')`). Без `version`
  поведение не меняется; `memory` игнорирует (нечего персистить). Решение — чистый хелпер
  `decideMigration` + адаптерные хуки `read/write/clearPersistedVersion`.
- **SSR-гидрация: `storage.hydrate(state)`** ✅ — `ISyncStorage`→`void`, `IAsyncStorage`→
  `Promise<void>`. До `initialize()` засевает (init не перезатирает `initialState`-ом);
  после — заменяет состояние и уведомляет подписчиков. С `version` фиксирует текущую версию.
- **Агрегированный `isSourceReady`** для cross-store combined ✅ — combined-селектор готов,
  только когда готов локальный источник И все источники зависимостей (`onSourceStatusChange`
  тоже агрегирован). Простые селекторы — по-прежнему один источник.
- **Logger-middleware для storage** ✅ — `loggerMiddleware`/`syncLoggerMiddleware` +
  `getDefault().logger()`. Логирует только пишущие действия (чтения молчат), минимален, без
  i18n/цветов.
- **Схлопывание entry `/utils`**: после CLEANUP там фактически только `createSynapse`, который реэкспортится из корня. Решить, оставлять ли отдельный entry. (Решение упаковки — не код; не входило в этот объём.)
- **Декораторный сахар (`@action`)** — сознательно отвергнут (не нужен IoC). Фиксируем как «нет».
- **Не добавлять** (ниша, раздует бандл): encryption, compression, throttle/debounce (батчинг есть), sync-with-server (это слой API).

---

## Этап 8 — Чеклист релиза v5

- **CHANGELOG**: breaking change от Этапа 0 (удаление plugins, сдвиг позиционных аргументов), мажор.
- `peerDependenciesMeta`: `rxjs` помечен `optional`. Корректно для core-only потребителей, но npm 7+ не доустановит rxjs автоматически. Если важно — снять `optional` у `rxjs` (react/react-dom оставить optional).
- `rslib.config.ts`: `externals` + `bundle:false` уже гарантируют, что rxjs/react не зашиваются в `dist` — менять не нужно (частый ложный страх).
- Проверить `exports`-карту package.json после удаления legacy: не должно остаться entry, ведущих в пустоту.
- Идиома типа синапса: `export type XSynapse = Awaited<typeof xSynapse>` — задокументировать как канон.

---

## Что хорошо — не трогать

- Разделение `StorageCore` (инфраструктура) → `Sync/AsyncBaseStorage` (CRUD) → конкретные адаптеры — чистое и правильное.
- Lifecycle/status (`IDLE/LOADING/READY/ERROR`, `waitForReady`, переинициализация после destroy) — аккуратно.
- `IndexedDBManager` с последовательной очередью схемных операций (`opQueue`, `enqueue`) и локальной ссылкой на `db` после `await` — решение реальной гонки, грамотно прокомментировано.
- Race-protection через `keyVersions` в async `subscribeByKey` — корректная идея (замечание только про рост, 1.4).
- `createLazyClone` (structuredClone по требованию) и `findChangedPaths` с guard по паре (oldObj,newObj) — продуманно.
- Singleton-модуль с мердж-стратегиями — мощно (возможно избыточно: 5 стратегий, на практике почти всегда `FIRST_WINS`; но не мешает).
- Главная ценность цикла: **явное разделение State Manager (`synapse-storage/core`) и Business Logic Layer (`/reactive` · `/utils` · `/react`)**. Зафиксировано в `docs/ru/architecture.md`, README и в форме API.
