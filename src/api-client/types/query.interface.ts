import { ResponseFormat } from './api.interface'

/**
 * Тип для функции отписки от событий
 */
export type Unsubscribe = VoidFunction

/**
 * Опции для выполнения запроса
 */
export interface QueryOptions {
  /** Отключить кэширование для этого запроса */
  disableCache?: boolean
  /** Signal для отмены запроса */
  signal?: AbortSignal
  /** Таймаут в миллисекундах (переопределяет глобальный) */
  timeout?: number
  /** Дополнительные заголовки */
  headers?: Headers
  /** Пользовательский контекст */
  context?: Record<string, any>
  /** Ключи заголовков, влияющие на кэш (для конкретного запроса) */
  cacheableHeaderKeys?: string[]
  /** Формат ответа (переопределяет формат из RequestDefinition) */
  responseFormat?: ResponseFormat
  /** Название файла при скачивании (переопределяет fileName из RequestDefinition) */
  fileName?: string
  /** Тип файла при скачивании (переопределяет fileType из RequestDefinition) */
  fileType?: string
  /** Автоматически скачать файл после получения */
  downloadFile?: boolean
  /**
   * Функция для повторного выполнения запроса
   */
  retry?: <T = any, R = any>(params: T, options?: QueryOptions) => Promise<R>
}

/**
 * Метаданные для файла
 */
export interface FileMetadata {
  /** Имя файла */
  fileName: string
  /** Тип файла (MIME-тип) */
  fileType: string
  /** Размер файла в байтах */
  size?: number
  /** Дата создания файла */
  createdAt?: Date | string
  /** Дата изменения файла */
  updatedAt?: Date | string
}

/**
 * Результат скачивания файла
 */
export interface FileDownloadResult<T = Blob | ArrayBuffer> {
  /** Данные файла */
  data: T
  /** Метаданные файла */
  metadata: FileMetadata
  /** HTTP-статус */
  status: number
  /** Текст статуса */
  statusText: string
  /** Заголовки ответа */
  headers: Headers
  /** Успешна ли загрузка */
  ok: boolean
}

/**
 * Результат выполнения запроса
 */
export interface QueryResult<T = any, E = Error> {
  /** Данные ответа (при успешном запросе) */
  data?: T
  /** Ошибка (при неуспешном запросе) */
  error?: E
  /** Флаг успешности запроса */
  ok: boolean
  /** HTTP-статус */
  status: number
  /** Текстовое описание статуса */
  statusText: string
  /** Заголовки ответа */
  headers: Headers
  /** Результат скачивания файла (если responseFormat - Blob или ArrayBuffer) */
  fileDownloadResult?: FileDownloadResult
  fromCache?: boolean
}
