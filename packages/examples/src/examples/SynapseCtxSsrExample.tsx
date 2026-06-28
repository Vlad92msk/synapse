import { useEffect, useState } from 'react'
import { createSynapseCtx, useSelector } from 'synapse-storage/react'
import { cardStyle, sectionTitle } from './styles'
import { pokemonSynapse } from './pokemon-advanced/pokemon.synapse'
import type { PokemonBrief, PokemonState } from './pokemon-advanced/pokemon.types'

/**
 * createSynapseCtx в SSR-режиме на домене pokemon. При `ssr: true` и снапшоте, переданном
 * пропом `dehydratedState`, Provider сеет sync-стор синхронно и рендерит детей сразу — без
 * `loadingComponent`, без мигания, без клиентского фетча. Это пара к ssr-hydration: там
 * гидрируется «голый» storage, здесь — целый модуль через контекст.
 */
const PokemonCtx = createSynapseCtx(pokemonSynapse, {
  ssr: true,
  loadingComponent: <div style={{ padding: 16, color: '#888' }}>Initializing…</div>,
})

// Данные, как будто посчитанные на сервере под конкретный запрос.
const SERVER_LIST: PokemonBrief[] = [
  { id: 1, name: 'bulbasaur', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png' },
  { id: 4, name: 'charmander', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png' },
  { id: 7, name: 'squirtle', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7.png' },
]

function PokemonView() {
  const selectors = PokemonCtx.useSynapseSelectors()
  const list = useSelector(selectors.pokemonList)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
      {list?.map((p) => (
        <div key={p.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, textAlign: 'center' }}>
          <img src={p.sprite} alt={p.name} style={{ width: 56, height: 56, imageRendering: 'pixelated' }} />
          <div style={{ fontSize: 12, textTransform: 'capitalize' }}>{p.name}</div>
        </div>
      ))}
    </div>
  )
}

const PokemonViewWithCtx = PokemonCtx.contextSynapse(PokemonView)

export function SynapseCtxSsrExample() {
  const [snapshot, setSnapshot] = useState<PokemonState | null>(null)

  // СЕРВЕР: собрать снапшот стора под запрос (в Next.js — в page.tsx; уходит пропом в client-компонент).
  useEffect(() => {
    PokemonCtx.dehydrate({ initialState: { pokemonList: SERVER_LIST } }).then(setSnapshot)
  }, [])

  return (
    <div style={cardStyle}>
      <h2>createSynapseCtx — SSR (Pokemon)</h2>
      <p>
        Снапшот стора готовится «на сервере» (<code>dehydrate</code>) и уходит пропом
        <code> dehydratedState</code>. При <code>ssr: true</code> Provider сеет стор синхронно — список
        виден на первом же рендере.
      </p>
      <h3 style={sectionTitle}>Seeded via context</h3>
      {snapshot ? <PokemonViewWithCtx dehydratedState={snapshot} /> : <p style={{ color: '#888' }}>Rendering on server…</p>}
    </div>
  )
}
