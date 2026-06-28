import { useState } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'
import { TodoState, createTodo, initialTodoState } from './todo/todo.types'

// Singleton переиспользует экземпляр хранилища по имени: где бы ни создавался стор
// с тем же именем — это один и тот же объект и одно состояние. Полезно для shared state.
// Домен — TodoState (как и в остальных разделах). Подробнее — в docs/ru/singleton.md.

// Общий singleton-стор: оба компонента ниже создают его «заново», но получают один экземпляр.
const sharedStorage = new MemoryStorage<TodoState>({
  name: 'singleton-shared-todo',
  singleton: { enabled: true },
  initialState: initialTodoState,
})
sharedStorage.initialize()

// ─── Демо ─────────────────────────────────────────────────────────────────────

function BasicSingletonDemo() {
  const [info, setInfo] = useState<string[]>([])

  const runDemo = async () => {
    const logs: string[] = []

    const s1 = new MemoryStorage<TodoState>({
      name: 'singleton-basic-todo',
      singleton: { enabled: true },
      initialState: { todos: [], filter: 'completed' },
    })
    await s1.initialize()
    logs.push("s1: filter = 'completed'")

    const s2 = new MemoryStorage<TodoState>({
      name: 'singleton-basic-todo',
      singleton: { enabled: true },
      initialState: { todos: [], filter: 'all' }, // проигнорируется (FIRST_WINS)
    })
    await s2.initialize()

    logs.push(`s2: get('filter') = ${s2.get<string>('filter')} (ожидаем 'completed')`)
    logs.push(`s1 === s2: ${s1 === s2}`)

    await s1.destroy()
    setInfo(logs)
  }

  return (
    <div>
      <button onClick={runDemo}>Запустить демо</button>
      {info.length > 0 && <pre style={{ ...codeBlock, marginTop: 8 }}>{info.join('\n')}</pre>}
    </div>
  )
}

function CustomKeyDemo() {
  const [info, setInfo] = useState<string[]>([])

  const runDemo = async () => {
    const logs: string[] = []

    // Один name, но разные key → разные экземпляры.
    const active = new MemoryStorage<TodoState>({
      name: 'todo-board',
      singleton: { enabled: true, key: 'board-active' },
      initialState: { todos: [createTodo('Активная доска')], filter: 'active' },
    })
    await active.initialize()

    const archive = new MemoryStorage<TodoState>({
      name: 'todo-board',
      singleton: { enabled: true, key: 'board-archive' },
      initialState: { todos: [createTodo('Архив')], filter: 'completed' },
    })
    await archive.initialize()

    logs.push(`active (key=board-active): filter = ${active.get<string>('filter')}`)
    logs.push(`archive (key=board-archive): filter = ${archive.get<string>('filter')}`)
    logs.push(`active === archive: ${active === archive}`)

    await active.destroy()
    await archive.destroy()
    setInfo(logs)
  }

  return (
    <div>
      <button onClick={runDemo}>Запустить демо</button>
      {info.length > 0 && <pre style={{ ...codeBlock, marginTop: 8 }}>{info.join('\n')}</pre>}
    </div>
  )
}

function ComponentA() {
  const count = useStorageSubscribe(sharedStorage, (s) => s.todos.length)
  return (
    <div style={{ padding: 4, border: '1px dashed #aaa', borderRadius: 4 }}>
      <strong>Компонент A</strong>: задач — {count}
      <button style={{ marginLeft: 8 }} onClick={() => sharedStorage.update((s) => { s.todos.push(createTodo('Из A')) })}>
        Добавить
      </button>
    </div>
  )
}

function ComponentB() {
  // Создаёт «новый» стор с тем же именем — но получает тот же singleton.
  const sameStorage = new MemoryStorage<TodoState>({
    name: 'singleton-shared-todo',
    singleton: { enabled: true },
    initialState: initialTodoState,
  })
  const count = useStorageSubscribe(sameStorage, (s) => s.todos.length)
  return (
    <div style={{ padding: 4, border: '1px dashed #aaa', borderRadius: 4, marginTop: 4 }}>
      <strong>Компонент B</strong> (тот же singleton): задач — {count}
      <button style={{ marginLeft: 8 }} onClick={() => sameStorage.update((s) => { s.todos.push(createTodo('Из B')) })}>
        Добавить
      </button>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function SingletonExample() {
  return (
    <div style={cardStyle}>
      <h2>Singleton</h2>
      <p>
        Переиспользование экземпляров хранилища по имени. Полезно для общего состояния, когда стор
        создаётся в нескольких местах (компоненты, модули). По умолчанию работает стратегия
        <code> FIRST_WINS</code>: первый initialState побеждает, последующие игнорируются.
      </p>

      <h3 style={sectionTitle}>Один экземпляр на имя</h3>
      <BasicSingletonDemo />

      <h3 style={sectionTitle}>Кастомный ключ (singleton.key)</h3>
      <p style={{ fontSize: 13 }}>Один <code>name</code>, разные <code>key</code> → разные экземпляры.</p>
      <CustomKeyDemo />

      <h3 style={sectionTitle}>Singleton в React (общий state двух компонентов)</h3>
      <ComponentA />
      <ComponentB />
    </div>
  )
}
