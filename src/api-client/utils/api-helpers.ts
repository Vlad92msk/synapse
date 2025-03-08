/**
 * Логгер для API
 */
export const apiLogger = {
  debug: (message: string, ...args: any[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[API] ${message}`, ...args)
    }
  },

  log: (message: string, ...args: any[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[API] ${message}`, ...args)
    }
  },

  info: (message: string, ...args: any[]) => {
    console.info(`[API] ${message}`, ...args)
  },

  warn: (message: string, ...args: any[]) => {
    console.warn(`[API] ${message}`, ...args)
  },

  error: (message: string, ...args: any[]) => {
    console.error(`[API] ${message}`, ...args)
  },
}

/**
 * Создает уникальный идентификатор
 * @returns Строка с уникальным идентификатором
 */
export function createUniqueId(name?: string): string {
  return `${name ? `${name}|` : ''}${Math.random().toString(36).substring(2, 9) + Date.now().toString(36)}`
}

/**
 * Преобразует объект Headers в обычный объект
 * @param headers Объект Headers
 * @returns Обычный объект с заголовками
 */
export function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value
  })
  return result
}
