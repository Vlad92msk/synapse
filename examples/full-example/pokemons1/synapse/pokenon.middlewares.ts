import { EnhancedMiddleware } from 'synapse-storage/reactive'
import { PokemonState } from '../types'


// Создадим пользовательскую middleware для теста
// Бдем слушать события определенных типов и вызывать другое
export const createPokemonAlertMiddleware = (): EnhancedMiddleware<PokemonState> => (api) => (next) => async (action) => {
  const result = await next(action)
  // Проверяем тип после выполнения
  if (action.type.includes('pokemon/next') || action.type.includes('pokemon/prev')) {
    const state = await api.getState()

    // Пробуем найти действие напрямую
    const alertAction = api.findActionByType('pokemon/showAlert')

    if (alertAction) {
      await alertAction({
        message: `Покемон переключен на ID: ${state.currentId}`,
        type: 'info',
      })
    } else {
      await api.dispatch({
        type: 'pokemon/showAlert',
        payload: {
          message: `Покемон переключен на ID: ${state.currentId}`,
          type: 'info',
        },
      })
    }
  }

  return result
}
