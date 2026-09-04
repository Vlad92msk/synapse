# SSR, гидрация/дегидрация — конспект

Личный конспект по механизму SSR и гидрации. Собран по коду `synapse` (state-manager)
и проекта `sn_client` (лента постов профиля). Годится и для понимания, и для собеса.

---

## 0. Одной фразой

SSR требует, чтобы **серверный и первый клиентский рендер увидели идентичное состояние**.
Сервер и клиент — разные процессы, поэтому состояние переносится сериализацией:
**dehydrate** выжимает из стора плоский JSON-снапшот, он вшивается в HTML, на клиенте
**hydrate** засеивает его в стор *до первого рендера*. Иначе — hydration mismatch.

### Весь путь снапшота одной картинкой

```
fetch → dehydratePostsFeed → dehydrateModule (fork → snapshot → собрать main)
     → page.tsx: snapshot = проп dehydratedState
     → createSynapseCtx: resolveAwaiter → awaiter → getStoreIfReady → seedHydration (до первого рендера)
     → сервер рендерит HTML с данными; клиент засевает свой стор тем же снапшотом → нет mismatch
     → useEffect: подписки, seed-guard гасит дубль-GET
```

Дальше — то же самое по слоям, подробно.

---

## 1. Что реально уходит клиенту

На сервере при запросе страницы происходят **две вещи одновременно**, и передаётся **и то, и другое**:

- **Фетч данных** → JSON (посты, профиль).
- **`renderToString`** → React прогоняет компоненты **на сервере** и превращает их в **строку HTML**
  с уже вписанными данными.

Ответ клиенту — один HTML-документ:

```html
<div id="root"><ul><li>bulbasaur</li>...</ul></div>   <!-- 1. готовый HTML (renderToString) -->
<script>window.__DEHYDRATED__ = {"pokemonList":[...]}</script>  <!-- 2. те же данные в JSON (dehydrate) -->
<script src="/bundle.js"></script>                     <!-- 3. сам SPA -->
```

- **HTML (1)** — чтобы браузер показал контент мгновенно, до загрузки JS (скорость + SEO).
- **JSON (2)** — чтобы «оживить» этот HTML на клиенте.

---

## 2. Два разных «hydrate» — не путать

- **React `hydrateRoot()`** (не `createRoot()`) — оживляет DOM: не рисует заново, а «прицепляет»
  события/хуки/реактивность к **уже существующему** серверному HTML.
- **`storage.hydrate()`** (наш стор) — засевает стор данными, чтобы React-рендер выдал HTML,
  **совпадающий** с серверным.

Второй нужен, чтобы сработал первый без mismatch.

### Почему mismatch вообще возможен
`hydrateRoot` прогоняет твои компоненты **ещё раз в браузере** и сравнивает результат с
пришедшим DOM. Совпало → просто вешает обработчики (быстро, без мерцания). Не совпало →
React выкидывает серверный HTML и перерисовывает (варнинг + мерцание).

### Почему клиент не «фетчит сам»
- `fetch` асинхронный, а первый рендер синхронный и немедленный → данных ещё нет → mismatch.
- Лишний сетевой запрос за тем, что сервер уже получил.

Решение — не перезапрашивать, а **перенести уже полученное** (dehydrate → HTML → hydrate).

---

## 3. `'use client'` ≠ «только в браузере»

Главное заблуждение. `'use client'` значит «выполняется **и** на сервере, **и** в браузере».
На **первой загрузке** клиентский компонент **тоже** прогоняется через `renderToString` на
сервере → его HTML попадает в ответ. «Только в браузере» он становится на последующих
**клиентских навигациях** (SPA-переходы).

Критерий «сработал ли SSR» один:
> **Попал ли контент в HTML первого ответа сервера?**

- Данные пришли пропом и отрисованы **синхронно** → в HTML → SEO видит, FCP/LCP лучше.
- Данные грузятся `useEffect` → в первом HTML их **нет** → по факту CSR (эффекты на сервере не идут).

---

## 4. Как хуки работают на сервере

`renderToString` исполняет **фазу рендера**, но **не** фазу эффектов:

- **Выполняются на сервере:** `useState`, `useContext`, `useMemo`, `useRef`, кастомные читающие хуки.
- **НЕ выполняются:** `useEffect`, `useLayoutEffect` — только в браузере после гидрации.

Отсюда практическое правило:
> В фазе рендера нельзя читать то, чего нет на сервере: `window`, `localStorage`, `Date.now()`,
> `Math.random()` — иначе mismatch. Такое — только внутри `useEffect`.

