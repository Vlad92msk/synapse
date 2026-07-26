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

> С **6.0.0** SSR **включён by construction** — отдельного флага `ssr` больше нет (удалён).
> Конструкция C-формы синхронна, поэтому на сервере Provider строит свежую оболочку на каждый рендер
> (`buildSyncShell`) и синхронно сеет её `dehydratedState`. Только классический `renderToString`
> (streaming/Suspense — вне скоупа).
>
> Полный запускаемый цикл (dehydrate → renderToString → гидрация) — в
> [`SynapseCtxSsrExample.tsx`](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/SynapseCtxSsrExample.tsx)
> (на домене Posts; ниже та же механика показана на pokemon).

Раньше `createSynapseCtx` гейтил детей `loadingComponent`, пока модуль не готов, и серверный рендер
включался флагом `ssr: true`. Теперь стор всегда синхронно готов к первому кадру, поэтому серверный
рендер засеянного контента — поведение по умолчанию, а `loadingComponent` остаётся лишь запасным
рендером (async-стор, который не удалось построить синхронно).

### Опции

```typescript
const PokemonCtx = createSynapseCtx(pokemonSynapse, {
  loadingComponent: <Spinner />, // запасной рендер (в норме C-форма готова к первому кадру)
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
На сервере Provider затем строит свежую оболочку на каждый рендер и синхронно сеет её этим снапшотом,
чтобы `renderToString` отдал готовый контент на первом рендере (main-синглтон при этом не трогается —
изоляция запроса by construction).

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
> const dehydrated = await dehydrateModule(pokemonSynapse, { state: { pokemonList: list } })
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
- **Без `dehydratedState`.** Фоновый провайдер без серверных данных рендерит пустую оболочку из
  `initialState` (см. секцию ниже); сигнатуры хуков не менялись.

## SSR — «фоновые» провайдеры без серверных данных

> С **6.0.0** SSR-оболочка выводится **самой C-формой** — ручной `ssrShell`, объектная форма с `wire`
> и функциональная фабрика **удалены**. Единственная форма — синхронный конфиг (см.
> [createSynapse](./create-synapse-basic.md)).

Секция выше серверно рендерит стор, которому **пришли серверные данные** (`dehydratedState`). Но часть
провайдеров оборачивает большое поддерево (шелл приложения), а **своих серверных данных не имеет** —
presence, relations, media-player. Раньше их стор строился async-фабрикой и синхронно на сервере не был
готов, поэтому провайдер упирался в гейт `loadingComponent` и рендерил пустоту — **срезая всё поддерево
под собой**, включая корректно засеянную ленту двумя уровнями глубже.

Теперь конструкция **синхронна by construction**: `storage`/`dispatcher`/`selectors` строятся из
`initialState` в один тик, а всё async (deps, endpoints, WS) живёт в фабрике `effects`, которая
**на сервере не исполняется**. Поэтому у **любого** C-form-модуля с синхронным хранилищем есть
`buildSyncShell()` — способ синхронно поднять «пустой» стор из `initialState`, чтобы провайдер
отрендерил `children` на сервере. Полный стор (с зависимостями и эффектами) достраивается на клиенте,
после чего контекст бесшовно переключается на него.

### Ничего специального объявлять не нужно

Оболочка выводится из sync-ядра — просто пиши обычную C-форму, а всё async держи в `effects`:

```ts
import { createSynapse } from 'synapse-storage/utils'
import { MemoryStorage } from 'synapse-storage/core'

export const presenceSynapse = createSynapse({
  // sync-ядро — из него библиотека строит SSR-оболочку автоматически
  storage: () => new MemoryStorage<PresenceState>({ name: 'presence', initialState }),
  dispatcher: (s) => new PresenceDispatcher(s),
  selectors: (s) => new PresenceSelectors(s),
  dependencies: [coreSynapse],                       // гейт СТАРТА эффектов (не конструкции)
  // async — только клиент (endpoints / WS); на сервере не исполняется
  effects: async () => new PresenceEffects(await getPresenceEndpoints(), coreSynapse.state$),
})
```

- Ноль boilerplate на SSR: оболочка = `{ storage(), dispatcher(storage), selectors(storage) }`.
- Один источник правды для `name`/`initialState` (нет расхождения sync/async → нет бага гидрации).
- `effects` не бежит на сервере → WS/IndexedDB/эффекты туда не едут by construction.
- `storage` должен быть синхронным (`MemoryStorage`/`LocalStorage`). У async-стора (IndexedDB) синхронной
  оболочки нет → провайдер деградирует к `loadingComponent` (см. подводные камни).

> **Server-safe хранилище.** Если хранилище client-only (`LocalStorage` требует `localStorage`, media-player
> берёт `tabId`/broadcast) — оберни фабрику в `browserStorage(config, { client })` (экспорт из
> `synapse-storage/core`): `MemoryStorage` на сервере, `client(config)` в браузере. Обе ветки — sync-стор
> одной формы, тип выводится без ручных дженериков. См. [SSR-гидрация](./ssr-hydration.md).

### Провайдер

Ничего включать не нужно — на месте вызова обычный `createSynapseCtx`. Фоновый провайдер просто прокидывает
детей:

```tsx
export const { contextSynapse: withPresence } =
  createSynapseCtx(presenceSynapse, { loadingComponent: null })

