// Определяем типы для переводов и опций
import { loggerConsole } from '../../../_utils'
import type { EnhancedMiddleware } from '../dispatcher.module'

interface LoggerTranslations {
  action: string
  prevState: string
  nextState: string
  duration: string
  error: string
  diff: string
  changesCount: string
  showFullState: string
}

interface LoggerColors {
  title: string
  prevState: string
  fullState: string
  action: string
  nextState: string
  error: string
  diff: string
}

interface LoggerOptions {
  collapsed?: boolean
  duration?: boolean
  diff?: boolean
  showFullState?: boolean
  translations?: Partial<LoggerTranslations>
  colors?: Partial<LoggerColors>
}

// Функция для вычисления разницы между двумя объектами состояния
function getStateDiff(prevState: any, nextState: any): { [key: string]: any } {
  const diff: { [key: string]: any } = {}

  // Проверяем изменения в свойствах верхнего уровня
  const allKeys = [...new Set([...Object.keys(prevState), ...Object.keys(nextState)])]

  allKeys.forEach((key) => {
    // Если ключ существует в обоих состояниях
    if (key in prevState && key in nextState) {
      // Если это объекты, рекурсивно проверяем их
      if (
        typeof prevState[key] === 'object' &&
        prevState[key] !== null &&
        typeof nextState[key] === 'object' &&
        nextState[key] !== null &&
        !Array.isArray(prevState[key]) &&
        !Array.isArray(nextState[key])
      ) {
        const nestedDiff = getStateDiff(prevState[key], nextState[key])
        if (Object.keys(nestedDiff).length > 0) {
          diff[key] = nestedDiff
        }
      }
      // Для массивов и примитивов просто сравниваем значения
      else if (JSON.stringify(prevState[key]) !== JSON.stringify(nextState[key])) {
        diff[key] = { PREV: prevState[key], NEXT: nextState[key] }
      }
    }
    // Если ключ существует только в предыдущем состоянии
    else if (key in prevState) {
      diff[key] = { PREV: prevState[key], NEXT: undefined }
    }
    // Если ключ существует только в новом состоянии
    else {
      diff[key] = { PREV: undefined, NEXT: nextState[key] }
    }
  })

  return diff
}

export const loggerDispatcherMiddleware = <State extends Record<string, any>>(options: LoggerOptions = {}): EnhancedMiddleware<State> => {
  const defaultTranslations = {
    action: 'Действие',
    prevState: 'Предыдущее состояние',
    nextState: 'Следующее состояние',
    duration: 'Длительность',
    error: 'Ошибка в действии',
    diff: 'Изменения',
    changesCount: 'Количество изменений',
    showFullState: 'Полное состояние',
  }

  const defaultOptions = {
    collapsed: false,
    duration: true,
    diff: false,
    showFullState: true, // Показывать полное состояние по умолчанию
    translations: defaultTranslations,
    colors: {
      title: '#3498db',
      prevState: '#9E9E9E',
      fullState: '#008a15',
      action: '#03A9F4',
      nextState: '#4CAF50',
      error: '#F20404',
      diff: '#9C27B0',
    },
  }

  // Объединяем пользовательские настройки с настройками по умолчанию
  const mergedOptions = {
    ...defaultOptions,
    ...options,
    // Объединяем переводы отдельно, чтобы позволить частичное переопределение
    translations: {
      ...defaultTranslations,
      ...(options.translations || {}),
    },
    // Объединяем цвета отдельно, чтобы позволить частичное переопределение
    colors: {
      ...defaultOptions.colors,
      ...(options.colors || {}),
    },
  }

  const { collapsed, duration, colors, translations } = mergedOptions

  return (api) => (next) => async (action) => {
    // Собираем информацию перед выполнением
    const started = Date.now()
    const prevState = await api.getState()

    // Выполняем действие без группировки логов
    try {
      // Выполняем действие
      const result = await next(action)

      // Собираем информацию после выполнения
      const nextState = await api.getState()
      const ended = Date.now()
      const time = ended - started

      // Теперь выводим всю информацию в группе
      const title = `${action.type}`
      const groupMethod = collapsed ? loggerConsole.groupCollapsed : loggerConsole.group

      groupMethod(`%c ${title}`, `color: ${colors.title}; font-weight: bold`)

      // Выводим информацию о действии
      loggerConsole.log(`%c ${translations.action}:`, `color: ${colors.action}; font-weight: bold`, action)

      // Если включена опция diff, вычисляем и показываем изменения
      if (mergedOptions.diff) {
        const stateDiff = getStateDiff(prevState, nextState)
        const changesCount = Object.keys(stateDiff).length

        loggerConsole.log(`%c ${translations.diff} (${translations.changesCount}: ${changesCount}):`, `color: ${colors.diff}; font-weight: bold`, stateDiff)
      }

      // Если showFullState включен, показываем полные состояния
      if (mergedOptions.showFullState) {
        // Создаем подгруппу для полного состояния
        loggerConsole.groupCollapsed(`%c ${translations.showFullState}`, `color: ${colors.fullState}; font-weight: bold`)
        loggerConsole.log(`%c ${translations.prevState}:`, `color: ${colors.prevState}; font-weight: bold`, prevState)
        loggerConsole.log(`%c ${translations.nextState}:`, `color: ${colors.nextState}; font-weight: bold`, nextState)
        loggerConsole.groupEnd()
      }

      if (duration) {
        loggerConsole.log(`%c ${translations.duration}: %c ${time}ms`, 'font-weight: bold', 'color: #4CAF50')
      }

      loggerConsole.groupEnd()

      return result
    } catch (error) {
      // В случае ошибки логируем её отдельно, не в группе
      loggerConsole.error(`%c ${translations.error}:`, `color: ${colors.error}; font-weight: bold`, action.type, error)

      // Пробрасываем ошибку дальше
      throw error
    }
  }
}
