/**
 * Общие утилиты вычисления/записи пути по accessor'у.
 *
 * Используются базовым классом `Dispatcher` (`this.apiActions`/`this.keyedApiActions`).
 */

/**
 * Вычисляет путь к свойству через Proxy-перехват обращений.
 *
 * @example resolvePath((s) => s.api.listRequest) // ['api', 'listRequest']
 */
export function resolvePath<T>(accessor: (draft: T) => any): string[] {
  const path: string[] = []
  const handler: ProxyHandler<any> = {
    get(_, prop) {
      if (typeof prop === 'string') {
        path.push(prop)
      }
      return new Proxy({}, handler)
    },
  }
  accessor(new Proxy({}, handler) as T)
  return path
}

/**
 * Записывает значение по пути в объекте (мутирует переданный draft).
 */
export function setByPath(obj: any, path: string[], value: any): void {
  let current = obj
  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]]
  }
  current[path[path.length - 1]] = value
}
