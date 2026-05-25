import { useState, useEffect, useCallback } from 'react'
import { MemoryStorage, SelectorModule } from 'synapse-storage/core'
import type { IStorage, SelectorAPI } from 'synapse-storage/core'
import { useSelector } from 'synapse-storage/react'
import { cardStyle, buttonRow } from './styles'

/**
 * Пример: Selector system — createSelector(), комбинированные селекторы, useSelector()
 */

interface UserState {
  users: Array<{ id: number; name: string; age: number; role: 'admin' | 'user' }>
  sortBy: 'name' | 'age'
  filterRole: 'all' | 'admin' | 'user'
}

const initialState: UserState = {
  users: [
    { id: 1, name: 'Алексей', age: 28, role: 'admin' },
    { id: 2, name: 'Мария', age: 34, role: 'user' },
    { id: 3, name: 'Дмитрий', age: 22, role: 'user' },
    { id: 4, name: 'Анна', age: 30, role: 'admin' },
    { id: 5, name: 'Игорь', age: 45, role: 'user' },
  ],
  sortBy: 'name',
  filterRole: 'all',
}

// Создаём storage и SelectorModule отдельно (без createSynapse)
const storage = new MemoryStorage<UserState>({ name: 'selector-demo', initialState })

// SelectorModule создаётся отдельно — это то, что createSynapse делает внутри
let selectorModule: SelectorModule<UserState>
let selectors: ReturnType<typeof buildSelectors>

function buildSelectors(sm: SelectorModule<UserState>) {
  // Простые селекторы — извлекают часть state
  const users = sm.createSelector((s) => s.users)
  const sortBy = sm.createSelector((s) => s.sortBy)
  const filterRole = sm.createSelector((s) => s.filterRole)

  // Комбинированный селектор — зависит от users и filterRole
  const filteredUsers = sm.createSelector(
    [users, filterRole],
    (usersVal, roleVal) => {
      if (roleVal === 'all') return usersVal
      return usersVal.filter((u) => u.role === roleVal)
    },
  )

  // Комбинированный от filtered + sortBy
  const sortedUsers = sm.createSelector(
    [filteredUsers, sortBy],
    (filtered, sort) => {
      return [...filtered].sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name)
        return a.age - b.age
      })
    },
  )

  // Вложенная комбинация: count от sortedUsers
  const totalFiltered = sm.createSelector(
    [sortedUsers],
    (sorted) => sorted.length,
  )

  // Селектор с кастомным equals (для массивов/объектов)
  const adminNames = sm.createSelector(
    (s) => s.users.filter((u) => u.role === 'admin').map((u) => u.name),
    { equals: (a, b) => JSON.stringify(a) === JSON.stringify(b), name: 'adminNames' },
  )

  // Селектор с вычислением
  const averageAge = sm.createSelector(
    [users],
    (usersVal) => {
      if (usersVal.length === 0) return 0
      return Math.round(usersVal.reduce((acc, u) => acc + u.age, 0) / usersVal.length)
    },
  )

  return { users, sortBy, filterRole, filteredUsers, sortedUsers, totalFiltered, adminNames, averageAge }
}

// Инициализация
const readyPromise = storage.initialize().then(() => {
  selectorModule = new SelectorModule(storage)
  selectors = buildSelectors(selectorModule)
})

export function SelectorSystemExample() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    readyPromise.then(() => setReady(true))
  }, [])

  if (!ready) return <div>Initializing SelectorModule...</div>

  return <SelectorUI />
}

