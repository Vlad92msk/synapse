import { StorageKey } from '../utils/storage-key'

export function parsePath(path: string | StorageKey): string[] {
  // Если это StorageKey и он помечен как непарсируемый
  if (path instanceof StorageKey && path.isUnparseable()) {
    return [path.toString()]
  }

  const pathStr = path.toString()
  return pathStr.replace(/\[/g, '.').replace(/\]/g, '').split('.').filter(Boolean)
}

export function getValueByPath(obj: any, path: string | StorageKey) {
  const parts = parsePath(path)
  return parts.reduce((curr, key) => (curr === undefined ? undefined : curr[key]), obj)
}

const cloneNode = (node: any): any => (Array.isArray(node) ? [...node] : { ...node })

/**
 * Иммутабельная запись значения по пути.
 *
 * НЕ мутирует `obj`: клонирует корень и только узлы НА пути записи (structural
 * sharing — соседние ветки сохраняют ссылки). Возвращает новое состояние.
 *
 * Это важно для `MemoryStorage`, который держит состояние по ссылке: запись по
 * месту портила бы переданный `initialState` и ломала `reset()`.
 */
export function setValueByPath(obj: any, path: string | StorageKey, value: any): any {
  if (path === '') return value

  // Непарсируемый StorageKey — один ключ верхнего уровня.
  if (path instanceof StorageKey && path.isUnparseable()) {
    return { ...(obj ?? {}), [path.toString()]: value }
  }

  const parts = parsePath(path)
  if (parts.length === 0) return value

  const root = obj == null ? {} : cloneNode(obj)
  let curr = root

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    const nextKey = parts[i + 1]
    const shouldBeArray = nextKey !== undefined && !Number.isNaN(Number(nextKey))
    const child = curr[key]

    if (child == null || typeof child !== 'object') {
      // узла нет (или это примитив посреди пути) — создаём контейнер
      curr[key] = shouldBeArray ? [] : {}
    } else {
      // существующий узел — клонируем, чтобы не мутировать исходный
      curr[key] = cloneNode(child)
    }

    curr = curr[key]
  }

  curr[parts[parts.length - 1]] = value
  return root
}

/**
 * Иммутабельное удаление значения по пути. НЕ мутирует `obj`.
 * Возвращает `{ state, removed }`: `removed=false`, если пути не существовало
 * (состояние тогда возвращается прежним по ссылке).
 */
export function removeValueByPath(obj: any, path: string | StorageKey): { state: any; removed: boolean } {
  if (path instanceof StorageKey && path.isUnparseable()) {
    const rawKey = path.toString()
    if (obj == null || !(rawKey in obj)) return { state: obj, removed: false }
    const clone = { ...obj }
    delete clone[rawKey]
    return { state: clone, removed: true }
  }

  const parts = parsePath(path)
  if (parts.length === 0 || obj == null) return { state: obj, removed: false }

  const root = cloneNode(obj)
  let curr = root

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    const child = curr[key]
    if (child == null || typeof child !== 'object') {
      return { state: obj, removed: false } // пути не существует
    }
    curr[key] = cloneNode(child)
    curr = curr[key]
  }

  const lastKey = parts[parts.length - 1]
  if (!(lastKey in curr)) return { state: obj, removed: false }

  delete curr[lastKey]
  return { state: root, removed: true }
}
