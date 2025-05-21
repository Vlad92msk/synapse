/**
 * Создает новый массив, применяя функцию к каждому элементу массива,
 * а затем сглаживает результат на один уровень.
 *
 * @param array - Исходный массив
 * @param iteratee - Функция, применяемая к каждому элементу
 * @returns Новый сглаженный массив
 */
export function flatMap<T, R>(array: T[], iteratee: (value: T, index: number, array: T[]) => R | R[]): R[] {
  if (!array || !array.length) return []

  return array.reduce((acc: R[], value: T, index: number) => {
    const mapped = iteratee(value, index, array)

    if (Array.isArray(mapped)) {
      acc.push(...mapped)
    } else {
      acc.push(mapped)
    }

    return acc
  }, [])
}
