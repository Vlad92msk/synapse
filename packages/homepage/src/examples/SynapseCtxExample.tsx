import { useState } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher } from 'synapse-storage/reactive'
import { createSynapseCtx, useSelector } from 'synapse-storage/react'
import { cardStyle, buttonRow } from './styles'

/**
 * Пример: createSynapseCtx() — React Context + HOC паттерн
 * Предоставляет: contextSynapse, useSynapseStorage, useSynapseSelectors, useSynapseActions
 */

interface ThemeState {
  theme: 'light' | 'dark'
  fontSize: number
  language: 'ru' | 'en'
  notifications: boolean
}

const initialState: ThemeState = {
  theme: 'light',
  fontSize: 14,
  language: 'ru',
  notifications: true,
}

// 1. Создаём synapse store
const settingsStorePromise = createSynapse({
  storage: new MemoryStorage<ThemeState>({ name: 'settings-ctx', initialState }),

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

// 2. Создаём контекст — ключевая функция
const {
  contextSynapse,
  useSynapseStorage,
  useSynapseSelectors,
  useSynapseActions,
} = createSynapseCtx(settingsStorePromise, {
  loadingComponent: <div style={{ padding: 20 }}>Загрузка настроек...</div>,
})

// 3. Дочерние компоненты используют хуки контекста

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
  // useSynapseStorage() — прямой доступ к storage объекту
  const storage = useSynapseStorage()
  const [rawState, setRawState] = useState<string>('')

  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => {
        const state = storage.getStateSync()
        setRawState(JSON.stringify(state, null, 2))
      }}>
        useSynapseStorage().getState()
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

// 4. HOC оборачивает корневой компонент — обеспечивает контекст
const SettingsPanelWithContext = contextSynapse(SettingsPanel)

export function SynapseCtxExample() {
  return (
    <div style={cardStyle}>
      <h2>createSynapseCtx() — React Context + HOC</h2>

      {/* contextSynapse(Component) — оборачивает компонент, предоставляя контекст */}
      <SettingsPanelWithContext />

      <h4>API заметки:</h4>
      <ul style={{ fontSize: 12, color: '#666' }}>
        <li><code>createSynapseCtx(storePromise, options?)</code> — создаёт контекст</li>
        <li><code>contextSynapse(Component)</code> — HOC, обеспечивает провайдер + loading</li>
        <li><code>useSynapseStorage()</code> → <code>IStorage&lt;T&gt;</code></li>
        <li><code>useSynapseSelectors()</code> → объект селекторов</li>
        <li><code>useSynapseActions()</code> → объект dispatch-функций</li>
        <li><code>useSynapseState$()</code> → <code>Observable&lt;T&gt;</code> (только с effects)</li>
        <li><code>cleanupSynapse()</code> — ручная очистка контекста</li>
        <li>Дочерние компоненты вызываются ТОЛЬКО внутри contextSynapse</li>
      </ul>
    </div>
  )
}
