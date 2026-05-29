# createSynapseCtx

> [Назад к оглавлению](./README.md)

React Context + HOC для доступа к хранилищу Synapse через хуки. Автоматическая загрузка во время инициализации хранилища.

## Создание контекста

```typescript
import { createSynapseCtx, useSelector } from 'synapse-storage/react'
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher } from 'synapse-storage/reactive'

// 1. Создаём хранилище (как обычно)
const storePromise = createSynapse({
  storage: new MemoryStorage<SettingsState>({ name: 'settings', initialState }),
  createSelectorsFn: (sm) => ({
    theme: sm.createSelector((s) => s.theme),
    fontSize: sm.createSelector((s) => s.fontSize),
    isDark: sm.createSelector((s) => s.theme === 'dark'),
  }),
  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_s, { createAction }) => ({
      toggleTheme: createAction({ type: 'toggleTheme', action: () => { ... } }),
      setFontSize: createAction({ type: 'setFontSize', action: (size: number) => { ... } }),
    })),
})

// 2. Создаём контекст из промиса хранилища
const {
  contextSynapse,       // HOC — оборачивает компонент, предоставляя контекст
  useSynapseStorage,    // () => IStorage<T>
  useSynapseSelectors,  // () => { theme, fontSize, ... }
  useSynapseActions,    // () => { toggleTheme, setFontSize, ... }
  cleanupSynapse,       // () => Promise<void>
} = createSynapseCtx(storePromise, {
  loadingComponent: <div>Loading...</div>,  // отображается, пока хранилище не готово
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
// contextSynapse() оборачивает корневой компонент
// Все дочерние компоненты получают доступ к хукам

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

// Оборачиваем — loadingComponent показывается, пока хранилище не готово
const SettingsPanelWithContext = contextSynapse(SettingsPanel)

// Использование в JSX:
<SettingsPanelWithContext />
```

## useSynapseState$ (только с эффектами)

```typescript
// Доступно только если хранилище создано с createEffectConfig + effects
// Возвращает Observable<TState> для использования с RxJS

const { useSynapseState$ } = createSynapseCtx(storeWithEffectsPromise)

function MyComponent() {
  const state$ = useSynapseState$()

  useEffect(() => {
    const sub = state$.subscribe((state) => {
      console.log('state changed:', state)
    })
    return () => sub.unsubscribe()
  }, [state$])
}
```

## Очистка

```typescript
// Ручная очистка контекста и ресурсов
await cleanupSynapse()

// Внутри вызывает store.destroy()
// Сбрасывает ленивую инициализацию промиса
```

## Три варианта createSynapseCtx

```typescript
// 1. Базовый (storage + selectors)
// Доступно: useSynapseStorage, useSynapseSelectors, cleanupSynapse
const ctx = createSynapseCtx(basicStorePromise)

// 2. С диспетчером (+ actions)
// Доступно: + useSynapseActions
const ctx = createSynapseCtx(dispatcherStorePromise)

// 3. С эффектами (+ state$)
// Доступно: + useSynapseState$
const ctx = createSynapseCtx(effectsStorePromise)
```
