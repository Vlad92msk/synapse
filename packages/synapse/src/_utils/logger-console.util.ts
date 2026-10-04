// Обертка над console через globalThis. Обращение к globalThis.console — ленивое (в момент вызова),
// чтобы у модуля не было top-level кода, который бандлер не может доказать чистым (tree-shaking).
export const loggerConsole = {
  log: (...args: any[]) => globalThis.console.log(...args),
  warn: (...args: any[]) => globalThis.console.warn(...args),
  error: (...args: any[]) => globalThis.console.error(...args),
  group: (...args: any[]) => globalThis.console.group(...args),
  groupEnd: () => globalThis.console.groupEnd(),
  groupCollapsed: (...args: any[]) => globalThis.console.groupCollapsed(...args),
}
