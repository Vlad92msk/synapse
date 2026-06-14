# Аудит `core/storage`

Дата: 2026-06-13
Объём: `packages/synapse/src/core/storage` — адаптеры, middlewares, модули (plugin/singleton), utils.

Вывод одной строкой: **архитектура в целом здоровая и хорошо разложена по слоям**, но
есть ~5 конкретных дефектов/несогласованностей, заметный объём мёртвого кода и одно
дублирование механизмов, которое стоит схлопнуть. Ничего «срочно переписывать всё» — точечные правки.

---

## 1. Корректность / потенциальные баги

### 1.1 LocalStorage стирает данные при `destroy()` — асимметрия с IndexedDB ⚠️
- `SyncBaseStorage.performCleanup()` (`adapters/sync-base-storage.service.ts:67`) вызывает `this.doClear()`.
- `LocalStorage.doDestroy()` (`adapters/local-storage.service.ts:126`) — снова `doClear()`.
- `IndexedDBStorage` специально **переопределил** `performCleanup` (`adapters/indexed-DB.service.ts:717`), чтобы НЕ чистить данные на destroy («persistent storage: do NOT clear»).
- А `useCreateStorage` (`react/hooks/useCreateStorage.ts:92`) ставит `destroyOnUnmount` по умолчанию `true` для всего, кроме indexedDB.

**Уточнение:** это поведение **известное и задокументированное** — тест `__tests__/storage.test.ts:201` прямо обходит его («НЕ вызываем a.destroy() — он чистит localStorage»). То есть не скрытый баг, а сознательное решение.
Тем не менее асимметрия остаётся спорной: localStorage при `destroy()` ведёт себя как memory, тогда как IndexedDB сохраняет данные. Два «персистентных» хранилища с противоположной семантикой destroy — источник сюрпризов.
→ Решить осознанно: либо выровнять (LocalStorage тоже не чистит на destroy, как IndexedDB), либо сделать поведение явным флагом конфигурации (`clearOnDestroy?: boolean`).

### 1.2 `update()` вызывает `executeBeforeSet`, но не `executeAfterSet`
- `set()` прогоняет значение через `executeBeforeSet` → middleware → `executeAfterSet` (`sync-base:159-170`, `async-base:161-172`).
- `update()` прогоняет только `executeBeforeSet` (`sync-base:222`, `async-base:229`), `executeAfterSet` отсутствует.

Плагин, трансформирующий значение в `onAfterSet`, молча не сработает на `update`. Асимметрия → баг ожиданий. Нужно либо выровнять, либо явно задокументировать, что плагины не применяются к batch-update.

### 1.3 `onBeforeGet` / `executeBeforeGet` — мёртвый хук
- Реализован в обоих plugin-модулях и в интерфейсах (`plugin.service.ts:111/322`, `plugin.interface.ts`), но **нигде не вызывается**: `get()` зовёт только `executeAfterGet`.
- То есть публично объявленный хук `onBeforeGet` не работает.
→ Либо подключить в `get()`, либо удалить из интерфейса и реализаций.

### 1.4 `keyVersions` растёт неограниченно + лишняя работа для sync-хранилищ
- `StorageCore.notifySubscribers` (`adapters/storage-core.ts:145`) на каждый вызов делает `keyVersions.set(...)` и никогда не удаляет ключи.
- Нужно это только для защиты от race в **async** `subscribeByKey` (`async-base:441`). Для sync-хранилищ (`sync-base:424`) версии не читаются вообще.
- Для долгоживущих приложений с динамическими ключами (например кэш-ключи API) Map растёт навсегда → медленная утечка; для sync — ещё и чистый оверхед.
→ Инкрементировать версии только там, где они реально используются (async), и/или чистить на `remove`.

### 1.5 `get()` эмитит событие на каждом чтении
- `STORAGE_SELECT` эмитится в каждом `get()` (`sync-base:141`, `async-base:143`), причём в async это `await emitEvent` на горячем пути чтения.
→ Чтения обычно не должны генерировать события по умолчанию (или хотя бы не ждать emit). Минорный, но системный оверхед.

---

## 2. Мёртвый / неиспользуемый код (раздувает бандл, можно удалять)

