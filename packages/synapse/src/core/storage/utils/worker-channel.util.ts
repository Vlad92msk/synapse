import { loggerConsole } from '../../../_utils/logger-console.util'
import { SyncBroadcastChannel } from './broadcast.util'

interface WorkerChannelMessage<T = unknown> {
  // Имя канала — по нему воркер разводит сообщения между портами (мультиплексирование).
  // Опционально на уровне типа, чтобы обработчики были совместимы с SyncBroadcastChannel
  // (в фолбэке сообщения приходят без channelName). В воркер-режиме поле всегда проставлено.
  channelName?: string
  type: string
  payload?: T
  senderId: string
  targetId?: string
  timestamp: number
  // ─── RPC-поля (workerKind: 'store') ───
  // Имя операции стора (get/set/...), уникальный id запроса и текст ошибки ответа.
  op?: string
  requestId?: string
  error?: string
}

type MessageHandler<T> = (message: WorkerChannelMessage<T>) => void | Promise<void>
type SyncRequestHandler<T> = () => T | Promise<T>

/** Вид воркера: 'relay' — stateless pub/sub (по умолчанию), 'store' — stateful key-value стор с RPC. */
export type WorkerKind = 'relay' | 'store'

interface WorkerChannelOptions {
  // Позволяет указать собственный воркер. Разные URL → разные воркеры.
  workerUrl?: string | URL
  /** Вид воркера. По умолчанию 'relay' (обратная совместимость с middleware). */
  workerKind?: WorkerKind
  /** Таймаут RPC-запроса ({@link WorkerChannel.request}) и requestSync, мс. По умолчанию 1000. */
  requestTimeoutMs?: number
}

// Служебное сообщение регистрации порта в воркере (привязка port → channelName)
const REGISTER_TYPE = '__worker_channel_register__'
// Служебное сообщение снятия регистрации порта (при close()) — чтобы воркер не держал
// закрытые порты в Set вечно (иначе память воркера растёт за цикл открытия/закрытия вкладок).
const UNREGISTER_TYPE = '__worker_channel_unregister__'

// ─── Store-RPC протокол (workerKind: 'store') ──────────────────────────────────
const RPC_REQUEST_TYPE = '__worker_store_rpc_request__'
const RPC_RESPONSE_TYPE = '__worker_store_rpc_response__'
// Уведомление соседних портов/экземпляров о мутации (для инвалидации кэша в других вкладках).
const STORE_MUTATION_TYPE = '__worker_store_mutation__'
// senderId в ответах воркера — не совпадает ни с одним tabId, чтобы не отфильтроваться как «своё».
const STORE_WORKER_ID = '__worker_store__'
// Операции, меняющие состояние — после них воркер уведомляет соседей.
const MUTATING_OPS = ['setAll', 'set', 'update', 'delete', 'clear']

/**
 * Контракт операций key-value стора. Работает поверх обычного `Map<string, unknown>`.
 * Одна и та же реализация используется и в реальном SharedWorker (инъекцией через
 * `.toString()`), и во in-process фолбэке — этим гарантируется идентичная семантика.
 *
 * `WorkerCacheStorage` общается со стором только через {@link WorkerChannel.request}(op,
 * payload) по этому op-набору (`get`/`getAll`/`setAll`/`set`/`update`/`delete`/`clear`/
 * `keys`/`has`) и не знает, где реально живут данные (SharedWorker-Map / in-process Map).
 */
function applyStoreOp(store: Map<string, unknown>, op: string, payload: any): any {
  switch (op) {
    case 'get':
      return store.get(payload.key)
    case 'getAll': {
      const out: Record<string, unknown> = {}
      store.forEach((v, k) => {
        out[k] = v
      })
      return out
    }
    case 'setAll': {
      store.clear()
      const state = (payload && payload.state) || {}
      Object.keys(state).forEach((k) => store.set(k, state[k]))
      return undefined
    }
    case 'set':
      store.set(payload.key, payload.value)
      return undefined
    case 'update': {
      const entries = (payload && payload.entries) || []
      entries.forEach((e: { key: string; value: unknown }) => store.set(e.key, e.value))
      return undefined
    }
    case 'delete': {
      const had = store.has(payload.key)
      store.delete(payload.key)
      return had
    }
    case 'clear':
      store.clear()
      return undefined
    case 'keys':
      return Array.from(store.keys())
    case 'has':
      return store.has(payload.key)
    default:
      throw new Error('Unknown store op: ' + op)
  }
}