### Паттерн «мостик через пропасть гидрации» (`ProfileContent.tsx`)
```ts
const { current } = useCurrentUser()          // на сервере пусто
const profile = current ?? fallbackProfile     // fallbackProfile — серверный резолв
```
- **Сервер:** `current` пуст → `fallbackProfile` → HTML с профилем.
- **Первый клиентский кадр:** `current` ещё пуст → `fallbackProfile` → **тот же HTML** (нет mismatch).
- **После гидрации:** эффекты запустились, стор наполнился → `current` перетирает фолбэк → живой профиль.

---

## 4.5. Четыре уровня — фундамент, без него всё путается

Главный источник каши в голове: кажется, что есть «synapse» и «его состояние» — два уровня.
На деле их **четыре**, и почти каждый вопрос «как это работает» снимается, если их разделить.

| Уровень | Что это | В коде |
|---|---|---|
| **1. Module (handle)** | ленивая обёртка над фабрикой. Ещё **НЕ** стор. Умеет `.ready()`/`.fork()` | `postsSynapse`, результат `fork()` |
| **2. Synapse (instance)** | собранный **живой** стор: `{ storage, dispatcher, selectors, state$ }` | результат `await handle.ready()` |
| **3. Storage** | контейнер состояния внутри instance: кэш, подписчики, middleware, реактивность | `synapse.storage` |
| **4. State (snapshot)** | **плоский объект данных** типа `TState`. Голые данные, без машинерии | `storage.getStateSync()` |

- `fork()` возвращает **уровень 1** (новый handle), а `.ready()` превращает его в **уровень 2** (instance).
- `postsSynapse` — это handle-**синглтон**: создаётся один раз при загрузке серверного бандла,
  живёт всю жизнь процесса, **общий на всех пользователей**. Он играет **две роли сразу**:
  - **как шаблон:** `fork()` порождает из его фабрики изолированные форки под запрос;
  - **как живой синглтон:** `ready()` собирает **один** instance (`settled`) — это **main**.
- **Дегидрация** = вынуть **уровень 4** (голые данные) из живого стора, отбросив машинерию
  уровней 2–3. «Лишнее» — это не мусор в данных, а подписки/middleware/реактивность: то, что
  не переживёт JSON. Snapshot — «сухой концентрат», который на клиенте «разбавят» обратно (hydrate).
- Тип snapshot — **ровно `TState`** (тот же интерфейс, что и `initialState`). «Сериализуемый» —
  требование не к типу, а к **наполнению**: в `TState` нельзя класть функции, классы с методами,
  `Map`/`Set`, `Date`, циклы — только то, что переживёт `JSON.stringify`/`parse`.

---

## 5. Дегидрация на сервере — `dehydrateModule.ts`

```ts
const forkHandle = synapseModule.fork()                    // 1. новый handle под запрос
const forkInstance = await forkHandle.ready({ withEffects: false })  // 2. собрать instance, эффекты OFF
if (state) await forkInstance.storage.hydrate({ ...forkInstance.storage.getStateSync(), ...state })  // 3. мердж → storage
const snapshot = forkInstance.storage.getStateSync()       // 4. ДЕГИДРАЦИЯ: выжать уровень 4
await forkHandle.destroy()                                 //    форк больше не нужен, snapshot жив
// ...
return snapshot
```

- **`forkHandle = fork()`** — per-request **handle** (уровень 1), из той же фабрики. Без него данные
  пользователя A утекли бы в ответ B (**request bleed**). `.ready()` собирает **forkInstance** (уровень 2).
- **`withEffects: false`** — собрать стор целиком, но **не запускать эффекты**: на сервере они не
  нужны и вредны (у форка — лишняя работа; у main — «висящие» навсегда подписки).
- **`{ ...getStateSync(), ...state }`** — свежий форк ⇒ `getStateSync() == initialState`. `hydrate`
  заменяет состояние **целиком**, поэтому мердж поверх текущего, чтобы частичный `state` не занулил
  непереданные поля (shallow-мердж верхнего уровня). После `hydrate` в `forkInstance.storage`
  лежит результат мерджа.
- **`snapshot`** — плоский объект типа `TState` (уровень 4), уходит пропом `dehydratedState`. Это
  самостоятельная копия-данные: ссылок на форк не держит, переживает его `destroy()`.

### Подготовка main к SSR-рендеру (только при `ssr: true`)

```ts
const mainInstance = await synapseModule.ready({ withEffects: false })  // instance СИНГЛТОНА, не форк
if (mainInstance.storage.initStatus.status === StorageStatus.READY) {
  await mainInstance.storage.hydrate(snapshot)                          // залить в общий стор для рендера
}
```

- **main = instance того же синглтона** `synapseModule` (не форк!). `ready()` мемоизирован → один
  объект. Именно его читает **Provider на сервере** через `getStoreIfReady()`.
