import { createSynapseCtx } from 'synapse-storage/react'
import { pokemon1Synapse } from './pokemon.synapse'

export const pokemonSynapseCtx = createSynapseCtx(
  // Передаем сам Synapse
  pokemon1Synapse,
  {
    loadingComponent: <div>loading</div>, // Передаем компонент, который будет отображаться пока идет загрузка инициализация
    // mergeFn: // Функция слияния переданных параметров в initialState (по умолчанию выполняется глубокая копия)
  },
)
