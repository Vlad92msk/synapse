> [🏠 Home](../../README.md)

# Creating Dispatcher
___

```typescript
import { createDispatcher, loggerDispatcherMiddleware } from 'synapse-storage/reactive'
import { PokemonStorage } from '../storages/pokemon.storage'
import { createPokemonAlertMiddleware } from '../middlewares/pokenon.middlewares'
import { Pokemon } from '../types'

// const myWorker = new Worker('path-to-my-worker')

export interface AlertPayload {
  message: string
  type: 'info' | 'warning' | 'error' | 'success'
  duration?: number // Display duration in milliseconds
}

// Function to create dispatcher
export function createPokemonDispatcher(storage: PokemonStorage) {
  // Create middleware: logger
  const loggerMiddleware = loggerDispatcherMiddleware({
    collapsed: true, // Collapse groups in console for compactness
    colors: {
      title: '#3498db', // Custom blue color for title
    },
    duration: true,
    diff: true,
    showFullState: true,
  })

  // Create middleware: alertM (just for example)
  const alertM = createPokemonAlertMiddleware()

  return createDispatcher({
    storage,
    middlewares: [loggerMiddleware, alertM],
  }, (storage, { createWatcher, createAction }) => ({
    // watchers
    watchCurrentId: createWatcher({...}),
    // Events
    loadPokemon: createAction<number, { id: number }>({...}),
    loadPokemonRequest: createAction<number, { id: number }>({...}),
    // Successful data retrieval
    success: createAction<{ data?: Pokemon}, { data?: Pokemon }>({...}, {
      // Memoization function (not tested yet)
      // memoize: (currentArgs: any[], previousArgs: any[], previousResult: any) => true,
      // Web worker for action execution (not tested yet)
      // worker: myWorker,
    }),
    failure: createAction<Error, { err: Error }>({...}),
    next: createAction<void, { id: number }>({...}),
    prev: createAction<void, { id: number }>({...}),
    showAlert: createAction<AlertPayload, void>({...}),
  }))
  // Alternative way to add:
  // .use(logger)
  // .use(alertM)
}

// Export dispatcher type
export type PokemonDispatcher = ReturnType<typeof createPokemonDispatcher>
```
___

## 📚 Navigation

- [🏠 Home](../../README.md)
- [📖 All documentation sections](../../README.md#-documentation)

### Related sections:
- [⚡ Creating Effects](./create-effects.md)
- [⚡ Creating Effects Module](./create-effects-module.md)
- [🛠️ createSynapse utility](./create-synapse.md)
- [⚙️ Creating custom middlewares](./custom-middlewares.md)
