import { useState, useEffect, useRef } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { ApiClient } from 'synapse-storage/api'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

// ─── Типы ───────────────────────────────────────────────────────────────────

interface PokemonListResponse {
  count: number
  results: Array<{ name: string; url: string }>
}

interface Pokemon {
  id: number
  name: string
  height: number
  weight: number
  types: Array<{ type: { name: string } }>
  sprites: { front_default: string }
}

// ─── Создание хранилища для кэша ────────────────────────────────────────────

const apiCacheStorage = new MemoryStorage<Record<string, any>>({
  name: 'pokemon-api-cache',
  initialState: {},
})

// ─── Создание ApiClient ─────────────────────────────────────────────────────

const pokemonApi = new ApiClient({
  storage: apiCacheStorage as any,

  baseQuery: {
    baseUrl: 'https://pokeapi.co/api/v2',
    timeout: 10000,
    prepareHeaders: async (headers) => {
      headers.set('Accept', 'application/json')
      return headers
    },
  },

  cache: {
    ttl: 60000,
    cleanup: { enabled: true, interval: 120000 },
    invalidateOnError: true,
  },

  endpoints: async (create) => ({
    getPokemonList: create<{ limit?: number; offset?: number }, PokemonListResponse>({
      request: (params) => ({
        path: '/pokemon',
        method: 'GET',
        query: params,
      }),
      cache: { ttl: 120000 },
      tags: ['pokemon-list'],
    }),

    getPokemonById: create<{ id: number }, Pokemon>({
      request: ({ id }) => ({
        path: `/pokemon/${id}`,
        method: 'GET',
      }),
      cache: true,
      tags: ['pokemon'],
    }),

    getPokemonByName: create<{ name: string }, Pokemon>({
      request: ({ name }) => ({
        path: `/pokemon/${name}`,
        method: 'GET',
      }),
      cache: { ttl: 300000 },
      tags: ['pokemon'],
    }),
  }),
})

// ─── Инициализация ──────────────────────────────────────────────────────────

let initPromise: Promise<void> | null = null

function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await apiCacheStorage.initialize()
      await pokemonApi.init()
    })()
  }
  return initPromise
}

// ─── Компонент-пример ───────────────────────────────────────────────────────

