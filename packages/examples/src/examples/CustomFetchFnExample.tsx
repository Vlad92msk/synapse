import { useEffect, useRef, useState } from 'react'
import { ApiClient } from 'synapse-storage/api'
import { MemoryStorage } from 'synapse-storage/core'

import { buttonRow, cardStyle, sectionTitle } from './styles'

// ─────────────────────────────────────────────────────────────────────────────
// Axis B — a custom `baseQuery.fetchFn`.
//
// `ApiClient` accepts `baseQuery: { baseUrl, fetchFn?: typeof fetch }`. `fetchFn`
// replaces HOW the client performs a request — it's the TRANSPORT, not a
// ServiceWorker interception. Here it wraps the transport with an auth header and
// exactly ONE silent refresh-then-retry on a 401.
//
// The library does NOT need extending: `fetchFn` is built in. And crucially, the
// `ApiClient` cache/tags layer keeps working UNCHANGED on top of the custom
// transport — a GET is cached, a mutation invalidates the tag, the refetch runs
// back through the same `customFetch`.
//
// To keep the demo deterministic (no real auth server), the transport talks to a
// tiny in-memory fake backend that rejects a stale token with 401. Rotate the
// server token with the "expire session" button, then hit "load notes" — you'll
// see the 401 → silent refresh → retry happen inside `fetchFn`, invisible to the
// ApiClient above it.
// ─────────────────────────────────────────────────────────────────────────────

interface Note {
  id: number
  title: string
}

// ── Fake in-memory backend (stands in for a real HTTP API) ───────────────────
const notes: Note[] = [{ id: 1, title: 'first note' }]
let nextId = 2

let serverToken = 'tok-1' // the token the server currently accepts
let sessionToken = 'tok-1' // the token the client currently holds
let transportHits = 0 // how many times the real transport actually ran
let refreshCount = 0 // how many silent refreshes happened

// A tiny event bus so the UI can show what `customFetch` did under the hood.
const listeners = new Set<(m: string) => void>()
const emit = (m: string) => listeners.forEach((l) => l(m))

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// The refresh endpoint: issues a token the server will accept again.
async function refreshToken(): Promise<string> {
  await delay(120)
  refreshCount += 1
  return serverToken
}

// The actual transport `customFetch` talks to. In a real app this would be
// `window.fetch`, an axios wrapper, or a postMessage bridge to a Worker.
async function transport(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  transportHits += 1
  await delay(150)

  const auth = new Headers(init?.headers).get('Authorization')
  if (auth !== `Bearer ${serverToken}`) {
    return json({ message: 'token expired' }, 401)
  }

  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const method = (init?.method ?? 'GET').toUpperCase()

  if (url.endsWith('/notes') && method === 'GET') {
    return json(notes)
  }
  if (url.endsWith('/notes') && method === 'POST') {
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as { title: string }) : { title: 'untitled' }
    const note: Note = { id: nextId++, title: body.title }
    notes.push(note)
    return json(note, 201)
  }
  return json({ message: 'not found' }, 404)
}

// ── The custom fetchFn: auth header + one silent refresh-then-retry on 401 ────
const customFetch: typeof fetch = async (input, init) => {
  const send = (token: string) => {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return transport(input, { ...init, headers })
  }

  let res = await send(sessionToken)
  if (res.status === 401) {
    emit('401 → silent refresh + retry (invisible to ApiClient)')
    sessionToken = await refreshToken()
    res = await send(sessionToken)
  }
  return res
}

// ── ApiClient over the custom transport — cache/tags untouched ────────────────
function makeClient() {
  return new ApiClient({
    storage: new MemoryStorage<Record<string, any>>({ name: 'custom-fetch-fn-cache', initialState: {} }),
    baseQuery: {
      baseUrl: 'https://example.test/api', // never actually hit — customFetch owns the transport
      fetchFn: customFetch,
    },
    cache: { ttl: 60_000 },
    endpoints: async (create) => ({
      // GET — cached + tagged
      getNotes: create<Record<string, never>, Note[]>({
        request: () => ({ path: '/notes', method: 'GET' }),
        cache: true,
        tags: ['notes'],
      }),
      // POST — a mutation that invalidates the tag on success
      addNote: create<{ title: string }, Note>({
        request: (body) => ({ path: '/notes', method: 'POST', body }),
        cache: false,
        invalidatesTags: ['notes'],
      }),
    }),
  })
}

