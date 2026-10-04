import { StorageKey, StorageKeyType } from '../../core/storage/utils/storage-key'

export interface CacheMetadata {
  createdAt: number
  updatedAt: number
  /**
   * Абсолютное время протухания. `Infinity` — без срока; после JSON-сериализации
   * (localStorage, dehydrate → HTML) `Infinity` превращается в `null` — трактуется так же.
   */
  expiresAt: number | null
  tags?: string[]
}

export interface CacheOptions {
  ttl?: number
  cleanup?: {
    enabled: boolean
    interval?: number
  }
  invalidateOnError?: boolean
}

export interface CacheEntry<Data, Params extends Record<string, any> = any> {
  data: Data
  metadata: CacheMetadata
  params: Params
}

/**
 * Стабильная сериализация значения для ключа кэша: ключи объектов сортируются рекурсивно,
 * строки экранируются через JSON — поэтому вложенные объекты и значения с `&`/`=` не дают коллизий.
 * Семантика как у JSON: `undefined`/функции в объектах пропускаются, `toJSON` (Date) учитывается.
 */
function stableSerialize(value: unknown): string {
  const v = value !== null && typeof value === 'object' && typeof (value as { toJSON?: unknown }).toJSON === 'function' ? (value as { toJSON: () => unknown }).toJSON() : value
  if (v === undefined || typeof v === 'function') return 'null'
  if (typeof v === 'bigint') return JSON.stringify(String(v))
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(stableSerialize).join(',')}]`

  const obj = v as Record<string, unknown>
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined && typeof obj[k] !== 'function')
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerialize(obj[k])}`).join(',')}}`
}

/**
 * Некриптографический 53-битный хеш строки (cyrb53). Нужен, чтобы значения заголовков
 * (в т.ч. `Authorization`) различали записи кэша, но не хранились открытым текстом
 * в ключе (localStorage/IndexedDB/снапшот dehydrate).
 */
function hashString(str: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export class CacheUtils {
  static createMetadata(ttl: number = 0, tags: string[] = []): CacheMetadata {
    const now = Date.now()
    const expiresAt = ttl > 0 ? now + ttl : Infinity

    return {
      createdAt: now,
      updatedAt: now,
      expiresAt,
      tags,
    }
  }

  /** ISO timestamps are derived lazily (for logging/debugging) instead of being stored in the cache payload. */
  static formatDateTime(timestamp: number): string {
    return timestamp === Infinity ? 'never' : new Date(timestamp).toISOString()
  }

  static isExpired(metadata: CacheMetadata | undefined): boolean {
    // Запись без метаданных — повреждённая/чужая: считаем протухшей
    if (!metadata) return true
    // null — это Infinity, пережившая JSON (см. CacheMetadata.expiresAt)
    if (metadata.expiresAt === null || metadata.expiresAt === undefined) return false
    return Date.now() > metadata.expiresAt
  }

  static updateMetadata(metadata: CacheMetadata): CacheMetadata {
    return {
      ...metadata,
      updatedAt: Date.now(),
    }
  }

  static createKey(...parts: (string | number)[]): StorageKey {
    return new StorageKey(parts.join('_'))
  }

  /**
   * Ключ кэша запроса: `<endpoint>::<стабильная сериализация { p: params, h: заголовки, r: path/format }>`.
   * - параметры сериализуются целиком (вложенные объекты/массивы, экранирование строк);
   * - значения заголовков хешируются — в ключе нет секретов (токенов) открытым текстом;
   * - параметры и заголовки в разных пространствах — одноимённые не перетирают друг друга;
   * - `request` — итоговый path и формат ответа: их могут менять `options.context`/`responseFormat` при тех же params.
   * Ключ «сырой» (`StorageKey(raw)`): точки/скобки в нём не разбираются как путь.
   * Записи старого формата (`<endpoint>_k=v&…`) с новым ключом не совпадают — просто промахи.
   * @returns [ключ, параметры для сохранения в записи — без заголовков]
   */
  static createApiKey(
    endpoint: string,
    params?: Record<string, any>,
    headers: Record<string, string> = {},
    request: Record<string, string> = {},
  ): [StorageKeyType, Record<string, any> | undefined] {
    const hashedHeaders: Record<string, string> = {}
    for (const name of Object.keys(headers)) {
      hashedHeaders[name.toLowerCase()] = hashString(headers[name])
    }

    return [new StorageKey(`${endpoint}::${stableSerialize({ p: params ?? {}, h: hashedHeaders, r: request })}`, true), params]
  }

  /** Сырой (непарсируемый) ключ хранилища из строкового ключа кэша. */
  static toStorageKey(key: StorageKeyType): StorageKey {
    return key instanceof StorageKey ? key : new StorageKey(String(key), true)
  }

  // Функция для проверки, есть ли у записи определенные теги
  static hasAnyTag(metadata: CacheMetadata, tags: string[] = []): boolean {
    if (!metadata.tags || !tags.length) return false
    return tags.some((tag) => metadata.tags?.includes(tag))
  }
}