export function ApiClientExample() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ensureInit().then(() => setReady(true)).catch((e) => setError(e.message))
  }, [])

  if (error) return <div style={cardStyle}><h2>ApiClient</h2><p style={{ color: 'red' }}>Init error: {error}</p></div>
  if (!ready) return <div style={cardStyle}><h2>ApiClient</h2><p>Initializing...</p></div>

  return (
    <div style={cardStyle}>
      <h2>ApiClient — HTTP-клиент с кэшированием</h2>
      <p>Типизированный HTTP-клиент. Endpoints, кэш по тегам, подписки на состояние запроса, abort.</p>

      {/* ─── Импорты ──────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Импорты</h3>
      <pre style={codeBlock}>{`import { MemoryStorage } from 'synapse-storage/core'
import { ApiClient } from 'synapse-storage/api'`}</pre>

      {/* ─── Создание ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Создание ApiClient</h3>
      <pre style={codeBlock}>{`// 1. Хранилище для кэша запросов
const apiCacheStorage = new MemoryStorage<Record<string, any>>({
  name: 'api-cache',
  initialState: {},
})

// 2. Создание клиента
const pokemonApi = new ApiClient({
  storage: apiCacheStorage,         // хранилище для кэша (обязательно)

  baseQuery: {
    baseUrl: 'https://pokeapi.co/api/v2',
    timeout: 10000,                 // таймаут запроса (мс)
    prepareHeaders: async (headers, context) => {
      headers.set('Accept', 'application/json')
      // headers.set('Authorization', \`Bearer \${token}\`)
      // context.requestParams — параметры текущего запроса
      // context.getFromStorage('key') — чтение из storage
      // context.getCookie('name') — чтение cookie
      return headers
    },
    // fetchFn: customFetch,        // кастомная fetch-функция
    // credentials: 'include',      // CORS credentials
  },

  cache: {
    ttl: 60000,                     // время жизни кэша (мс)
    cleanup: {
      enabled: true,
      interval: 120000,             // интервал авто-очистки (мс)
    },
    invalidateOnError: true,        // инвалидировать кэш при ошибке
  },

  endpoints: async (create) => ({
    // GET — список с query-параметрами
    getPokemonList: create<
      { limit?: number; offset?: number },  // тип параметров
      PokemonListResponse                   // тип ответа
    >({
      request: (params) => ({
        path: '/pokemon',
        method: 'GET',
        query: params,              // -> ?limit=5&offset=0
      }),
      cache: { ttl: 120000 },      // свой TTL для этого эндпоинта
      tags: ['pokemon-list'],       // теги для инвалидации
    }),

    // GET — один ресурс по ID (параметр в path)
    getPokemonById: create<{ id: number }, Pokemon>({
      request: ({ id }) => ({
        path: \`/pokemon/\${id}\`,   // -> /pokemon/25
        method: 'GET',
      }),
      cache: true,                  // используется глобальный TTL
      tags: ['pokemon'],
    }),
  }),
})

// 3. Инициализация (обязательна перед использованием)
await apiCacheStorage.initialize()
await pokemonApi.init()`}</pre>

      {/* ─── request() ────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>request() — выполнение запроса</h3>
      <pre style={codeBlock}>{`// pokemonApi.request(endpointName, params, options?)
// Возвращает Promise<QueryResult<T>>

const result = await pokemonApi.request('getPokemonList', { limit: 5 })

// QueryResult<T>:
// {
//   ok: boolean           — успешен ли запрос
//   data?: T              — данные ответа (типизированы)
//   error?: Error         — ошибка (если ok = false)
//   status: number        — HTTP статус (200, 404, ...)
//   statusText: string    — HTTP статус текст
//   headers: Headers      — заголовки ответа
//   fromCache?: boolean   — результат из кэша?
// }

if (result.ok) {
  console.log(result.data)        // PokemonListResponse (типизированно)
  console.log(result.fromCache)   // false (первый запрос)
}

// Повторный запрос с теми же параметрами — из кэша
const cached = await pokemonApi.request('getPokemonList', { limit: 5 })
console.log(cached.fromCache)     // true`}</pre>

      <SimpleRequestDemo />

      {/* ─── QueryOptions ─────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>QueryOptions — опции запроса</h3>
      <pre style={codeBlock}>{`// Третий аргумент request() — опции
await pokemonApi.request('getPokemonById', { id: 25 }, {
  disableCache: true,             // не использовать кэш
  timeout: 5000,                  // таймаут для этого запроса
  signal: abortController.signal, // сигнал отмены
  headers: new Headers({          // доп. заголовки
    'X-Custom': 'value',
  }),
  context: { source: 'user' },   // передаётся в prepareHeaders
})

// prepareHeaders получает context:
prepareHeaders: async (headers, context) => {
  if (context.context?.source === 'admin') {
    headers.set('X-Admin', 'true')
  }
  return headers
}`}</pre>

      {/* ─── RequestDefinition ────────────────────────────────────────── */}
      <h3 style={sectionTitle}>RequestDefinition — описание запроса в endpoint</h3>
      <pre style={codeBlock}>{`// Полная структура объекта, возвращаемого из request()
request: (params) => ({
  path: '/pokemon',               // путь (добавляется к baseUrl)
  method: 'GET',                  // 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body: params,                   // тело запроса (POST/PUT/PATCH)
  query: { limit: 5 },           // query-параметры (?limit=5)
  headers: { 'X-Custom': '1' },  // заголовки для этого запроса
  responseFormat: 'json',         // 'json' | 'blob' | 'arrayBuffer' | 'text' | 'formData' | 'raw'
})

// POST с body + инвалидация кэша
createPokemon: create<{ name: string; type: string }, Pokemon>({
  request: (params) => ({
    path: '/pokemon',
    method: 'POST',
    body: params,                 // сериализуется в JSON
  }),
  invalidatesTags: ['pokemon-list'],  // при успехе сбросит кэш
  cache: false,                       // мутации не кэшируем
})`}</pre>

      {/* ─── Кэширование ──────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Кэширование и теги</h3>
      <pre style={codeBlock}>{`// Глобальный кэш (для всех эндпоинтов)
cache: {
  ttl: 60000,                            // 60 секунд
  cleanup: { enabled: true, interval: 120000 },
  invalidateOnError: true,
}

// Per-endpoint кэш (переопределяет глобальный)
getPokemonById: create<...>({
  cache: { ttl: 300000 },               // 5 минут для этого эндпоинта
})

// Отключить кэш для эндпоинта
createPokemon: create<...>({
  cache: false,
})

// Отключить кэш для конкретного запроса
await pokemonApi.request('getPokemonById', { id: 1 }, {
  disableCache: true,                    // принудительно идти в сеть
})

// --- Теги ---
// Эндпоинт помечен тегами:
getPokemonList: create<...>({
  tags: ['pokemon-list'],
})

// Мутация инвалидирует теги при успехе:
createPokemon: create<...>({
  invalidatesTags: ['pokemon-list'],     // сбросит кэш всех endpoint'ов
                                         // с тегом 'pokemon-list'
})`}</pre>

      <CacheDemo />

      {/* ─── getEndpoints() ───────────────────────────────────────────── */}
      <h3 style={sectionTitle}>getEndpoints() — прямой доступ к эндпоинтам</h3>
      <pre style={codeBlock}>{`const endpoints = pokemonApi.getEndpoints()

// Endpoint объект:
// {
//   fetchCounts: number              — кол-во выполненных запросов
//   request(params, options?)        — выполнить запрос (возвращает RequestResponseModify)
//   subscribe(callback)              — подписка на состояние эндпоинта
//   reset()                          — сбросить счетчик
//   meta: { name, tags, invalidatesTags, cache }
//   destroy()                        — очистка
// }

// request() через endpoint возвращает RequestResponseModify:
const req = endpoints.getPokemonById.request({ id: 25 })

// RequestResponseModify:
// {
//   id: string                       — уникальный ID запроса
//   subscribe(listener)              — подписка на состояние запроса
//   wait()                           — Promise<QueryResult>
//   waitWithCallbacks({ idle, loading, success, error })
//   abort()                          — отменить запрос
//   then/catch/finally               — Promise API (можно await)
// }

// Подписка на состояние запроса
req.subscribe((state) => {
  // RequestState<T>:
  // {
  //   status: 'idle' | 'loading' | 'success' | 'error'
  //   data?: Pokemon
  //   error?: Error
  //   fromCache: boolean
  //   requestParams: { id: number }
  // }
  console.log(state.status)       // 'loading' -> 'success'
  console.log(state.data)         // Pokemon | undefined
})

// Дождаться результата
const result = await req.wait()
console.log(result.data)          // Pokemon`}</pre>

      <EndpointDirectDemo />

      {/* ─── waitWithCallbacks ────────────────────────────────────────── */}
      <h3 style={sectionTitle}>waitWithCallbacks() — колбэки по статусам</h3>
      <pre style={codeBlock}>{`const endpoints = pokemonApi.getEndpoints()
const req = endpoints.getPokemonById.request({ id: 25 })

const result = await req.waitWithCallbacks({
  idle: (state) => console.log('Idle'),
  loading: (state) => console.log('Loading...'),
  success: (data, state) => console.log('Data:', data),
  error: (error, state) => console.log('Error:', error),
})

// result — тот же QueryResult<T>`}</pre>

      {/* ─── abort() ──────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>abort() — отмена запроса</h3>
      <pre style={codeBlock}>{`// Способ 1: через endpoint
const endpoints = pokemonApi.getEndpoints()
const req = endpoints.getPokemonById.request({ id: 25 })
req.abort()  // отменяет запрос через AbortController

// Способ 2: через AbortController в options
const controller = new AbortController()
const result = pokemonApi.request('getPokemonById', { id: 25 }, {
  signal: controller.signal,
})
controller.abort()  // отменяет запрос`}</pre>

      <AbortDemo />

      {/* ─── Подписка на endpoint state ───────────────────────────────── */}
      <h3 style={sectionTitle}>subscribe() — подписка на состояние endpoint</h3>
      <pre style={codeBlock}>{`const endpoints = pokemonApi.getEndpoints()

// Подписка на общее состояние эндпоинта (не конкретного запроса)
const unsub = endpoints.getPokemonById.subscribe((state) => {
  // EndpointState:
  // {
  //   status: 'idle' | 'loading' | 'success' | 'error'
  //   error?: Error
  //   fetchCounts: number
  //   meta: { name, tags, invalidatesTags, cache }
  //   cacheableHeaders: string[]
  // }
  console.log('Endpoint status:', state.status, 'fetches:', state.fetchCounts)
})

// Отписка
unsub()`}</pre>

      {/* ─── Lifecycle ────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Lifecycle</h3>
      <pre style={codeBlock}>{`// Инициализация (обязательна)
await apiCacheStorage.initialize()  // сначала хранилище
await pokemonApi.init()             // потом клиент

// Уничтожение (очищает кэш, подписки, эндпоинты)
await pokemonApi.destroy()`}</pre>
    </div>
  )
}

// ─── Демо-компоненты ────────────────────────────────────────────────────────

function SimpleRequestDemo() {
  const [pokemons, setPokemons] = useState<Array<{ name: string; url: string }>>([])
  const [loading, setLoading] = useState(false)
  const [meta, setMeta] = useState('')

  const fetchList = async () => {
    setLoading(true)
    const start = Date.now()
    const result = await pokemonApi.request('getPokemonList', { limit: 5 })
    setLoading(false)

    if (result.ok && result.data) {
      setPokemons(result.data.results)
      setMeta(`status: ${result.status} | fromCache: ${result.fromCache} | ${Date.now() - start}ms`)
    } else {
      setMeta(`error: ${result.error}`)
    }
  }

  return (
    <div style={{ padding: 8, background: '#e8f5e9', borderRadius: 4, marginTop: 8 }}>
      <strong>Demo: request('getPokemonList', {'{ limit: 5 }'})</strong>
      <div style={buttonRow}>
        <button onClick={fetchList} disabled={loading}>
          {loading ? 'Loading...' : 'Fetch (1-й раз — сеть, 2-й — кэш)'}
        </button>
      </div>
      {meta && <div style={{ fontSize: 11, color: '#888' }}>{meta}</div>}
      {pokemons.length > 0 && (
        <div style={{ fontSize: 12, marginTop: 4 }}>
          {pokemons.map((p, i) => <div key={i}>{i + 1}. {p.name}</div>)}
        </div>
      )}
    </div>
  )
}

function CacheDemo() {
  const [log, setLog] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const addLog = (msg: string) => setLog((prev) => [...prev, msg])

  const runCacheDemo = async () => {
    setLoading(true)
    setLog([])

    const start1 = Date.now()
    const r1 = await pokemonApi.request('getPokemonByName', { name: 'pikachu' })
    addLog(`1) pikachu: fromCache=${r1.fromCache} | ${Date.now() - start1}ms`)

    const start2 = Date.now()
    const r2 = await pokemonApi.request('getPokemonByName', { name: 'pikachu' })
    addLog(`2) pikachu (повтор): fromCache=${r2.fromCache} | ${Date.now() - start2}ms`)

    const start3 = Date.now()
    const r3 = await pokemonApi.request('getPokemonByName', { name: 'charizard' })
    addLog(`3) charizard (новые params): fromCache=${r3.fromCache} | ${Date.now() - start3}ms`)

    const start4 = Date.now()
    const r4 = await pokemonApi.request('getPokemonByName', { name: 'pikachu' }, { disableCache: true })
    addLog(`4) pikachu (disableCache: true): fromCache=${r4.fromCache} | ${Date.now() - start4}ms`)

    setLoading(false)
  }

  return (
    <div style={{ padding: 8, background: '#f3e5f5', borderRadius: 4, marginTop: 8 }}>
      <strong>Demo: Кэширование</strong>
      <div style={buttonRow}>
        <button onClick={runCacheDemo} disabled={loading}>
          {loading ? 'Running...' : 'Run cache demo'}
        </button>
      </div>
      {log.length > 0 && (
        <pre style={{ ...codeBlock, fontSize: 11 }}>{log.join('\n')}</pre>
      )}
    </div>
  )
}

function EndpointDirectDemo() {
  const [states, setStates] = useState<string[]>([])
  const [pokemon, setPokemon] = useState<Pokemon | null>(null)
  const [loading, setLoading] = useState(false)

  const runDemo = async () => {
    setLoading(true)
    setStates([])
    setPokemon(null)

    const endpoints = pokemonApi.getEndpoints()
    const req = endpoints.getPokemonById.request(
      { id: 6 },
      { disableCache: true },
    )

    req.subscribe((state) => {
      setStates((prev) => [...prev, `status: ${state.status} | fromCache: ${state.fromCache} | data: ${state.data ? state.data.name : 'null'}`])
    })

    const result = await req.wait()
    if (result.ok && result.data) {
      setPokemon(result.data)
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: 8, background: '#e3f2fd', borderRadius: 4, marginTop: 8 }}>
      <strong>Demo: getEndpoints() + subscribe + wait()</strong>
      <div style={buttonRow}>
        <button onClick={runDemo} disabled={loading}>
          {loading ? 'Loading...' : 'Fetch Charizard (#6)'}
        </button>
      </div>
      {states.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>State transitions:</div>
          <pre style={{ ...codeBlock, fontSize: 11 }}>{states.join('\n')}</pre>
        </div>
      )}
      {pokemon && (
        <div style={{ fontSize: 12, marginTop: 4, display: 'flex', gap: 12, alignItems: 'center' }}>
          {pokemon.sprites.front_default && (
            <img src={pokemon.sprites.front_default} alt={pokemon.name} style={{ width: 64, height: 64, imageRendering: 'pixelated' }} />
          )}
          <div><strong>{pokemon.name}</strong> (#{pokemon.id})</div>
        </div>
      )}
    </div>
  )
}

function AbortDemo() {
  const [status, setStatus] = useState<string>('')
  const reqRef = useRef<any>(null)

  const startRequest = () => {
    setStatus('loading...')
    const endpoints = pokemonApi.getEndpoints()
    const req = endpoints.getPokemonByName.request(
      { name: 'mewtwo' },
      { disableCache: true },
    )
    reqRef.current = req

    req.subscribe((state) => {
      setStatus(`status: ${state.status}`)
    })

    req.wait().then((result) => {
      if (result.ok) {
        setStatus(`success: ${result.data!.name}`)
      } else {
        setStatus(`error/aborted: ${result.error}`)
      }
    }).catch(() => {
      setStatus('aborted (catch)')
    })
  }

  const abortRequest = () => {
    if (reqRef.current) {
      reqRef.current.abort()
      setStatus('abort() called')
    }
  }

  return (
    <div style={{ padding: 8, background: '#fce4ec', borderRadius: 4, marginTop: 8 }}>
      <strong>Demo: abort()</strong>
      <div style={buttonRow}>
        <button onClick={startRequest}>Start request</button>
        <button onClick={abortRequest}>Abort!</button>
      </div>
      {status && <div style={{ fontSize: 11, color: '#888' }}>{status}</div>}
    </div>
  )
}
