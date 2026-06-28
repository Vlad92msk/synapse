// Данные для интерактивного «холста» SSR-гидрации (hydration-flow).
// Каждый шаг выверен по реальной реализации synapse:
//   · fork / ready({ withEffects }) / getSnapshot   → utils/createSynapse/factory.ts
//   · dehydrateModule (fork → ready → hydrate → snapshot → destroy + warm main)
//                                                    → utils/dehydrateModule.ts
//   · getStateSync                                   → core/storage/.../storage-core
//   · hydrate (полная замена состояния)              → core/storage/.../sync-base-storage.service.ts
//   · resolveSyncReady / getStoreIfReady (SSR fast-path) → utils/createSynapseAwaiter.ts
//   · seedHydration / SSR-гейт / useEffect           → react/utils/createSynapseCtx.tsx
//
// Пример сквозной — лента покемонов (как и вся остальная документация).
//
// Структура узла на «полотне»:
//   · сам шаг (спайн)        — call / fn / file / role / what / why / before? / after?
//   · ответвление-теория     — concept?  (концептуальный врез НАД узлом)
//   · ответвление-код        — samples?  (конкретный код приложения и/или библиотеки ПОД/НАД узлом)

export type Lang = 'ru' | 'en'
export type Loc = Record<Lang, string>
export type Zone = 'server' | 'transfer' | 'client'
export type CodeLang = 'json' | 'typescript' | 'tsx'

export interface DataPanel {
  label: Loc
  lang: CodeLang
  code: string
}

/** Концептуальный врез — «ответвление-теория» над узлом. */
export interface ConceptInsert {
  title: Loc
  body: Loc
}

/** Конкретный код шага — «ответвление-код». kind различает код приложения и внутренности synapse. */
export interface CodeSample {
  label: Loc
  /** app — код вашего приложения (page.tsx, серверная функция, контекст); lib — внутренности synapse. */
  kind: 'app' | 'lib'
  lang: CodeLang
  code: string
}

export interface FlowStep {
  id: string
  zone: Zone
  /** Номер на узле (сквозная нумерация шагов). */
  num: number
  /** Короткая подпись узла. */
  call: Loc
  /** Сигнатура вызова (моноширинный). */
  fn: string
  /** Где в коде живёт шаг. */
  file: string
  /** Одна строка — роль шага (под узлом). */
  role: Loc
  /** Что именно вызывается и что происходит. */
  what: Loc
  /** Зачем это нужно. */
  why: Loc
  /** Состояние данных ДО шага (если шаг их меняет). */
  before?: DataPanel
  /** Состояние данных ПОСЛЕ шага. */
  after?: DataPanel
  /** Теоретический врез — ответвление над узлом. */
  concept?: ConceptInsert
  /** Конкретный код — ответвление с кодом приложения/библиотеки. */
  samples?: CodeSample[]
}

export const ZONE_META: Record<Zone, { title: Loc; sub: Loc }> = {
  server: {
    title: { ru: 'СЕРВЕР · RSC', en: 'SERVER · RSC' },
    sub: {
      ru: 'Выполняется на каждый HTTP-запрос. Цель — собрать сериализуемый снапшот и отрендерить HTML с контентом.',
      en: 'Runs on every HTTP request. Goal — build a serializable snapshot and render HTML with real content.',
    },
  },
  transfer: {
    title: { ru: 'ГРАНИЦА · сервер → клиент', en: 'BOUNDARY · server → client' },
    sub: {
      ru: 'Снапшот сериализуется в JSON и едет в payload вместе с HTML.',
      en: 'The snapshot is serialized to JSON and travels in the payload alongside the HTML.',
    },
  },
  client: {
    title: { ru: 'КЛИЕНТ · hydrateRoot', en: 'CLIENT · hydrateRoot' },
    sub: {
      ru: 'Браузер засевает стор снапшотом ДО первого рендера — первый кадр совпадает с серверным.',
      en: 'The browser seeds the store with the snapshot BEFORE the first render — the first frame matches the server.',
    },
  },
}

