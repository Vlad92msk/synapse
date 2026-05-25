import { ResponseFormat } from '../types/api.interface'

/**
 * Получает формат ответа на основе MIME-типа
 * @param contentType MIME-тип контента
 * @returns Формат ответа
 */
export function getResponseFormatForMimeType(contentType: string): ResponseFormat | undefined {
  const type = contentType.toLowerCase().split(';')[0].trim()

  if (type.includes('application/json')) {
    return ResponseFormat.Json
  }

  if (type.includes('text/')) {
    return ResponseFormat.Text
  }

  if (type.includes('multipart/form-data')) {
    return ResponseFormat.FormData
  }

  if (type.includes('application/octet-stream') || type.includes('application/pdf') || type.includes('image/') || type.includes('audio/') || type.includes('video/')) {
    return ResponseFormat.Blob
  }

  return undefined
}

/**
 * Проверяет, является ли ответ файлом на основе заголовков
 * @param headers Заголовки ответа
 * @returns true если ответ является файлом
 */
export function isFileResponse(headers: Headers): boolean {
  const contentType = headers.get('content-type') || ''
  const contentDisposition = headers.get('content-disposition') || ''

  // Проверяем по типу контента
  const isFileContentType =
    contentType.includes('application/octet-stream') ||
    contentType.includes('application/pdf') ||
    contentType.includes('image/') ||
    contentType.includes('audio/') ||
    contentType.includes('video/')

  // Проверяем по заголовку content-disposition
  const isAttachment = contentDisposition.includes('attachment') || contentDisposition.includes('filename=')

  return isFileContentType || isAttachment
}

/**
 * Извлекает имя файла из заголовков
 * @param headers Заголовки ответа
 * @returns Имя файла
 */
export function extractFilenameFromHeaders(headers: Headers): string | undefined {
  const contentDisposition = headers.get('content-disposition')

  if (!contentDisposition) return undefined

  // Пытаемся извлечь имя файла из content-disposition
  const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
  if (filenameMatch && filenameMatch[1]) {
    // Очищаем от кавычек
    return filenameMatch[1].replace(/['"]/g, '').trim()
  }

  return undefined
}

/**
 * Извлекает метаданные файла из заголовков
 * @param headers Заголовки ответа
 * @returns Метаданные файла
 */
export function getFileMetadataFromHeaders(headers: Headers): Record<string, any> | undefined {
  const contentType = headers.get('content-type') || ''
  const contentDisposition = headers.get('content-disposition') || ''
  const contentLength = headers.get('content-length')

  if (!isFileResponse(headers)) {
    return undefined
  }

  const filename = extractFilenameFromHeaders(headers)

  return {
    filename,
    contentType,
    contentDisposition,
    size: contentLength ? parseInt(contentLength, 10) : undefined,
  }
}

/**
 * Создает blob URL для файла
 * @param blob Объект Blob или File
 * @returns URL для доступа к файлу
 */
export function createBlobUrl(blob: Blob): string {
  return URL.createObjectURL(blob)
}

/**
 * Освобождает blob URL
 * @param url URL для освобождения
 */
export function revokeBlobUrl(url: string): void {
  URL.revokeObjectURL(url)
}

/**
 * Скачивает файл в браузере
 * @param blob Объект Blob или File
 * @param filename Имя файла
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = createBlobUrl(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => revokeBlobUrl(url), 100)
}
