/**
 * Deep equality check for two values.
 */
export function isEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (a == null || b == null) return a === b

  const typeA = typeof a
  const typeB = typeof b
  if (typeA !== typeB) return false
  if (typeA !== 'object') return a === b

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime()
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false
    }
    return true
  }

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false

  return keysA.every((key) => Object.prototype.hasOwnProperty.call(b, key) && isEqual(a[key], b[key]))
}

/**
 * Finds all changed paths between two objects.
 */
export function findChangedPaths(oldObj: any, newObj: any, prefix = '', changedPaths: Set<string> = new Set<string>(), visited = new WeakMap<any, WeakSet<any>>()): Set<string> {
  if (oldObj === newObj) return changedPaths

  if (typeof oldObj !== 'object' || typeof newObj !== 'object' || oldObj === null || newObj === null) {
    if (oldObj !== newObj) {
      changedPaths.add(prefix || '')
    }
    return changedPaths
  }

  // Cycle/dedup guard keyed by the (oldObj, newObj) PAIR, not by oldObj alone.
  // structuredClone deduplicates shared references, so a single `oldObj` can be
  // reached via different paths leading to DIFFERENT `newObj`s. Keying on oldObj
  // alone would skip the second, genuinely-changed branch entirely.
  const seenNew = visited.get(oldObj)
  if (seenNew) {
    if (seenNew.has(newObj)) return changedPaths
    seenNew.add(newObj)
  } else {
    visited.set(oldObj, new WeakSet([newObj]))
  }

  const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})])

  for (const key of allKeys) {
    const oldValue = oldObj[key]
    const newValue = newObj[key]
    if (oldValue === newValue) continue

    const path = prefix ? `${prefix}.${key}` : key

    if (oldValue && newValue && typeof oldValue === 'object' && typeof newValue === 'object' && !Array.isArray(oldValue) && !Array.isArray(newValue)) {
      findChangedPaths(oldValue, newValue, path, changedPaths, visited)
    } else if (Array.isArray(oldValue) && Array.isArray(newValue)) {
      if (!isEqual(oldValue, newValue)) {
        changedPaths.add(path)
      }
    } else if (!isEqual(oldValue, newValue)) {
      changedPaths.add(path)
    }
  }

  return changedPaths
}

/**
 * Creates a lazy deep-clone of an object.
 * Shallow copy initially, structuredClone on first nested property access.
 */
export function createLazyClone<T extends Record<string, any>>(source: T): T {
  const cloned = new Set<string>()
  const shallow = { ...source }

  return new Proxy(shallow, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && !cloned.has(prop)) {
        const val = target[prop as keyof typeof target]
        if (val !== null && typeof val === 'object') {
          cloned.add(prop)
          ;(target as any)[prop] = structuredClone(val)
        }
      }
      return Reflect.get(target, prop, receiver)
    },
    set(target, prop, value) {
      if (typeof prop === 'string') {
        cloned.add(prop)
      }
      return Reflect.set(target, prop, value)
    },
  }) as T
}
