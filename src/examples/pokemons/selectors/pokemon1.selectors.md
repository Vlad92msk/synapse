```typescript
import { SelectorModule } from '@vlad92msk/synapse/core'
import { PokemonStorage } from '../storages/pokemon.storage'
import { pokemon1Selectors } from '../store2'

export const createPokemonSelectors1 = (storage: PokemonStorage) => {
  const selectors = new SelectorModule(storage)

  const front_default = selectors.createSelector(
    (state) => state.currentId
  )
  
  return ({
    front_default,
  })
}
```
