const globalConsole = globalThis.console

// Экспортируем обертку, которая использует console через globalThis
export const loggerConsole = {
  log: (...args: any[]) => globalConsole.log(...args),
  warn: (...args: any[]) => globalConsole.warn(...args),
  error: (...args: any[]) => globalConsole.error(...args),
  group: (...args: any[]) => globalConsole.group(...args),
  groupEnd: () => globalConsole.groupEnd(),
  groupCollapsed: (...args: any[]) => globalConsole.groupCollapsed(...args),
}