// ── Фундаментальный врез: что вообще такое «гидрация» ──────────────────────────
// Показывается отдельным узлом В НАЧАЛЕ полотна — снимает главное заблуждение
// («гидрация = только про HTML»).
export const FOUNDATION: ConceptInsert = {
  title: { ru: 'Слово «гидрация» значит две разные вещи', en: '"Hydration" means two different things' },
  body: {
    ru:
      'DOM-гидрация (React): hydrateRoot берёт готовый серверный HTML и «оживляет» его — навешивает обработчики, переиспользует DOM-узлы, не перерисовывая их.\n\n' +
      'State-гидрация (Synapse): storage.hydrate() заливает plain-снапшот ДАННЫХ в живой стор. Тут нет HTML — только данные.\n\n' +
      'Связь: чтобы React-гидрация прошла без mismatch, первый клиентский рендер обязан дать ТОТ ЖЕ markup, что сервер. Markup зависит от состояния стора ⇒ стор на первом клиентском кадре должен содержать ТЕ ЖЕ данные. Поэтому state-гидрация существует РАДИ DOM-гидрации — это две стороны одного процесса.',
    en:
      'DOM hydration (React): hydrateRoot takes the ready server HTML and "revives" it — attaches handlers, reuses DOM nodes instead of repainting them.\n\n' +
      'State hydration (Synapse): storage.hydrate() pours a plain snapshot of DATA into a live store. No HTML here — only data.\n\n' +
      'The link: for React hydration to avoid a mismatch, the first client render must produce the SAME markup as the server. Markup depends on store state ⇒ the store on the first client frame must hold the SAME data. So state hydration exists FOR THE SAKE OF DOM hydration — two sides of one process.',
  },
}

// ── Образцы данных (лента покемонов) ──────────────────────────────────────────
const DTO = `// сырой ответ PokeAPI (ещё НЕ форма стора)
{
  "count": 1302,
  "next": "/api/v2/pokemon?offset=12&limit=12",
  "results": [
    { "name": "bulbasaur", "url": ".../pokemon/1/" },
    { "name": "ivysaur",   "url": ".../pokemon/2/" },
    { "name": "venusaur",  "url": ".../pokemon/3/" }
  ]
}`

const STATE_DEFAULT = `// PokemonState = initialState форка (пустая лента)
{
  "pokemonList": [],
  "offset": 0,
  "hasMore": true,
  "api": { "listRequest": { "status": "idle", "error": null } }
}`

const STATE_HYDRATED = `// PokemonState с реальной лентой (plain JSON)
{
  "pokemonList": [
    { "id": 1, "name": "bulbasaur", "sprite": ".../1.png" },
    { "id": 2, "name": "ivysaur",   "sprite": ".../2.png" },
    { "id": 3, "name": "venusaur",  "sprite": ".../3.png" }
  ],
  "offset": 12,
  "hasMore": true,
  "api": { "listRequest": { "status": "success", "error": null } }
}`

// ── Образцы кода приложения ───────────────────────────────────────────────────
const APP_PAGE = `// app/[locale]/pokemon/page.tsx — RSC, БЕЗ 'use client'
import { fetchFirstPage, dehydratePokemon } from '@/pokemon/pokemon.server'
import { PokemonFeed } from '@/pokemon/PokemonFeed'

export default async function PokemonPage() {
  // ШАГ 1 — серверный фетч (await: данные есть ДО рендера)
  const feed = await fetchFirstPage(0)

  // ШАГИ 2–8 — собрать сериализуемый снапшот стора
  const dehydratedState = await dehydratePokemon(feed)

  // ШАГ 9 — снапшот уезжает пропом в клиентский компонент
  return <PokemonFeed dehydratedState={dehydratedState ?? undefined} />
}`

const APP_SERVER_FN = `// pokemon.server.ts — 'server only'
import 'server-only'
import { dehydrateModule } from 'synapse-storage/utils'
import { pokemonSynapse } from './pokemon.synapse'

const POKE = 'https://pokeapi.co/api/v2'

// ШАГ 1 — прямой fetch, без клиентского ApiClient/кэша/synapse
export const fetchFirstPage = async (offset: number) => {
  const res = await fetch(\`\${POKE}/pokemon?limit=12&offset=\${offset}\`, { cache: 'no-store' })
  if (!res.ok) return null
  return (await res.json()) as PokeListResponse // сырой DTO
}`

const APP_DEHYDRATE = `// pokemon.server.ts — маппинг DTO → форма стора + дегидрация
export const dehydratePokemon = async (feed: PokeListResponse | null) => {
  if (!feed) return null
  // вся механика (fork → ready → hydrate → snapshot → destroy + прогрев main)
  // живёт в server-safe dehydrateModule; здесь — только маппинг полей
  return dehydrateModule(pokemonSynapse, {
    ssr: true,                              // ← прогрев основного handle (ШАГ 8)
    state: {                                // ← накладывается поверх initialState форка
      pokemonList: feed.results.map(toBrief),
      offset: 12,
      hasMore: Boolean(feed.next),
      api: { listRequest: { status: 'success', error: null } }, // «запрос уже успешен»
    },
  })
}`

