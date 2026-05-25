import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { ApiClient, ResponseFormat } from 'synapse-storage/api'
import { cardStyle, buttonRow } from './styles'

/**
 * Пример 12: API Client — ApiClient, endpoints, queries, caching
 */

// Хранилище для кэша запросов
const apiCacheStorage = new MemoryStorage<Record<string, any>>({
  name: 'api-cache-demo',
  initialState: {},
})

// --- Создание ApiClient ---

const apiClient = new ApiClient({
  storage: apiCacheStorage as any,

  baseQuery: {
    baseUrl: 'https://jsonplaceholder.typicode.com',
    prepareHeaders: async (headers) => {
      headers.set('Content-Type', 'application/json')
      // Можно добавить авторизацию:
      // headers.set('Authorization', `Bearer ${getToken()}`)
      return headers
    },
    timeout: 10000,
  },

  cache: {
    ttl: 30000, // 30 секунд
    cleanup: { enabled: true, interval: 60000 },
    invalidateOnError: true,
  },

  endpoints: async (create) => ({
    // GET запрос - список пользователей
    getUsers: create<Record<string, never>, Array<{ id: number; name: string; email: string }>>({
      request: () => ({
        path: '/users',
        method: 'GET',
      }),
      cache: { ttl: 60000 }, // Кэш на 1 минуту
      tags: ['users'],
    }),

    // GET запрос - один пользователь по ID
    getUser: create<{ userId: number }, { id: number; name: string; email: string; phone: string }>({
      request: (params) => ({
        path: `/users/${params.userId}`,
        method: 'GET',
      }),
      cache: true, // Используется глобальный ttl
      tags: ['users', 'user-detail'],
    }),

    // GET запрос - посты пользователя
    getUserPosts: create<{ userId: number }, Array<{ id: number; title: string; body: string }>>({
      request: (params) => ({
        path: `/users/${params.userId}/posts`,
        method: 'GET',
      }),
      tags: ['posts'],
    }),

    // POST запрос - создание поста
    createPost: create<{ title: string; body: string; userId: number }, { id: number; title: string }>({
      request: (params) => ({
        path: '/posts',
        method: 'POST',
        body: params,
      }),
      invalidatesTags: ['posts'], // Инвалидирует кэш постов
      cache: false, // Мутации не кэшируются
    }),

    // GET запрос с query parameters
    getTodos: create<{ userId?: number; completed?: boolean }, Array<{ id: number; title: string; completed: boolean }>>({
      request: (params) => ({
        path: '/todos',
        method: 'GET',
        query: params,
      }),
      cache: { ttl: 15000 },
      tags: ['todos'],
    }),
  }),
})

function ApiInitPanel() {
  const [initialized, setInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        await apiCacheStorage.initialize()
        await apiClient.init()
        setInitialized(true)
      } catch (err: any) {
        setError(err.message)
      }
    }
    init()
  }, [])

  if (error) return <div style={{ color: 'red' }}>Init error: {error}</div>
  if (!initialized) return <div>Initializing API client...</div>
  return null
}

// --- 1. Simple request ---

function SimpleRequestDemo() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [meta, setMeta] = useState<string>('')

  return (
    <div style={{ padding: 8, background: '#e8f5e9', borderRadius: 4 }}>
      <h4>1. Simple Request (GET /users)</h4>
      <div style={buttonRow}>
        <button onClick={async () => {
          setLoading(true)
          const startTime = Date.now()
          const result = await apiClient.request('getUsers', {})
          setLoading(false)

          if (result.ok && result.data) {
            setUsers(result.data.slice(0, 3))
            setMeta(`status: ${result.status} | fromCache: ${result.fromCache} | time: ${Date.now() - startTime}ms`)
          } else {
            setMeta(`error: ${result.error?.message}`)
          }
        }} disabled={loading}>
          {loading ? 'Loading...' : 'Fetch Users'}
        </button>
        <button onClick={async () => {
          setLoading(true)
          // Повторный запрос — должен прийти из кэша
          const startTime = Date.now()
          const result = await apiClient.request('getUsers', {})
          setLoading(false)

          if (result.ok && result.data) {
            setUsers(result.data.slice(0, 3))
            setMeta(`status: ${result.status} | fromCache: ${result.fromCache} | time: ${Date.now() - startTime}ms`)
          }
        }} disabled={loading}>
          Fetch Again (cached?)
        </button>
      </div>
      {meta && <div style={{ fontSize: 11, color: '#888' }}>{meta}</div>}
      {users.length > 0 && (
        <div style={{ fontSize: 12, marginTop: 4 }}>
          {users.map((u) => <div key={u.id}>{u.id}. {u.name} ({u.email})</div>)}
        </div>
      )}
    </div>
  )
}

// --- 2. Request with params ---

