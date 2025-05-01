```typescript
import { SelectorModule } from '@vlad92msk/synapse/core'
import { PokemonStorage } from '../storages/pokemon.storage'
import { pokemon1Selectors } from '../store2'

export const createPokemonSelectors = (storage: PokemonStorage) => {
  const selectors = new SelectorModule(storage)

  const sprites = selectors.createSelector(
    (state) => state.currentPokemon?.sprites,
  )

  // Аналогично подходу Redux
  const val1 = selectors.createSelector(
    [
      sprites,
      pokemon1Selectors.front_default
    ],
      (sprites, front_default) => [sprites, front_default],
  )

  return ({
    sprites,
    val1,
  })
}
```
