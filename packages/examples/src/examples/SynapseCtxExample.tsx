import { useState } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher } from 'synapse-storage/reactive'
import { createSynapseCtx, useSelector } from 'synapse-storage/react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

/**
 * Пример: createSynapseCtx() — React Context + HOC паттерн
 */

// ─── Интерфейс состояния ────────────────────────────────────────────────────

interface SettingsState {
  theme: 'light' | 'dark'
  fontSize: number
  language: 'ru' | 'en'
  notifications: boolean
}

const initialState: SettingsState = {
  theme: 'light',
  fontSize: 14,
  language: 'ru',
  notifications: true,
}

// ─── 1. Создаём synapse store ───────────────────────────────────────────────

const settingsStorePromise = createSynapse({
  storage: new MemoryStorage<SettingsState>({ name: 'settings-ctx', initialState }),

  createSelectorsFn: (sm) => ({
    theme: sm.createSelector((s) => s.theme),
    fontSize: sm.createSelector((s) => s.fontSize),
    language: sm.createSelector((s) => s.language),
    notifications: sm.createSelector((s) => s.notifications),
    isDark: sm.createSelector((s) => s.theme === 'dark'),
  }),

  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_storage, { createAction }) => {
      const toggleTheme = createAction({
        type: 'toggleTheme',
        action: (_: void) => {
          const state = storage.getStateSync()
          storage.set('theme', state.theme === 'light' ? 'dark' : 'light')
        },
      })

      const setFontSize = createAction({
        type: 'setFontSize',
        action: (size: number) => {
          storage.set('fontSize', size)
          return size
        },
      })

      const toggleLanguage = createAction({
        type: 'toggleLanguage',
        action: (_: void) => {
          const state = storage.getStateSync()
          storage.set('language', state.language === 'ru' ? 'en' : 'ru')
        },
      })

      const toggleNotifications = createAction({
        type: 'toggleNotifications',
        action: (_: void) => {
          const state = storage.getStateSync()
          storage.set('notifications', !state.notifications)
        },
      })

      return { toggleTheme, setFontSize, toggleLanguage, toggleNotifications }
    }),
})

// ─── 2. Создаём контекст ────────────────────────────────────────────────────

const {
  contextSynapse,
  useSynapseStorage,
  useSynapseSelectors,
  useSynapseActions,
  cleanupSynapse,
} = createSynapseCtx(settingsStorePromise, {
  loadingComponent: <div style={{ padding: 20 }}>Загрузка настроек...</div>,
})

// ─── 3. Дочерние компоненты (внутри contextSynapse) ─────────────────────────

function ThemeDisplay() {
  const selectors = useSynapseSelectors()
  const theme = useSelector(selectors.theme)
  const isDark = useSelector(selectors.isDark)

  return (
    <div style={{ padding: 8, background: isDark ? '#333' : '#f5f5f5', color: isDark ? '#fff' : '#333', borderRadius: 4, marginBottom: 8 }}>
      Тема: <strong>{theme}</strong> (isDark: {String(isDark)})
    </div>
  )
}

function FontSizeControl() {
  const selectors = useSynapseSelectors()
  const actions = useSynapseActions()
  const fontSize = useSelector(selectors.fontSize)

  return (
    <div style={{ marginBottom: 8 }}>
      <span>Размер шрифта: {fontSize}px </span>
      <button onClick={() => actions.setFontSize(Math.max(10, (fontSize ?? 14) - 2))}>A-</button>
      <button onClick={() => actions.setFontSize((fontSize ?? 14) + 2)}>A+</button>
    </div>
  )
}

function LanguageToggle() {
  const selectors = useSynapseSelectors()
  const actions = useSynapseActions()
  const language = useSelector(selectors.language)

  return (
    <div style={{ marginBottom: 8 }}>
      Язык: <strong>{language}</strong>{' '}
      <button onClick={() => actions.toggleLanguage()}>Переключить</button>
    </div>
  )
}

function NotificationToggle() {
  const selectors = useSynapseSelectors()
  const actions = useSynapseActions()
  const notifications = useSelector(selectors.notifications)

  return (
    <div style={{ marginBottom: 8 }}>
      Уведомления: <strong>{notifications ? 'Вкл' : 'Выкл'}</strong>{' '}
      <button onClick={() => actions.toggleNotifications()}>Переключить</button>
    </div>
  )
}

function DirectStorageAccess() {
  const storage = useSynapseStorage()
  const [rawState, setRawState] = useState<string>('')

  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => {
        const state = storage.getStateSync()
        setRawState(JSON.stringify(state, null, 2))
      }}>
        useSynapseStorage().getStateSync()
      </button>
      {rawState && <pre style={{ fontSize: 11, background: '#f5f5f5', padding: 8, borderRadius: 4 }}>{rawState}</pre>}
    </div>
  )
}

function SettingsPanel() {
  const actions = useSynapseActions()

  return (
    <div>
      <div style={buttonRow}>
        <button onClick={() => actions.toggleTheme()}>Toggle Theme</button>
      </div>
      <ThemeDisplay />
      <FontSizeControl />
      <LanguageToggle />
      <NotificationToggle />
      <DirectStorageAccess />
    </div>
  )
}

