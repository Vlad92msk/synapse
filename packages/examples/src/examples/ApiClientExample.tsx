import { useEffect, useRef, useState } from 'react'
import { initPokemonApi, pokemonApiClient, type PokemonApiEndpoints } from './pokemon-advanced/pokemon.api'
import { buttonRow, cardStyle, sectionTitle } from './styles'

/**
 * Интерактивная песочница вокруг канонического `pokemonApiClient` (см. pokemon-advanced/pokemon.api.ts).
 * Тот же клиент, что эффекты модуля используют в проде, но здесь его дёргают руками, чтобы
 * показать живьём: подписку на состояние запроса, кэш (TTL) и отмену (abort).
 */
export function ApiClientExample() {
  const [ready, setReady] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const endpointsRef = useRef<PokemonApiEndpoints | null>(null)
  const append = (m: string) => setLog((p) => [...p.slice(-7), m])

  useEffect(() => {
    initPokemonApi().then(() => {
      endpointsRef.current = pokemonApiClient.getEndpoints()
      setReady(true)
    })
  }, [])

  // request() возвращает управляемый объект: subscribe (состояние) / wait (промис) / abort.
  const loadList = async () => {
    const ep = endpointsRef.current
    if (!ep) return
    const t0 = performance.now()
    const req = ep.getList.request({ limit: 12, offset: 0 })
    req.subscribe((s) => append(`status: ${s.status}`))
    const res = await req.wait()
    const ms = Math.round(performance.now() - t0)
    append(res.ok ? `ok: ${res.data?.results.length} items in ${ms}ms` : `error: ${res.error?.message ?? 'failed'}`)
  }

  // Второй вызов с теми же параметрами обслуживается из кэша (cache.ttl на эндпоинте) — заметно быстрее.
  const loadCached = async () => {
    const ep = endpointsRef.current
    if (!ep) return
    const t0 = performance.now()
    const res = await ep.getList.request({ limit: 12, offset: 0 }).wait()
    append(`cache: ${res.data?.results.length ?? 0} items in ${Math.round(performance.now() - t0)}ms`)
  }

  // abort() отменяет запрос на лету.
  const abortDemo = () => {
    const ep = endpointsRef.current
    if (!ep) return
    const req = ep.getDetails.request({ id: 1 })
    req.abort()
    append('aborted getDetails(1)')
  }

  return (
    <div style={cardStyle}>
      <h2>ApiClient (Pokemon)</h2>
      <p>
        Песочница поверх <code>pokemonApiClient</code>: подписка на статус запроса, кэш по TTL и отмена.
        Создание клиента и мапперы — в каноническом <code>pokemon.api.ts</code>.
      </p>

      <h3 style={sectionTitle}>Demo</h3>
      <div style={buttonRow}>
        <button onClick={loadList} disabled={!ready}>request getList</button>
        <button onClick={loadCached} disabled={!ready}>request again (cache)</button>
        <button onClick={abortDemo} disabled={!ready}>request + abort</button>
        <button onClick={() => setLog([])}>clear log</button>
      </div>
      {!ready && <p style={{ color: '#888' }}>Initializing ApiClient…</p>}

      <ul style={{ fontSize: 12, fontFamily: 'monospace', paddingLeft: 16 }}>
        {log.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
    </div>
  )
}
