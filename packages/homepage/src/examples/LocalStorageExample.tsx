import { useState, useEffect } from 'react'
import { LocalStorage } from 'synapse-storage/core'
import { cardStyle, buttonRow } from './styles'

interface ThemeState {
  theme: 'light' | 'dark'
  fontSize: number
}

/**
 * Пример 2: Создание LocalStorage через new
 * Данные сохраняются в localStorage и переживают перезагрузку страницы
 */
export function LocalStorageExample() {
  const [storage] = useState(() =>
    new LocalStorage<ThemeState>({
      name: 'theme-settings',
      initialState: { theme: 'light', fontSize: 14 },
    }),
  )
  const [state, setState] = useState<ThemeState>({ theme: 'light', fontSize: 14 })
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    storage.initialize().then(() => {
      if (!cancelled) {
        setIsReady(true)
        setState(storage.getStateSync())
      }
    })

    return () => {
      cancelled = true
      storage.destroy()
    }
  }, [storage])

  useEffect(() => {
    if (!isReady) return
    return storage.subscribeToAll(() => {
      setState(storage.getStateSync())
    })
  }, [storage, isReady])

  if (!isReady) return <div>Initializing LocalStorage...</div>

  return (
    <div style={cardStyle}>
      <h2>LocalStorage (new)</h2>
      <p>Данные сохраняются между перезагрузками страницы</p>
      <p>Theme: <strong>{state.theme}</strong>, Font size: <strong>{state.fontSize}px</strong></p>

      <div style={buttonRow}>
        <button onClick={() => storage.set('theme', state.theme === 'light' ? 'dark' : 'light')}>
          toggle theme
        </button>
        <button onClick={() => storage.set('fontSize', state.fontSize + 2)}>
          fontSize +2
        </button>
        <button onClick={() => storage.set('fontSize', state.fontSize - 2)}>
          fontSize -2
        </button>
        <button onClick={() => storage.clear()}>
          clear()
        </button>
      </div>

      <h4>Подписка на конкретный ключ:</h4>
      <SubscribeToKey storage={storage} isReady={isReady} />
    </div>
  )
}

/** Компонент демонстрирует subscribe по ключу */
function SubscribeToKey({ storage, isReady }: { storage: LocalStorage<ThemeState>; isReady: boolean }) {
  const [themeValue, setThemeValue] = useState<string>('')

  useEffect(() => {
    if (!isReady) return
    // Подписка на конкретный ключ
    return storage.subscribe('theme', (value) => {
      setThemeValue(String(value))
    })
  }, [storage, isReady])

  return (
    <p>
      <code>subscribe('theme', cb)</code> → последнее значение: <strong>{themeValue || '(нет)'}</strong>
    </p>
  )
}