// ─── 4. HOC оборачивает корневой компонент ──────────────────────────────────

const SettingsPanelWithContext = contextSynapse(SettingsPanel)

// ─── Экспорт ────────────────────────────────────────────────────────────────

export function SynapseCtxExample() {
  return (
    <div style={cardStyle}>
      <h2>createSynapseCtx</h2>
      <p>React Context + HOC для доступа к Synapse store через хуки. Автоматический loading пока store инициализируется.</p>

      {/* ─── Создание контекста ─────────────────────────────────────── */}
      <h3 style={sectionTitle}>Создание контекста</h3>
      <pre style={codeBlock}>{`import { createSynapseCtx, useSelector } from 'synapse-storage/react'
import { createSynapse } from 'synapse-storage/utils'

// 1. Создаём store (как обычно)
const storePromise = createSynapse({
  storage: new MemoryStorage<SettingsState>({ name: 'settings', initialState }),
  createSelectorsFn: (sm) => ({
    theme: sm.createSelector((s) => s.theme),
    fontSize: sm.createSelector((s) => s.fontSize),
  }),
  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_s, { createAction }) => ({
      toggleTheme: createAction({ type: 'toggleTheme', action: () => { ... } }),
      setFontSize: createAction({ type: 'setFontSize', action: (size: number) => { ... } }),
    })),
})

// 2. Создаём контекст из store promise
const {
  contextSynapse,       // HOC — оборачивает компонент, предоставляя контекст
  useSynapseStorage,    // () => IStorage<T>
  useSynapseSelectors,  // () => { theme, fontSize, ... }
  useSynapseActions,    // () => { toggleTheme, setFontSize, ... }
  cleanupSynapse,       // () => Promise<void>
} = createSynapseCtx(storePromise, {
  loadingComponent: <div>Загрузка...</div>,  // показывается пока store не ready
})`}</pre>

      {/* ─── Использование хуков ───────────────────────────────────── */}
      <h3 style={sectionTitle}>Использование хуков в дочерних компонентах</h3>
      <pre style={codeBlock}>{`// Дочерние компоненты вызываются ТОЛЬКО внутри contextSynapse HOC

function ThemeDisplay() {
  const selectors = useSynapseSelectors()
  const theme = useSelector(selectors.theme)       // реактивное значение
  const isDark = useSelector(selectors.isDark)

  return <div>Тема: {theme}, isDark: {String(isDark)}</div>
}

function FontSizeControl() {
  const selectors = useSynapseSelectors()
  const actions = useSynapseActions()
  const fontSize = useSelector(selectors.fontSize)

  return (
    <div>
      Размер: {fontSize}px
      <button onClick={() => actions.setFontSize(fontSize - 2)}>A-</button>
      <button onClick={() => actions.setFontSize(fontSize + 2)}>A+</button>
    </div>
  )
}

function DirectAccess() {
  const storage = useSynapseStorage()
  // Прямой доступ к storage — например для getStateSync(), update(), set()
  const state = storage.getStateSync()
}`}</pre>

      {/* ─── HOC обёртка ──────────────────────────────────────────── */}
      <h3 style={sectionTitle}>HOC contextSynapse()</h3>
      <pre style={codeBlock}>{`// contextSynapse() оборачивает корневой компонент
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

// Оборачиваем — loadingComponent показывается пока store не готов
const SettingsPanelWithContext = contextSynapse(SettingsPanel)

// Использование в JSX:
<SettingsPanelWithContext />`}</pre>

      {/* ─── useSynapseState$ (только с effects) ──────────────────── */}
      <h3 style={sectionTitle}>useSynapseState$ (только с effects)</h3>
      <pre style={codeBlock}>{`// Доступен только если store создан с createEffectConfig + effects
// Возвращает Observable<TState> для работы с RxJS

const { useSynapseState$ } = createSynapseCtx(storeWithEffectsPromise)

function MyComponent() {
  const state$ = useSynapseState$()

  useEffect(() => {
    const sub = state$.subscribe((state) => {
      console.log('state changed:', state)
    })
    return () => sub.unsubscribe()
  }, [state$])
}`}</pre>

      {/* ─── Очистка ──────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Очистка</h3>
      <pre style={codeBlock}>{`// Ручная очистка контекста и ресурсов
await cleanupSynapse()

// Вызывает store.destroy() внутри
// Сбрасывает lazy-promise инициализации`}</pre>

      {/* ─── Перегрузки ───────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Три варианта createSynapseCtx</h3>
      <pre style={codeBlock}>{`// 1. Basic (storage + selectors)
// Доступны: useSynapseStorage, useSynapseSelectors, cleanupSynapse
const ctx = createSynapseCtx(basicStorePromise)

// 2. С dispatcher (+ actions)
// Доступны: + useSynapseActions
const ctx = createSynapseCtx(dispatcherStorePromise)

// 3. С effects (+ state$)
// Доступны: + useSynapseState$
const ctx = createSynapseCtx(effectsStorePromise)`}</pre>

      {/* ─── Живой пример ─────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Живой пример</h3>
      <SettingsPanelWithContext />
    </div>
  )
}
