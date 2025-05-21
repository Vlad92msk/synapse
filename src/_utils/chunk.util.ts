/**
 * Разбивает массив на группы элементов указанного размера.
 * @param array - Массив для разбиения
 * @param size - Размер каждой группы
 * @returns Массив групп элементов
 */
export function chunk<T>(array: T[], size: number = 1): T[][] {
  if (size <= 0) throw new Error('Size must be greater than 0')

  if (!array || !array.length) return []

  const result: T[][] = []
  const length = array.length
  let index = 0

  while (index < length) {
    result.push(array.slice(index, index + size))
    index += size
  }

  return result
}