- Без сборки синглтон пуст → Provider покажет **спиннер вместо ленты** в HTML.
- Залить в общий стор данные одного запроса безопасно, потому что рендер идёт **синхронно сразу
  после**, в пределах одного запроса; изоляцию под запрос держит форк выше.
- **`initStatus === READY`** только у синхронных сторов (Memory/LocalStorage). У async (IndexedDB)
  синхронного SSR нет → шаг пропускается, флаг `ssr` сам вырождается.

### Два разных `hydrate` на сервере — не путать

Оба — «залить состояние в storage», но с разными целями:
1. **в форк** (шаг 3) — чтобы снять с него snapshot (изоляция под запрос).
2. **в main** — чтобы серверный Provider при `renderToString` прочитал данные и выдал HTML с лентой.

Ни один из них — это **не** «клиентская гидрация». Настоящая гидрация — на клиенте (раздел 7).

---

## 5.5. Что на самом деле читает серверный рендер: main + `seedHydration`

Это стык серверной и клиентской половин и ответ на вопрос «а заливка данных в ОБЩИЙ main не
отравит других пользователей?». Проследим, что происходит при `renderToString` (`createSynapseCtx.tsx`).

Компонент обёрнут в `contextSynapse`. При рендере с пропом `dehydratedState`:

```
1. resolveAwaiter() → per-tree awaiter от синглтона (createSynapseAwaiter(synapseModule))
2. resolveSyncReady → synapseModule.getSnapshot() → main (READY, т.к. его собрали выше)
   → awaiter.store = main  (ОБЩИЙ инстанс!)
3. useState(() => {                       // инициализатор, синхронно
       const store = getStoreIfReady()    // → main
       seedHydration(store)               // → main.storage.hydrate(dehydratedState) ← ЭТОГО запроса
       return store
   })
4. render синхронно читает main → HTML
   ↑ между шагом 3 и 4 НЕТ ни одного await
```

**Вывод:** серверный рендер читает **общий main**, но каждый запрос **пере-засевает его своим
пропом синхронно прямо перед чтением**. Раз между засевом (шаг 3) и чтением (шаг 4) нет точки
уступки (`await`), конкурентный запрос не вклинится посреди рендера. main «мигает» между данными
разных пользователей на границах `await`, но ни один рендер не прочитает чужие данные.

### Тогда зачем вообще собирать main в `dehydrateModule`?

Его настоящая задача — **сделать синглтон READY**, чтобы сработал sync-fast-path:
`getSnapshot()` вернёт READY-instance → `getStoreIfReady()` не `undefined` → Provider рендерит
children, а не спиннер.

Важно не перепутать роли двух строк:

```ts
const mainSynapse = await externalSynapseModule.ready({ withEffects: false })  // ← ЭТО делает READY
if (mainSynapse.storage.initStatus.status === StorageStatus.READY) {
  await mainSynapse.storage.hydrate(snapshot)                                    // ← только пишет данные
}
```

- **READY даёт `ready()`** (сборка + `initialize()`). К моменту `if (READY)` синглтон **уже** READY —
  это просто **guard**, а не механизм доведения до READY. `await` у `hydrate` формально создаёт
  микрозадачу (нужно для async-сторов), но **READY не «доводит»** — статус выставлен раньше.
- **`hydrate(snapshot)` только пишет состояние.** В стандартном потоке эти данные **затираются
  пропом** через `seedHydration` при рендере (§5.5 выше) → в HTML они не попадают.

Отсюда практический вывод: **в happy-path `hydrate(snapshot)` можно было бы и не делать** — рендер
всё равно покажет данные из пропа. Оставлен как **belt-and-suspenders**: держит данные в main
корректными для любого пути, который прочитает синглтон **не** через проп-seed (компонент под
Provider без `dehydratedState`, прямое чтение стора). Убрать можно, оставить — безопаснее.

Отсюда и безопасность мутации общего main: **никто не доверяет его залитым данным** — каждый
рендер пере-засевает свои из `dehydratedState`. Изоляция под запрос держится на трёх вещах:
1. **данные едут в пропе** `dehydratedState` (изолирован, летит в HTML именно этого запроса);
2. **`seedHydration`** пере-накладывает их синхронно при рендере;
3. **рендер синхронный** — нет `await` между засевом и чтением.

Хрупкое место: если рендер **приостановится** (Suspense/стриминг) между засевом main и чтением —
чужой запрос теоретически успеет пере-засеять. Для sync-сторов это не наступает; поэтому вся
схема «залить данные в общий синглтон» живёт только для синхронных сторов (Memory/LocalStorage).

> При `ssr: false` main не собирается и не засевается → сервер отдаёт `loadingComponent`, состояние
> main для HTML не используется — тогда синглтон работает **только как фабрика форков**.

---

## 6. `hydrate` vs `initialState` — НЕ одно и то же

