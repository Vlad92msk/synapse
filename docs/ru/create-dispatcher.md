> [🏠 Главная](./README.md)
> 
# Создание Диспетчера
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
  duration?: number // Длительность показа в миллисекундах
}

// Функция для создания диспетчера
export function createPokemonDispatcher(storage: PokemonStorage) {
  // Создаем middleware: логгер
  const loggerMiddleware = loggerDispatcherMiddleware({
    collapsed: true, // Сворачиваем группы в консоли для компактности
    colors: {
      title: '#3498db', // Кастомный синий цвет для заголовка
    },
    duration: true,
    diff: true,
    showFullState: true,
  })

  // Создаем middleware: alertM (просто для примера)
  const alertM = createPokemonAlertMiddleware()

  return createDispatcher({
    storage,
    middlewares: [loggerMiddleware, alertM],
  }, (storage, { createWatcher, createAction }) => ({
    // watcher`s
    watchCurrentId: createWatcher({...}),
    // сСобытия
    loadPokemon: createAction<number, { id: number }>({...}),
    loadPokemonRequest: createAction<number, { id: number }>({...}),
    // Успешное получение данных
    success: createAction<{ data?: Pokemon}, { data?: Pokemon }>({...}, {
      // Функция мемоизации (пока не тестировал)
      // memoize: (currentArgs: any[], previousArgs: any[], previousResult: any) => true,
      // Веб-воркер для выполнения действия (пока не тестировал)
      // worker: myWorker,
    }),
    failure: createAction<Error, { err: Error }>({...}),
    next: createAction<void, { id: number }>({...}),
    prev: createAction<void, { id: number }>({...}),
    showAlert: createAction<AlertPayload, void>({...}),
  }))
  // Альтернативный вариант добавления:
  // .use(logger)
  // .use(alertM)
}

// Экспортируем тип диспетчера
export type PokemonDispatcher = ReturnType<typeof createPokemonDispatcher>
```
___

## 📚 Навигация

- [🏠 Главная](./README.md)
- [📖 Все разделы документации](./README.md#-документация)

### Связанные разделы:
- [⚡ Создание Эффектов](./create-effects.md)
- [⚡ Создание Модуля эффектов](./create-effects-module.md)
- [🛠️ Утилита createSynapse](./create-synapse.md)
- [⚙️ Создание пользовательских middlewares](./custom-middlewares.md)
