# createSynapseCtx

> [Назад к оглавлению](./README.md) · [Песочница (Settings)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/SynapseCtxExample.tsx) · [Пример SSR (Posts)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/SynapseCtxSsrExample.tsx)

React Context + HOC для доступа к модулю Synapse через хуки. Передаётся ленивый handle: фабрика стартует
при первом монтировании Provider'а (не на импорте), с автоматическим `loadingComponent` на время инициализации.

Домен тот же — собранный на прошлых страницах `pokemonSynapse`. Это «провайдерный» способ отдать его в
дерево; альтернатива (ручной `await` + проп) — [awaitSynapse](./await-synapse.md), её и использует
демо в модуле.

## Создание контекста

```typescript
import { createSynapseCtx, useSelector } from 'synapse-storage/react'
import { pokemonSynapse } from './pokemon.synapse'   // ленивый handle с прошлых страниц

// Передаём САМ handle, а не вызов. Фабрика стартует лениво при первом mount, не на импорте.
const {
  contextSynapse,       // HOC — оборачивает компонент, предоставляя контекст
  useSynapseStorage,    // () => IStorage<PokemonState>
  useSynapseSelectors,  // () => PokemonSelectors
  useSynapseActions,    // () => PokemonDispatcher (actions)
  useSynapseState$,     // () => Observable<PokemonState> (только с effects)
  cleanupSynapse,       // () => Promise<void>
} = createSynapseCtx(pokemonSynapse, {
  loadingComponent: <div>Загрузка покедекса...</div>,  // пока модуль не готов
})
```

## Использование хуков в дочерних компонентах

```typescript
// Дочерние компоненты вызываются ТОЛЬКО внутри HOC contextSynapse

function PokemonGrid() {
  const selectors = useSynapseSelectors()
  const actions = useSynapseActions()

  const filteredList = useSelector(selectors.filteredList)   // реактивные значения
  const isListLoading = useSelector(selectors.isListLoading)

  return (
    <div>
      {filteredList?.map((p) => (
        <button key={p.id} onClick={() => actions.selectPokemon(p.id)}>{p.name}</button>
      ))}
      {isListLoading && <span>Loading...</span>}
    </div>
  )
}

function SearchInput() {
  const selectors = useSynapseSelectors()
  const actions = useSynapseActions()
  const query = useSelector(selectors.searchQuery)

  return <input value={query ?? ''} onChange={(e) => actions.setSearchQuery(e.target.value)} />
}

function DirectAccess() {
  const storage = useSynapseStorage()
  // Прямой доступ к хранилищу — например getStateSync(), update(), set()
  const state = storage.getStateSync()
}
```

## HOC contextSynapse()

```typescript
function Pokedex() {
  const actions = useSynapseActions()
  return (
    <div>
      <button onClick={() => actions.loadList()}>Reload</button>
      <SearchInput />
      <PokemonGrid />
    </div>
  )
}

// Оборачиваем — loadingComponent показывается, пока модуль не готов
const PokedexWithContext = contextSynapse(Pokedex)

// Использование в JSX:
<PokedexWithContext />
```

## useSynapseState$ (только с эффектами)

```typescript
// Доступно только если в фабрику передан effects (у pokemon — да).
// Возвращает Observable<PokemonState> для использования с RxJS.

const { useSynapseState$ } = createSynapseCtx(pokemonSynapse)

function StateLogger() {
  const state$ = useSynapseState$()

  useEffect(() => {
    const sub = state$.subscribe((state) => console.log('selected:', state.selectedPokemonId))
    return () => sub.unsubscribe()
  }, [state$])
}
```

## Реактивные чтения в компоненте

Запись по-прежнему идёт через actions, но читать можно реактивно — прямо из потока селектора (`.$`):

```typescript
import { useObservable, useSubscription } from 'synapse-storage/react'

function DebouncedSearch() {
  const selectors = useSynapseSelectors()

  const debounced = useObservable(
    () => selectors.searchQuery.$.pipe(debounceTime(300), distinctUntilChanged()),
    '',
    [selectors],
  )

  useSubscription(() => selectors.favoriteCount.$.pipe(skip(1), tap(logFavChange)).subscribe(), [selectors])

  return <div>{debounced}</div>
}
```

## Очистка

```typescript
// Ручная очистка контекста и ресурсов
await cleanupSynapse()

// Для class-handle делегирует handle.destroy() (LIFO-teardown + сброс мемоизации) —
// следующий mount заново исполнит фабрику.
```

## Три варианта createSynapseCtx

