import { WorkerChannel } from '../../utils/worker-channel.util'
import { WorkerStorageBackend } from './backend.interface'

/**
 * Бэкенд поверх {@link WorkerChannel} в store-режиме — ЖИВОЙ кэш, разделяемый между
 * вкладками через SharedWorker (при недоступности SharedWorker — прозрачный in-process
 * фолбэк на module-level Map, round-trip идентичен, но без кросс-табного шеринга).
 *
 * Это дословный вынос прежней логики {@link WorkerCacheStorage}: канал создаётся в
 * конструкторе, все op проксируются в `channel.request(op, payload)`, `close()` закрывает
 * канал (данные в сторе остаются — их разделяют другие вкладки). Поведение бэкенда
 * идентично прежнему адаптеру.
 */
export class SharedWorkerBackend implements WorkerStorageBackend {
  private readonly channel: WorkerChannel

  constructor(channelName: string, options: { workerUrl?: string | URL; requestTimeoutMs?: number } = {}) {
    this.channel = new WorkerChannel(channelName, {
      workerKind: 'store',
      workerUrl: options.workerUrl,
      requestTimeoutMs: options.requestTimeoutMs,
    })
  }

  /** Канал уже создан в конструкторе (как в прежнем адаптере) — connect идемпотентен. */
  async connect(): Promise<void> {
    // no-op: транспорт инициализируется в конструкторе WorkerChannel.
  }

  /**
   * Фактический режим транспорта. `'worker'` — реальный кросс-табный SharedWorker;
   * иначе (`'local'`/`'noop'`) — in-process фолбэк без межвкладочного шеринга.
   * Используется адаптером для честного {@link WorkerCacheStorage.capabilities}.
   */
  get shared(): boolean {
    return this.channel.transportMode === 'worker'
  }

  /**
   * Подписка на STORE_MUTATION от воркера/локальных пиров (записи из ДРУГИХ вкладок/
   * экземпляров). Воркер рассылает уведомление после каждой мутирующей операции; в
   * store-режиме до подписчиков доходят только эти сообщения. Возвращает функцию отписки.
   */
  onMutation(handler: () => void): VoidFunction {
    return this.channel.subscribe(() => handler())
  }

  getAll(): Promise<Record<string, unknown>> {
    return this.channel.request<Record<string, unknown>>('getAll')
  }

  setAll(state: Record<string, unknown>): Promise<void> {
    return this.channel.request<void>('setAll', { state })
  }

  get(key: string): Promise<unknown> {
    return this.channel.request<unknown>('get', { key })
  }

  set(key: string, value: unknown): Promise<void> {
    return this.channel.request<void>('set', { key, value })
  }

  update(entries: Array<{ key: string; value: unknown }>): Promise<void> {
    return this.channel.request<void>('update', { entries })
  }

  delete(key: string): Promise<boolean> {
    return this.channel.request<boolean>('delete', { key })
  }

  clear(): Promise<void> {
    return this.channel.request<void>('clear')
  }

  keys(): Promise<string[]> {
    return this.channel.request<string[]>('keys')
  }

  has(key: string): Promise<boolean> {
    return this.channel.request<boolean>('has', { key })
  }

  close(): void {
    // Данные в сторе остаются (live-cache): их разделяют другие вкладки.
    this.channel.close()
  }
}