const APP_CONTEXT = `// pokemon.context.tsx — 'use client'
import { createSynapseCtx } from 'synapse-storage/react'
import { pokemonSynapse } from './pokemon.synapse'

export const {
  contextSynapse: withPokemon,
  useSynapseSelectors: usePokemonSelectors,
  useSynapseActions: usePokemonActions,
} = createSynapseCtx(pokemonSynapse, {
  loadingComponent: <p>Loading…</p>,
  ssr: true,                       // ← разрешить контент в серверном HTML
})

// PokemonFeed.tsx — обёрнут в HOC; проп dehydratedState ловит withPokemon
export const PokemonFeed = withPokemon(() => <PokemonList />)`

// ── Образцы кода библиотеки (synapse) ─────────────────────────────────────────
const LIB_FORK = `// utils/createSynapse/factory.ts
fork() {
  // Независимый handle из той же фабрики — свой стор, свой жизненный цикл.
  return createSynapseModule(factory)
}`

const LIB_READY = `// buildSynapse — один прогон пайплайна на ready()
const config = await factory()        // getCoreSynapse, new MemoryStorage(...)
await storage.initialize()            // IDLE → READY, засев initialState
const state$ = toObservable(storage)  // всегда, даже без эффектов

if (withEffects && moduleEffects.length > 0) {
  await effectsModule.start()         // ← на сервере ПРОПУСКАЕТСЯ (withEffects: false)
}`

const LIB_HYDRATE = `// core/storage/.../sync-base-storage.service.ts
public hydrate(state: T): void {
  this.doSet('', state)                  // ПОЛНАЯ замена состояния
  this._stateCache = this.getRawState()  // обновить синхронный кэш
  this.notifyHydration(this._stateCache) // на сервере подписчиков нет → no-op
}`

const LIB_DEHYDRATE_MODULE = `// utils/dehydrateModule.ts — server-safe (без React)
export const dehydrateModule = async (synapseModule, { state, ssr = false } = {}) => {
  // per-request форк: свой стор, не пересекается с другими запросами
  const fork = synapseModule.fork()
  const forked = await fork.ready({ withEffects: false })

  // hydrate заменяет состояние целиком → мерджим поверх текущего (initialState)
  if (state) await forked.storage.hydrate({ ...forked.storage.getStateSync(), ...state })
  const snapshot = forked.storage.getStateSync()  // ← «обезвоживание»
  await fork.destroy()                            // временный форк убран

  if (ssr) {                                      // ШАГ 8 — прогрев main handle
    const main = await synapseModule.ready({ withEffects: false })
    if (main.storage.initStatus.status === StorageStatus.READY) {
      await main.storage.hydrate(snapshot)
    }
  }
  return snapshot
}`

const LIB_AWAITER = `// utils/createSynapseAwaiter.ts — SSR sync-fast-path
const resolveSyncReady = (input) => {
  // handle уже собран? getSnapshot() отдаёт synapse синхронно
  const snapshot = input?.getSnapshot?.()
  if (snapshot?.storage.initStatus.status === StorageStatus.READY) return snapshot
  // ...иначе уходим в async-ветку (waitForReady)
  return undefined
}
// если стор готов синхронно — getStoreIfReady() отдаёт его сразу (сервер/гидрация)`

const LIB_SEED = `// react/utils/createSynapseCtx.tsx
const seedHydration = (store) => {
  if (store && dehydratedState !== undefined &&
      store.storage.initStatus.status === StorageStatus.READY) {
    store.storage.hydrate(dehydratedState)   // ← та же hydrate, что на сервере
  }
}

const [synapseStore, setSynapseStore] = useState(() => {
  const store = resolveAwaiter().getStoreIfReady()  // синхронно: готов ли стор?
  seedHydration(store)                              // ДО первого рендера
  return store
})`

const LIB_GATE = `// react/utils/createSynapseCtx.tsx — SSR-гейт
if (!synapseStore) return <>{loadingComponent}</>   // нет стора → спиннер

return (
  <SynapseContext.Provider value={synapseStore}>
    <Component {...restProps} ref={ref} />          // есть стор → контент в HTML
  </SynapseContext.Provider>
)`

const LIB_REVIVE = `// react/utils/createSynapseCtx.tsx — оживление (только клиент)
useEffect(() => {
  const instance = resolveAwaiter()
  seedHydration(instance.getStoreIfReady())   // повторный засев (идемпотентно)
  setSynapseStore(instance.getStoreIfReady())

  const offReady = instance.onReady(setSynapseStore) // подписки/эффекты живут тут
  const offErr = instance.onError(setError)
  return () => { offReady(); offErr() }
}, [])`