```typescript
// 1. Базовый (storage + selectors)
// Доступно: useSynapseStorage, useSynapseSelectors, cleanupSynapse
const ctx = createSynapseCtx(basicSynapse)

// 2. С диспетчером (+ actions)
// Доступно: + useSynapseActions
const ctx = createSynapseCtx(dispatcherSynapse)

// 3. С эффектами (+ state$) — случай pokemon
// Доступно: + useSynapseState$
const ctx = createSynapseCtx(pokemonSynapse)
```

## SSR — серверный рендер засеянных sync-сторов

> Доступно с **5.0.1**. Только классический `renderToString` (streaming/Suspense — вне скоупа).
>
> Полный запускаемый цикл (dehydrate → renderToString → гидрация) — в
> [`SynapseCtxSsrExample.tsx`](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/SynapseCtxSsrExample.tsx)
> (на домене Posts; ниже та же механика показана на pokemon).

По умолчанию `createSynapseCtx` гейтит детей `loadingComponent`, пока модуль не готов — на сервере
это даёт пустой HTML (нет SEO, нет первого кадра из server-state). Флаг `ssr: true` включает режим,
в котором синхронно-готовый стор (Memory/LocalStorage — как у pokemon) рендерит контент сразу.

### Опции

```typescript
const PokemonCtx = createSynapseCtx(pokemonSynapse, {
  loadingComponent: <Spinner />,
  ssr: true, // включить серверный рендер засеянных sync-сторов
})
```

Сигнатура помощника `dehydrate` и пропа Provider'а:

```typescript
// Серверный помощник: собрать сериализуемый снапшот стора.
dehydrate(opts?: { initialState?: Partial<TState> }): Promise<TState>

// Provider (любой HOC из contextSynapse) принимает снапшот пропом:
<Wrapped dehydratedState={snapshot} />
```

### Сервер: собрать снапшот

`dehydrate` создаёт **per-request форк** модуля (параллельные запросы не делят состояние —
никакого request bleed), сеет `initialState` через `hydrate` и возвращает сериализуемый снапшот.
При `ssr: true` он дополнительно прогревает основной handle тем же снапшотом, чтобы синхронный
`renderToString` отдал готовый стор на первом рендере.

```typescript
// Любой контур добычи данных (ApiClient pokemon и т.п.) → снапшот.
const list = await fetchInitialPokemon()
const dehydrated = await PokemonCtx.dehydrate({ initialState: { pokemonList: list } })

const html = renderToString(<PokedexWithContext dehydratedState={dehydrated} />)
// dehydrated сериализуем в HTML: window.__SYNAPSE_STATE__ = JSON.stringify(dehydrated)
```

> **RSC / `'use client'`-граница.** `createSynapseCtx` обычно зовётся в `'use client'`-модуле, поэтому
> его `dehydrate` (замыкание) на сервер (RSC / `'server only'`) не импортнуть. Для этого случая есть
> **server-safe** `dehydrateModule` из `synapse-storage/utils` — без React-зависимостей, принимает
> сам модуль явно. Её и оборачивает `dehydrate` (одна и та же логика, без дубля):
>
> ```typescript
> import { dehydrateModule } from 'synapse-storage/utils'
>
> // в серверном (RSC) файле — pokemonSynapse импортируется напрямую, без 'use client'-контекста
> const dehydrated = await dehydrateModule(pokemonSynapse, { ssr: true, state: { pokemonList: list } })
> ```
>
> `state` накладывается поверх `initialState` форка (shallow, top-level) — можно передать только
> изменённые поля; вложенные объекты заменяются целиком.

### Клиент: гидрация тем же снапшотом

Снапшот приезжает пропом и **синхронно** засевается в стор ДО первого рендера → HTML клиента
совпадает с серверным → нет hydration mismatch. Дальше init/мутации/догрузка — на клиенте.

```typescript
const dehydrated = JSON.parse(window.__SYNAPSE_STATE__)

hydrateRoot(container, <PokedexWithContext dehydratedState={dehydrated} />)
```

### Гарантии и ограничения

- **Per-request изоляция.** `dehydrate` форкает модуль; `seedHydration` в Provider переприменяет
  именно переданный `dehydratedState` синхронно перед каждым рендером — два параллельных серверных
  рендера с разными снапшотами не пересекаются.
- **Эффекты не исполняются на сервере.** Подписки/`mountedEffect` потребителя стартуют только на
  клиенте (через `useEffect`, который `renderToString` не вызывает) — аналог `enableStaticRendering`.
