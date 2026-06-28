# Задача: рецепт «Управление формами на хранилище synapse» (+ раздел «Рецепты» для State Manager)

> Статус: проработка / сбор требований. Реализация НЕ начата.
> Дата: 2026-06-28.
> Автор фактуры: аудит кодовой базы (storage core, middlewares, SSR, docs-движок homepage).

---

## 1. Зачем (мотивация)

Управление формами — самый частый прикладной кейс. Цель — дать в документации
**готовый, копипастный** рецепт: разработчик заходит в доку, копирует код, вставляет
к себе — и получает собственное управление формой вместо `react-hook-form` /
`Formik` / `Final Form`.

Ключевое: у synapse есть преимущества, которых у form-библиотек нет **по
архитектуре** (а не прикручены сбоку):

- **SSR + гидрация** — форма рендерится на сервере с уже заполненными
  значениями/ошибками, на клиенте подхватывается без вспышки (есть `hydrate()`,
  доказано тестом `core/storage/__tests__/hydrate.test.ts` и рецептом
  `ssr-hydration`).
- **Cross-tab sync** — `broadcastMiddleware` синхронизирует черновик формы между
  вкладками (см. `sync-broadcast.middleware.ts`).
- **Persist + миграции** — `LocalStorage`/`IndexedDB` сохраняют черновик между
  сессиями, `version` + `migrate` мигрируют схему (см. рецепт `persist-migration`).
- **Валидация как middleware** — централизованная, переиспользуемая, срабатывает
  на ЛЮБУЮ запись в стор независимо от источника.

Это и есть потенциальная **killer-фича**: «форма с SSR, автосохранением,
синхронизацией между вкладками и схемной валидацией — в N строк, без зависимостей».

---

## 2. Область и честные границы (важно для тона рецепта)

Рецепт должен быть **честным**: synapse-форма — это не «RHF, но во всём лучше».
Надо явно показать, что мы воспроизводим, а что — осознанно иначе.

**Что закрываем (показать в рецепте):**
- стейт формы: `{ values, errors, touched, dirty, isSubmitting, submitCount }`;
- изоляция ре-рендеров по полю — через `storage.subscribe(pathSelector, cb)` /
  `useStorageSubscribe(storage, s => s.values.email)` (компонент поля
  перерисовывается только на своё поле);
- валидация (синхронная схемная) через middleware;
- `touched`/`dirty`/`isValid` — производные/обновляемые в middleware;
- submit-flow (`isSubmitting`, сбор ошибок, блокировка повторного сабмита);
- reset к initialState (`storage.reset()`).

**Где synapse иначе / чего нет из коробки (упомянуть честно, не замалчивать):**
- нет field-registration в стиле `register('email')` под нативные inputs —
  у нас контролируемые инпуты + `set/update`;
- async-валидация (проверка на сервере) — отдельный, более сложный паттерн
  (через BLL/эффекты или вручную); в базовом рецепте — синхронная схема;
- array/dynamic fields — показать кратко, но это уже усложнение;
- производительность на огромных формах — за счёт точечных подписок ок, но это
  надо измерять, а не обещать.

**Anti-goal:** не превращать рецепт в мини-библиотеку с API. Это РЕЦЕПТ —
копипастный код в проект пользователя, который он дальше правит под себя.

---

## 3. Состав рецептов (предлагается несколько уровней)

Рекомендуется лесенка от простого к продвинутому, чтобы можно было скопировать
ровно нужный уровень:

1. **`forms-basic`** — минимальная форма на `MemoryStorage`:
   - state-shape формы, контролируемые инпуты, `update()` на ввод,
     `subscribe`/`useStorageSubscribe` для чтения, submit, reset.
   - Цель: «голый» каркас без магии.

2. **`forms-validation`** — добавляем **валидационную middleware**:
   - middleware перехватывает запись в `values.*`, прогоняет схему, пишет `errors`;
   - схема — простая функция-валидатор (и/или адаптер под zod/yup как опция);
   - `isValid` производное.

