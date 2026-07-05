import { useEffect, useRef, useState } from 'react'
import { ApiClient } from 'synapse-storage/api'
import { MemoryStorage } from 'synapse-storage/core'

import { buttonRow, cardStyle, codeBlock, sectionTitle } from './styles'

// ─────────────────────────────────────────────────────────────────────────────
// Axis A — full fetch control via an APP-OWNED, fetch-intercepting ServiceWorker.
//
// The `ApiClient` below is completely ordinary: plain MemoryStorage, plain
// `baseQuery`, no custom `fetchFn`. It does NOT know a ServiceWorker exists.
//
// Separately, we register `/custom-sw.js` (see `public/custom-sw.js`). That SW
// lives BELOW the client at the platform level and transparently intercepts
// `fetch` (stale-while-revalidate per URL + offline fallback). Because the SW
// sits below `fetch`, every request STILL appears in DevTools → Network — but
// tagged "(ServiceWorker)". Contrast this with `WorkerCacheStorage`, which
// short-circuits ABOVE fetch: a cache hit there produces NO Network row at all.
//
// The SW is unrelated to `ApiClient.storage`: the storage is the client's
// in-tab cache/tag layer; the SW is a network-layer interceptor. Two independent
// axes of control.
// ─────────────────────────────────────────────────────────────────────────────

interface PokemonApiResponse {
  name: string
  sprites: { front_default: string }
}

const API_BASE = 'https://pokeapi.co/api/v2'

// A totally normal ApiClient. Nothing here is aware of the ServiceWorker.
const apiClient = new ApiClient({
  storage: new MemoryStorage<Record<string, any>>({
    name: 'custom-fetch-sw-cache',
    initialState: {},
  }),
  baseQuery: { baseUrl: API_BASE, timeout: 10000 },
  cache: { ttl: 5 * 60_000 },
  endpoints: async (create) => ({
    getPokemon: create<{ id: number }, PokemonApiResponse>({
      request: ({ id }) => ({ path: `/pokemon/${id}`, method: 'GET' }),
      cache: true,
    }),
  }),
})

type Endpoints = ReturnType<typeof apiClient.getEndpoints>

type SwState = 'unsupported' | 'registering' | 'controlling' | 'waiting' | 'error'

export function CustomFetchServiceWorkerExample() {
  const [swState, setSwState] = useState<SwState>('registering')
  const [ready, setReady] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const endpointsRef = useRef<Endpoints | null>(null)
  const append = (m: string) => setLog((p) => [...p.slice(-6), m])

  // Register the app-owned SW. This is the ONLY wiring the SW needs — the
  // ApiClient above is untouched.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setSwState('unsupported')
      return
    }
    setSwState('registering')
    navigator.serviceWorker
      .register('/custom-sw.js')
      .then(async () => {
        // `controller` is set once the SW controls this page.
        setSwState(navigator.serviceWorker.controller ? 'controlling' : 'waiting')
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          setSwState(navigator.serviceWorker.controller ? 'controlling' : 'waiting')
        })
      })
      .catch(() => setSwState('error'))
  }, [])

  useEffect(() => {
    apiClient.init().then(() => {
      endpointsRef.current = apiClient.getEndpoints() as Endpoints
      setReady(true)
    })
  }, [])

  // Fetch through the ApiClient. Watch DevTools → Network: the row is tagged
  // "(ServiceWorker)". Toggle "Offline" there and repeat — the SW serves it
  // from its own cache (or the offline fallback) with no real network.
  const load = async (id: number) => {
    const ep = endpointsRef.current
    if (!ep) return
    const t0 = performance.now()
    const res = await ep.getPokemon.request({ id }).wait()
    const ms = Math.round(performance.now() - t0)
    append(
      res.ok
        ? `#${id} ${res.data?.name} — ${ms}ms (row tagged "(ServiceWorker)" in Network)`
        : `#${id} error: ${res.error?.message ?? 'failed'}`,
    )
  }

  // A raw fetch that reads the SW-injected headers, so interception is visible
  // right here in the UI (not only in DevTools). Same URL space as the client.
  const pingViaSw = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/pokemon/${id}`)
      const servedBy = res.headers.get('X-Served-By') ?? '(none — not intercepted yet)'
      const strategy = res.headers.get('X-SW-Strategy') ?? '—'
      append(`ping #${id}: X-Served-By=${servedBy}, strategy=${strategy}`)
    } catch (e) {
      append(`ping #${id}: network error (${(e as Error).message})`)
    }
  }

  const swLabel: Record<SwState, string> = {
    unsupported: 'ServiceWorker not supported in this browser',
    registering: 'registering /custom-sw.js …',
    controlling: 'controlling this page ✓ (fetch is being intercepted)',
    waiting: 'registered — reload once so it starts controlling the page',
    error: 'registration failed',
  }

  return (
    <div style={cardStyle}>
      <h2>Custom fetch-intercepting ServiceWorker</h2>
      <p>
        An ordinary <code>ApiClient</code> (plain <code>MemoryStorage</code>, no custom{' '}
        <code>fetchFn</code>) with an app-owned <code>/custom-sw.js</code> registered on top. The SW
        transparently intercepts <code>fetch</code> with stale-while-revalidate + an offline
        fallback. The client never knows it exists.
      </p>

      <h3 style={sectionTitle}>ServiceWorker status</h3>
      <pre style={codeBlock}>{`SW: ${swLabel[swState]}`}</pre>

      <h3 style={sectionTitle}>Fetch through the ApiClient</h3>
      <p style={{ fontSize: 13, color: '#888' }}>
        Open DevTools → Network. Each request appears as a row tagged{' '}
        <code>(ServiceWorker)</code> — the SW sits <b>below</b> fetch, so the row still shows (unlike{' '}
        <code>WorkerCacheStorage</code>, where a cache hit produces <b>no row at all</b>). Tick{' '}
        <b>Offline</b> in Network and click again: the SW answers from its cache / offline fallback.
      </p>
      <div style={buttonRow}>
        <button onClick={() => load(25)} disabled={!ready}>
          get #25 (pikachu)
        </button>
        <button onClick={() => load(1)} disabled={!ready}>
          get #1 (bulbasaur)
        </button>
        <button onClick={() => pingViaSw(25)}>ping #25 (read SW headers)</button>
        <button onClick={() => setLog([])}>clear log</button>
      </div>
      {!ready && <p style={{ color: '#888' }}>Initializing ApiClient…</p>}
      <ul style={{ fontSize: 12, fontFamily: 'monospace', paddingLeft: 16 }}>
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>

      <p style={{ fontSize: 13, color: '#888', marginTop: 16 }}>
        This is the real offline / fetch-control path. It needs <b>no library changes</b>: the SW is
        an app-owned asset that works out of the box, orthogonal to <code>ApiClient.storage</code>.
        For replacing <i>how</i> a request is performed (auth-retry, metrics, worker transport)
        instead of intercepting it, see the <code>baseQuery.fetchFn</code> recipe.
      </p>
    </div>
  )
}
