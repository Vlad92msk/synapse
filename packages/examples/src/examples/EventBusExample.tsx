import { useEffect, useRef, useState } from 'react'
import { createEventBus } from 'synapse-storage/utils'
import { buttonRow, cardStyle, sectionTitle } from './styles'

/**
 * createEventBus — развязка между модулями через доменные события. Pokemon-модуль публикует
 * события («выбрали покемона», «переключили избранное»), а сторонние сервисы — analytics и
 * toaster — слушают их по паттерну, не импортируя сам synapse.
 *
 * Реальная интеграция: вызовы `publish` ставятся в dispatcher/effects pokemon-модуля; здесь
 * они вынесены на кнопки, чтобы наглядно показать поток событие → подписчики. Шина — это
 * `createSynapse`-handle, поэтому её нужно один раз поднять (`await`).
 */
const pokemonEventBus = createEventBus({ name: 'pokemon-events', autoCleanup: true, maxEvents: 100 })

type Bus = Awaited<typeof pokemonEventBus>

export function EventBusExample() {
  const busRef = useRef<Bus | null>(null)
  const [analytics, setAnalytics] = useState<string[]>([])
  const [toasts, setToasts] = useState<string[]>([])

  useEffect(() => {
    const subs: Array<() => void> = []
    pokemonEventBus.then(async (bus) => {
      busRef.current = bus
      // analytics: слушает ВСЕ pokemon-события по wildcard.
      const a = await bus.dispatcher.subscribe({
        eventPattern: 'POKEMON_*',
        handler: (data) => setAnalytics((prev) => [...prev.slice(-4), `track ${JSON.stringify(data)}`]),
      })
      // toaster: только переключение избранного.
      const t = await bus.dispatcher.subscribe({
        eventPattern: 'FAVORITE_TOGGLED',
        handler: (data) => setToasts((prev) => [...prev.slice(-4), `★ favorite #${data.id}`]),
      })
      subs.push(a.unsubscribe, t.unsubscribe)
    })
    return () => subs.forEach((u) => u())
  }, [])

  const publish = (event: string, data: any) => busRef.current?.dispatcher.publish({ event, data })

  return (
    <div style={cardStyle}>
      <h2>createEventBus (Pokemon)</h2>
      <p>
        Шина событий между модулями: pokemon публикует доменные события, а <code>analytics</code> и
        <code> toaster</code> подписаны по паттернам (<code>POKEMON_*</code> / <code>FAVORITE_TOGGLED</code>),
        ничего не зная про сам synapse.
      </p>

      <h3 style={sectionTitle}>Publish</h3>
      <div style={buttonRow}>
        <button onClick={() => publish('POKEMON_SELECTED', { id: 25, name: 'pikachu' })}>POKEMON_SELECTED</button>
        <button onClick={() => publish('POKEMON_LOADED', { count: 12 })}>POKEMON_LOADED</button>
        <button onClick={() => publish('FAVORITE_TOGGLED', { id: 6, name: 'charizard' })}>FAVORITE_TOGGLED</button>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong>analytics (POKEMON_*)</strong>
          <ul style={{ fontSize: 12, fontFamily: 'monospace', paddingLeft: 16 }}>
            {analytics.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong>toaster (FAVORITE_TOGGLED)</strong>
          <ul style={{ fontSize: 12, fontFamily: 'monospace', paddingLeft: 16 }}>
            {toasts.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}
