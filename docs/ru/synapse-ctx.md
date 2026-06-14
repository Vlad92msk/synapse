# createSynapseCtx

> [Назад к оглавлению](./README.md)

React Context + HOC для доступа к модулю Synapse через хуки. Передаётся ленивый handle: фабрика стартует
при первом монтировании Provider'а (не на импорте), с автоматическим `loadingComponent` на время инициализации.

## Создание контекста

```typescript
import { createSynapseCtx, useSelector } from 'synapse-storage/react'
import { createSynapse } from 'synapse-storage/utils'

// 1. Создаём ленивый handle (как обычно)
const settingsSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<SettingsState>({ name: 'settings', initialState })
  return {
    storage,
    dispatcher: new SettingsDispatcher(storage),
    selectors: new SettingsSelectors(storage),
  }
})

// 2. Создаём контекст — передаём САМ handle, а не вызов.
//    Фабрика стартует лениво при первом mount, не на импорте.
const {
  contextSynapse,       // HOC — оборачивает компонент, предоставляя контекст
  useSynapseStorage,    // () => IStorage<T>
  useSynapseSelectors,  // () => SettingsSelectors
  useSynapseActions,    // () => SettingsDispatcher (actions)
  useSynapseState$,     // () => Observable<TState> (только с effects)
  cleanupSynapse,       // () => Promise<void>
} = createSynapseCtx(settingsSynapse, {
  loadingComponent: <div>Loading...</div>,  // отображается, пока модуль не готов
})
```

## Использование хуков в дочерних компонентах

```typescript
// Дочерние компоненты вызываются ТОЛЬКО внутри HOC contextSynapse

function ThemeDisplay() {
  const selectors = useSynapseSelectors()
  const theme = useSelector(selectors.theme)       // реактивное значение
  const isDark = useSelector(selectors.isDark)

  return <div>Theme: {theme}, isDark: {String(isDark)}</div>
}

function FontSizeControl() {
  const selectors = useSynapseSelectors()
  const actions = useSynapseActions()
  const fontSize = useSelector(selectors.fontSize)

  return (
    <div>
      Size: {fontSize}px
      <button onClick={() => actions.setFontSize(fontSize - 2)}>A-</button>
      <button onClick={() => actions.setFontSize(fontSize + 2)}>A+</button>
    </div>
  )
}

function DirectAccess() {
  const storage = useSynapseStorage()
  // Прямой доступ к хранилищу — например, для getStateSync(), update(), set()
  const state = storage.getStateSync()
}
```

## HOC contextSynapse()

```typescript
function SettingsPanel() {
  const actions = useSynapseActions()
  return (
    <div>
      <button onClick={() => actions.toggleTheme()}>Toggle Theme</button>
      <ThemeDisplay />
      <FontSizeControl />
    </div>
  )
}

// Оборачиваем — loadingComponent показывается, пока модуль не готов
const SettingsPanelWithContext = contextSynapse(SettingsPanel)

// Использование в JSX:
<SettingsPanelWithContext />
```

## useSynapseState$ (только с эффектами)

```typescript
// Доступно только если в фабрику передан effects.
// Возвращает Observable<TState> для использования с RxJS.

const { useSynapseState$ } = createSynapseCtx(synapseWithEffects)

function MyComponent() {
  const state$ = useSynapseState$()

  useEffect(() => {
    const sub = state$.subscribe((state) => console.log('state changed:', state))
    return () => sub.unsubscribe()
  }, [state$])
}
```

## Реактивные чтения в компоненте

Запись по-прежнему идёт через actions, но читать можно реактивно — прямо из потока селектора:

```typescript
import { useObservable, useSubscription } from 'synapse-storage/react'

function SearchBox() {
  const selectors = useSynapseSelectors()

  const debounced = useObservable(
    () => selectors.searchQuery.$.pipe(debounceTime(300), distinctUntilChanged()),
    '',
    [selectors],
  )

  useSubscription(() => selectors.lastId.$.pipe(skip(1), tap(scrollToEnd)).subscribe(), [selectors])

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

// 3. С эффектами (+ state$)
// Доступно: + useSynapseState$
const ctx = createSynapseCtx(effectsSynapse)
```

## SSR — серверный рендер засеянных sync-сторов

> Доступно с **5.0.1**. Только классический `renderToString` (streaming/Suspense — вне скоупа).

По умолчанию `createSynapseCtx` гейтит детей `loadingComponent`, пока модуль не готов — на сервере
это даёт пустой HTML (нет SEO, нет первого кадра из server-state). Флаг `ssr: true` включает режим,
в котором синхронно-готовый стор (Memory/LocalStorage) рендерит контент сразу.

### Опции

```typescript
const PostsSynapse = createSynapseCtx(postsSynapse, {
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
// Любой контур добычи данных (generated requests и т.п.) → снапшот.
const feed = await fetchFeed()
const dehydrated = await PostsSynapse.dehydrate({ initialState: { posts: feed } })

const html = renderToString(<PostsFeedWithCtx dehydratedState={dehydrated} />)
// dehydrated сериализуем в HTML: window.__SYNAPSE_STATE__ = JSON.stringify(dehydrated)
```

### Клиент: гидрация тем же снапшотом

Снапшот приезжает пропом и **синхронно** засевается в стор ДО первого рендера → HTML клиента
совпадает с серверным → нет hydration mismatch. Дальше init/мутации/догрузка — на клиенте.

```typescript
const dehydrated = JSON.parse(window.__SYNAPSE_STATE__)

hydrateRoot(container, <PostsFeedWithCtx dehydratedState={dehydrated} />)
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