- **`utils/storage.utils.ts`** (`pathUtils` + `dataUtils`, ~85 строк) — не импортируется нигде. Полностью мёртвый.
- **`StorageEvents.STORAGE_DELETE` и `STORAGE_PATCH`** (`storage.interface.ts:37-38`) — объявлены, но никогда не эмитятся (`remove` шлёт `STORAGE_UPDATE`). Вводят в заблуждение подписчиков `subscribeToAll`.
- **`depth`** в `AsyncMiddlewareModule`/`SyncMiddlewareModule` (`middleware-module.ts:89,228`) — инкремент/декремент есть, чтения нет. Мёртвое поле.
- **`onBeforeGet`** — см. 1.3.
- **Plugin-система в целом** сейчас не используется приложением (только прокинута типами; в `api/example.ts` закомментирована). См. раздел 4.

---

## 3. Дублирование / усложнение (можно упростить)

### 3.1 Несколько параллельных реализаций equality/clone/path
- Глубокое сравнение: `state-diff.isEqual`, comparator в `shallow-compare` (×2 sync/async), `dataUtils` (мёртвый).
- Клонирование: `createLazyClone` (structuredClone), `dataUtils.clone` (JSON), `{...state}`.
- Работа с путями: `adapters/path.utils.ts` (parsePath/getValueByPath/setValueByPath), `utils/path-selector.util.ts` (extractPath), `utils/storage.utils.ts` (мёртвый pathUtils).
→ Свести к одному набору path-утилит и одному `isEqual`. `shallowCompare` может переиспользовать общий comparator.

### 3.2 Две параллельные системы детекта изменений
- `update()` сам делает diff через `findChangedPaths` + `isEqual` (`sync-base:206,247`).
- При этом существует `shallowCompareMiddleware`, который делает свой кэш-сравнение, но **только для `set`** (`action.type !== 'set'` → пропуск). На `update` он не работает.
→ Логика «изменилось/не изменилось» размазана между базовым классом и middleware. Стоит решить, где она живёт.

### 3.3 sync/async код почти полностью дублирован
`sync-base` и `async-base` (≈480/507 строк) — это один и тот же алгоритм, отличающийся только `await`. То же с middleware-модулями, broadcast-middleware, plugin-модулями, batching, shallow-compare. Это осознанный размен (избегаем async-обёрток в sync-пути), но это ~2× кода в бандле для логики `update`/`set`/подписок. Если бандл критичен — кандидат на генерацию sync-варианта из async или общий приватный core с инъекцией «runner»-а.

### 3.4 `cache.util.ts` лежит не в том слое
`CacheUtils`/`CacheEntry` используются **только** в `api/components/query-storage.ts` (слой бизнес-логики), не в самом storage. Это часть API-слоя, попавшая в `core/storage/utils`. Плюс `CacheMetadata` хранит и числовые таймстемпы, и их ISO-строковые дубликаты (`createdAtDateTime`/`updatedAtDateTime`/`expiresAtDateTime`) — удвоение payload кэша ради читабельности.
→ Перенести в `api/`, ISO-строки считать лениво/для дебага.

---

## 4. Плагины vs Middlewares — делить ли?

Коротко: **оставить только middlewares**. Разделение сейчас не оправдано.

- **Middlewares** строго мощнее: контроль цепочки, short-circuit (`VALUE_NOT_CHANGED`, отмена delete), доступ к `dispatch`/`getState`/`do*`, порядок. Реально используются (batching, shallowCompare, broadcast).
- **Plugins** — это более слабое подмножество (хуки before/after на set/get/delete/clear). Всё, что делает плагин (трансформация значения/ключа), middleware делает тоже и с большим контролем. При этом плагины:
  - сейчас **не используются** нигде в приложении;
  - имеют мёртвый хук `onBeforeGet` (1.3);
  - не покрывают `update` симметрично (1.2);
  - дублируют целый модуль ×2 (sync/async) в бандле.

`t.md` пытается развести их по смыслу («плагин = логика, независимая от storage»), но на практике независимую логику удобнее держать в слое бизнес-логики (который ты уже выделил), а не как второй механизм перехвата внутри storage.

Рекомендация: **убрать plugin-систему из ядра** (или хотя бы не экспортировать/не шипать), оставить middlewares как единственную точку расширения. Если нужна эргономика «простых хуков» — это тонкий хелпер, собирающий middleware из колбэков `{ onBeforeSet, onAfterSet }`, без отдельной подсистемы и без дублирования sync/async-менеджеров.