3. **`forms-persist-and-sync`** — форма как черновик:
   - `LocalStorage` (или IndexedDB) → автосохранение черновика;
   - `broadcastMiddleware` → синхронизация между вкладками;
   - `version`+`migrate` → миграция схемы черновика.

4. **`forms-ssr`** — серверный рендер формы:
   - сервер засевает значения/ошибки через `hydrate()` ДО `initialize()`;
   - клиент гидрируется снапшотом → нет вспышки;
   - переиспользовать паттерн из рецепта `ssr-hydration` / `dehydrateModule`.

> Можно начать с одного объединённого рецепта `forms` с разделами-уровнями
> (как сделан `pokemon-advanced`), а не 4 отдельных страниц. Решение — в §7.

---

## 4. Техническая фактура и дизайн (для автора рецепта)

### 4.1 Middleware API (как писать валидацию)
Источник: `core/storage/utils/middleware-module.ts`.

- Есть **две** разновидности: `SyncMiddleware` (Memory/LocalStorage) и
  `AsyncMiddleware` (IndexedDB). Для форм почти всегда нужен **sync** (Memory/Local).
- Форма middleware:
  ```ts
  const validationMiddleware = (schema): SyncMiddleware => ({
    name: 'form-validation',
    setup: () => {},
    reducer: (api) => (next) => (action) => {
      const result = next(action)        // сначала пишем значение (НЕ блокируем!)
      // затем вычисляем ошибки и кладём в errors-срез
      return result
    },
  })
  ```
- `action.type`: `'set' | 'update' | 'reset' | 'init' | ...`. Реагировать на
  `set`/`update`.
- `api.storage.doSet/doGet/doUpdate/notifySubscribers` — прямой доступ к стору
  внутри middleware (минуя цепочку).
- `api.getState()` — текущее состояние.
- Шаблон-ориентир: `sync-storage-shallow-compare.middleware.ts` (как перехватывать
  только нужные action и ключи), `sync-broadcast.middleware.ts` (setup + reducer +
  cleanup, notifySubscribers).

### 4.2 ГЛАВНЫЕ грабли валидационной middleware (зафиксировать в рецепте)
1. **НЕ блокировать запись инвалидного значения.** Инпут должен показывать то,
   что напечатал пользователь. Поэтому middleware сначала `next(action)` (пишем
   value), потом вычисляет и пишет `errors`. Если вернуть `VALUE_NOT_CHANGED`
   (символ из `middleware-module.ts`) на инвалидный ввод — поле «залипнет».
2. **Рекурсия.** Запись `errors` внутри middleware не должна снова запускать
   валидацию. Решения: писать `errors` через `api.storage.doSet('errors', ...)`
   + `notifySubscribers` НАПРЯМУЮ (минуя dispatch-цепочку), и/или валидацию
   запускать только когда меняется ключ из `values.*` (guard по ключу/сегменту).
   Сегментный guard уже поддержан паттерном `action.metadata?.segment` (см.
   shallow-compare middleware).
3. **Когда валидировать.** На каждый `set` (live) vs на blur vs на submit. Базовый
   рецепт — live + `touched` (показывать ошибку только для тронутых полей).
4. **Sync vs Async.** Для IndexedDB middleware async — это усложняет рецепт; для
   персиста черновика чаще достаточно LocalStorage (sync). В рецепте по умолчанию
   sync, async — как примечание.

### 4.3 Альтернатива middleware — производные ошибки через селектор
Валидацию можно сделать НЕ middleware, а **селектором** (derived state):
`errors = createSelector(values -> validate(values))`. Плюс: проще, без рекурсии.
Минус: ошибки не персистятся/не шарятся как часть state, и нет «точки», где
валидация навязана всем писателям. Рецепт должен **сравнить оба подхода** и
объяснить, когда что (middleware — когда нужна централизованность/персист/шеринг
ошибок; селектор — когда нужна простота). Пользователь явно просил middleware —
делаем его основным, селектор показываем как альтернативу.