| | `initialState` | `hydrate(snapshot)` |
|---|---|---|
| Когда | при `initialize()`, **только если стор пуст** | в любой момент, **заменяет что угодно** |
| Данные | статический дефолт в коде | динамика из конкретного запроса |
| Приоритет | уступает существующему | **побеждает** дефолт |
| Роль | «пустая форма по умолчанию» | «залить реальные данные» |

`initialize()` дёргает `initialState` только при `!hasExistingState`. `hydrate` **до** `initialize()`
кладёт состояние → `hasExistingState === true` → `initialState` пропускается. **Серверные данные
побеждают.** Плюс `hydrate` после `initialize()` уведомляет подписчиков (реактивно перерисует).

---

## 7. Гидрация на клиенте — `createSynapseCtx.tsx`

```ts
const [synapseStore] = useState(() => {
  const store = resolveAwaiter().getStoreIfReady()
  seedHydration(store)   // ← засев ДО первого рендера
  return store
})
```

- Засев в **инициализаторе `useState`**, а не в `useEffect` — потому что гидрация обязана
  произойти **синхронно, до первого рендера**. В `useEffect` было бы поздно → mismatch.
- `dehydratedState !== undefined` → per-tree awaiter (изоляция серверного рендера);
  иначе — общий клиентский awaiter (обычный SPA).

### `clientAwaiter` vs per-tree awaiter — какой стор берётся

`resolveAwaiter` выбирает, откуда взять стор:

```ts
const resolveAwaiter = () => {
  if (dehydratedState !== undefined) {          // SSR / гидрация
    return treeAwaiterRef.current ??= createSynapseAwaiter(synapseModule)  // per-tree
  }
  return getClientAwaiter()                      // обычный SPA → clientAwaiter
}
```

`clientAwaiter` — переменная **уровня модуля** (создаётся при `createSynapseCtx`, живёт в замыкании).
Что это значит в каждой среде:

- **На клиенте** — намеренный **app-wide синглтон**: один общий стор на всё приложение, строится один
  раз при первом mount. Берётся, когда пропа нет (обычный SPA).
- **На сервере** — переменная модуля живёт **в процессе, общая между запросами** (то есть процесс-
  глобальная). Общий на всех запросов стор = **request bleed**, поэтому на SSR-пути `clientAwaiter`
  **не используют**: при наличии `dehydratedState` берётся **per-tree awaiter** (`treeAwaiterRef`,
  свой на каждое дерево рендера).