#### Проверка на конкретном кейсе: валидация форм
Допустим, хранилище используется под формы и нужен плагин-валидатор. На middleware это делается полнее, чем на плагине:
```ts
const validationMiddleware = (schema): SyncMiddleware => ({
  name: 'validation',
  reducer: (api) => (next) => (action) => {
    if (action.type === 'set' || action.type === 'update') {
      const result = schema.validate(action.value, api.getState()) // доступ ко всему стейту → кросс-полевая валидация
      if (!result.ok) {
        // на выбор: бросить и отклонить запись, либо пропустить (вернуть VALUE_NOT_CHANGED),
        // либо подменить значение (нормализация/trim/coerce)
        throw new ValidationError(result.errors)
      }
    }
    return next(action)
  },
})
```
Плагинный `onBeforeSet` так не может: нет доступа к dispatch/цепочке, нет short-circuit, нет `getState` для кросс-полевых правил, и он **не сработает на `update`** (см. 1.2). Вывод: валидация — и любой другой реальный кейс перехвата — полностью закрывается middleware. Плагины удаляемы.

#### План удаления (на будущее, НЕ выполнять сейчас)
Затрагиваемые файлы (поверхность `pluginExecutor`):
1. удалить `modules/plugin/plugin.service.ts` и `modules/plugin/plugin.interface.ts`;
2. `adapters/sync-base-storage.service.ts` и `adapters/async-base-storage.service.ts` — убрать параметр конструктора `pluginExecutor` и все вызовы `executeBeforeSet/AfterSet/AfterGet/BeforeDelete/AfterDelete/OnClear` (значения проходят насквозь без трансформации);
3. `adapters/{memory,local,indexed-DB}.service.ts` — убрать `pluginExecutor` из конструкторов, `create()` и `IndexedDBStorage.createStorages` (поле `pluginExecutor` в конфиге);
4. `utils/storage-factory.util.ts` — убрать `pluginExecutor` из всех сигнатур;
5. `core/storage/index.ts` — убрать реэкспорт `plugin.interface`/`plugin.service`;
6. `react/hooks/useCreateStorage.ts` — убрать `pluginExecutor` из перегрузок и реализации;
7. `api/example.ts` — почистить закомментированные упоминания.

⚠️ **Breaking change по позиционным аргументам:** `pluginExecutor` сейчас 2-й позиционный параметр в `create()`/конструкторах — после удаления `eventEmitter`/`logger` сдвинутся. На практике позиционно его никто не передаёт (только `useCreateStorage` и `StorageFactory` пробрасывают), реальные вызовы (`createEventBus`, `api/example`) передают лишь config. Но т.к. это публичное API — отметить в CHANGELOG как breaking и выпустить мажором.

---

## 5. Нужен ли logger-middleware (и что ещё «нужно всем»)?

- **Logger-middleware для storage**: умеренно полезен, но в проекте **уже есть** `loggerDispatcherMiddleware` (`reactive/dispatcher/middlewares/logger.middleware.ts`), логирующий action + prev/next state на уровне бизнес-логики. Это покрывает 80% потребности «что произошло». Отдельный storage-логгер дал бы только низкоуровневые get/set. Если добавлять — делать **крошечным** и **dev-only** (как уже помечен dispatcher-логгер), не тащить i18n/цвета второй раз. Не критично.

- **Что реально часто нужно и сейчас отсутствует** — для персистентных хранилищ это **версионирование/миграции состояния**: когда форма `initialState` меняется между релизами, в localStorage/IndexedDB лежат данные старой схемы, и их надо мигрировать (`version` + `migrate(oldState, oldVersion)`). Это единственный по-настоящему массово нужный пробел. Сейчас `init` просто берёт существующее состояние как есть (`middleware-module.ts:145`), без проверки версии.

- **Не добавлять** (ниша, раздует бандл зря): encryption, compression, throttle/debounce (батчинг уже есть), sync-with-server (это слой API).

Итого по «добавить»: единственный кандидат с высоким ROI — **persist-migration** для localStorage/IndexedDB. Logger — опционально и только если совсем минимальный dev-билд.

---

## 6. Что хорошо (не трогать)

- Разделение `StorageCore` (инфраструктура) → `Sync/AsyncBaseStorage` (CRUD) → конкретные адаптеры — чистое и правильное.
- Lifecycle/status (`IDLE/LOADING/READY/ERROR`, `waitForReady`, переинициализация после destroy) сделан аккуратно.
- `IndexedDBManager` с последовательной очередью схемных операций (`opQueue`, `enqueue`) и работой с локальной ссылкой на `db` после `await` — это решение реальной гонки, грамотно прокомментировано.
- Race-protection через `keyVersions` в async `subscribeByKey` — корректная идея (замечание только про неограниченный рост, 1.4).
- `createLazyClone` (structuredClone по требованию) и `findChangedPaths` с guard по паре (oldObj,newObj) — продуманно.
- Singleton-модуль с мердж-стратегиями — мощно (возможно даже избыточно: 5 стратегий, на практике почти всегда `FIRST_WINS`; но это не мешает).

