import { StorageKey, StorageKeyType } from './storage-key'

export interface CacheMetadata {
  createdAt: number
  updatedAt: number
  expiresAt: number
  tags?: string[]
  createdAtDateTime: string
  updatedAtDateTime: string
  expiresAtDateTime: string
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

export class CacheUtils {
  static createMetadata(ttl: number = 0, tags: string[] = []): CacheMetadata {
    const now = Date.now()
    const expiresAt = ttl > 0 ? now + ttl : Infinity

    return {
      createdAt: now,
      updatedAt: now,
      expiresAt,
      tags,
      createdAtDateTime: this.formatDateTime(now),
      updatedAtDateTime: this.formatDateTime(now),
      expiresAtDateTime: expiresAt === Infinity ? 'never' : this.formatDateTime(expiresAt),
    }
  }

  private static formatDateTime(timestamp: number): string {
    return new Date(timestamp).toISOString()
  }

  static isExpired(metadata: CacheMetadata): boolean {
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

  static createApiKey(endpoint: string, params?: Record<string, any>): [StorageKeyType, Record<string, any> | undefined] {
    if (!params) return [new StorageKey(endpoint, true), params]

    const sortedParams = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&')

    return [new StorageKey(`${endpoint}_${sortedParams}`, true), params]
  }

  // Функция для проверки, есть ли у записи определенные теги
  static hasAnyTag(metadata: CacheMetadata, tags: string[] = []): boolean {
    if (!metadata.tags || !tags.length) return false
    return tags.some((tag) => metadata.tags?.includes(tag))
  }
}
