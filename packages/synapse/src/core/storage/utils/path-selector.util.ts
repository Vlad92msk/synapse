/**
 * Creates a dummy Proxy state object for path extraction.
 */
export function createDummyState<T>(): T {
  const handler: ProxyHandler<any> = {
    get: (target: any, prop: string) => {
      target[prop] = target[prop] || new Proxy({}, handler)
      return target[prop]
    },
  }
  return new Proxy({} as T, handler)
}

/**
 * Extracts the property path from a selector function using Proxy.
 *
 * **Limitations:**
 * - Does not support conditional logic (if/ternary): Proxy records ALL accessed paths
 *   and returns the longest, which leads to subscription on the wrong path.
 * - Does not support destructuring or array methods (map, filter, etc.)
 * - For such cases use string-based subscription: `storage.subscribe('user.permissions', callback)`
 */
export function extractPath<T>(
  selector: (state: T) => any,
  dummyState: T,
  cache?: WeakMap<Function, string>,
): string {
  if (cache?.has(selector)) {
    return cache.get(selector)!
  }

  const accessedPaths: string[] = []

  const createProxyHandler = (path = ''): ProxyHandler<any> => ({
    get: (_target: any, prop: string) => {
      if (typeof prop === 'symbol') {
        return Reflect.get(_target, prop)
      }

      const currentPath = path ? `${path}.${prop}` : prop
      accessedPaths.push(currentPath)

      return new Proxy({}, createProxyHandler(currentPath))
    },
    has: () => true,
    ownKeys: () => [],
    getOwnPropertyDescriptor: () => ({
      configurable: true,
      enumerable: true,
    }),
    apply: () => {
      return new Proxy(() => {}, createProxyHandler(path))
    },
  })

  try {
    selector(new Proxy(dummyState, createProxyHandler()))
  } catch {
    // Ignore errors from accessing non-existent properties
  }

  if (accessedPaths.length === 0) return ''

  accessedPaths.sort((a, b) => b.length - a.length)

  const result = accessedPaths[0]
  cache?.set(selector, result)
  return result
}