function SelectorUI() {
  // useSelector — основной хук для подписки на селектор
  const sortedUsers = useSelector(selectors.sortedUsers)
  const totalFiltered = useSelector(selectors.totalFiltered)
  const sortBy = useSelector(selectors.sortBy)
  const filterRole = useSelector(selectors.filterRole)
  const adminNames = useSelector(selectors.adminNames)
  const averageAge = useSelector(selectors.averageAge)

  // useSelector с withLoading: true — возвращает { data, isLoading }
  const { data: usersWithLoading, isLoading } = useSelector(selectors.users, { withLoading: true })

  // Ручная подписка на селектор (subscribe pattern)
  const [manualValue, setManualValue] = useState<number | undefined>()
  useEffect(() => {
    const unsub = selectors.averageAge.subscribe({
      notify: (value) => setManualValue(value),
    })
    return unsub
  }, [])

  // Programmatic select (async)
  const [asyncResult, setAsyncResult] = useState<string>('')
  const fetchAsync = useCallback(async () => {
    const result = await selectors.adminNames.select()
    setAsyncResult(JSON.stringify(result))
  }, [])

  // selectSync (synchronous)
  const handleSelectSync = () => {
    const val = selectors.totalFiltered.selectSync()
    alert(`selectSync() = ${val}`)
  }

  return (
    <div style={cardStyle}>
      <h2>Selector System</h2>

      <div style={{ marginBottom: 12, fontSize: 13, background: '#f9f9f9', padding: 8, borderRadius: 4 }}>
        <div>Средний возраст: {averageAge} | Админы: {adminNames?.join(', ')}</div>
        <div>Показано: {totalFiltered} пользователей | Сортировка: {sortBy} | Фильтр: {filterRole}</div>
        {isLoading && <div style={{ color: '#888' }}>Загрузка...</div>}
      </div>

      <div style={buttonRow}>
        <button onClick={() => storage.set('sortBy', sortBy === 'name' ? 'age' : 'name')}>
          Сортировка: {sortBy === 'name' ? 'по возрасту' : 'по имени'}
        </button>
        <button onClick={() => storage.set('filterRole', filterRole === 'all' ? 'admin' : filterRole === 'admin' ? 'user' : 'all')}>
          Фильтр: {filterRole === 'all' ? 'только admin' : filterRole === 'admin' ? 'только user' : 'все'}
        </button>
        <button onClick={() => storage.update((s) => {
          s.users.push({ id: Date.now(), name: `User${Date.now() % 100}`, age: 20 + Math.floor(Math.random() * 30), role: Math.random() > 0.5 ? 'admin' : 'user' })
        })}>
          + Добавить юзера
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, margin: '8px 0' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
            <th>Имя</th><th>Возраст</th><th>Роль</th>
          </tr>
        </thead>
        <tbody>
          {sortedUsers?.map((u) => (
            <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{u.name}</td><td>{u.age}</td><td>{u.role}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={buttonRow}>
        <button onClick={fetchAsync}>selector.select() (async)</button>
        <button onClick={handleSelectSync}>selector.selectSync()</button>
      </div>
      {asyncResult && <div style={{ fontSize: 12, fontFamily: 'monospace' }}>select() result: {asyncResult}</div>}
      {manualValue !== undefined && <div style={{ fontSize: 12, fontFamily: 'monospace' }}>subscribe notify: averageAge = {manualValue}</div>}

      <h4>API заметки:</h4>
      <ul style={{ fontSize: 12, color: '#666' }}>
        <li><code>createSelector((state) =&gt; state.field)</code> — простой селектор</li>
        <li><code>createSelector([dep1, dep2], (val1, val2) =&gt; result)</code> — комбинированный</li>
        <li><code>createSelector(fn, {'{'} equals, name {'}'})</code> — кастомное сравнение и именование</li>
        <li><code>useSelector(selector)</code> → <code>T | undefined</code></li>
        <li><code>useSelector(selector, {'{'} withLoading: true {'}'})</code> → <code>{'{'} data, isLoading {'}'}</code></li>
        <li><code>selector.select()</code> → <code>Promise&lt;T&gt;</code> (async)</li>
        <li><code>selector.selectSync()</code> → <code>T | undefined</code> (sync, cached)</li>
        <li><code>selector.subscribe({'{'} notify: (value) =&gt; ... {'}'})</code> → unsubscribe fn</li>
      </ul>
    </div>
  )
}