function ParamsRequestDemo() {
  const [userId, setUserId] = useState(1)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  return (
    <div style={{ padding: 8, background: '#fff3e0', borderRadius: 4, marginTop: 8 }}>
      <h4>2. Request with Params (GET /users/:id)</h4>
      <div style={buttonRow}>
        <select value={userId} onChange={(e) => setUserId(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((id) => <option key={id} value={id}>User {id}</option>)}
        </select>
        <button onClick={async () => {
          setLoading(true)
          const result = await apiClient.request('getUser', { userId })
          setLoading(false)
          if (result.ok) setUser(result.data)
        }} disabled={loading}>
          {loading ? 'Loading...' : 'Fetch User'}
        </button>
      </div>
      {user && (
        <div style={{ fontSize: 12, marginTop: 4, fontFamily: 'monospace' }}>
          {JSON.stringify(user, null, 2)}
        </div>
      )}
    </div>
  )
}

// --- 3. Endpoint direct access ---

function EndpointDirectDemo() {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [requestInfo, setRequestInfo] = useState<string>('')

  return (
    <div style={{ padding: 8, background: '#e3f2fd', borderRadius: 4, marginTop: 8 }}>
      <h4>3. Endpoint Direct Access</h4>
      <p style={{ fontSize: 12, color: '#666' }}>
        Получение эндпоинтов напрямую через <code>getEndpoints()</code> с подпиской на состояние запроса.
      </p>
      <div style={buttonRow}>
        <button onClick={async () => {
          setLoading(true)
          const endpoints = apiClient.getEndpoints()
          const requestState = endpoints.getUserPosts.request({ userId: 1 })

          // Подписка на состояние запроса
          requestState.subscribe((state) => {
            setRequestInfo(`status: ${state.status} | fromCache: ${state.fromCache}`)
          })

          const result = await requestState.wait()
          setLoading(false)

          if (result.ok && result.data) {
            setPosts(result.data.slice(0, 3))
          }
        }} disabled={loading}>
          Fetch Posts (with subscribe)
        </button>
      </div>
      {requestInfo && <div style={{ fontSize: 11, color: '#888' }}>{requestInfo}</div>}
      {posts.length > 0 && (
        <div style={{ fontSize: 12, marginTop: 4 }}>
          {posts.map((p) => <div key={p.id}>{p.id}. {p.title.slice(0, 50)}...</div>)}
        </div>
      )}
    </div>
  )
}

// --- 4. POST (mutation) ---

function MutationDemo() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  return (
    <div style={{ padding: 8, background: '#fce4ec', borderRadius: 4, marginTop: 8 }}>
      <h4>4. POST Request (mutation)</h4>
      <div style={buttonRow}>
        <button onClick={async () => {
          setLoading(true)
          const res = await apiClient.request('createPost', {
            title: 'Test Post',
            body: 'This is a test post from Synapse ApiClient',
            userId: 1,
          })
          setLoading(false)
          setResult(res)
        }} disabled={loading}>
          {loading ? 'Creating...' : 'Create Post'}
        </button>
      </div>
      {result && (
        <pre style={{ fontSize: 11, fontFamily: 'monospace' }}>
          {JSON.stringify({ ok: result.ok, status: result.status, data: result.data }, null, 2)}
        </pre>
      )}
    </div>
  )
}

// --- 5. Query params ---

function QueryParamsDemo() {
  const [todos, setTodos] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  return (
    <div style={{ padding: 8, background: '#f1f8e9', borderRadius: 4, marginTop: 8 }}>
      <h4>5. Query Parameters (GET /todos?userId=1&completed=true)</h4>
      <div style={buttonRow}>
        <button onClick={async () => {
          setLoading(true)
          const res = await apiClient.request('getTodos', { userId: 1, completed: true })
          setLoading(false)
          if (res.ok && res.data) setTodos(res.data.slice(0, 5))
        }} disabled={loading}>
          Fetch completed todos for user 1
        </button>
        <button onClick={async () => {
          setLoading(true)
          const res = await apiClient.request('getTodos', { userId: 1, completed: false })
          setLoading(false)
          if (res.ok && res.data) setTodos(res.data.slice(0, 5))
        }} disabled={loading}>
          Fetch pending todos
        </button>
      </div>
      {todos.length > 0 && (
        <div style={{ fontSize: 12, marginTop: 4 }}>
          {todos.map((t) => (
            <div key={t.id}>
              {t.completed ? '✓' : '○'} {t.title.slice(0, 60)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ApiClientExample() {
  return (
    <div style={cardStyle}>
      <h2>ApiClient — HTTP client with caching</h2>
      <ApiInitPanel />
      <SimpleRequestDemo />
      <ParamsRequestDemo />
      <EndpointDirectDemo />
      <MutationDemo />
      <QueryParamsDemo />

      <h4>API заметки:</h4>
      <ul style={{ fontSize: 12, color: '#666' }}>
        <li><code>new ApiClient({'{ storage, baseQuery, cache, endpoints }'})</code> — создание</li>
        <li><code>apiClient.init()</code> — обязательная инициализация</li>
        <li><code>apiClient.request(endpointName, params, options?)</code> — выполнение запроса</li>
        <li><code>apiClient.getEndpoints()</code> — прямой доступ к эндпоинтам</li>
        <li><code>endpoint.request(params)</code> — возвращает объект с <code>subscribe</code>, <code>wait</code>, <code>abort</code></li>
        <li><code>cache: {'{ ttl, cleanup, invalidateOnError }'}</code> — глобальный кэш</li>
        <li><code>invalidatesTags</code> — автоматическая инвалидация кэша по тегам</li>
        <li><code>ResponseFormat</code> — Json, Blob, ArrayBuffer, Text, FormData, Raw</li>
        <li><code>prepareHeaders</code> — глобальный и per-endpoint</li>
      </ul>
    </div>
  )
}
