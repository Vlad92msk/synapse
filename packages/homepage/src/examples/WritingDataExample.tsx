import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

// ─── Типы ───────────────────────────────────────────────────────────────────

interface UserState {
  name: string
  age: number
  tags: string[]
  settings: { theme: 'light' | 'dark'; notifications: boolean }
}

// ─── Создание хранилища ─────────────────────────────────────────────────────

const storage = new MemoryStorage<UserState>({
  name: 'writing-demo',
  initialState: {
    name: 'Alice',
    age: 28,
    tags: ['admin'],
    settings: { theme: 'light', notifications: true },
  },
})

// ─── Компонент ──────────────────────────────────────────────────────────────

export function WritingDataExample() {
  const [state, setState] = useState<UserState | null>(null)
  const [log, setLog] = useState<string[]>([])

  const addLog = (msg: string) => setLog((prev) => [...prev.slice(-7), msg])

  useEffect(() => {
    let cancelled = false
    storage.initialize().then(() => {
      if (!cancelled) setState(storage.getStateSync())
    })
    const unsub = storage.subscribeToAll(() => setState(storage.getStateSync()))
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  if (!state) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>Запись данных</h2>
      <p>Все способы записи данных в хранилище. Работают одинаково для Memory и LocalStorage (синхронно), для IndexedDB — с <code>await</code>.</p>

      {/* ─── set() ───────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>set(key, value) — установить значение по ключу</h3>
      <pre style={codeBlock}>{`import { MemoryStorage } from 'synapse-storage/core'

interface UserState {
  name: string
  age: number
  tags: string[]
  settings: { theme: 'light' | 'dark'; notifications: boolean }
}

const storage = new MemoryStorage<UserState>({
  name: 'my-store',
  initialState: {
    name: 'Alice',
    age: 28,
    tags: ['admin'],
    settings: { theme: 'light', notifications: true },
  },
})
await storage.initialize()

// ── Sync Storage (MemoryStorage / LocalStorage) ──

storage.set('name', 'Bob')
storage.set('age', 30)
storage.set('tags', ['admin', 'editor'])
storage.set('settings', { theme: 'dark', notifications: false })

// ── Async Storage (IndexedDBStorage) ──

await storage.set('name', 'Bob')
await storage.set('age', 30)`}</pre>

      <p>State: <code>{JSON.stringify(state)}</code></p>
      <div style={buttonRow}>
        <button onClick={() => {
          storage.set('name', state.name === 'Alice' ? 'Bob' : 'Alice')
          addLog(`set('name', '${state.name === 'Alice' ? 'Bob' : 'Alice'}')`)
        }}>
          toggle name
        </button>
        <button onClick={() => {
          storage.set('age', state.age + 1)
          addLog(`set('age', ${state.age + 1})`)
        }}>
          set('age', +1)
        </button>
        <button onClick={() => {
          storage.set('tags', [...state.tags, 'new'])
          addLog(`set('tags', [..., 'new'])`)
        }}>
          set('tags', +new)
        </button>
        <button onClick={() => {
          storage.set('settings', { ...state.settings, theme: state.settings.theme === 'light' ? 'dark' : 'light' })
          addLog(`set('settings', { theme: '${state.settings.theme === 'light' ? 'dark' : 'light'}' })`)
        }}>
          set('settings', toggle theme)
        </button>
      </div>

      {/* ─── update() ────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>update(updater) — изменить несколько полей за раз</h3>
      <pre style={codeBlock}>{`// update() использует immer-like мутации.
// Можно мутировать state напрямую внутри callback.
// Все изменения применяются атомарно — одна нотификация подписчикам.

// ── Sync Storage ──

storage.update((state) => {
  state.name = 'Charlie'
  state.age += 5
  state.tags.push('moderator')
  state.settings.theme = 'dark'
})

// Удобно для вложенных объектов:
storage.update((state) => {
  state.settings.notifications = false
})

// ── Async Storage ──

await storage.update((state) => {
  state.name = 'Charlie'
  state.age += 5
})`}</pre>

      <div style={buttonRow}>
        <button onClick={() => {
          storage.update((s) => { s.name = 'Charlie'; s.age += 5 })
          addLog("update: name='Charlie', age+=5")
        }}>
          update(name + age)
        </button>
        <button onClick={() => {
          const tag = 'tag_' + Math.floor(Math.random() * 100)
          storage.update((s) => { s.tags.push(tag) })
          addLog(`update: tags.push('${tag}')`)
        }}>
          update(push tag)
        </button>
        <button onClick={() => {
          storage.update((s) => {
            s.settings.theme = s.settings.theme === 'light' ? 'dark' : 'light'
            s.settings.notifications = !s.settings.notifications
          })
          addLog('update: toggle theme + notifications')
        }}>
          update(settings batch)
        </button>
      </div>

      {/* ─── set vs update ───────────────────────────────────────────── */}
      <h3 style={sectionTitle}>set() vs update() — когда что использовать</h3>
      <pre style={codeBlock}>{`// set() — замена значения целиком по одному ключу.
// Подходит когда меняете одно поле или заменяете объект целиком.
storage.set('name', 'Bob')
storage.set('settings', { theme: 'dark', notifications: false })

// update() — мутация нескольких полей за раз.
// Подходит когда нужно изменить несколько полей атомарно.
// Одна нотификация подписчикам вместо нескольких.
storage.update((s) => {
  s.name = 'Bob'
  s.age = 30
  s.settings.theme = 'dark'
})

// ⚠️ С set() каждый вызов = отдельная нотификация:
storage.set('name', 'Bob')     // нотификация 1
storage.set('age', 30)         // нотификация 2

// ✅ С update() — одна нотификация:
storage.update((s) => {
  s.name = 'Bob'               // нотификация 1 (общая)
  s.age = 30
})`}</pre>

      {/* ─── reset() ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>reset() — сброс к initialState</h3>
      <pre style={codeBlock}>{`// Возвращает хранилище к начальному состоянию (initialState из конфига).

// Sync
storage.reset()

// Async
await storage.reset()`}</pre>

      <div style={buttonRow}>
        <button onClick={() => { storage.reset(); addLog('reset()') }}>reset()</button>
      </div>

      {/* ─── Лог ─────────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Результаты</h3>
      <pre style={{ ...codeBlock, minHeight: 60 }}>{log.join('\n') || '(нажмите кнопки выше чтобы увидеть результаты)'}</pre>
    </div>
  )
}
