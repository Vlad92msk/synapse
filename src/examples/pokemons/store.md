```typescript
import { EffectsModule } from '@vlad92msk/synapse/reactive'

import { pokemonEndpoints } from './api.md'
import { appConfig } from './app.config'
import { createPokemonDispatcher } from './dispatchers/pokemon.dispatcher.md'
import { pokemonEffects } from './effects/pokemon.effects'
import { createPokemonSelectors } from './selectors/pokemon.selectors'
import { createPokemonStorage } from './storages/pokemon.storage'

// Асинхронная функция для инициализации хранилища
export async function initializeStore() {
  // 1. Создаем хранилище
  const storage = await createPokemonStorage()
  
  // 2. Получаем вычисляемые селекторы
  const selectors = createPokemonSelectors(storage)

  // 3. Создаем диспетчер
  const dispatcher = createPokemonDispatcher(storage)

  // 4. Создаем модуль эффектов
  const effectsModule = new EffectsModule(
    storage,                            // Передаем хранилище
    { pokemonDispatcher: dispatcher },  // Передаем диспетчеры
    { pokemonApi: pokemonEndpoints },   // Передаем API 
    appConfig                            // Передаем config
  )

  // 5. Добавляем объединенные эффекты
  effectsModule.add(pokemonEffects)

  // 6. Запускаем эффекты
  effectsModule.start()

  // 7. Возвращаем все, что нужно для работы с хранилищем
  return {
    storage,
    selectors,
    actions: dispatcher.dispatch,
    state$: effectsModule.state$,
  }
}

export const {
  storage: pokemonStorage,
  state$: pokemonState$,
  actions: pokemonActions,
  selectors: pokemonSelectors,
} = await initializeStore()
```