/**
 * Исходник воркера как строка. Воркер держит набор подключённых портов
 * по каждому channelName и пересылает сообщения соседним портам того же
 * канала (исключая отправителя). Специально минимальный, но корректный.
 */
function getWorkerSource(): string {
  return `
    // Карта: channelName -> Set<MessagePort>
    var channels = new Map();

    self.onconnect = function (event) {
      var port = event.ports[0];

      port.onmessage = function (e) {
        var data = e.data;
        if (!data || !data.channelName) return;

        // Регистрация порта в канале
        if (data.type === '${REGISTER_TYPE}') {
          var set = channels.get(data.channelName);
          if (!set) {
            set = new Set();
            channels.set(data.channelName, set);
          }
          set.add(port);
          return;
        }

        // Снятие регистрации (порт закрывается) — не держим мёртвый порт в Set.
        if (data.type === '${UNREGISTER_TYPE}') {
          var reg = channels.get(data.channelName);
          if (reg) {
            reg.delete(port);
            if (reg.size === 0) channels.delete(data.channelName);
          }
          return;
        }

        // Пересылаем сообщение соседним портам того же канала (кроме отправителя)
        var peers = channels.get(data.channelName);
        if (!peers) return;
        peers.forEach(function (peer) {
          if (peer !== port) {
            peer.postMessage(data);
          }
        });
      };

      port.start();
    };
  `
}

// Кэш blob-URL воркера по умолчанию на уровне модуля.
// Важно: один и тот же URL → один и тот же SharedWorker. Если бы мы создавали
// новый blob на каждый экземпляр, каждый получил бы отдельный воркер.
let defaultWorkerUrl: string | undefined

function getDefaultWorkerUrl(): string {
  if (!defaultWorkerUrl) {
    const source = getWorkerSource()
    defaultWorkerUrl = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }))
  }
  return defaultWorkerUrl
}

/**
 * Исходник STORE-воркера. Держит `Map<channelName, Map<key, value>>` (мультиплексирование
 * по channelName) и отвечает на RPC-операции ({@link applyStoreOp}). После мутирующей
 * операции рассылает соседним портам того же канала уведомление STORE_MUTATION, чтобы
 * другие вкладки могли инвалидировать/обновить свой кэш.
 *
 * Логика операций инъектируется из {@link applyStoreOp} через `.toString()`, поэтому
 * воркер и in-process фолбэк ведут себя одинаково (нет расхождения реализаций).
 */
function getStoreWorkerSource(): string {
  return `
    var channels = new Map(); // channelName -> Map(key -> value)
    var ports = new Map();    // channelName -> Set<MessagePort>
    var MUTATING = ${JSON.stringify(MUTATING_OPS)};

    // Инжектим как БИНДИНГ (var), а не голое объявление: минификатор потребителя
    // переименовывает объявленную функцию, но вызовы внутри этого строкового
    // скрипта ссылаются на литеральное имя. Named function expression оставляет
    // внешнее имя (var) стабильным, а внутреннее имя — локальным.
    var applyStoreOp = ${applyStoreOp.toString()};

    function getStore(name) {
      var s = channels.get(name);
      if (!s) { s = new Map(); channels.set(name, s); }
      return s;
    }

    self.onconnect = function (event) {
      var port = event.ports[0];

      port.onmessage = function (e) {
        var data = e.data;
        if (!data || !data.channelName) return;

        if (data.type === '${REGISTER_TYPE}') {
          var set = ports.get(data.channelName);
          if (!set) { set = new Set(); ports.set(data.channelName, set); }
          set.add(port);
          return;
        }

        if (data.type === '${UNREGISTER_TYPE}') {
          var reg = ports.get(data.channelName);
          if (reg) {
            reg.delete(port);
            if (reg.size === 0) ports.delete(data.channelName);
          }
          return;
        }

        if (data.type === '${RPC_REQUEST_TYPE}') {
          var store = getStore(data.channelName);
          var response = {
            channelName: data.channelName,
            type: '${RPC_RESPONSE_TYPE}',
            senderId: '${STORE_WORKER_ID}',
            requestId: data.requestId,
            timestamp: Date.now(),
          };
          try {
            response.payload = applyStoreOp(store, data.op, data.payload);
          } catch (err) {
            response.error = (err && err.message) ? err.message : String(err);
          }
          port.postMessage(response);

          // Уведомляем соседей о мутации (кроме порта-инициатора).
          if (!response.error && MUTATING.indexOf(data.op) !== -1) {
            var peers = ports.get(data.channelName);
            if (peers) {
              peers.forEach(function (peer) {
                if (peer !== port) {
                  peer.postMessage({
                    channelName: data.channelName,
                    type: '${STORE_MUTATION_TYPE}',
                    senderId: data.senderId,
                    payload: { op: data.op },
                    timestamp: Date.now(),
                  });
                }
              });
            }
          }
          return;
        }
      };

      port.start();
    };
  `
}

