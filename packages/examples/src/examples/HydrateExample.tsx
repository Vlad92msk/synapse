import { useEffect, useState } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { cardStyle, sectionTitle } from './styles'
import type { PokemonBrief } from './pokemon-advanced/pokemon.types'

/**
 * SSR-гидрация на домене pokemon: первую страницу покемонов рендерим на СЕРВЕРЕ, снапшот
 * уезжает на клиент и засевает стор ДО initialize() — первый клиентский рендер идёт уже с
 * данными, без мигания и без повторного запроса. Это упрощённая копия паттерна из реального
 * Next.js page.tsx (server fetch → dehydrate → проп dehydratedState → client seed).
 */
interface PokemonListState extends Record<string, any> {
  pokemonList: PokemonBrief[]
}

// ── СЕРВЕР (Next.js: Server Component / page.tsx) ───────────────────────────
// Фетчим первую страницу на сервере и собираем сериализуемый снапшот стора.
async function fetchFirstPokemonOnServer(): Promise<PokemonListState> {
  const res = await fetch('https://pokeapi.co/api/v2/pokemon?limit=12&offset=0')
  const data = (await res.json()) as { results: Array<{ name: string; url: string }> }
  const pokemonList: PokemonBrief[] = data.results.map((p) => {
    const id = Number(p.url.split('/').filter(Boolean).pop())
    return { id, name: p.name, sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png` }
  })
  return { pokemonList }
}

// ── КЛИЕНТ ('use client') ──────────────────────────────────────────────────
// Снапшот пришёл пропом. hydrate() ДО initialize() — серверное состояние побеждает initialState,
// инициализация его не перезатирает, повторного фетча нет.
function seedStorageFromServer(serverState: PokemonListState): MemoryStorage<PokemonListState> {
  const storage = new MemoryStorage<PokemonListState>({ name: 'pokemon-ssr', initialState: { pokemonList: [] } })
  storage.hydrate(serverState)
  return storage
}

export function HydrateExample() {
  const [serverState, setServerState] = useState<PokemonListState | null>(null)
  const [list, setList] = useState<PokemonBrief[]>([])

  // Имитация серверного рендера (в Next.js произошло бы в page.tsx до отдачи HTML).
  useEffect(() => {
    fetchFirstPokemonOnServer().then(setServerState)
  }, [])

  // Клиент: получили снапшот → засеяли стор → отрисовали из него (без второго запроса к API).
  useEffect(() => {
    if (!serverState) return
    let alive = true
    const storage = seedStorageFromServer(serverState)
    storage.initialize().then(() => {
      if (alive) setList(storage.getStateSync().pokemonList)
    })
    return () => {
      alive = false
      storage.destroy()
    }
  }, [serverState])

  return (
    <div style={cardStyle}>
      <h2>SSR-гидрация (Pokemon)</h2>
      <p>
        Первые покемоны рендерятся на сервере, снапшот засевается на клиенте через
        <code> storage.hydrate()</code> до <code>initialize()</code> — на экране они появляются сразу,
        без отдельного клиентского запроса.
      </p>
      <h3 style={sectionTitle}>Seeded from server</h3>
      {!serverState ? (
        <p style={{ color: '#888' }}>Rendering on server…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
          {list.map((p) => (
            <div key={p.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, textAlign: 'center' }}>
              <img src={p.sprite} alt={p.name} style={{ width: 56, height: 56, imageRendering: 'pixelated' }} />
              <div style={{ fontSize: 12, textTransform: 'capitalize' }}>{p.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