Итог: общий стор безопасен **только на клиенте**; на сервере он обходится через per-tree awaiter.
(Per-tree awaiter всё равно читает тот же синглтон main через `getSnapshot()` — изолирует он
**состояние awaiter'а**, а корректность данных под запрос держит проп + `seedHydration`, см. §5.5.)

### `useEffect` рядом — не дубль `useState`

На клиенте при первом рендере стор может быть **ещё не готов** (async-сборка: фабрика ждёт
зависимости, `storage.initialize()` у IndexedDB async). `useState` схватил то, что было синхронно
(возможно, `undefined`). `useEffect` после маунта:
1. перепроверяет готовность (вдруг уже готов) + сеет свежий стор;
2. **подписывается** через `onReady`/`onError` — когда async-сборка завершится, обновит state и
   перерисует с данными.

`useState` = синхронный кадр для SSR/first-paint; `useEffect` = догнать async-готовность на клиенте.
На сервере `useEffect` не идёт — там синхронного стора уже хватило.

### Не путать входы в дегидрацию

`createSynapseCtx` отдаёт замыкание `dehydrate` — это **ярлык** к тому же `dehydrateModule`
(с подставленными модулем и `ssr`). Если в проекте есть свой серверный хелпер (напр.
`dehydratePostsFeed`, который сам зовёт `dehydrateModule`) — замыкание может **не использоваться**.
Дважды дегидрация не происходит: на запрос — один `dehydrateModule`.

---

## 7.5. `createSynapseAwaiter` — готов ли стор прямо сейчас

React при первом рендере спрашивает синхронно: «дай стор **сейчас**». А стор бывает async
(фабрика ждёт зависимости, `storage.initialize()` у IndexedDB). Awaiter — маленький **автомат
состояния** `pending` / `ready` / `error`, который умеет ответить и синхронно, и асинхронно.

- **`resolveSyncReady(input)`** — синхронный ярлык: достать готовый стор прямо сейчас. Для handle —
  через `getSnapshot()` (отдаёт `settled`, если READY); либо напрямую переданный готовый synapse.
  Не вышло → `undefined` → асинхронный путь. **Это и есть SSR sync-fast-path** — так серверный
  рендер синхронно получает `main`.
- **Конструктор** сразу зовёт `resolveSyncReady`: если готов — выставляет `store`+`ready` **до
  возврата**, чтобы `getStoreIfReady()` отдал стор на первом же синхронном рендере.
- **`storeInitPromise`** (async) — ветка, когда синхронно готового не было: `await` стор →
  `await storage.waitForReady()` → выставить `ready` и дёрнуть подписчиков `onReady` (или `onError`).
- **API:** `getStoreIfReady()` (стор или `undefined`), `onReady`/`onError` (подписка; если уже готов —
  зовёт немедленно), `waitForReady`, `isReady`, `destroy`.

Связка со всем разобранным:

```
СЕРВЕР (стор ПРЕДсобран в dehydrateModule): resolveSyncReady → готов сразу → getStoreIfReady → seed → рендер
КЛИЕНТ (1-я гидрация, стор ещё не строился): синхронно undefined → useState = undefined →
        useEffect: onReady → стор достроился → перерендер с данными
```

Синхронный путь срабатывает там, где стор **уже собран** (сервер после `dehydrateModule`; повторный
mount на клиенте, когда синглтон уже построен). Первая клиентская гидрация идёт async-путём — подробно
в §7.6.

Одной фразой: awaiter — **мостик между «React хочет синхронно» и «стор бывает async»**.

---

## 7.6. Тайминг на клиенте: sync на сервере, async на клиенте

Важный факт, снимающий заблуждение «к первому кадру всё синхронно готово и на клиенте тоже».

**Стор по сети НЕ переезжает.** Сервер (Node) и клиент (браузер) — разные процессы; серверный и
клиентский синглтоны — **разные объекты**, каждый строится из одной фабрики. Едет только
`dehydratedState` (JSON в HTML). Клиент по нему **пересобирает свой стор и заново засевает**. Снапшот —
мост между двумя разными сторами, а не переезд одного.

Отсюда разный тайминг:

```
СЕРВЕР:  dehydrateModule сделал await ready() ДО рендера → стор READY →
         getStoreIfReady() отдаёт синхронно → seed в useState → HTML с данными (1 кадр)

КЛИЕНТ:  стор заранее НЕ строится, buildSynapse async →
         1-й кадр: стор не READY → гейт Provider'а → loadingComponent
         (микрозадача: стор достроился → onReady → seedHydration → setSynapseStore)
         2-й кадр: стор READY и засеян → дети с данными
```

То есть на клиенте sync-стор доезжает **на тик позже, через `onReady`** (не через синхронный
`useState`). Это один лишний ре-рендер, проскакивающий за микрозадачу.

### Почему при этом НЕТ дубль-запроса

Гейт Provider'а — ключ:

```ts
if (!synapseStore) return <>{loadingComponent}</>   // дети НЕ монтируются, пока стор не готов

onReady((store) => { seedHydration(store); setSynapseStore(store) })  // сперва засев, потом дети
```

Пока стор не готов — `PostsBody` (с эффектом `mounted`) **не смонтирован**. К моменту его маунта стор
**уже засеян** → seed-guard видит `seeded` → `EMPTY` → GET не летит. Правильный порядок гарантирует
гейт, а не удача.

### Цена (легаси-путь: стор с данными БЕЗ оболочки)

Раз серверный HTML = контент, а первый клиентский кадр = `loadingComponent`, для sync-стора возможен
**hydration-варнинг** в консоли + микро-мерцание. Хуже: React, увидев `<section>` (сервер) ≠ `<p>`
(клиент), **выкидывает серверный HTML и регенерирует поддерево** — на реальном кейсе это переиграло
инлайн-`<head>`-скрипт темы (`data-theme`) и уронило CSS-переменные (страница без стилей). То есть «цена»
на практике ломает UX, а не только шумит.

> **С 5.4.0 эта цена устранена, если у стора с данными есть оболочка.** Дай стору `ssrShell` (или
> объектную форму — оболочка выведется сама), и первый клиентский кадр засеет **оболочку** тем же
> `dehydratedState` → кадр-1 рендерит тот же контент, что и сервер → **mismatch и регенерации нет**,
> `loadingComponent` для такого стора не нужен. `onReady` затем апгрейдит на реальный async-стор (тоже
> засеянный). Композиция `ssrShell` + `dehydratedState` — см. §8.5.
>
> «Цена» остаётся только для легаси-пути: стор с данными БЕЗ оболочки (кадр-1 = `loadingComponent`).
> Для **фоновых** сторов без данных оболочка всегда пустая на кадре-1 (и совпадает с сервером) — там
> mismatch'а не было и нет.

> Заметка про «известный баг» с повторным клиентским GET (`ssr-posts-client-request-bug`) на практике
> может не воспроизводиться — гейт Provider'а закрывает основной сценарий. Доверяй наблюдению; если
> дубль всё же увидишь — ищи рассинхрон owner/scope между `mounted` и seed, а не «стор не успел».

---

## 8. Опция `ssr: true/false`

Отвечает на вопрос: **класть ли контент стора в серверный HTML синхронно.**

В `dehydrateModule` при `ssr`:
```ts
const main = await synapseModule.ready({ withEffects: false })
if (main.storage.initStatus.status === StorageStatus.READY) {
  await main.storage.hydrate(snapshot)   // залить snapshot в main
}
```

**`main` — это не временный стор.** `synapseModule` — ленивый мемоизированный handle; `ready()`
собирает стор один раз и кладёт в `settled`. `main` === `settled` === **синглтон модуля**.
Его же читает Provider на сервере:

```
getStoreIfReady() → awaiter → resolveSyncReady → getSnapshot() → settled  (тот же объект!)
```

Поэтому сборка main — не «локальная»: она наполняет синглтон, который читает серверный рендер.
Без неё `getSnapshot()` вернёт `undefined` → awaiter уйдёт в async → `getStoreIfReady()`
отдаст `undefined` → Provider покажет `loadingComponent` → **в HTML спиннер, не данные.**

**Откуда `initStatus === READY`:** `ready({ withEffects: false })` прогоняет весь пайплайн, включая
`storage.initialize()`. У `MemoryStorage`/`LocalStorage` инициализация синхронная → сразу `READY`.
У `IndexedDB` (async) синхронно READY не станет → шаг пропускается (флаг сам вырождается).

| | `ssr: true` | `ssr: false` |
|---|---|---|
| Provider на сервере | рендерит **children** (контент в HTML) | рендерит **`loadingComponent`** |
| Для чего | sync-сторы с SEO/first-screen данными | async-сторы (IndexedDB) или client-only |

- **Всегда `true`:** для async — безвредно (READY-проверка отсечёт). Для sync без seed — покажет
  пустые children вместо спиннера + лишняя сборка на сервере.
- **Всегда `false`:** SEO-сторы никогда не попадут в HTML → всегда спиннер на сервере, боты
  контент не увидят. (Дубль-запроса всё равно нет — seed-guard работает независимо от `ssr`.)

Правило:
> **`ssr: true`** — sync-стор (Memory/LocalStorage), данные нужны в HTML (SEO / первый экран).
> **`ssr: false`** — async-стор (IndexedDB) или client-only без серверных данных.

Флаг статический (задаётся при `createSynapseCtx`), но `true` сам корректно деградирует для async.

> **С 5.4.0 `ssr: true` умеет больше.** Всё в этом разделе — про стор **с серверными данными**, доведённый
> до READY заранее в `dehydrateModule` (сборка main). Но флаг `ssr: true` теперь включает и **второй путь**:
> если у модуля задана `ssrShell`, а синхронно-готового стора нет (например, у **фонового** провайдера с
> async-фабрикой и без `dehydratedState`), Provider строит синхронную **оболочку** из `initialState` и всё
> равно рендерит children. То есть `ssr: true` + `ssrShell` даёт серверный контент даже для async-стора —
> см. §8.5. (Раньше гейт рендера флаг `ssr` вообще не читал: он использовался только внутри `dehydrateModule`,
> и `{ ssr: true }` без seed давал `loadingComponent`.)

---

## 8.5. SSR фоновых провайдеров без серверных данных — `ssrShell`

Всё до этого — про стор, которому **пришли серверные данные** (лента постов: `dehydrate` → snapshot →
`seedHydration`). Но есть провайдеры, которые оборачивают большое поддерево (шелл приложения), а **своих
серверных данных не имеют**: presence, relations, media-player. Их стор строится **async-фабрикой**
(`await getCoreSynapse()`, сокет), поэтому синхронно на сервере он никогда не готов. Без помощи такой
провайдер упирается в гейт `loadingComponent` и **срезает всё поддерево из HTML** — включая корректно
засеянную ленту двумя уровнями глубже. Ни `dehydrate`, ни warm тут не применить: **снапшота нет** (нет
серверных данных), а фабрика async.

**Решение — синхронная SSR-оболочка.** Модуль умеет построить «пустой» стор из `initialState` в обход
async-фабрики, её зависимостей и эффектов. Это тот же **уровень 2 (instance)** из §4.5, но собранный
синхронно и без машинерии зависимостей/эффектов.

```ts
// объявление: второй аргумент createSynapse
export const presenceSynapse = createSynapse(
  async () => { const core = await getCoreSynapse(); return { storage, dependencies:[core], dispatcher, selectors, effects } },
  { ssrShell: () => {                         // ← синхронно, без deps/effects; storage — sync (Memory)
      const storage = new MemoryStorage<PresenceState>({ name:'presence', initialState })
      return { storage, selectors: new PresenceSelectors(storage), dispatcher: new PresenceDispatcher(storage) }
    } },
)
// провайдер: withPresence(({children}) => <>{children}</>), createSynapseCtx(presenceSynapse, { ssr:true })
```

### Что происходит по уровням

- **`storage.initializeSync()`** (новый sync-lifecycle sync-сторов) доводит Memory/LocalStorage до
  **READY в один тик**, без `await` — вся их инициализация (`initializeWithMiddlewares`) и так синхронна.
  У async-сторов (IndexedDB) его нет → оболочка для них невозможна (понятная ошибка).
- **`SynapseModule.buildSyncShell()`** синхронно собирает **новый instance** из `ssrShell`
  (`storage.initializeSync()` → `dispatcher[FINALIZE]()` → `state$`). Не мемоизируется: **новый на каждый
  вызов** — request-изоляция на сервере; throwaway на первый кадр гидрации на клиенте.
- **Provider (`createSynapseCtx`)** при `ssr: true` и НЕ готовом сторе строит оболочку и рендерит children.

### Сервер vs клиент (тайминг оболочки)

```
СЕРВЕР:  ssr:true, стор не готов синхронно, есть ssrShell →
         НЕ трогаем общий clientAwaiter (иначе async-фабрика/эффекты/WS поедут на сервер + bleed) →
         buildSyncShell() → children в HTML (пустое initialState-состояние)

КЛИЕНТ:  1-й кадр (гидрация): та же оболочка (пустое состояние) === сервер → нет mismatch
         useEffect: поднимается реальный async-стор (clientAwaiter) →
         onReady → контекст свапается на реальный стор, оболочка уничтожается
```

### Почему изоляция бесплатна

Оболочка засевается **константным `initialState`** — одинаковым для всех запросов. Данных одного запроса
в ней нет по определению → **cross-request bleed невозможен by design** (в отличие от §5.5, где общий main
приходилось защищать синхронным пере-засевом пропа). Плюс серверный код **не создаёт `clientAwaiter`** —
значит async-фабрика, эффекты, WebSocket, IndexedDB на сервер не тянутся (важно: SSR шелла втягивает в
серверный рендер много client-only компонентов — они обязаны быть SSR-safe, `document`/`window` только в
`useEffect`).

### Как это сочетается с путём posts

Пути **компонуются на двух уровнях**:

1. **Дерево:** страница сеет ленту через `dehydratedState` (§5–§7), а фоновый `presence` двумя уровнями
   выше — через `ssrShell`. Без оболочки гейт `presence` вырезал бы засеянную ленту из HTML вообще.
2. **Один стор:** у стора С данными может быть И `dehydratedState`, И оболочка одновременно. Тогда на
   первом клиентском кадре, если реальный async-стор ещё не готов, **оболочка засевается снапшотом**
   (`seedHydration(shell)`) → кадр-1 = серверный контент → нет mismatch (см. §7.6 «Цена»). Раньше seed
   применялся только к готовому стору, но не к оболочке — оттого кадр-1 был пустым/`loadingComponent`.

| | стор с серверными данными (posts) | фоновый стор без данных (presence) |
|---|---|---|
| Механизм | `dehydratedState` + оболочка (объектная форма) → seed оболочки на кадре-1 | `ssrShell` + `{ ssr: true }` |
| Что в HTML | контент с данными запроса (сервер и кадр-1) | children с пустым `initialState` |
| Изоляция | форк для снапшота + `seedHydration` (в реальный стор ИЛИ в оболочку) | константный `initialState` (данных запроса нет) |
| Кадр-1 клиента | оболочка, засеянная `dehydratedState` → контент, нет mismatch | пустая оболочка = сервер, нет mismatch |

---

## 9. Как не сделать дубль-запрос — seed-guard (`posts.effects.ts`)

Компонент шлёт лишь **сигнал жизненного цикла**, решение о фетче — в эффекте модуля:

```ts
// PostsBody.tsx
useEffect(() => { postsActions.mounted({ ownerPublicId, scope }); ... }, [...])

// posts.effects.ts
if (seeded && seededOwner === effectiveOwner && seededScope === scope) return EMPTY  // guard
return of(dispatcher.loadPosts(...))
```

- Сервер засеял ленту → `seeded === true` (`list.length > 0` или `postsRequest === Success`).
- Компонент монтируется в браузере, шлёт `mounted`.
- Guard видит совпадение owner+scope → `return EMPTY` → **GET не делается.**
- Guard НЕ сработает (и запрос нужен) при: смене профиля/навигации (owner изменился), отсутствии
  seed (обычный SPA), другом scope (home/global).

Это ровно паттерн React Query staleTime: сервер положил свежее в кэш → повторный fetch на маунте
не идёт. Роль `staleTime` играет seed-guard.

---

## 10. Полная цепочка (профиль в `sn_client`)

```
СЕРВЕР (page.tsx):
  Promise.all([resolveViewedProfile, fetchInitialFeed, fetchSectionPreviews])   ← данные
  dehydratePostsFeed(feed) → dehydrateModule(ssr:true):
       forkHandle = fork()                          [1] новый handle под запрос
       forkInstance = ready(withEffects:false)      [2] собрать instance, эффекты OFF
       forkInstance.storage.hydrate({...initial, ...state})  [3] мердж → storage
       snapshot = forkInstance.storage.getStateSync()        [4] ДЕГИДРАЦИЯ (плоский TState)
       forkHandle.destroy()                             форк умер, snapshot жив
       if(ssr): mainInstance = ready(main) → mainInstance.storage.hydrate(snapshot)  ← собрать+залить синглтон
  <ProfileContent fallbackProfile dehydratedState dehydratedComments />
       renderToString: хуки рендера идут, useEffect НЕТ, profile = fallbackProfile
       withPosts Provider: getStoreIfReady() → settled READY → рендерит ленту
  → HTML с профилем и постами (+ dehydratedState в разметке)

═══════════ сеть ═══════════

КЛИЕНТ:
  показывает серверный HTML сразу (нет первого loading)
  hydrateRoot:
     seedHydration(dehydratedState) в useState-инициализаторе  ← синхронно, до рендера
     первый рендер === серверный HTML → нет mismatch
     useEffect ЗАПУСКАЮТСЯ:
        mounted → seed-guard видит seeded → EMPTY (нет дубль-GET)
        current наполняется → перетирает fallbackProfile
        комменты/реакции догружаются, включается реактивность/навигация
```

---

## 11. Тезисы для собеседования

1. SSR = сервер и первый клиентский рендер видят одинаковое состояние; иначе hydration mismatch.
2. Сервер отдаёт **и HTML** (`renderToString`, для скорости/SEO) **и JSON** (`dehydrate`, для оживления).
3. React на клиенте делает `hydrateRoot` (не `createRoot`): не рисует заново, а прицепляет
   интерактивность к готовому DOM; для этого прогоняет компоненты ещё раз и сравнивает.
4. `'use client'` ≠ «только в браузере» — на первой загрузке рендерится и на сервере.
5. Критерий работающего SSR: контент в HTML первого ответа. Пропы+синхронный рендер — да; `useEffect` — нет.
6. На сервере идёт фаза рендера (useState/useContext/useMemo), `useEffect` — нет.
7. Нельзя читать в рендере то, чего нет на сервере (`window`, `Date.now()`, `Math.random()`).
8. `dehydrate` = снять сериализуемый снапшот; на сервере — **per-request fork** (иначе request bleed).
9. `hydrate` ≠ `initialState`: initialState — дефолт для пустого стора и уступает; hydrate заменяет всё и побеждает.
10. Засев на клиенте — синхронно **до** первого рендера (useState-инициализатор, не useEffect).
11. SSR ускоряет **первый осмысленный рендер** (сервер ближе к API, убран клиентский водопад, нет
    спиннера) ценой чуть худшего TTFB.
12. Дубль-запрос гасится seed-guard'ом (аналог staleTime в React Query).

---

## Файлы-первоисточники

- `packages/synapse/src/utils/dehydrateModule.ts` — дегидрация на сервере (fork, snapshot, сборка main)
- `packages/synapse/src/react/utils/createSynapseCtx.tsx` — Provider, seedHydration, ssr-гейт, оболочка (§8.5)
- `packages/synapse/src/utils/createSynapse/factory.ts` — ленивый handle, `settled`, `ready/fork/getSnapshot`, `buildSyncShell` (§8.5)
- `packages/synapse/src/utils/createSynapse/createSynapse.ts` — опция `ssrShell` (§8.5)
- `packages/synapse/src/utils/createSynapseAwaiter.ts` — `resolveSyncReady`, `getStoreIfReady` (sync-fast-path)
- `packages/synapse/src/core/storage/adapters/sync-base-storage.service.ts` — `hydrate`, `initializeWithMiddlewares`, `initializeSync` (§8.5)
- `docs/ru/ssr-hydration.md` — гайд по `storage.hydrate`; `docs/ru/synapse-ctx.md` — раздел про `ssrShell`
- `sn_client`: `.../profile/page.tsx`, `_components/ProfileContent.tsx`, `posts/ui/PostsFeed.tsx`,
  `posts/ui/PostsBody.tsx`, `posts/synapse/posts.effects.ts`, `posts/synapse/posts.context.tsx`,
  `posts/api/posts.server.ts`
</content>
</invoke>
