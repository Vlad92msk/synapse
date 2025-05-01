// import { IStoragePlugin, PluginContext, StorageKeyType } from 'synapse'
//
// /**
//  * Пример 1: LoggingPlugin
//  *
//  * Плагин для логирования операций хранилища.
//  * Записывает информацию о всех операциях в консоль или пользовательский логгер.
//  */
// export class LoggingPlugin implements IStoragePlugin {
//   name = 'logging'
//
//   constructor(
//     private options: {
//       logLevel?: 'info' | 'debug' | 'verbose',
//       customLogger?: (message: string, data?: any) => void
//     } = {},
//   ) {}
//
//   private log(message: string, data?: any): void {
//     const formattedMessage = `[LoggingPlugin] ${message}`
//
//     if (this.options.customLogger) {
//       this.options.customLogger(formattedMessage, data)
//     } else if (this.options.logLevel === 'verbose') {
//       console.log(formattedMessage, data)
//     } else if (this.options.logLevel === 'debug' || !this.options.logLevel) {
//       console.log(formattedMessage)
//     } else {
//       console.log(formattedMessage)
//     }
//   }
//
//   async initialize(): Promise<void> {
//     this.log('Плагин инициализирован')
//   }
//
//   async destroy(): Promise<void> {
//     this.log('Плагин уничтожен')
//   }
//
//   async onBeforeSet<T>(value: T, context: PluginContext): Promise<T> {
//     this.log(
//       `Сохранение значения в хранилище ${context.storageName}`,
//       this.options.logLevel === 'verbose' ? value : undefined,
//     )
//     return value
//   }
//
//   async onAfterSet<T>(key: StorageKeyType, value: T, context: PluginContext): Promise<T> {
//     this.log(
//       `Значение сохранено по ключу ${String(key)}`,
//       this.options.logLevel === 'verbose' ? value : undefined,
//     )
//     return value
//   }
//
//   async onBeforeGet(key: StorageKeyType, context: PluginContext): Promise<StorageKeyType> {
//     this.log(`Запрос значения по ключу ${String(key)}`)
//     return key
//   }
//
//   async onAfterGet<T>(key: StorageKeyType, value: T | undefined, context: PluginContext): Promise<T | undefined> {
//     if (value === undefined) {
//       this.log(`Значение не найдено по ключу ${String(key)}`)
//     } else {
//       this.log(
//         `Получено значение по ключу ${String(key)}`,
//         this.options.logLevel === 'verbose' ? value : undefined,
//       )
//     }
//     return value
//   }
//
//   async onBeforeDelete(key: StorageKeyType, context: PluginContext): Promise<boolean> {
//     this.log(`Запрос на удаление значения по ключу ${String(key)}`)
//     return true
//   }
//
//   async onAfterDelete(key: StorageKeyType, context: PluginContext): Promise<void> {
//     this.log(`Значение удалено по ключу ${String(key)}`)
//   }
//
//   async onClear(context: PluginContext): Promise<void> {
//     this.log(`Хранилище ${context.storageName} очищено`)
//   }
// }
//
// /**
//  * Пример 2: ValidationPlugin
//  *
//  * Плагин для валидации данных перед сохранением в хранилище.
//  * Позволяет устанавливать правила валидации для определенных ключей.
//  */
// export class ValidationPlugin implements IStoragePlugin {
//   name = 'validation'
//
//   private validators = new Map<string, (value: any) => { valid: boolean, message?: string }>()
//
//   constructor(
//     private options: {
//       throwOnInvalid?: boolean;
//       onValidationError?: (key: string, value: any, message: string) => void;
//     } = { throwOnInvalid: true },
//   ) {}
//
//   /**
//    * Добавляет правило валидации для определенного ключа
//    *
//    * @param key Ключ, для которого применяется валидация
//    * @param validator Функция валидации, возвращающая результат проверки
//    * @returns Экземпляр плагина для цепочки вызовов
//    */
//   addValidator(
//     key: string,
//     validator: (value: any) => { valid: boolean, message?: string },
//   ): this {
//     this.validators.set(key, validator)
//     return this
//   }
//
//   /**
//    * Помощник для создания валидатора по JSON-схеме
//    *
//    * @param schema Объект описывающий схему данных
//    * @returns Функция-валидатор
//    */
//   static schemaValidator(schema: any): (value: any) => { valid: boolean, message?: string } {
//     return (value: any) => {
//       // Здесь должна быть реализация проверки по JSON-схеме
//       // Для примера используем упрощенную логику
//       if (schema.type === 'object' && typeof value !== 'object') {
//         return { valid: false, message: 'Value must be an object' }
//       }
//
//       if (schema.type === 'array' && !Array.isArray(value)) {
//         return { valid: false, message: 'Value must be an array' }
//       }
//
//       if (schema.required && Array.isArray(schema.required)) {
//         for (const prop of schema.required) {
//           if (value[prop] === undefined) {
//             return { valid: false, message: `Required property "${prop}" is missing` }
//           }
//         }
//       }
//
//       return { valid: true }
//     }
//   }
//
//   async onBeforeSet<T>(value: T, context: PluginContext): Promise<T> {
//     // Получаем ключ из метаданных (должен быть добавлен хранилищем)
//     const key = context.metadata?.key
//
//     if (key && this.validators.has(key)) {
//       const validator = this.validators.get(key)!
//       const result = validator(value)
//
//       if (!result.valid) {
//         const errorMessage = result.message || `Validation failed for key "${key}"`
//
//         if (this.options.onValidationError) {
//           this.options.onValidationError(key, value, errorMessage)
//         }
//
//         if (this.options.throwOnInvalid) {
//           throw new Error(errorMessage)
//         }
//       }
//     }
//
//     return value
//   }
// }