- **Async-сторы (IndexedDB).** Синхронного серверного рендера контента нет (инициализация async):
  на сервере остаётся прежний гейт `loadingComponent`, без краша и без request bleed; `dehydrate`
  всё равно собирает корректный снапшот (дожидается async-`hydrate`).
- **Обратная совместимость.** Без `ssr` и без `dehydratedState` поведение прежнее (ленивый старт +
  `loadingComponent`); сигнатуры хуков не менялись.

## SSR — «фоновые» провайдеры без серверных данных (`ssrShell`)

> Доступно с **5.4.0**.

Секция выше серверно рендерит стор, которому **пришли серверные данные** (`dehydratedState`). Но часть
провайдеров оборачивает большое поддерево (шелл приложения), а **своих серверных данных не имеет** —
presence, relations, media-player. Их стор строится **async-фабрикой** (`await getCoreSynapse()`, сокет,
…), поэтому синхронно на сервере он никогда не готов. Без помощи такой провайдер упирается в гейт
`loadingComponent` на сервере и рендерит пустоту — **срезая всё поддерево под собой**, включая корректно
засеянную ленту двумя уровнями глубже.

`ssrShell` даёт модулю способ синхронно построить **«пустой» стор из `initialState`** — в обход
async-фабрики, её зависимостей и эффектов — чтобы провайдер отрендерил `children` на сервере. Полный стор
(с зависимостями и эффектами) достраивается на клиенте, после чего контекст бесшовно переключается на него.

### Объявление оболочки — объектная форма (рекомендуется)

Самый чистый способ — **объектная форма** `createSynapse`: объявляешь **синхронное ядро**
(`storage`/`dispatcher`/`selectors`) отдельно от **async-обвязки** (`wire`: `dependencies`/`effects`).
Библиотека тогда **выводит SSR-оболочку сама** из sync-ядра — ручной `ssrShell` не нужен, а
`name`/`initialState` живут в одном месте. `wire` исполняется только при сборке реального стора
(клиент) и никогда — на сервере.

```ts
import { createSynapse } from 'synapse-storage/utils'
import { MemoryStorage } from 'synapse-storage/core'

export const presenceSynapse = createSynapse({
  // sync-ядро — из него библиотека строит SSR-оболочку, без ручного ssrShell
  storage: () => new MemoryStorage<PresenceState>({ name: 'presence', initialState }),
  dispatcher: (s) => new PresenceDispatcher(s),
  selectors: (s) => new PresenceSelectors(s),
  // async-обвязка — только клиент (deps / effects / endpoints / WS)
  wire: async () => ({
    dependencies: [await getCoreSynapse()],
    effects: new PresenceEffects(await getPresenceEndpoints()),
  }),
})
```

- Ноль boilerplate на SSR: оболочка = `{ storage(), dispatcher(storage), selectors(storage) }`.
- Один источник правды для `name`/`initialState` (нет расхождения sync/async → нет бага гидрации).
- `wire` не бежит на сервере → WS/IndexedDB/эффекты туда не едут by construction.
- `storage` должен быть синхронным (`MemoryStorage`/`LocalStorage`) для авто-оболочки. У async-стора
  (IndexedDB) синхронного SSR нет — просто не ставь `{ ssr: true }` у провайдера (как и раньше).

### Объявление оболочки — функциональная форма + ручной `ssrShell` (escape hatch)

Если оставляешь функциональную фабрику (или `dispatcher`/`selectors` требуют client-only аргументы
конструктора, которым нельзя исполняться на сервере) — передай синхронный `ssrShell` вторым аргументом.
Он возвращает подмножество конфига — `{ storage, dispatcher?, selectors? }`, **без**
`effects`/`dependencies`.

```ts
export const presenceSynapse = createSynapse(
  async () => {
    const core = await getCoreSynapse()
    const storage = new MemoryStorage<PresenceState>({ name: 'presence', initialState })
    return { storage, dependencies: [core], dispatcher: new PresenceDispatcher(storage), selectors: new PresenceSelectors(storage), effects: new PresenceEffects(/* … */) }
  },
  {
    ssrShell: () => {
      const storage = new MemoryStorage<PresenceState>({ name: 'presence', initialState })
      return { storage, selectors: new PresenceSelectors(storage), dispatcher: new PresenceDispatcher(storage) }
    },
  },
)
```

> **Забыл оболочку?** Если поставил `{ ssr: true }` у провайдера, а `ssrShell` (или объектной формы) у
> модуля нет, и стор не готов синхронно — `createSynapseCtx` один раз пишет `[Synapse]`-варнинг вместо
> молчаливого отката к `loadingComponent`.

### Провайдер

