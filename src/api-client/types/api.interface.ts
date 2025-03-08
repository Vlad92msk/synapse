import { StorageType } from '../../storage'
import { CreateEndpoint, EndpointConfig } from './endpoint.interface'

/**
 * Форматы ответа от сервера
 */
export enum ResponseFormat {
  /** JSON-объект (по умолчанию) */
  Json = 'json',
  /** Blob-объект для файлов */
  Blob = 'blob',
  /** ArrayBuffer для бинарных данных */
  ArrayBuffer = 'arrayBuffer',
  /** Текстовый формат */
  Text = 'text',
  /** FormData для форм */
  FormData = 'formData',
  /** Без преобразования - возвращает сырой ответ */
  Raw = 'raw',
}

/**
 * Настройки кэша
 * Может быть объектом с параметрами или boolean (true для кэширования с настройками по умолчанию, false для отключения)
 */
export type CacheConfig =
  | boolean
  | {
      /** Время жизни кэша в миллисекундах */
      ttl?: number
      /** Настройки периодической очистки */
      cleanup?: {
        /** Включить периодическую очистку */
        enabled: boolean
        /** Интервал очистки в миллисекундах */
        interval?: number
      }
      /** Инвалидировать кэш при ошибке */
      invalidateOnError?: boolean
    }

/**
 * Определение запроса
 * Содержит всю необходимую информацию для выполнения HTTP-запроса
 */
export interface RequestDefinition<RequestParams extends Record<string, any>> {
  /** Путь запроса (относительный или абсолютный URL) */
  path: string
  /** HTTP-метод */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  /** Тело запроса (автоматически сериализуется) */
  body?: any
  /** Параметры запроса (автоматически добавляются в URL) */
  query?: RequestParams
  /** HTTP-заголовки */
  headers?: Record<string, string>
  /** Формат ответа (по умолчанию json) */
  responseFormat?: ResponseFormat
  /** Имя файла для автоматического скачивания */
  fileName?: string
  /** Тип контента для автоматического скачивания */
  fileType?: string
}

/**
 * Контекст API для использования в prepareHeaders и других функциях
 * Содержит вспомогательные методы и информацию о запросе
 */
export interface ApiContext<RequestParams extends Record<string, any> = any> {
  /** Параметры запроса */
  requestParams?: RequestParams
  /** Получить значение из localStorage */
  getFromStorage?: <T>(key: string) => T | undefined
  /** Получить значение cookie */
  getCookie?: (name: string) => string | undefined
  /** Поддержка для дополнительных свойств */
  [key: string]: any
}

/**
 * Аргументы для создания fetch-запроса
 */
export interface FetchBaseQueryArgs {
  /** Базовый URL для всех запросов */
  baseUrl: string
  /** Функция для подготовки заголовков, может быть асинхронной */
  prepareHeaders?: (headers: Headers, context: ApiContext) => Promise<Headers>
  /** Таймаут запроса в миллисекундах */
  timeout?: number
  /** Пользовательская fetch-функция */
  fetchFn?: typeof fetch
  credentials?: RequestCredentials
}

export interface CreateApiClientOptions<T extends Record<string, EndpointConfig<any, any>> = Record<string, EndpointConfig<any, any>>> {
  /** Тип хранилища */
  storageType: StorageType
  /** Опции хранилища */
  storageOptions?: {
    /** Имя хранилища */
    name?: string
    /** Имя базы данных (для IndexedDB) */
    dbName?: string
    /** Имя хранилища (для IndexedDB) */
    storeName?: string
    /** Версия базы данных (для IndexedDB) */
    dbVersion?: number
  }
  /** Настройки кэша
   * если явно указан false - значит ни один запрос НЕ будет кэшироваться, даже если в эндпоинтах указаны параметры
   * */
  cache?: CacheConfig
  /** Базовый запрос или его настройки */
  baseQuery: FetchBaseQueryArgs
  /** Функция для создания эндпоинтов */
  endpoints?: (create: CreateEndpoint) => Promise<T>
  /** Глобальные заголовки, влияющие на кэш */
  cacheableHeaderKeys?: string[]
}

/**
 * Извлечение типа параметров из конфигурации эндпоинта
 */
export type ExtractParamsType<T> = T extends EndpointConfig<infer P, any> ? P : never

/**
 * Извлечение типа результата из конфигурации эндпоинта
 */
export type ExtractResultType<T> = T extends EndpointConfig<any, infer R> ? R : never