const client = makeClient()

type Endpoints = ReturnType<typeof client.getEndpoints>

export function CustomFetchFnExample() {
  const [ready, setReady] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const endpointsRef = useRef<Endpoints | null>(null)
  const append = (m: string) => setLog((p) => [...p.slice(-8), m])

  useEffect(() => {
    const onEvent = (m: string) => append(`  ↳ ${m}`)
    listeners.add(onEvent)
    client.init().then(() => {
      endpointsRef.current = client.getEndpoints() as Endpoints
      setReady(true)
    })
    return () => {
      listeners.delete(onEvent)
    }
  }, [])

  // GET through the custom transport. First call hits transport; a repeat with the
  // same params is served from the ApiClient cache — transport is NOT called.
  const loadNotes = async () => {
    const ep = endpointsRef.current
    if (!ep) return
    const before = transportHits
    const res = await ep.getNotes.request({}).wait()
    const hit = transportHits > before
    append(
      res.ok
        ? `getNotes → ${res.data?.length ?? 0} notes ${hit ? '(via customFetch)' : '(from cache)'}`
        : `getNotes error: ${res.error?.message ?? 'failed'}`,
    )
  }

  // A mutation. On success it invalidates the 'notes' tag, so the next getNotes
  // goes back through customFetch instead of the cache.
  const addNote = async () => {
    const ep = endpointsRef.current
    if (!ep) return
    const title = `note @ ${new Date().toLocaleTimeString()}`
    const res = await ep.addNote.request({ title }).wait()
    append(res.ok ? `addNote → #${res.data?.id} (invalidates 'notes' tag)` : `addNote error: ${res.error?.message ?? 'failed'}`)
  }

  // Rotate the server token so the client's held token becomes stale. The next
  // request 401s → customFetch silently refreshes and retries, once.
  const expireSession = () => {
    serverToken = `tok-${Date.now()}`
    append(`session expired on server (refreshes so far: ${refreshCount})`)
  }

  return (
    <div style={cardStyle}>
      <h2>Custom baseQuery.fetchFn (auth-retry transport)</h2>
      <p>
        A custom <code>fetchFn</code> in <code>baseQuery</code> replaces <b>how</b> the client performs a request. Here it
        adds an auth header and does exactly one silent <code>refresh → retry</code> on a 401 — the <code>ApiClient</code>{' '}
        above never sees the 401. The library needs <b>no</b> extending: <code>fetchFn</code> is built in.
      </p>

      <h3 style={sectionTitle}>Cache/tags work over the custom transport</h3>
      <p style={{ fontSize: 13, color: '#888' }}>
        1) <b>load notes</b> twice — the second is served from cache (no transport call). 2) <b>add note</b> invalidates the{' '}
        <code>notes</code> tag, so the next <b>load notes</b> refetches through <code>customFetch</code>. 3) <b>expire
        session</b> then <b>load notes</b> — watch the silent 401 refresh-retry.
      </p>
      <div style={buttonRow}>
        <button onClick={loadNotes} disabled={!ready}>
          load notes
        </button>
        <button onClick={addNote} disabled={!ready}>
          add note
        </button>
        <button onClick={expireSession} disabled={!ready}>
          expire session
        </button>
        <button onClick={() => setLog([])}>clear log</button>
      </div>
      {!ready && <p style={{ color: '#888' }}>Initializing ApiClient…</p>}

      <ul style={{ fontSize: 12, fontFamily: 'monospace', paddingLeft: 16 }}>
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  )
}