---

## 7. Тесты `core/storage` — покрытие и пробелы

Сейчас один файл `__tests__/storage.test.ts` (258 строк). Это «страховочные» контрактные тесты, прогоняемые по трём реализациям (`describe.each`). Подход правильный, но покрытие — только базовый happy-path.

### Что уже покрыто
- `initialize()` → `waitForReady()` → `initStatus === READY`;
- `getState`/`getStateSync` отдают `initialState`;
- `update(fn)`: иммутабельность + `changedPaths`;
- `subscribe(selector, cb)`: дёргается только на нужный срез;
- `subscribeToAll`: уведомление + отписка;
- два `update` подряд → консистентный снапшот;
- `destroy()`: идемпотентность + доступ после destroy бросает;
- персистентность LocalStorage и IndexedDB между инстансами;
- параллельные `update` по разным ключам (IndexedDB).

### Чего НЕ хватает (по убыванию важности)
**Базовый CRUD вообще не покрыт напрямую:**
- `set(key, value)` + `get(key)` round-trip (одиночный ключ) — сейчас всё идёт через `update`;
- `remove(key)` → значение исчезает, подписчик получает `undefined`;
- `has(key)`, `keys()`;
- `clear()` → стейт пуст;
- **`reset()`** → возврат к `initialState` — не тестируется совсем (а это место, где легко ошибиться).

**Пути и формы подписки:**
- `set('user.name', v)` / `get('user.name')` — вложенный путь;
- `subscribe('user.name', cb)` — строковая (не селекторная) подписка + доставка начального значения;
- удаление вложенного пути и элемента массива (`doDelete` в IndexedDB имеет отдельную ветку для массивов — не покрыта);
- «сырые»/непарсируемые ключи (`StorageKey` с `isUnparseable`).

**Middlewares (своя зона риска, сейчас 0 тестов):**
- `shallowCompare`: повторный `set` тем же значением → подписчик НЕ уведомляется (`VALUE_NOT_CHANGED`);
- `batching`: серия `set` склеивается, итог корректен;
- проброс кастомных middlewares через `config.middlewares(getDefault => [...])`;
- `update` без фактических изменений → нет уведомления (ветка `actuallyChangedKeys.length === 0`).

**Lifecycle / ошибки:**
- провал `initialize()` → статус `ERROR`, `waitForReady()` реджектит, `onStatusChange` получает ERROR;
- вызов API до `READY` → `ensureReady()` бросает;
- отписка селектора реально прекращает уведомления (есть для `subscribeToAll`, нет для `subscribe`).

**Singleton (отдельный модуль, тестов нет):**
- два `create` с `singleton.enabled` и одним именем → один инстанс;
- `ConfigMergeStrategy.FIRST_WINS` / `STRICT` (бросает) / `DEEP_MERGE` — поведение мерджа;
- `destroy` синглтона убирает его из реестра (повторный create создаёт новый).

> Примечание: часть из этих тестов может вскрыть уже отмеченные дефекты (1.2 — `executeAfterSet` не зовётся в `update`; `reset`; рост `keyVersions`). Это нормально — они и нужны, чтобы зафиксировать/найти эти места.

Базовый CRUD-набор (set/get/remove/has/keys/clear/reset + строковые/вложенные подписки) добавлен в этот же файл — см. коммит/дифф тестов.

## Приоритеты к исправлению

| # | Что | Приоритет |
|---|-----|-----------|
| 1.1 | LocalStorage вытирается на destroy (несогласовано с IndexedDB) | Высокий — проверить намерение |
| 1.2 | `executeAfterSet` не вызывается в `update` | Средний |
| 1.3 | мёртвый `onBeforeGet` — подключить или удалить | Средний |
| 1.4 | рост `keyVersions` / лишняя работа в sync | Средний |
| 2.* | удалить мёртвый код (`storage.utils.ts`, `depth`, `STORAGE_DELETE/PATCH`) | Низкий, быстро |
| 3.4 | перенести `cache.util.ts` в `api/` | Низкий |
| 4 | схлопнуть plugins → только middlewares | Архитектурное решение |
| 5 | (опц.) persist-migration middleware | Фича по желанию |