Включи `ssr: true` — на месте вызова больше ничего не меняется. Фоновый провайдер обычно просто прокидывает
детей:

```tsx
export const { contextSynapse: withPresence } =
  createSynapseCtx(presenceSynapse, { ssr: true, loadingComponent: null })

export const PresenceProvider = withPresence(({ children }) => <>{children}</>)
```

На сервере `PresenceProvider` теперь рендерит `children` (всё поддерево доходит до HTML); на клиенте
первый кадр рендерит ту же пустую оболочку (совпадает с сервером — нет hydration mismatch), затем
апгрейдится до реального стора.

### Как это работает

- **Сервер.** При `ssr: true` Provider рендерит **свежую оболочку на каждый рендер**
  (`module.buildSyncShell()`) — и для фонового стора, и для стора с `dehydratedState` — и не трогает общий
  client awaiter / main-синглтон. Поэтому async-фабрика / эффекты / WebSocket на сервере не запускаются, и
  никакое состояние запроса не пишется в процесс-глобальный объект → **request-изоляция by construction,
  безопасно даже при стриминге** (Next App Router по умолчанию стримит). Легаси-модули без оболочки
  используют общий main — безопасно только для не-стримингового `renderToString`.
- **Клиентская гидрация.** Первый кадр строит ту же оболочку (пустое состояние) → идентично серверу → нет
  mismatch. Затем в `useEffect` собирается реальный async-стор; по готовности контекст переключается на
  него, а оболочка уничтожается.
- **Флаг `ssr` больше не «мёртвый».** Раньше гейт рендера его вообще не читал (использовался только в
  `dehydrate`), поэтому `{ ssr: true }` без `dehydratedState` всё равно показывал `loadingComponent`.
  Теперь `ssr: true` включает путь оболочки. Без `ssrShell` флаг — no-op (прежний гейт `loadingComponent`),
  обратная совместимость сохранена.

### Подводные камни

- **`storage`/`dispatcher`/`selectors` исполняются на сервере** (из них строится оболочка). Держи их
  SSR-safe — никаких `window`/`document`/`localStorage` в конструкторах. Нужна client-only сборка —
  функциональная форма с отдельным `ssrShell`.
- **Взаимодействия в фазе оболочки теряются при апгрейде.** Оболочка — throwaway-стор для первого кадра;
  когда въезжает реальный стор, действия, задиспатченные в оболочку до апгрейда, пропадают. Считай
  поддерево оболочки display-only до апгрейда (для стора с данными реальный стор пере-засевается из
  `dehydratedState` — данные не теряются, теряются только до-апгрейдные действия пользователя).
- **`wire` исполняется ДО `storage.initialize()`.** Не читай/не мутируй стор внутри `wire` — он лишь
  возвращает `dependencies`/`effects`. Состояние приходит из `initialState`, `dehydratedState` или эффектов.
- **Async-хранилище (IndexedDB) не умеет синхронную оболочку.** Если `storage` модуля async, а ты выставил
  `{ ssr: true }` — сборка оболочки падает; провайдер **деградирует к `loadingComponent`** (без краша) и
  один раз пишет dev-варнинг. Просто не ставь `{ ssr: true }` для провайдеров с async-стором.

### `dehydrate` vs `ssrShell`

| Ситуация | Что использовать |
|---|---|
| У стора **есть** серверные данные (лента, первая страница) | `dehydrate` / `dehydrateModule` + проп `dehydratedState` (секция выше) |
| У провайдера серверных данных **нет**, но он не должен блокировать SSR (шелл приложения) | `ssrShell` + `{ ssr: true }` |
| Только клиент, без SSR | ни то, ни другое — дефолтный ленивый гейт `loadingComponent` |

Они компонуются на двух уровнях:

- **По дереву:** страница засевает ленту через `dehydratedState`, а шелл `presence` двумя уровнями выше —
  через `ssrShell`; без оболочки гейт вырезал бы засеянную ленту из HTML.
- **На одном сторе:** дай стору с данными И `dehydratedState`, И оболочку (объектная форма выводит её
  сама). Тогда на первом клиентском кадре, если реальный async-стор ещё не готов, оболочка **засевается
  снапшотом** → кадр-1 рендерит тот же контент, что и сервер → нет hydration mismatch (и нет регенерации
  поддерева, которая иначе переигрывает инлайн-`<head>`-скрипты и роняет тему/CSS). Для стора с данными
  предпочитай объектную форму, чтобы у него была оболочка — тогда `loadingComponent` и не нужен.

Весь модуль pokemon целиком — [Pokemon (рецепт)](./pokemon-advanced.md).