### 4.4 Изоляция ре-рендеров (показать как преимущество)
- `useStorageSubscribe(storage, s => s.values.email)` — компонент поля
  перерисовывается только на изменение своего поля.
- Учесть открытый пункт из аудита storage: `useStorageSubscribe` сейчас БЕЗ
  `equals` — ре-рендер на любое изменение стора. Если к моменту рецепта добавим
  `equals`/`useStorageRef` (см. `STORAGE_REACTIVE_AUDIT.md`), рецепт станет
  заметно сильнее по перформансу. **Зависимость, не блокер.**

### 4.5 Cross-tab и persist (фактура)
- `broadcastMiddleware` / `syncBroadcastMiddleware` — `{ storageType, storageName }`,
  fire-and-forget broadcast на `set/update/delete/clear`, начальная синхронизация
  для memory. Канал: `${storageType}-${storageName}`.
- Персист: `LocalStorage`/`IndexedDB` сохраняют сами; `clearOnDestroy` управляет
  очисткой; `version`+`migrate` — миграции схемы черновика.

### 4.6 SSR (фактура, уже доказано)
- `storage.hydrate(state)` ДО `initialize()` → `initialState` не перезатирает
  серверный снапшот; ПОСЛЕ → заменяет + уведомляет (тест `hydrate.test.ts`).
- `getStateSync()` — снапшот для сериализации в HTML.
- На уровне модуля есть `dehydrateModule()` (`utils/dehydrateModule.ts`) и
  React-обвязка `createSynapseCtx` — переиспользовать паттерн.
- Готовые страницы-ориентиры: `docs/{ru,en}/ssr-hydration.md`,
  `docs/{ru,en}/persist-migration.md`, секция `sections/ssr-hydration.tsx`
  (+ `hydration-flow/`).

---

## 5. Раздел «Рецепты» в навигации — РЕШЕНО

Решение: **добавить новую подгруппу «Рецепты» внутрь pillar State Manager**
(`nav.pillars.state`) в `packages/homepage/src/pages/docs/components/docs-sidebar/data/list.ts`.
Форм-рецепт — первый элемент этой подгруппы; дальше в неё добавляются другие
рецепты по хранилищам.

Конкретика:
- новая группа в `groups` блока `nav.pillars.state` (после `patterns`):
  `{ titleKey: 'nav.sections.state-recipes', items: [{ key: 'forms' /* + уровни */ }] }`;
- **titleKey НЕ переиспользовать `nav.sections.recipes`** — он уже занят группой
  рецептов в pillar `bll` (там `pokemon-advanced`). Завести отдельный ключ, напр.
  `nav.sections.state-recipes` (= «Рецепты»), чтобы две группы «Рецепты» в разных
  блоках не конфликтовали по i18n-ключу.

---

## 6. Чек-лист интеграции в docs-движок homepage

Документация управляется из нескольких связанных мест. Для КАЖДОЙ новой страницы:

1. **Markdown-исходники** (канонический контент, 2 локали):
   - `docs/ru/<key>.md`
   - `docs/en/<key>.md`
2. **Секция-компонент homepage:**
   - `packages/homepage/src/pages/docs/sections/<key>.tsx` (+ опц. `<key>.module.css`)
   - зарегистрировать в `packages/homepage/src/pages/docs/sections/index.ts`
3. **Сайдбар-навигация:**
   - `packages/homepage/src/pages/docs/components/docs-sidebar/data/list.ts`
     — добавить `{ key: '<key>' }` (и, возможно, новую группу/`titleKey`)
4. **i18n (RU + EN):**
   - `packages/homepage/src/i18n/config.ts` — `nav.sections.*`,
     `nav.sections.<group>.<key>`, заголовки/описания (и для ru, и для en).
