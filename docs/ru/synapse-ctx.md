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