let storeWorkerUrl: string | undefined

function getStoreWorkerUrl(): string {
  if (!storeWorkerUrl) {
    storeWorkerUrl = URL.createObjectURL(new Blob([getStoreWorkerSource()], { type: 'application/javascript' }))
  }
  return storeWorkerUrl
}

/**
 * In-process фолбэк для STORE-режима (нет реального SharedWorker: тесты/SSR).
 *
 * Map разделяется НА УРОВНЕ МОДУЛЯ по channelName, поэтому два WorkerCacheStorage с
 * одним channelName в ОДНОМ процессе видят одни данные. ВАЖНО: это НЕ межвкладочный
 * шеринг — у каждой вкладки свой модуль/процесс. Кросс-табный шеринг даёт только
 * настоящий SharedWorker. Round-trip при этом идентичен MemoryStorage.
 */
const localStores = new Map<string, Map<string, unknown>>()
const localPeers = new Map<string, Set<WorkerChannel<any>>>()

function getLocalStore(channelName: string): Map<string, unknown> {
  let store = localStores.get(channelName)
  if (!store) {
    store = new Map()
    localStores.set(channelName, store)
  }
  return store
}

/**
 * Транспорт поверх SharedWorker/MessagePort, зеркалящий публичный API
 * SyncBroadcastChannel. Позволяет middleware и адаптерам хранилища использовать
 * оба класса взаимозаменяемо.
 *
 * Мультиплексирование: N хранилищ делят ОДИН SharedWorker и разделяются по
 * channelName. Если SharedWorker недоступен — прозрачно делегируем в
 * SyncBroadcastChannel. Если недоступен и BroadcastChannel — no-op (SSR-safe).
 */
export class WorkerChannel<T = unknown> {
  private readonly channelName: string

  private readonly tabId: string

  private messageHandlers: Set<MessageHandler<T>>

  private syncHandler?: SyncRequestHandler<T>

  private readonly syncTimeoutMs: number

  private readonly workerKind: WorkerKind

  private pendingSyncRequests: Map<
    string,
    {
      resolve: (value: T | null) => void
      reject: (reason?: any) => void
      timeout: NodeJS.Timeout
    }
  >

  // Ожидающие RPC-ответы (workerKind: 'store'), ключ — requestId.
  private pendingRequests: Map<
    string,
    {
      resolve: (value: any) => void
      reject: (reason?: any) => void
      timeout: NodeJS.Timeout
    }
  > = new Map()

  // Режим работы транспорта. 'local' — in-process стор (store-fallback/SSR).
  private mode: 'worker' | 'fallback' | 'noop' | 'local'

  private port?: MessagePort

  // Фолбэк на SyncBroadcastChannel (когда SharedWorker недоступен, relay-режим)
  private fallback?: SyncBroadcastChannel<T>

  // In-process стор (workerKind: 'store' без SharedWorker)
  private localStore?: Map<string, unknown>