export const FLOW_STEPS: FlowStep[] = [
  {
    id: 'fetch',
    zone: 'server',
    num: 1,
    call: { ru: 'Серверный фетч', en: 'Server fetch' },
    fn: 'fetchFirstPage(offset)',
    file: 'pokemon.server.ts',
    role: { ru: 'взять первую страницу ленты на сервере', en: 'fetch the first page on the server' },
    what: {
      ru: 'page.tsx — серверный компонент (RSC, без «use client»). Он await-ит fetchFirstPage: прямой fetch на PokeAPI (без клиентского ApiClient, без кэша, без synapse). Получаем сырой DTO: { results, count, next }.',
      en: 'page.tsx is a Server Component (RSC, no "use client"). It awaits fetchFirstPage: a direct fetch to PokeAPI (no client ApiClient, no cache, no synapse). We get a raw DTO: { results, count, next }.',
    },
    why: {
      ru: 'Контент нужен в серверном HTML ради SEO, а значит данные должны существовать синхронно ДО рендера. useEffect здесь не подходит — на сервере он не запускается, на клиенте срабатывает уже ПОСЛЕ первой отрисовки.',
      en: 'Content must be in the server HTML for SEO, so the data has to exist synchronously BEFORE render. useEffect does not help — it never runs on the server and on the client fires only AFTER the first paint.',
    },
    after: { label: { ru: 'Результат — сырой DTO', en: 'Result — raw DTO' }, lang: 'json', code: DTO },
    samples: [
      { label: { ru: 'page.tsx (серверный компонент)', en: 'page.tsx (server component)' }, kind: 'app', lang: 'tsx', code: APP_PAGE },
      { label: { ru: 'pokemon.server.ts (серверная функция)', en: 'pokemon.server.ts (server function)' }, kind: 'app', lang: 'typescript', code: APP_SERVER_FN },
    ],
  },
  {
    id: 'fork',
    zone: 'server',
    num: 2,
    call: { ru: 'Изоляция запроса', en: 'Isolate the request' },
    fn: 'pokemonSynapse.fork()',
    file: 'createSynapse/factory.ts',
    role: { ru: 'независимый handle из той же фабрики', en: 'independent handle from the same factory' },
    what: {
      ru: 'fork() создаёт новый ЛЕНИВЫЙ handle поверх той же фабрики (createSynapseModule(factory)). Фабрика ещё не исполнена — стора пока нет, только «завод».',
      en: 'fork() creates a new LAZY handle over the same factory (createSynapseModule(factory)). The factory has not run yet — there is no store, just a "factory".',
    },
    why: {
      ru: 'Node обслуживает много запросов в одном процессе. Общий синглтон-стор привёл бы к протечке данных между запросами (request bleed). fork() даёт каждому запросу свой стор.',
      en: 'Node serves many requests in one process. A shared singleton store would leak data between requests (request bleed). fork() gives each request its own store.',
    },
    concept: {
      title: { ru: 'Почему форк, а не общий стор', en: 'Why a fork, not a shared store' },
      body: {
        ru:
          'На клиенте стор — синглтон: одна вкладка = один пользователь. На сервере один Node-процесс обслуживает СОТНИ запросов параллельно. Если бы все они писали в общий модульный стор, лента пользователя A попала бы в HTML пользователя B (request bleed).\n\n' +
          'fork() = свой стор на каждый запрос → полная изоляция. После снятия снапшота форк уничтожается.',
        en:
          'On the client the store is a singleton: one tab = one user. On the server a single Node process serves HUNDREDS of requests in parallel. If they all wrote to one shared module store, user A’s feed could end up in user B’s HTML (request bleed).\n\n' +
          'fork() = its own store per request → full isolation. Once the snapshot is taken, the fork is destroyed.',
      },
    },
    samples: [{ label: { ru: 'fork() — внутренности', en: 'fork() — internals' }, kind: 'lib', lang: 'typescript', code: LIB_FORK }],
  },
  {
    id: 'ready-fork',
    zone: 'server',
    num: 3,
    call: { ru: 'Сборка стора без эффектов', en: 'Build store without effects' },
    fn: 'await fork.ready({ withEffects: false })',
    file: 'createSynapse/factory.ts → buildSynapse',
    role: { ru: 'собрать стор, но НЕ запускать эффекты', en: 'build the store, but DO NOT start effects' },
    what: {
      ru: 'Фабрика исполняется один раз: создаётся MemoryStorage с initialState, storage.initialize() доводит стор до READY. Шаг effectsModule.start() ПРОПУСКАЕТСЯ.',
      en: 'The factory runs once: a MemoryStorage is created with initialState, storage.initialize() brings the store to READY. The effectsModule.start() step is SKIPPED.',
    },
    why: {
      ru: 'Нужен готовый изолированный стор для снапшота, но без единой RxJS-подписки/таймера/сокета на сервере. Раньше тут стартовали эффекты — лишь чтобы тут же быть уничтоженными.',
      en: 'We need a ready isolated store for the snapshot, but without a single RxJS subscription/timer/socket on the server. Effects used to start here only to be torn down immediately.',
    },
    after: { label: { ru: 'Стор = дефолтный initialState', en: 'Store = default initialState' }, lang: 'json', code: STATE_DEFAULT },
    samples: [{ label: { ru: 'buildSynapse — пропуск эффектов', en: 'buildSynapse — skipping effects' }, kind: 'lib', lang: 'typescript', code: LIB_READY }],
  },
  {
    id: 'snapshot-base',
    zone: 'server',
    num: 4,
    call: { ru: 'Снимаем базу', en: 'Take the base' },
    fn: 'storage.getStateSync()',
    file: 'core/storage/storage-core',
    role: { ru: 'синхронно прочитать текущее состояние', en: 'read the current state synchronously' },
    what: {
      ru: 'getStateSync() возвращает внутренний _stateCache — сейчас это initialState форка со всеми полями (pokemonList, offset, hasMore, api).',
      en: 'getStateSync() returns the internal _stateCache — currently the fork’s initialState with all fields (pokemonList, offset, hasMore, api).',
    },
    why: {
      ru: 'Берём базу со ВСЕМИ полями, чтобы ниже переопределить только нужные и не потерять структуру стора (hydrate заменяет состояние целиком).',
      en: 'We take a base with ALL fields so we can override only what we need below without losing the store’s shape (hydrate replaces the whole state).',
    },
  },
  {
    id: 'hydrate-fork',
    zone: 'server',
    num: 5,
    call: { ru: 'Заливаем данные', en: 'Pour the data in' },
    fn: 'await storage.hydrate({ ...base, ...serverState })',
    file: 'sync-base-storage.service.ts',
    role: { ru: 'DTO → форма PokemonState', en: 'DTO → PokemonState shape' },
    what: {
      ru: "hydrate(state) делает doSet('', state) — ПОЛНУЮ замену состояния. Поля DTO раскладываются по форме стора: results → pokemonList, next → offset/hasMore, api.listRequest = success.",
      en: "hydrate(state) does doSet('', state) — a FULL state replacement. DTO fields map onto the store shape: results → pokemonList, next → offset/hasMore, api.listRequest = success.",
    },
    why: {
      ru: 'Превратить сырой ответ в точное состояние стора, какое было бы после успешной клиентской загрузки. Пометка api = success говорит клиенту «грузить заново не нужно».',
      en: 'Turn the raw response into the exact store state you’d have after a successful client load. Marking api = success tells the client "no need to load again".',
    },
    before: { label: { ru: 'ДО — сырой DTO', en: 'BEFORE — raw DTO' }, lang: 'json', code: DTO },
    after: { label: { ru: 'ПОСЛЕ — PokemonState', en: 'AFTER — PokemonState' }, lang: 'json', code: STATE_HYDRATED },
    concept: {
      title: { ru: 'initialState ≠ dehydratedState', en: 'initialState ≠ dehydratedState' },
      body: {
        ru:
          'initialState — статический дефолт, зашитый в фабрику модуля (пустой список). Известен на этапе определения модуля, одинаков для всех.\n\n' +
          'dehydratedState (снапшот) — динамика под КОНКРЕТНЫЙ HTTP-запрос, сфетченная на сервере. Свой на каждый запрос, и он ПЕРЕОПРЕДЕЛЯЕТ initialState.\n\n' +
          'Поэтому «просто initialState» задачу не решает: нужны реальные данные под запрос, сериализуемо перенесённые на клиент.',
        en:
          'initialState is a static default baked into the module factory (an empty list). Known at module-definition time, the same for everyone.\n\n' +
          'dehydratedState (the snapshot) is dynamic, per specific HTTP request, fetched on the server. Different per request, and it OVERRIDES initialState.\n\n' +
          'So "just initialState" does not cut it: you need real per-request data, serialized across to the client.',
      },
    },
    samples: [{ label: { ru: 'hydrate() — внутренности', en: 'hydrate() — internals' }, kind: 'lib', lang: 'typescript', code: LIB_HYDRATE }],
  },
  {
    id: 'snapshot-final',
    zone: 'server',
    num: 6,
    call: { ru: 'Снимаем снапшот', en: 'Take the snapshot' },
    fn: 'const snapshot = storage.getStateSync()',
    file: 'utils/dehydrateModule.ts',
    role: { ru: 'итоговый plain-JSON снапшот', en: 'the final plain-JSON snapshot' },
    what: {
      ru: 'Снова getStateSync() — но стор уже залит данными. Получаем финальный PokemonState как plain-объект (без методов/классов) → готов к JSON-сериализации.',
      en: 'getStateSync() again — but the store is already filled. We get the final PokemonState as a plain object (no methods/classes) → ready for JSON serialization.',
    },
    why: {
      ru: 'Это и есть результат «обезвоживания» (dehydrate): сухие данные, которые уедут на клиент пропом dehydratedState. Шаги 2–7 целиком инкапсулированы в dehydrateModule.',
      en: 'This is the result of "dehydration": dry data that will travel to the client as the dehydratedState prop. Steps 2–7 are fully encapsulated in dehydrateModule.',
    },
    after: { label: { ru: 'snapshot (поедет на клиент)', en: 'snapshot (will travel to client)' }, lang: 'json', code: STATE_HYDRATED },
    samples: [{ label: { ru: 'dehydrateModule — вся механика', en: 'dehydrateModule — the whole machinery' }, kind: 'lib', lang: 'typescript', code: LIB_DEHYDRATE_MODULE }],
  },
  {
    id: 'destroy',
    zone: 'server',
    num: 7,
    call: { ru: 'Убираем форк', en: 'Destroy the fork' },
    fn: 'await fork.destroy()',
    file: 'createSynapse/factory.ts → teardown',
    role: { ru: 'уничтожить временный стор (no leak)', en: 'tear down the temporary store (no leak)' },
    what: {
      ru: 'teardown в LIFO чистит dispatcher / selectors / storage. Эффекты не стартовали (withEffects: false) — останавливать нечего.',
      en: 'teardown in LIFO order cleans dispatcher / selectors / storage. Effects never started (withEffects: false) — nothing to stop.',
    },
    why: {
      ru: 'Форк был временным — нужным только чтобы родить снапшот. Утечки памяти/подписок на сервере недопустимы, поэтому форк всегда уничтожается.',
      en: 'The fork was temporary — needed only to produce the snapshot. Memory/subscription leaks on the server are unacceptable, so the fork is always destroyed.',
    },
  },
  {
    id: 'warm-main',
    zone: 'server',
    num: 8,
    call: { ru: 'Прогрев основного handle', en: 'Warm the main handle' },
    fn: 'await main.ready({ withEffects: false }); main.storage.hydrate(snapshot)',
    file: 'utils/dehydrateModule.ts (ssr: true)',
    role: { ru: 'чтобы провайдер на сервере отдал готовый стор', en: 'so the provider returns a ready store on the server' },
    what: {
      ru: 'При ssr: true тем же снапшотом прогревается ОСНОВНОЙ (не форк!) handle модуля — тоже без эффектов.',
      en: 'With ssr: true the same snapshot warms the MAIN (not the fork!) module handle — also without effects.',
    },
    why: {
      ru: 'Провайдер берёт стор через getStoreIfReady(), а его sync-fast-path смотрит на synapseModule.getSnapshot() — то есть на ОСНОВНОЙ handle. Форк прогрел свой стор, а основной остался пуст → без этого шага на сервере рендерился бы loadingComponent, а ленту догружал бы клиент. Это и был корень «лишнего запроса».',
      en: 'The provider reads the store via getStoreIfReady(), whose sync-fast-path looks at synapseModule.getSnapshot() — i.e. the MAIN handle. The fork warmed its own store, the main stayed empty → without this step the server would render loadingComponent and the client would refetch. This was the root cause of the "extra request".',
    },
    concept: {
      title: { ru: 'ssr: true vs ssr: false — на что влияет', en: 'ssr: true vs ssr: false — what it controls' },
      body: {
        ru:
          'Флаг есть и в createSynapseCtx, и в dehydrateModule.\n\n' +
          'ssr: false (дефолт) — провайдер дожидается стор в useEffect, а он на сервере не идёт → в серверный HTML попадает loadingComponent. Контента нет, SEO нет; данные доезжают уже на клиенте.\n\n' +
          'ssr: true — два эффекта: (1) dehydrateModule прогревает основной handle (этот шаг), чтобы getSnapshot() на сервере вернул READY-стор; (2) провайдер при синхронно-готовом сторе рендерит контент сразу, минуя loadingComponent. Итог — лента уже в серверном HTML.\n\n' +
          'Важно: всё это работает для СИНХРОННЫХ сторов (Memory/LocalStorage). У async-сторов (IndexedDB) синхронного серверного рендера нет — там ssr: true сводится к обычному гейту загрузки.',
        en:
          'The flag exists both in createSynapseCtx and in dehydrateModule.\n\n' +
          'ssr: false (default) — the provider waits for the store in useEffect, which never runs on the server → the server HTML gets loadingComponent. No content, no SEO; data arrives on the client.\n\n' +
          'ssr: true — two effects: (1) dehydrateModule warms the main handle (this step) so getSnapshot() returns a READY store on the server; (2) with a synchronously-ready store the provider renders content immediately, skipping loadingComponent. Result — the feed is already in the server HTML.\n\n' +
          'Note: this works for SYNC stores (Memory/LocalStorage). Async stores (IndexedDB) have no synchronous server render — there ssr: true falls back to the usual loading gate.',
      },
    },
  },
  {
    id: 'prop',
    zone: 'transfer',
    num: 9,
    call: { ru: 'Снапшот едет пропом', en: 'Snapshot travels as a prop' },
    fn: '<PokemonFeed dehydratedState={snapshot} />',
    file: 'page.tsx → PokemonFeed',
    role: { ru: 'JSON через границу RSC → client', en: 'JSON across the RSC → client boundary' },
    what: {
      ru: 'PokemonState как сериализуемый объект проходит границу RSC. Next.js сериализует его в HTML-payload, и на клиенте он снова доступен как обычный проп. PokemonFeed обёрнут в withPokemon — проп ловит HOC.',
      en: 'PokemonState, a serializable object, crosses the RSC boundary. Next.js serializes it into the HTML payload, and on the client it is available again as a plain prop. PokemonFeed is wrapped in withPokemon — the HOC catches the prop.',
    },
    why: {
      ru: 'Доставить серверный снапшот ровно туда, где живёт клиентский Provider стора (withPokemon = createSynapseCtx(..., { ssr: true })).',
      en: 'Deliver the server snapshot exactly where the client store Provider lives (withPokemon = createSynapseCtx(..., { ssr: true })).',
    },
    after: { label: { ru: 'dehydratedState (сериализованный JSON)', en: 'dehydratedState (serialized JSON)' }, lang: 'json', code: STATE_HYDRATED },
    samples: [{ label: { ru: 'pokemon.context.tsx (Provider-HOC)', en: 'pokemon.context.tsx (Provider HOC)' }, kind: 'app', lang: 'tsx', code: APP_CONTEXT }],
  },
  {
    id: 'store-if-ready',
    zone: 'client',
    num: 10,
    call: { ru: 'Синхронно берём стор', en: 'Get the store synchronously' },
    fn: 'awaiter.getStoreIfReady()',
    file: 'utils/createSynapseAwaiter.ts',
    role: { ru: 'SSR sync-fast-path', en: 'SSR sync-fast-path' },
    what: {
      ru: 'При наличии dehydratedState используется per-tree awaiter (изоляция дерева). resolveSyncReady проверяет getSnapshot()/READY-storage и синхронно отдаёт клиентский MemoryStorage — он sync, готов сразу.',
      en: 'When dehydratedState is present a per-tree awaiter is used (tree isolation). resolveSyncReady checks getSnapshot()/READY-storage and synchronously returns the client MemoryStorage — it is sync and ready immediately.',
    },
    why: {
      ru: 'Стор нужен СИНХРОННО, ещё до первого рендера, чтобы было куда залить снапшот. На сервере шарить awaiter между деревьями нельзя (тот же request bleed) — отсюда per-tree.',
      en: 'The store is needed SYNCHRONOUSLY, before the first render, so there is somewhere to pour the snapshot. Sharing an awaiter between trees on the server is forbidden (the same request bleed) — hence per-tree.',
    },
    samples: [{ label: { ru: 'resolveSyncReady — sync-fast-path', en: 'resolveSyncReady — sync-fast-path' }, kind: 'lib', lang: 'typescript', code: LIB_AWAITER }],
  },
  {
    id: 'seed',
    zone: 'client',
    num: 11,
    call: { ru: 'Засев снапшота', en: 'Seed the snapshot' },
    fn: 'seedHydration → storage.hydrate(dehydratedState)',
    file: 'react/utils/createSynapseCtx.tsx',
    role: { ru: 'залить снапшот ДО первого рендера', en: 'pour the snapshot in BEFORE first render' },
    what: {
      ru: 'Внутри ленивого инициализатора useState вызывается та же hydrate, что на сервере, и заливает серверный снапшот в клиентский стор СИНХРОННО — до первого рендера.',
      en: 'Inside the lazy useState initializer the same hydrate as on the server is called, pouring the server snapshot into the client store SYNCHRONOUSLY — before the first render.',
    },
    why: {
      ru: 'Первый клиентский рендер обязан дать тот же HTML, что сервер → нет hydration mismatch, контент виден сразу, без loadingComponent и без useEffect-запроса.',
      en: 'The first client render must produce the same HTML as the server → no hydration mismatch, content is visible at once, with no loadingComponent and no useEffect request.',
    },
    before: { label: { ru: 'Клиентский стор ДО — пустой дефолт', en: 'Client store BEFORE — empty default' }, lang: 'json', code: STATE_DEFAULT },
    after: { label: { ru: 'Клиентский стор ПОСЛЕ — серверная лента', en: 'Client store AFTER — server feed' }, lang: 'json', code: STATE_HYDRATED },
    concept: {
      title: { ru: 'Так же работает TanStack Query', en: 'TanStack Query works the same way' },
      body: {
        ru:
          'Те же три фазы у всех:\n\n' +
          '· TanStack Query: на сервере dehydrate(queryClient) снимает сериализуемый снапшот кэша → он едет в HTML → на клиенте <HydrationBoundary state={…}> заливает его в queryClient ДО первого рендера.\n' +
          '· effector: fork() + serialize() на сервере, hydrate() на клиенте.\n' +
          '· Redux: preloadedState в createStore.\n\n' +
          'Наши fork / dehydrate / hydrate — ровно эти роли. Поняв один механизм, узнаёшь остальные: snapshot → граница → seed перед рендером.',
        en:
          'Everyone uses the same three phases:\n\n' +
          '· TanStack Query: on the server dehydrate(queryClient) takes a serializable cache snapshot → it travels in the HTML → on the client <HydrationBoundary state={…}> pours it into queryClient BEFORE the first render.\n' +
          '· effector: fork() + serialize() on the server, hydrate() on the client.\n' +
          '· Redux: preloadedState in createStore.\n\n' +
          'Our fork / dehydrate / hydrate are exactly these roles. Learn one and you recognize the rest: snapshot → boundary → seed before render.',
      },
    },
    samples: [{ label: { ru: 'seedHydration + useState (ядро)', en: 'seedHydration + useState (core)' }, kind: 'lib', lang: 'tsx', code: LIB_SEED }],
  },
  {
    id: 'gate',
    zone: 'client',
    num: 12,
    call: { ru: 'SSR-гейт', en: 'SSR gate' },
    fn: 'if (!synapseStore) return loadingComponent',
    file: 'react/utils/createSynapseCtx.tsx',
    role: { ru: 'рендерим контент, а не спиннер', en: 'render content, not a spinner' },
    what: {
      ru: 'Благодаря шагам 10–11 стор уже есть на первом кадре → рендерится <PokemonFeed/> (лента), а не loadingComponent.',
      en: 'Thanks to steps 10–11 the store already exists on the first frame → <PokemonFeed/> (the feed) is rendered instead of loadingComponent.',
    },
    why: {
      ru: 'Без ssr: true + sync-стора здесь был бы спиннер (стор обычно доезжает в useEffect, а он на сервере не идёт) → в HTML попал бы спиннер, без SEO.',
      en: 'Without ssr: true + a sync store this would be a spinner (the store usually arrives in useEffect, which never runs on the server) → the HTML would contain a spinner, with no SEO.',
    },
    samples: [{ label: { ru: 'SSR-гейт (ядро)', en: 'SSR gate (core)' }, kind: 'lib', lang: 'tsx', code: LIB_GATE }],
  },
  {
    id: 'revive',
    zone: 'client',
    num: 13,
    call: { ru: 'Оживление стора', en: 'Revive the store' },
    fn: 'useEffect(() => { … })',
    file: 'react/utils/createSynapseCtx.tsx',
    role: { ru: 'подписки, эффекты, дальнейшая жизнь', en: 'subscriptions, effects, further life' },
    what: {
      ru: 'Только на клиенте: повторный идемпотентный seedHydration, подписки onReady/onError, старт реактивности. Дальнейшая пагинация/мутации идут отсюда.',
      en: 'Client-only: a repeated idempotent seedHydration, onReady/onError subscriptions, reactivity start. Further pagination/mutations happen from here.',
    },
    why: {
      ru: 'Разделяем «первый кадр идентичен серверу» (синхронно, шаг 11) и «дальнейшая жизнь стора» (асинхронно, тут).',
      en: 'We separate "first frame identical to the server" (synchronous, step 11) from "the store’s further life" (asynchronous, here).',
    },
    samples: [{ label: { ru: 'useEffect (ядро)', en: 'useEffect (core)' }, kind: 'lib', lang: 'tsx', code: LIB_REVIVE }],
  },
]
