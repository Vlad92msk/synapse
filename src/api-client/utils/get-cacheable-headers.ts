/**
 * Создает объект с заголовками для кэширования на основе списка допустимых ключей
 * @param headers Заголовки запроса
 * @param cacheableHeaders Массив ключей заголовков, которые нужно включить в кэш
 * @returns Объект с отфильтрованными заголовками
 */
export function getCacheableHeaders(headers: Headers, cacheableHeaders: string[] = []): Record<string, string> {
  const result: Record<string, string> = {}

  if (!headers || cacheableHeaders.length === 0) {
    return result
  }

  // Проходим по всем ключам в cacheableHeaders
  cacheableHeaders.forEach((key) => {
    // Если заголовок существует, добавляем его в результат
    if (headers.has(key)) {
      result[key] = headers.get(key) || ''
    }
  })

  return result
}