  constructor(channelName: string, options: WorkerChannelOptions = {}) {
    this.channelName = channelName
    this.tabId = crypto.randomUUID()
    this.messageHandlers = new Set()
    this.workerKind = options.workerKind ?? 'relay'
    this.syncTimeoutMs = options.requestTimeoutMs ?? 1000
    this.pendingSyncRequests = new Map()

    if (this.workerKind === 'store') {
      // STORE-режим: только SharedWorker (кросс-таб) либо in-process стор.
      // SyncBroadcastChannel здесь не нужен — round-trip обеспечивает стор.
      if (typeof SharedWorker !== 'undefined' && this.tryConnectSharedWorker(options.workerUrl ?? getStoreWorkerUrl())) {
        this.mode = 'worker'
        return
      }
      // SharedWorker недоступен или конструктор бросил (CSP/SecurityError):
      // прозрачно деградируем на in-process стор (R6/R9).
      this.mode = 'local'
      this.localStore = getLocalStore(channelName)
      let peers = localPeers.get(channelName)
      if (!peers) {
        peers = new Set()
        localPeers.set(channelName, peers)
      }
      peers.add(this)
      return
    }

    if (typeof SharedWorker !== 'undefined' && this.tryConnectSharedWorker(options.workerUrl ?? getDefaultWorkerUrl())) {
      // Основной путь — SharedWorker
      this.mode = 'worker'
    } else if (typeof BroadcastChannel !== 'undefined') {
      // Фолбэк — прозрачно делегируем в SyncBroadcastChannel с тем же channelName
      this.mode = 'fallback'
      this.fallback = new SyncBroadcastChannel<T>(channelName)
    } else {
      // SSR: ни SharedWorker, ни BroadcastChannel — тихий no-op
      this.mode = 'noop'
    }
  }

  /**
   * Пытается создать SharedWorker и привязать порт. Конструктор `new SharedWorker`
   * может БРОСИТЬ синхронно (CSP `worker-src` без `blob:` → SecurityError). В этом
   * случае честно логируем и возвращаем false — вызывающий прозрачно уходит в фолбэк
   * (BroadcastChannel в relay-режиме, in-process стор в store-режиме), а не роняет
   * конструирование адаптера/middleware.
   *
   * @returns true если SharedWorker успешно подключён, иначе false (нужен фолбэк).
   */
  private tryConnectSharedWorker(workerUrl: string | URL): boolean {
    try {
      const worker = new SharedWorker(workerUrl)
      // Асинхронные ошибки воркера (после конструктора) — не молчим. Частый случай для
      // кастомного workerUrl: скрипт не загрузился (404/неверный MIME). Конструктор УЖЕ
      // отработал (mode='worker'), автофолбэка на этой стадии нет — операции будут падать
      // по таймауту. Даём actionable-диагностику, а не молчаливую деградацию (R9).
      worker.onerror = (event) => {
        loggerConsole.warn(
          `[WorkerChannel][${this.tabId}] SharedWorker-скрипт не загрузился/упал (url: ${String(workerUrl)}). ` +
            `Вероятная причина: недоступный кастомный workerUrl (404 / неверный MIME) или ошибка в скрипте. ` +
            `Транспорт остаётся в режиме 'worker', но RPC-операции будут падать по таймауту (${this.syncTimeoutMs}мс). ` +
            `Проверьте, что workerUrl отдаётся same-origin как application/javascript.`,
          event,
        )
      }
      this.port = worker.port
      this.port.onmessage = this.handleMessage.bind(this)
      this.port.onmessageerror = this.handleError.bind(this)
      this.port.start()
      this.registerPort()
      return true
    } catch (error) {
      loggerConsole.warn(
        `[WorkerChannel][${this.tabId}] SharedWorker недоступен (вероятно CSP worker-src без blob: → SecurityError). ` +
          `Прозрачно деградирую на ${this.workerKind === 'store' ? 'in-process стор (без кросс-табного шеринга)' : 'BroadcastChannel'}.`,
        error,
      )
      return false
    }
  }

  /** Фактический режим транспорта (для честного `capabilities`/диагностики, R9). */
  public get transportMode(): 'worker' | 'fallback' | 'noop' | 'local' {
    return this.mode
  }

  private error(...args: any[]) {
    loggerConsole.error(`[WorkerChannel][${this.tabId}]`, ...args)
  }

