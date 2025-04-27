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

export function setValueByPath(obj: any, path: string | StorageKey, value: any): any {
  if (path === '') return value

  const parts = parsePath(path)

  // Если путь - это StorageKey и он непарсируемый, используем его как есть
  if (path instanceof StorageKey && path.isUnparseable()) {
    obj[path.toString()] = value
    return obj
  }

  const lastKey = parts.pop()!
  const target = parts.reduce((curr, key) => {
    const nextKey = parts[parts.indexOf(key) + 1]
    const shouldBeArray = !Number.isNaN(Number(nextKey))

    if (!(key in curr)) {
      curr[key] = shouldBeArray ? [] : {}
    }
    return curr[key]
  }, obj)

  target[lastKey] = value
  return obj
}
