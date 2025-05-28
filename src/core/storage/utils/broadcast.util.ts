interface BroadcastMessage<T = unknown> {
  type: string
  payload?: T
  senderId: string
  timestamp: number
}

type MessageHandler<T> = (message: BroadcastMessage<T>) => void | Promise<void>
type SyncRequestHandler<T> = () => T | Promise<T>

interface SyncBroadcastChannelOptions {
  debug?: boolean
}

export class SyncBroadcastChannel<T = unknown> {
  private channel: BroadcastChannel

  private readonly tabId: string

  private messageHandlers: Set<MessageHandler<T>>

  private syncHandler?: SyncRequestHandler<T>

  private debug: boolean

  private syncTimeoutMs = 1000

  private pendingSyncRequests: Map<
    string,
    {
      resolve: (value: T | null) => void
      reject: (reason?: any) => void
      timeout: NodeJS.Timeout
    }
  >

  constructor(channelName: string, options: SyncBroadcastChannelOptions = {}) {
    this.channel = new BroadcastChannel(channelName)
    this.tabId = crypto.randomUUID()
    this.messageHandlers = new Set()
    this.debug = options.debug ?? false
    this.pendingSyncRequests = new Map()

    this.channel.onmessage = this.handleMessage.bind(this)
    this.channel.onmessageerror = this.handleError.bind(this)
  }

  private log(...args: any[]) {
    if (this.debug) {
      console.log(`[SyncBroadcastChannel][${this.tabId}]`, ...args)
    }
  }

  private error(...args: any[]) {
    console.error(`[SyncBroadcastChannel][${this.tabId}]`, ...args)
  }

  private async handleMessage(event: MessageEvent<BroadcastMessage<T>>): Promise<void> {
    const message = event.data

    // Игнорируем собственные сообщения
    if (message.senderId === this.tabId) {
      return
    }

    // Обработка запроса на синхронизацию
    if (message.type === 'SYNC_REQUEST') {
      if (this.syncHandler) {
        try {
          const state = await this.syncHandler()
          this.postMessage('SYNC_RESPONSE', state, message.senderId)
        } catch (error) {
          this.error('Error handling sync request:', error)
        }
      }
      return
    }

    // Обработка ответа на запрос синхронизации
    if (message.type === 'SYNC_RESPONSE') {
      const request = this.pendingSyncRequests.get(this.tabId)
      if (request) {
        clearTimeout(request.timeout)
        this.pendingSyncRequests.delete(this.tabId)
        //@ts-ignore
        request.resolve(message.payload)
      }
      return
    }

    // Уведомляем всех подписчиков о сообщении
    for (const handler of this.messageHandlers) {
      try {
        await handler(message)
      } catch (error) {
        this.error('Error in message handler:', error)
      }
    }
  }

  private handleError(event: MessageEvent) {
    this.error('Channel error:', event)
  }

  private postMessage(type: string, payload: T, targetId?: string): void {
    const message: BroadcastMessage<T> = {
      type,
      payload,
      senderId: this.tabId,
      timestamp: Date.now(),
    }

    this.channel.postMessage(message)
  }

  /**
   * Подписка на сообщения канала
   */
  public subscribe(handler: MessageHandler<T>) {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  /**
   * Установка обработчика запросов на синхронизацию
   */
  public setSyncHandler(handler: SyncRequestHandler<T>) {
    this.syncHandler = handler
  }

  /**
   * Отправка сообщения всем подписчикам
   */
  public broadcast(type: string, payload?: T) {
    //@ts-ignore
    this.postMessage(type, payload)
  }

  /**
   * Запрос синхронизации данных с других вкладок
   */
  public async requestSync(): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingSyncRequests.delete(this.tabId)
        resolve(null)
      }, this.syncTimeoutMs)

      this.pendingSyncRequests.set(this.tabId, { resolve, reject, timeout })

      this.postMessage('SYNC_REQUEST', { type: 'sync' } as T)
    })
  }

  /**
   * Закрытие канала
   */
  public close() {
    // Очищаем все pending запросы
    for (const [, request] of this.pendingSyncRequests) {
      clearTimeout(request.timeout)
      request.reject(new Error('Channel closed'))
    }
    this.pendingSyncRequests.clear()

    // Очищаем обработчики
    this.messageHandlers.clear()
    this.syncHandler = undefined

    // Закрываем канал
    this.channel.close()
  }
}
