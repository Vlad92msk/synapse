import { ApiContext } from '../types/api.interface'

/**
 * Создает контекст для подготовки заголовков
 *
 * @param context - базовый контекст
 * @param optionContext - дополнительный контекст из опций
 * @returns - полный контекст для подготовки заголовков
 */
export function createHeaderContext<RequestParams extends Record<string, any>>(
  context: ApiContext = {} as ApiContext<RequestParams>,
  optionContext: Record<string, any> = {},
): ApiContext<RequestParams> {
  return {
    ...context,
    ...optionContext,
    getFromStorage:
      context.getFromStorage ||
      ((key: string) => {
        try {
          const item = localStorage.getItem(key)
          return item ? JSON.parse(item) : undefined
        } catch (error) {
          console.warn(`[API] Ошибка чтения из localStorage: ${error}`)
          return undefined
        }
      }),
    getCookie:
      context.getCookie ||
      ((name: string) => {
        try {
          const matches = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1')}=([^;]*)`))
          return matches ? decodeURIComponent(matches[1]) : undefined
        } catch (error) {
          console.warn(`[API] Ошибка чтения cookie: ${error}`)
          return undefined
        }
      }),
  }
}
