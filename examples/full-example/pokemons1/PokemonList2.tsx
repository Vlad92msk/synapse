import { CSSProperties, useEffect, useState } from 'react'
import { pokemon2Actions, pokemon2Storage } from './synapse/pokemon.synapse'
import { PokemonState } from './types'

// Стили
const root: CSSProperties = { background: '#ebe7e71c', padding: '30px', height: '250px', width: '550px' }
const btn: CSSProperties = { background: '#c7c6c6', color: 'black', padding: '5px', borderRadius: '5px' }
const flexColumn: CSSProperties = { display: 'flex', flexDirection: 'column' }
const img: CSSProperties = { position: 'absolute', objectFit: 'contain' }
const contentContainer: CSSProperties = { ...flexColumn, position: 'relative', width: '100%', height: '100%', marginTop: '10px' }
const actionContainer: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }

export function SimplePokemonViewer2() {
  const [state, setState] = useState<PokemonState>({
    currentPokemon: null,
    loading: true,
    error: null,
    currentId: 1,
  })

  // Инициируем загрузку первого покемона через действия
  useEffect(() => {
    pokemon2Actions.loadPokemon(1)
  }, [])

  const handleNext = async () => {
    await pokemon2Actions.next()
  }

  const handlePrev = async () => {
    await pokemon2Actions.prev()
  }

  useEffect(() => {
    const unsubscribe = pokemon2Storage.subscribeToAll((event) => {
      if (event.key === 'currentId') {
        setState((prev) => ({
          ...prev,
          currentId: event.value,
        }))
      }

      if (Array.isArray(event.key)) {
        setState((prev) => ({
          ...prev,
          ...event.value,
        }))
      }
    })

    return () => unsubscribe()
  }, [])

  return (
    <div style={{ ...flexColumn, ...root }}>
      {state.error && <p>{`Error: ${state.error}`}</p>}

      {state.loading ? (
        <p>Loading Pokémon...</p>
      ) : state.currentPokemon ? (
        <div style={contentContainer}>
          <h2>{`Name: ${state.currentPokemon.name}`}</h2>

          <div style={{ ...flexColumn, marginTop: '10px' }}>
            <p>{`Height: ${state.currentPokemon.height / 10}`}</p>
            <p>{`Weight: ${state.currentPokemon.weight / 10}`}</p>
          </div>
          <img
            style={img}
            src={state.currentPokemon.sprites.other?.['official-artwork']?.front_default || state.currentPokemon.sprites.front_default}
            alt={state.currentPokemon.name}
          />
        </div>
      ) : null}

      <div style={actionContainer}>
        <button style={btn} onClick={handlePrev}>{'<--'}</button>
        <strong>{`#${state.currentId}`}</strong>
        <button style={btn} onClick={handleNext}>{'-->'}</button>
      </div>
    </div>
  )
}
