import { createDispatcher, loggerDispatcherMiddleware } from '@vlad92msk/synapse/reactive'

import { createPokemonAlertMiddleware } from '../middlewares/pokenon.middlewares'
import { PokemonStorage } from '../storages/pokemon.storage'
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

  return createDispatcher(
    {
      storage,
      middlewares: [loggerMiddleware, alertM],
    },
    (storage, { createWatcher, createAction }) => ({
      // Добавляем watcher для отслеживания текущего ID
      watchCurrentId: createWatcher({
        type: 'pokemon/currentIdChanged',
        selector: (state) => state.currentId,
        shouldTrigger: (prev, curr) => prev !== curr,
        meta: {
          description: 'Следит за изменениями ID текущего покемона',
        },
      }),

      // Watcher для отслеживания состояния загрузки
      watchLoadingState: createWatcher<boolean>({
        type: 'pokemon/loadingStateChanged',
        selector: (state) => state.loading,
      }),
      // Загрузка покемона по ID
      loadPokemon: createAction<number, { id: number }>({
        type: 'pokemon/loadPokemonIdl',
        action: async (id) => ({ id }),
      }),

      loadPokemonRequest: createAction<number, { id: number }>({
        type: 'pokemon/loadPokemonRequest',
        action: async (id) => {
          await storage.update((state) => {
            state.loading = true
            state.error = null
            state.currentId = id
          })

          return { id }
        },
      }),

      // Успешное получение данных
      success: createAction<{ data?: Pokemon }, { data?: Pokemon }>(
        {
          type: 'pokemon/success',
          action: async ({ data }) => {
            await storage.update((state) => {
              state.currentPokemon = data
              state.loading = false
              state.error = null
            })
            // Возвращаем данные покемона как payload
            return { data }
          },
        },
        {
          // Функция мемоизации (пока не тестировал)
          // memoize: (currentArgs: any[], previousArgs: any[], previousResult: any) => true,
          // Веб-воркер для выполнения действия (пока не тестировал)
          // worker: myWorker,
        },
      ),

      // Ошибка при получении данных
      failure: createAction<Error, { err: Error }>({
        type: 'pokemon/failure',
        action: async (err) => {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'
          await storage.update((state) => {
            state.loading = false
            state.error = errorMessage
          })

          // Возвращаем ошибку как payload
          return { err }
        },
      }),

      // Перейти к следующему покемону
      next: createAction<void, { id: number }>({
        type: 'pokemon/next',
        action: async () => {
          let newId = 1

          await storage.update((state) => {
            newId = state.currentId + 1
            if (newId > 151) newId = 1 // Ограничиваем первым поколением (1-151)
            state.currentId = newId
          })

          return { id: newId }
        },
      }),

      // Перейти к предыдущему покемону
      prev: createAction<void, { id: number }>({
        type: 'pokemon/prev',
        action: async () => {
          let newId = 1

          await storage.update((state) => {
            newId = state.currentId - 1
            if (newId < 1) newId = 151 // Ограничиваем первым поколением (1-151)
            state.currentId = newId
          })

          console.log(`Action: Previous pokemon (ID ${newId})`)
          return { id: newId }
        },
      }),

      showAlert: createAction<AlertPayload, void>({
        type: 'pokemon/showAlert',
        action: async (payload) => {
          // Используем глобальный alert для демонстрации
          alert(payload.message)

          // Здесь можно также обновить состояние для отображения alert в UI
          // например, добавить запись в массив alerts в state
        },
        meta: {
          description: 'Показывает оповещение пользователю',
        },
      }),
    }),
  )
  // Альтернативный вариант добавления:
  // .use(logger)
  // .use(alertM)
}

// Экспортируем тип диспетчера
export type PokemonDispatcher = ReturnType<typeof createPokemonDispatcher>
