import { useEffect, useRef, useState } from 'react'
import { ApiClient } from 'synapse-storage/api'
import { WorkerCacheStorage } from 'synapse-storage/core'

import { buttonRow, cardStyle, sectionTitle } from './styles'

// WorkerCacheStorage — асинхронный адаптер, чей стор живёт ВНУТРИ SharedWorker:
// живой кэш, ОБЩИЙ между вкладками origin-а. Здесь он подкладывается под ApiClient
// как storage кэша ответов.
//
// Главное отличие в DevTools → Network: повторный запрос (в т.ч. из ДРУГОЙ вкладки)
// обслуживается из воркер-кэша — сетевого хита НЕТ. Так и задумано.
//
// Важно: это ЖИВОЙ кэш, а не офлайн-слой. Для настоящего офлайна / контроля fetch
// см. рецепты внизу файла — они не про это хранилище.

interface PokemonApiResponse {
  name: string
  sprites: { front_default: string }
}

// Фабрика ApiClient поверх WorkerCacheStorage.
// channelName фиксируем = имени, чтобы все вкладки делили один канал.
function makeClient() {
  return new ApiClient({
    storage: new WorkerCacheStorage<Record<string, any>>({
      name: 'worker-cache-shared',
      options: {
        channelName: 'worker-cache-shared',
      },
    }),
    baseQuery: { baseUrl: 'https://pokeapi.co/api/v2', timeout: 10000 },
    cache: { ttl: 5 * 60_000 }, // ответы кэшируются в воркере на 5 минут
    endpoints: async (create) => ({
      getPokemon: create<{ id: number }, PokemonApiResponse>({
        request: ({ id }) => ({ path: `/pokemon/${id}`, method: 'GET' }),
        cache: true,
      }),
    }),
  })
}

const sharedClient = makeClient()

type Endpoints = ReturnType<typeof sharedClient.getEndpoints>

function ClientDemo({ title, hint }: { title: string; hint: string }) {
  const [ready, setReady] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const endpointsRef = useRef<Endpoints | null>(null)
  const append = (m: string) => setLog((p) => [...p.slice(-6), m])

  useEffect(() => {
    sharedClient.init().then(() => {
      endpointsRef.current = sharedClient.getEndpoints() as Endpoints
      setReady(true)
    })
  }, [])

  // Первый запрос — сеть. Повторный (или из другой вкладки) — из воркер-кэша.
  const load = async (id: number) => {
    const ep = endpointsRef.current
    if (!ep) return
    const t0 = performance.now()
    const res = await ep.getPokemon.request({ id }).wait()
    const ms = Math.round(performance.now() - t0)
    append(res.ok ? `#${id} ${res.data?.name} — ${ms}ms` : `#${id} error: ${res.error?.message ?? 'failed'}`)
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: '#888' }}>{hint}</p>
      <div style={buttonRow}>
        <button onClick={() => load(25)} disabled={!ready}>get #25 (pikachu)</button>
        <button onClick={() => load(1)} disabled={!ready}>get #1 (bulbasaur)</button>
        <button onClick={() => setLog([])}>clear log</button>
      </div>
      {!ready && <p style={{ color: '#888' }}>Initializing {title}…</p>}
      <ul style={{ fontSize: 12, fontFamily: 'monospace', paddingLeft: 16 }}>
        {log.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
    </div>
  )
}

export function WorkerCacheStorageExample() {
  return (
    <div style={cardStyle}>
      <h2>WorkerCacheStorage (ApiClient cache)</h2>
      <p>
        Кэш ответов <code>ApiClient</code> вынесен в SharedWorker. Следи за вкладкой Network:
        повторный запрос сетью НЕ идёт — ответ берётся из воркер-кэша. Это принципиальное отличие
        от обычного кэша в памяти вкладки, который у каждой вкладки свой.
      </p>

      <h3 style={sectionTitle}>Общий кэш между вкладками</h3>
      <ClientDemo
        title="shared"
        hint="Загрузи #25 здесь, затем открой страницу во ВТОРОЙ вкладке и запроси #25 — ответ придёт из общего SharedWorker-кэша, без сети."
      />

      <p style={{ fontSize: 13, color: '#888', marginTop: 16 }}>
        Нужен офлайн или контроль fetch? Это <b>живой</b> кэш, а не офлайн-слой. Смотри рецепты:
        «Custom fetch-intercepting ServiceWorker» (свой <code>sw.js</code> перехватывает fetch) и
        «Custom baseQuery.fetchFn» (замена транспорта: auth-retry, метрики, worker) — они решают
        офлайн/сеть, а не это хранилище.
      </p>
    </div>
  )
}
