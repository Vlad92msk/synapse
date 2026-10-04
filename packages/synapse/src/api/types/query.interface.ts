import { ResponseFormat, RetryConfig } from './api.interface'

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
  /**
   * @deprecated Не реализовано — игнорируется. Имя файла из ответа: `result.fileDownloadResult?.filename`;
   * скачивание в браузере — вручную (`URL.createObjectURL(result.data)` + `<a download>`).
   */
  fileName?: string
  /** @deprecated Не реализовано — игнорируется. */
  fileType?: string
  /** @deprecated Не реализовано — игнорируется (автоскачивания нет). */
  downloadFile?: boolean
  /** Конфигурация retry для этого запроса (переопределяет эндпоинт и глобальную) */
  retry?: RetryConfig
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
 * Метаданные файлового ответа (Blob/ArrayBuffer), извлечённые из заголовков
 * `Content-Type` / `Content-Disposition` / `Content-Length`.
 */
export interface ResponseFileMetadata {
  /** Имя файла из Content-Disposition (`filename*` RFC 5987 декодируется) */
  filename?: string
  contentType: string
  contentDisposition: string
  /** Размер в байтах из Content-Length */
  size?: number
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
  /** Метаданные файла (если ответ — файл: responseFormat Blob или ArrayBuffer) */
  fileDownloadResult?: ResponseFileMetadata
  fromCache?: boolean
}
