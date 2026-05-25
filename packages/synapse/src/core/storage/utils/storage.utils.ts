export interface StorageUtils {
  // Утилиты для работы с путями
  pathUtils: {
    join(...parts: string[]): string
    getParent(path: string): string
    isSubPath(parent: string, child: string): boolean
    getSegments(path: string): string[]
  }

  // Утилиты для работы с данными
  dataUtils: {
    flatten(obj: any, prefix?: string): Record<string, any>
    unflatten(flat: Record<string, any>): any
    clone<T>(data: T): T
    merge(target: any, source: any): any
  }
}

export const pathUtils: StorageUtils['pathUtils'] = {
  join: (...parts: string[]): string => parts.filter(Boolean).join('.'),
  getParent: (path: string): string => {
    const segments = path.split('.')
    return segments.slice(0, -1).join('.')
  },
  isSubPath: (parent: string, child: string): boolean => child.startsWith(`${parent}.`),
  getSegments: (path: string): string[] => path.split('.'),
}

export const dataUtils: StorageUtils['dataUtils'] = {
  flatten: (obj: any, prefix = ''): Record<string, any> =>
    Object.keys(obj).reduce(
      (acc, key) => {
        const prefixKey = prefix ? `${prefix}.${key}` : key

        if (typeof obj[key] === 'object' && obj[key] !== null) {
          if (Array.isArray(obj[key])) {
            acc[prefixKey] = obj[key]
          } else {
            Object.assign(acc, dataUtils.flatten(obj[key], prefixKey))
          }
        } else {
          acc[prefixKey] = obj[key]
        }

        return acc
      },
      {} as Record<string, any>,
    ),
  unflatten: (flat: Record<string, any>): any => {
    const result = {}

    for (const key in flat) {
      const segments = pathUtils.getSegments(key)
      let current: Record<string, any> = result

      for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i]
        current[segment] = current[segment] || {}
        current = current[segment]
      }

      current[segments[segments.length - 1]] = flat[key]
    }

    return result
  },
  clone: <T>(data: T): T => JSON.parse(JSON.stringify(data)),
  merge: (target: any, source: any): any => {
    const merged = dataUtils.clone(target)

    for (const key in source) {
      if (typeof source[key] === 'object' && source[key] !== null) {
        if (typeof merged[key] !== 'object') {
          merged[key] = {}
        }
        merged[key] = dataUtils.merge(merged[key], source[key])
      } else {
        merged[key] = source[key]
      }
    }

    return merged
  },
}
