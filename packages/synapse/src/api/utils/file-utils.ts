import { ResponseFormat } from '../types/api.interface'
import { ResponseFileMetadata } from '../types/query.interface'

/** Текстовый тип (JSON / text/*): явный Content-Type важнее `filename` в inline-Disposition. */
function isTextualContentType(contentType: string): boolean {
  const type = contentType.toLowerCase().split(';')[0].trim()
  return type === 'application/json' || type.endsWith('+json') || type.startsWith('text/')
}

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

  // Проверяем по заголовку content-disposition: `attachment` — всегда файл; одно лишь имя файла
  // (`inline; filename=report.json`) — файл, только если Content-Type не текстовый (JSON/text)
  const disposition = contentDisposition.toLowerCase()
  const isAttachment = /(^|;)\s*attachment/.test(disposition) || (disposition.includes('filename') && !isTextualContentType(contentType))

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

  // 1. filename*=charset'lang'percent-encoded (RFC 5987/6266) — приоритетнее обычного filename
  const extMatch = contentDisposition.match(/filename\*\s*=\s*([^']*)'[^']*'([^;\n]*)/i)
  if (extMatch && extMatch[2]) {
    try {
      return decodeURIComponent(extMatch[2].trim().replace(/^"|"$/g, ''))
    } catch {
      // битая percent-последовательность — пробуем обычный filename
    }
  }

  // 2. filename="..." / filename=... (без `*`)
  const filenameMatch = contentDisposition.match(/(?:^|;)\s*filename\s*=\s*("([^"]*)"|[^;\n]*)/i)
  const value = filenameMatch?.[2] ?? filenameMatch?.[1]
  if (value) {
    // Очищаем от кавычек
    return value.replace(/['"]/g, '').trim()
  }

  return undefined
}

/**
 * Извлекает метаданные файла из заголовков
 * @param headers Заголовки ответа
 * @returns Метаданные файла
 */
export function getFileMetadataFromHeaders(headers: Headers): ResponseFileMetadata | undefined {
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