export const PresenceProvider = withPresence(({ children }) => <>{children}</>)
```

На сервере `PresenceProvider` рендерит `children` (всё поддерево доходит до HTML); на клиенте
первый кадр рендерит ту же пустую оболочку (совпадает с сервером — нет hydration mismatch), затем
апгрейдится до реального стора.

### Как это работает

- **Сервер.** Provider рендерит **свежую оболочку на каждый рендер** (`buildSyncShell()`) — и для
  фонового стора, и для стора с `dehydratedState` — и не трогает общий client awaiter / main-синглтон.
  Поэтому фабрика `effects` / WebSocket на сервере не запускаются, и никакое состояние запроса не пишется
  в процесс-глобальный объект → **request-изоляция by construction, безопасно даже при стриминге**
  (Next App Router по умолчанию стримит).
- **Клиентская гидрация.** Первый кадр строит ту же оболочку (пустое состояние) → идентично серверу → нет
  mismatch. Затем в `useEffect` стартуют эффекты реального стора; по готовности контекст переключается на
  него, а оболочка уничтожается.

### Подводные камни

- **`storage`/`dispatcher`/`selectors` исполняются на сервере** (из них строится оболочка). Держи их
  SSR-safe — никаких `window`/`document`/`localStorage` в конструкторах. Нужна client-only сборка —
  оберни `storage` в `browserStorage(config, { client })`, а client-only аргументы `dispatcher`/`selectors`
  передавай под env-гардом (`isServer ? undefined : getTabId()`).
- **Взаимодействия в фазе оболочки теряются при апгрейде.** Оболочка — throwaway-стор для первого кадра;
  когда въезжает реальный стор, действия, задиспатченные в оболочку до апгрейда, пропадают. Считай
  поддерево оболочки display-only до апгрейда (для стора с данными реальный стор пере-засевается из
  `dehydratedState` — данные не теряются, теряются только до-апгрейдные действия пользователя).
- **Async-хранилище (IndexedDB) не умеет синхронную оболочку.** Если `storage` модуля async, синхронной
  оболочки нет; провайдер **деградирует к `loadingComponent`** на сервере (без краша) и один раз пишет
  dev-варнинг. Такой фоновый провайдер серверного контента не даёт — это ожидаемо.

### `dehydrate` + оболочка

| Ситуация | Что использовать |
|---|---|
| У стора **есть** серверные данные (лента, первая страница) | `dehydrate` / `dehydrateModule` + проп `dehydratedState` (секция выше) |
| У провайдера серверных данных **нет**, но он не должен блокировать SSR (шелл приложения) | ничего — оболочка выводится сама из sync-ядра |
| Только клиент (async-стор, IndexedDB) | серверной оболочки нет → гейт `loadingComponent` |

Они компонуются на двух уровнях:

- **По дереву:** страница засевает ленту через `dehydratedState`, а шелл `presence` двумя уровнями выше
  рендерит свою оболочку (by construction); без оболочки гейт вырезал бы засеянную ленту из HTML.
- **На одном сторе:** стор с данными получает И `dehydratedState`, И оболочку (C-форма выводит её сама).
  Тогда на первом клиентском кадре, если реальный стор ещё не готов, оболочка **засевается снапшотом** →
  кадр-1 рендерит тот же контент, что и сервер → нет hydration mismatch (и нет регенерации поддерева,
  которая иначе переигрывает инлайн-`<head>`-скрипты и роняет тему/CSS).

Весь модуль pokemon целиком — [Pokemon (рецепт)](./pokemon-advanced.md).
