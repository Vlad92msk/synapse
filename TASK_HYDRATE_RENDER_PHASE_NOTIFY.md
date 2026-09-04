# Клиентская гидрация нотифицирует подписчиков в фазе рендера → «setState in render»

> **Класс бага:** библиотечный. `contextSynapse` на клиенте гидрирует **общий main-синглтон**
> прямо в инициализаторе `useState` (фаза рендера), а `hydrate` синхронно нотифицирует
> подписчиков. Если тот же стор уже слушает компонент с другого роута — его `setState`
> стреляет во время рендера чужого провайдера.

---

## Симптом (как проявилось у потребителя sn_client)

Навигация профиль → лента:

```
Cannot update a component (`PostsBody`) while rendering a different component (`SynapseContext(_c3)`).
    at Set.forEach (<anonymous>)
```

`Set.forEach` в стеке — это обход подписчиков в `notifySubscribers`.

---

## Корень

Путь вызова целиком синхронный и стартует из фазы рендера:

```
useState(initializer)                     // фаза рендера нового провайдера
  → seedHydration(main)                   // createSynapseCtx.tsx:88
    → store.storage.hydrate(dehydratedState)   // createSynapseCtx.tsx:75
      → notifyHydration(...)              // sync-base-storage.service.ts:461
        → notifySubscribers(...) → Set.forEach(subscribers)  // :469–481
          → useSelector подписчика вызывает setState
```

Ключевые факты:

1. **Клиентский стор общий.** `getClientStore()` возвращает один main-синглтон на все маунты
   `contextSynapse` на любом роуте (`createSynapseCtx.tsx:26–31`). Комментарий «роуты
   пере-сеют его» верен, но пере-сев происходит **в рендере**.
2. **Засев идёт в фазе рендера.** `seedHydration(main)` вызывается внутри `useState`-инициализатора
   (`createSynapseCtx.tsx:79–90`), а не в эффекте.
3. **`hydrate` синхронно нотифицирует.** `hydrate` → `notifyHydration` → `notifySubscribers`
   по всем подписчикам ключа (`sync-base-storage.service.ts:450–482`).
4. **Guard пер-инстансный, гонку не ловит.** `seededRef` — это `WeakSet` **на каждый инстанс
   провайдера** (`createSynapseCtx.tsx:66–69`). У нового провайдера (лента `/feed`) он пуст,
   поэтому он спокойно гидрирует общий стор, на который ещё подписан старый провайдер
   (лента профиля). Guard защищает только от повторного засева тем же инстансом, но не от
   нотификации живых подписчиков с других роутов.

Итог: на сервере это безопасно (throwaway-стор на каждый рендер, подписчиков нет —
`createSynapseCtx.tsx:81–85`), а на клиенте общий стор с живыми кросс-роутными подписчиками
получает синхронную эмиссию в фазе рендера.

---

## Что сделать (чек-лист)

- [x] **Отложить клиентский засев в эффект.** В `contextSynapse` на клиенте `hydrate` вызывается
      из `useEffect` (commit-фаза) через `seedClient(...)` → нотификация подписчиков уже не в рендере.
      **Серверная ветка не тронута** — там `seedServer(...)` сеет throwaway-стор в фазе рендера.
- [x] **Сохранён первый клиентский paint для гидрации.** Засев в рендере оставлен **только на самом
      первом клиентском маунте** (`clientRenderSeeded`), когда живых подписчиков ещё нет →
      первый кадр совпадает с SSR-HTML; последующие маунты (навигация) сеют в эффекте.
- [x] **Идемпотентность засева.** `lastClientSnapshot` — сравнение по ссылке; тем же снапшотом
      повторно не сеем (эффект первого маунта = no-op после render-seed).
- [ ] **Тихая нотификация для гидрации (опц., глубже).** НЕ делали — root-фикс на call-site снял
      render-phase-эмиссию; storage-уровневый silent-hydrate оставлен на потом.
- [x] **Тест на регрессию.** `react/__tests__/ssr.client.test.tsx` — «кросс-роутный маунт не
      триггерит setState подписчика во время рендера» (единый app-root, A подписан, маунт B с
      другим снапшотом). Проверено: падает без фикса, зелёный с фиксом.

---

## Файлы

- `packages/synapse/src/react/utils/createSynapseCtx.tsx` — засев в рендере (:66–90), клиентский синглтон (:26–31).
- `packages/synapse/src/core/storage/adapters/sync-base-storage.service.ts` — `hydrate`/`notifyHydration` (:450–482).
- `packages/synapse/src/core/storage/adapters/async-base-storage.service.ts` — зеркальный async-`hydrate` (:455), проверить тот же класс.
- `packages/synapse/src/react/__tests__/ssr.client.test.tsx` — регрессионный тест.

---

## После правки

- Релинк dist для потребителей (sn_client завязан на локальный build).
- Широкий QA потребителей: SSR-первый-paint + SEO, клиентская навигация между роутами с общим
  стором, повторный засев. Пересечение с audit-TODO (`tasks/toTanstack/SSR_HYDRATION_AUDIT_TODO.md`).

## Временный воркэраунд у потребителя (для контекста)

sn_client закрыл это проектным паттерном без правки библиотеки: на навигации снапшот сеется
не через `dehydratedState` (render-time hydrate), а собственным экшеном `seedFromServer` в
`useEffect` (`src/modules/posts/ui/PostsFeed.tsx`, `posts.dispatcher.ts`). Библиотечный
`dehydratedState` оставлен только для сервера и первого клиентского маунта. Это обходной путь —
корневой фикс здесь, в библиотеке.