  private registerPort(): void {
    // Служебное сообщение без payload — только привязка порта к каналу
    const message: WorkerChannelMessage<T> = {
      channelName: this.channelName,
      type: REGISTER_TYPE,
      senderId: this.tabId,
      timestamp: Date.now(),
    }
    this.safePostMessage(message)
  }

  private async handleMessage(event: MessageEvent<WorkerChannelMessage<T>>): Promise<void> {
    const message = event.data

    // Чужие каналы игнорируем (страховка — воркер и так разводит по channelName)
    if (!message || message.channelName !== this.channelName) {
      return
    }

    // Игнорируем собственные сообщения
    if (message.senderId === this.tabId) {
      return
    }

    // Обработка RPC-ответа STORE-воркера (сопоставление по requestId)
    if (message.type === RPC_RESPONSE_TYPE) {
      const requestId = message.requestId
      if (!requestId) return
      const pending = this.pendingRequests.get(requestId)
      if (pending) {
        clearTimeout(pending.timeout)
        this.pendingRequests.delete(requestId)
        if (message.error) {
          pending.reject(new Error(message.error))
        } else {
          pending.resolve(message.payload)
        }
      }
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
      // Фильтруем по targetId — принимаем только ответы, адресованные этой вкладке
      if (message.targetId && message.targetId !== this.tabId) {
        return
      }
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

  private safePostMessage(message: WorkerChannelMessage<T>): void {
    if (!this.port) {
      return
    }
    try {
      // Всё, что уходит в порт, обязано клонироваться structured clone
      this.port.postMessage(message)
    } catch (error) {
      // Даём понятную ошибку вместо тихого сбоя postMessage
      throw new Error(
        `[WorkerChannel] Не удалось отправить сообщение "${message.type}": payload не поддерживает structured clone (structured clone algorithm). Передавайте только клонируемые данные. Исходная ошибка: ${(error as Error)?.message ?? error}`,
      )
    }
  }

  private postMessage(type: string, payload: T, targetId?: string): void {
    const message: WorkerChannelMessage<T> = {
      channelName: this.channelName,
      type,
      payload,
      senderId: this.tabId,
      timestamp: Date.now(),
    }

    if (targetId) {
      message.targetId = targetId
    }

    this.safePostMessage(message)
  }

  /**
   * Подписка на сообщения канала
   */
  public subscribe(handler: MessageHandler<T>) {
    if (this.mode === 'fallback' && this.fallback) {
      return this.fallback.subscribe(handler)
    }
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  /**
   * Установка обработчика запросов на синхронизацию
   */
  public setSyncHandler(handler: SyncRequestHandler<T>) {
    if (this.mode === 'fallback' && this.fallback) {
      this.fallback.setSyncHandler(handler)
      return
    }
    this.syncHandler = handler
  }

  /**
   * Отправка сообщения всем подписчикам
   */
  public broadcast(type: string, payload?: T) {
    if (this.mode === 'fallback' && this.fallback) {
      this.fallback.broadcast(type, payload)
      return
    }
    //@ts-ignore
    this.postMessage(type, payload)
  }

  /**
   * Запрос синхронизации данных с других вкладок
   */
  public async requestSync(): Promise<T | null> {
    if (this.mode === 'fallback' && this.fallback) {
      return this.fallback.requestSync()
    }

    // no-op режим — синхронизироваться не с кем
    if (this.mode === 'noop') {
      return null
    }

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
   * RPC-запрос к STORE-бэкенду (workerKind: 'store'). Отправляет операцию с уникальным
   * requestId и резолвится ответом. По таймауту ({@link WorkerChannelOptions.requestTimeoutMs},
   * по умолчанию 1000мс) — reject.
   *
   * В worker-режиме payload проходит structured clone через postMessage. В local-режиме
   * мы клонируем payload/результат вручную — так и валидируется клонируемость, и данные
   * изолируются (как через границу воркера).
   */
  public request<Res = unknown>(type: string, payload?: unknown): Promise<Res> {
    if (this.workerKind !== 'store') {
      return Promise.reject(new Error(`[WorkerChannel] request() доступен только в workerKind: 'store' (текущий: '${this.workerKind}')`))
    }

    // In-process стор — синхронный round-trip, но возвращаем Promise ради единого API.
    if (this.mode === 'local' && this.localStore) {
      let clonedPayload: any
      try {
        clonedPayload = payload === undefined ? undefined : structuredClone(payload)
      } catch (error) {
        return Promise.reject(
          new Error(
            `[WorkerChannel] Операция "${type}": payload не поддерживает structured clone (structured clone algorithm). Передавайте только клонируемые данные (не Response/Headers/функции). Исходная ошибка: ${(error as Error)?.message ?? error}`,
          ),
        )
      }

      try {
        const result = applyStoreOp(this.localStore, type, clonedPayload)
        if (MUTATING_OPS.indexOf(type) !== -1) {
          this.notifyLocalPeers(type)
        }
        // Клонируем результат — изоляция как через границу воркера.
        return Promise.resolve(structuredClone(result) as Res)
      } catch (error) {
        return Promise.reject(error)
      }
    }

    // Worker-режим — отправляем RPC-сообщение и ждём ответ по requestId.
    if (this.mode === 'worker') {
      return new Promise<Res>((resolve, reject) => {
        const requestId = crypto.randomUUID()
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(requestId)
          reject(new Error(`[WorkerChannel] RPC "${type}" превысил таймаут ${this.syncTimeoutMs}мс`))
        }, this.syncTimeoutMs)

        this.pendingRequests.set(requestId, { resolve, reject, timeout })

        const message: WorkerChannelMessage<T> = {
          channelName: this.channelName,
          type: RPC_REQUEST_TYPE,
          op: type,
          requestId,
          payload: payload as T,
          senderId: this.tabId,
          timestamp: Date.now(),
        }

        try {
          this.safePostMessage(message)
        } catch (error) {
          clearTimeout(timeout)
          this.pendingRequests.delete(requestId)
          reject(error)
        }
      })
    }

    return Promise.reject(new Error('[WorkerChannel] STORE-бэкенд недоступен'))
  }

  /** Уведомляет соседние in-process экземпляры того же канала о мутации (кроме себя). */
  private notifyLocalPeers(op: string): void {
    const peers = localPeers.get(this.channelName)
    if (!peers) return
    const message: WorkerChannelMessage<T> = {
      channelName: this.channelName,
      type: STORE_MUTATION_TYPE,
      payload: { op } as unknown as T,
      senderId: this.tabId,
      timestamp: Date.now(),
    }
    for (const peer of peers) {
      if (peer === this) continue
      for (const handler of peer.messageHandlers) {
        try {
          handler(message)
        } catch (error) {
          this.error('Error in local peer handler:', error)
        }
      }
    }
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

    // Очищаем pending RPC-запросы
    for (const [, request] of this.pendingRequests) {
      clearTimeout(request.timeout)
      request.reject(new Error('Channel closed'))
    }
    this.pendingRequests.clear()

    // Снимаем регистрацию in-process экземпляра (store-fallback).
    // Данные (localStore) НЕ трогаем — они разделяются между экземплярами канала.
    if (this.mode === 'local') {
      const peers = localPeers.get(this.channelName)
      if (peers) {
        peers.delete(this)
        if (peers.size === 0) localPeers.delete(this.channelName)
      }
      this.localStore = undefined
    }

    // Очищаем обработчики
    this.messageHandlers.clear()
    this.syncHandler = undefined

    // Закрываем фолбэк, если он был
    if (this.fallback) {
      this.fallback.close()
      this.fallback = undefined
    }

    // Закрываем порт SharedWorker
    if (this.port) {
      // Сначала просим воркер снять регистрацию порта — иначе он держит закрытый порт в
      // Set вечно (postMessage в него — тихий no-op, но память воркера растёт). Отправляем
      // ДО close(), пока порт ещё живой.
      this.safePostMessage({
        channelName: this.channelName,
        type: UNREGISTER_TYPE,
        senderId: this.tabId,
        timestamp: Date.now(),
      })
      this.port.onmessage = null
      this.port.onmessageerror = null
      this.port.close()
      this.port = undefined
    }
  }
}
