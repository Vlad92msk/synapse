import { CSSProperties, useEffect, useState } from 'react'
import { distinctUntilChanged, filter, map } from 'rxjs/operators'
import { useSelector, useStorageSubscribe } from 'synapse-storage/react'
import { pokemonSynapseCtx } from './synapse/pokemon.context'
import { pokemon1Actions, pokemon1Selectors, pokemon1State$, pokemon1Storage } from './synapse/pokemon.synapse'
import { PokemonState } from './types'

// Стили
const root: CSSProperties = { background: '#ebe7e71c', padding: '30px', height: '250px', width: '550px' }
const btn: CSSProperties = { background: '#c7c6c6', color: 'black', padding: '5px', borderRadius: '5px' }
const flexColumn: CSSProperties = { display: 'flex', flexDirection: 'column' }
const img: CSSProperties = { position: 'absolute', objectFit: 'contain' }
const contentContainer: CSSProperties = { ...flexColumn, position: 'relative', width: '100%', height: '100%', marginTop: '10px' }
const actionContainer: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }

interface SelfProps {
  test: string
}

export const SimplePokemonViewer = pokemonSynapseCtx.contextSynapse<SelfProps, Partial<PokemonState>>(() => {
  const [state, setState] = useState<PokemonState>({
    currentPokemon: null,
    loading: true,
    error: null,
    currentId: 1,
  })

  // Инициируем загрузку первого покемона через действия
  useEffect(() => {
    pokemon1Actions.loadPokemon(1)
  }, [])

  const handleNext = () => {
    pokemon1Actions.next().then((finalPayload) => {
      // finalPayload - то, что возвращает функция action в dispatcher-е
      // Именно это окажется в эффекте в качестве payload
      console.log('finalPayload:', finalPayload)
    })
  }

  const handlePrev = () => {
    pokemon1Actions.prev()
  }

  // ============ Основные инструменты для работы с контекстом ===============
  const actions = pokemonSynapseCtx.useSynapseActions()
  const selectors = pokemonSynapseCtx.useSynapseSelectors()

  // ============ Основные инструменты для работы с контекстом =============== КОНЕЦ

  // ============ Варианты подписок ===============

  // ВАРИАНТ #1 (Прямая подписка на хранилище)
  // subscribeToAll - вызывается при срабатывании любого события связанного с обновлением данных
  useEffect(() => {
    const unsubscribe = pokemon1Storage.subscribeToAll((event) => {
      console.log('event.type', event.type) // Тип события
      console.log('event.key', event.key) // Массив ключей, которые меняются (Корневые ключи хранилища)
      console.log('event.changedPaths', event.changedPaths) // Массив путей, которые менялись (Например: ['key1.key2.key3', enyKey1.enyKey2])
      console.log('event.value', event.value) // Текущее состояние

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

  // ВАРИАНТ #1.1 (Прямая подписка на хранилище)
  // Прямая подписка на значение в хранилище с помощью хука
  const selectorValue2 = useStorageSubscribe(pokemon1Storage, (s) => s.currentId)
  console.log('selectorValue2', selectorValue2)

  // ВАРИАНТ #1.2 (Прямая подписка на хранилище)
  // Второй колбэк вызывается только если изненилось значение полученное по ключу
  // Первый паратметр - либо селектор, либо строка
  // Этот подход можно использовать если нужна дополнительная логика обновления состояниея в компоненте
  // Или вне React
  useEffect(() => {
    const unsubscribe = pokemon1Storage.subscribe((s) => s.currentId, (value) => {
      // Сработает только если изменится currentId
      console.log('currentId', value)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // ВАРИАНТ #2 (Использование селекторов в стиле Redux)
  // С помощью хука useSelector
  const selectorValue1 = useSelector(pokemon1Selectors.sprites)
  console.log('selectorValue1', selectorValue1)

  // ВАРИАНТ #2.1
  // Нативным способом (единоразовое получение)
  useEffect(() => {
    pokemon1Selectors.sprites.select().then((val) => {
      console.log('pokemonSelectors select', val)
    })
  }, [])

  // ВАРИАНТ #2.2
  // Нативным способом (подписка на вычисляемое значение)
  useEffect(() => {
    pokemon1Selectors.sprites.subscribe({
      notify: (s) => {
        console.log('pokemonSelectors subscribe', s)
      },
    })
  }, [])

  // ВАРИАНТ #3 (Реактивный подход)
  // работает только совместно с использованием Dispatcher-а
  useEffect(() => {
    const subscription = pokemon1State$.pipe(
      map((state) => state.currentId),
      distinctUntilChanged(),
      filter((pokemonId) => pokemonId > 3),
    ).subscribe((state) => {
      console.log('Текущее состояние REACTIVE:', state)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // ============ Варианты подписок =============== КОНЕЦ

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
})