5. **Типы и структурированные данные (auto-generated):**
   - `packages/homepage/src/types/docs.ts` — `DocKey` и `DocSectionIds`
     ПОМЕЧЕНЫ как auto-generated («Generated at ...»). Скорее всего есть
     генератор из markdown → `structured-docs.json` → `types/docs.ts`.
     **Найти и запустить генератор** (проверить `package.json` homepage scripts),
     не править руками.
   - `packages/homepage/src/data/structured-docs.json` — регенерируется.
6. **Перекрёстные ссылки:** добавить ссылки из связанных страниц
   (`middlewares`, `ssr-hydration`, `persist-migration`, `subscriptions`).

> NB: уточнить пайплайн генерации (есть ли watch/CLI скрипт). Это влияет на то,
> правится `structured-docs.json`/`types/docs.ts` руками или генерацией.

---

## 7. Открытые вопросы / решения до старта

1. ~~Где разместить рецепты форм~~ — **РЕШЕНО (§5):** новая подгруппа «Рецепты»
   (`nav.sections.state-recipes`) внутри pillar State Manager.
2. **Одна страница `forms` с уровнями vs 4 отдельные страницы** (`forms-basic`,
   `forms-validation`, `forms-persist-sync`, `forms-ssr`)?
3. **Валидация:** своя функция-схема как основа + опциональный адаптер под
   zod/yup? Или только своя, чтобы рецепт был zero-dependency?
4. **Валидация: middleware (основное) vs селектор (альтернатива)** — оба показать,
   подтвердить приоритет middleware (как просил пользователь).
5. **Живой пример:** делать ли интерактивный пример в `packages/examples`
   (как `pokemon-advanced` / `ApiClientExample`) и линковать из доки?
6. **Зависимость от улучшений storage-хуков** (`equals` в `useStorageSubscribe`,
   `useStorageRef` из `STORAGE_REACTIVE_AUDIT.md`): ждать их или писать рецепт на
   текущих хуках и обновить позже? (Рекомендация: писать на текущих, отметить
   перф-улучшение как следующий шаг.)

---

## 8. Критерии приёмки

- [ ] Рецепт(ы) форм опубликованы на RU и EN, видны в сайдбаре, открываются.
- [ ] Код из рецепта **копипастится и запускается** без правок (zero-dependency
      вариант проверен).
- [ ] Показаны: базовая форма, валидационная middleware (с разбором граблей
      §4.2), персист + cross-tab, SSR-гидрация.
- [ ] Честный раздел «чем отличается от react-hook-form / чего нет из коробки».
- [ ] Перекрёстные ссылки на `middlewares`, `ssr-hydration`, `persist-migration`,
      `subscriptions` проставлены.
- [ ] `types/docs.ts` / `structured-docs.json` обновлены ГЕНЕРАТОРОМ, не руками.
- [ ] (Опц.) живой пример в `packages/examples` + ссылка из доки.

---

## 9. Связанные материалы в репозитории (фактура)

- Middleware API: `packages/synapse/src/core/storage/utils/middleware-module.ts`
- Примеры middleware: `sync-storage-shallow-compare.middleware.ts`,
  `sync-broadcast.middleware.ts`, `storage-batching.middleware.ts`,
  `storage-logger.middleware.ts`
- SSR/гидрация: `core/storage/__tests__/hydrate.test.ts`,
  `utils/dehydrateModule.ts`, `react/utils/createSynapseCtx.tsx`
- Подписки/чтение в React: `react/hooks/useStorageSubscribe.ts`,
  `react/hooks/useSelector.ts` (+ см. `STORAGE_REACTIVE_AUDIT.md`)
- Док-страницы-ориентиры: `docs/{ru,en}/middlewares.md`, `ssr-hydration.md`,
  `persist-migration.md`, `subscriptions.md`; секции
  `homepage/.../sections/{middlewares,ssr-hydration,persist-migration}.tsx`
- Эталон «рецепта»: `docs/{ru,en}/pokemon-advanced.md` +
  `sections/pokemon-advanced.tsx`
</content>
