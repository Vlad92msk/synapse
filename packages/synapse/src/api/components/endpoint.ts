import { CreateApiClientOptions, RetryConfig } from '../types/api.interface'
import { Endpoint as EndpointType, EndpointConfig, EndpointState, RequestResponseModify, RequestState } from '../types/endpoint.interface'
import { QueryOptions, QueryResult, Unsubscribe } from '../types/query.interface'
import { toApiError } from '../utils/api-error'
import { createUniqueId, headersToObject } from '../utils/api-helpers'
import { createHeaderContext } from '../utils/create-header-context'
import { createPrepareHeaders, mergeHeaders, prepareRequestHeaders } from '../utils/endpoint-headers'
import { fetchBaseQuery } from '../utils/fetch-base-query'
import { getCacheableHeaders } from '../utils/get-cacheable-headers'
import { QueryStorage } from './query-storage'

/** HTTP-статусы, при которых делать retry по умолчанию */
const DEFAULT_RETRY_ON = [0, 408, 429, 500, 502, 503, 504]

const createAbortError = () => new DOMException('The operation was aborted.', 'AbortError')

/** Идемпотентные методы: повтор не создаёт побочных эффектов дважды (RFC 9110 §9.2.2) */
const IDEMPOTENT_METHODS = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']

/**
 * Данные, которые переживут JSON-хранилище (localStorage/IndexedDB-сериализация, dehydrate).
 * Blob/ArrayBuffer/FormData/Response при сериализации молча превращаются в `{}` — такие ответы не кэшируем.
 */
function isCacheableData(data: unknown): boolean {
  if (data === null || typeof data !== 'object') return true
  if (typeof Blob !== 'undefined' && data instanceof Blob) return false
  if (typeof FormData !== 'undefined' && data instanceof FormData) return false
  if (typeof Response !== 'undefined' && data instanceof Response) return false
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return false
  return true
}

/**
 * Общий in-flight запрос для дедупликации. У него СВОЙ AbortController: отмена одного
 * потребителя не должна ронять остальных — общий fetch отменяется, только когда
 * отписались все (`refs` → 0).
 */
interface InflightEntry<T> {
  key: string
  promise: Promise<QueryResult<T, Error>>
  controller: AbortController
  refs: number
  /** Поколение тегов эндпоинта на старте (см. QueryStorage.getTagsGeneration) */
  generation: number
}

/**
 * Запись кэша хранит заголовки ответа plain-объектом (сериализуемо). Наружу отдаём `Headers`,
 * как у сетевого ответа: иначе `meta.headers.get(...)` падал только при попадании в кэш.
 */
function restoreCachedResult<T>(cached: QueryResult<T, Error>): QueryResult<T, Error> {
  const raw = cached.headers as unknown
  const headers = raw instanceof Headers ? raw : new Headers((raw ?? {}) as Record<string, string>)
  return { ...cached, headers, fromCache: true }
}

export interface EndpointClassOptions<RequestParams extends Record<string, any>, RequestResponse> {
  name: string
  queryStorage: QueryStorage
  config: EndpointConfig<RequestParams, RequestResponse>
  cacheableHeaderKeys: CreateApiClientOptions['cacheableHeaderKeys']
  globalCacheConfig: CreateApiClientOptions['cache']
  globalRetryConfig: CreateApiClientOptions['retry']
  baseQueryConfig: CreateApiClientOptions['baseQuery']
}

export class EndpointClass<RequestParams extends Record<string, any>, RequestResponse> implements EndpointType<RequestParams, RequestResponse> {
  private endpointSubscribers = new Set<(state: EndpointState) => void>()

  /** Сколько раз был вызван метод request */
  fetchCounts: number = 0

  meta: EndpointType['meta'] = {
    cache: false,
    invalidatesTags: [],
    name: '',
    tags: [],
  }

  private name: string
  private queryStorage: QueryStorage
  private configCurrentEndpoint: EndpointConfig<RequestParams, RequestResponse>
  private cacheableHeaderKeys: CreateApiClientOptions['cacheableHeaderKeys']
  private globalRetryConfig: CreateApiClientOptions['retry']
  private baseQueryConfig: CreateApiClientOptions['baseQuery']

  private queryFunction: ReturnType<typeof fetchBaseQuery>

  /** Массив заголовков, которые нужно включить в ключ кэширования */
  private cacheableHeaders: string[]

  private prepareHeaders: ReturnType<typeof createPrepareHeaders>

  /** Карта in-flight запросов для дедупликации (cacheKey → общий запрос) */
  private inflightRequests = new Map<string, InflightEntry<RequestResponse>>()

  constructor(options: EndpointClassOptions<RequestParams, RequestResponse>) {
    this.name = options.name
    this.queryStorage = options.queryStorage
    this.configCurrentEndpoint = options.config
    this.cacheableHeaderKeys = options.cacheableHeaderKeys
    this.globalRetryConfig = options.globalRetryConfig
    this.baseQueryConfig = options.baseQueryConfig

    // 1. Создаем функцию подготовки заголовков
    this.prepareHeaders = createPrepareHeaders(this.baseQueryConfig.prepareHeaders, this.configCurrentEndpoint.prepareHeaders)
    // 2. Создаем функцию исполнения запроса
    this.queryFunction = fetchBaseQuery({
      baseUrl: this.baseQueryConfig.baseUrl,
      fetchFn: this.baseQueryConfig.fetchFn,
      timeout: this.baseQueryConfig.timeout,
      credentials: this.baseQueryConfig.credentials,
    })
    // 3. Создаем массив тех заголовков, которые нужно включить в ключ кэширования
    this.cacheableHeaders = [...(this.cacheableHeaderKeys || []), ...(this.configCurrentEndpoint.includeCacheableHeaderKeys || [])].filter(
      (key) => !this.configCurrentEndpoint.excludeCacheableHeaderKeys?.includes(key),
    )
    // 4. Сохраняем информацию в meta
    this.meta.name = this.name
    this.meta.tags = this.configCurrentEndpoint.tags ?? this.meta.tags
    this.meta.invalidatesTags = this.configCurrentEndpoint.invalidatesTags ?? this.meta.invalidatesTags
    this.meta.cache = this.queryStorage.createCacheConfig(this.configCurrentEndpoint) ?? this.meta.cache
  }

  public request(params: RequestParams, options?: QueryOptions): RequestResponseModify<RequestResponse> {
    // 1. Подготовка и инициализация
    this.fetchCounts++
    const requestId = createUniqueId(this.name)
    const controller = new AbortController()
    const requestSubscribers = new Set<(state: RequestState<RequestResponse, RequestParams>) => void>()
    const currentState: RequestState<RequestResponse, RequestParams> = {
      status: 'idle',
      requestParams: params,
      headers: {},
      error: undefined,
      data: undefined,
      fromCache: false,
    }

    // Связываем пользовательский signal с внутренним controller
    const externalSignal = options?.signal
    const onExternalAbort = () => controller.abort()
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort()
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true })
      }
    }

    // 2. Функция нотификации подписчиков запроса
    const notifyRequestSubscribers = (newState: Partial<RequestState<RequestResponse, RequestParams>>) => {
      Object.assign(currentState, newState)
      requestSubscribers.forEach((cb) => cb({ ...currentState }))
    }

    // 3. Запускаем выполнение запроса
    const waitPromise = this.executeRequest(params, options, controller, notifyRequestSubscribers)

    // Снимаем слушатель с внешнего signal по завершении: долгоживущий signal (общий для страницы)
    // иначе копил бы по слушателю (и controller'у) на каждый запрос
    if (externalSignal) {
      const detach = () => externalSignal.removeEventListener('abort', onExternalAbort)
      waitPromise.then(detach, detach)
    }

    // 4. Возвращаем объект с методами управления запросом
    return {
      id: requestId,

      subscribe(listener, subscribeOptions = {}) {
        const { autoUnsubscribe = true } = subscribeOptions
        requestSubscribers.add(listener)
        listener(currentState)

        const unsubscribe = () => requestSubscribers.delete(listener)

        if (autoUnsubscribe) {
          // then(ok, fail), а не finally: производный от finally промис при ошибке запроса
          // реджектился бы без обработчика (unhandled rejection у каждого подписчика)
          waitPromise.then(unsubscribe, unsubscribe)
        }

        return unsubscribe
      },

      wait: () => waitPromise,

      waitWithCallbacks(handlers = {}) {
        const { idle, loading, success, error } = handlers

        this.subscribe(
          (state: RequestState<RequestResponse, RequestParams>) => {
            switch (state.status) {
              case 'idle':
                idle?.(state)
                break
              case 'loading':
                loading?.(state)
                break
              case 'success':
                success?.(state.data, state)
                break
              case 'error':
                error?.(state.error, state)
                break
            }
          },
          { autoUnsubscribe: true },
        )

        return waitPromise
      },

      abort: () => {
        if (!controller.signal.aborted) {
          controller.abort()
        }
      },

      then: (onfulfilled, onrejected) => waitPromise.then(onfulfilled, onrejected),
      catch: (onrejected) => waitPromise.catch(onrejected),
      finally: (onfinally) => waitPromise.finally(onfinally),
    }
  }

  /**
   * Определяет итоговую конфигурацию retry: вызов → эндпоинт → глобальная
   */
  private resolveRetryConfig(options: QueryOptions | undefined, method: string): RetryConfig | undefined {
    // Явный retry вызова/эндпоинта — осознанный opt-in, действует для любого метода
    const explicit = options?.retry ?? this.configCurrentEndpoint.retry
    if (explicit) return explicit
    // Глобальный retry — только для идемпотентных методов: повтор POST/PATCH после 5xx/обрыва
    // мог бы создать сущность дважды (сервер успел обработать, ответ потерялся)
    return IDEMPOTENT_METHODS.includes(method.toUpperCase()) ? this.globalRetryConfig : undefined
  }

  /**
   * Подключает потребителя к общему in-flight запросу. Отмена потребителя реджектит только его
   * (сразу, не дожидаясь общего ответа) и уменьшает `refs`; последний ушедший отменяет общий fetch.
   */
  private joinInflight(entry: InflightEntry<RequestResponse>, controller: AbortController): Promise<QueryResult<RequestResponse, Error>> {
    return new Promise((resolve, reject) => {
      let done = false

      const onAbort = () => {
        if (done) return
        done = true
        entry.refs--
        if (entry.refs <= 0) {
          // Новые дубли не должны цепляться к отменяемому запросу
          if (this.inflightRequests.get(entry.key) === entry) this.inflightRequests.delete(entry.key)
          entry.controller.abort()
        }
        reject(createAbortError())
      }

      if (controller.signal.aborted) {
        onAbort()
        return
      }
      controller.signal.addEventListener('abort', onAbort, { once: true })

      entry.promise.then(
        (result) => {
          if (done) return
          done = true
          controller.signal.removeEventListener('abort', onAbort)
          resolve(result)
        },
        (error) => {
          if (done) return
          done = true
          controller.signal.removeEventListener('abort', onAbort)
          reject(error)
        },
      )
    })
  }

  /**
   * Выполняет сетевой запрос с кэшированием, дедупликацией и retry
   */
  private async executeRequest(
    params: RequestParams,
    options: QueryOptions | undefined,
    controller: AbortController,
    notify: (state: Partial<RequestState<RequestResponse, RequestParams>>) => void,
  ): Promise<QueryResult<RequestResponse, Error>> {
    const headerContext = createHeaderContext({ requestParams: params }, options?.context || {})

    try {
      // 1. Формируем requestDefinition (метод, заголовки эндпоинта)
      const requestDefinition = this.configCurrentEndpoint.request(params, options?.context)

      // 2. Формируем заголовки: prepareHeaders (глобальный → эндпоинт) → RequestDefinition.headers → QueryOptions.headers
      // Ошибка в prepareHeaders валит запрос (ApiError, status 0): уйти без авторизации хуже, чем упасть
      const headers = await prepareRequestHeaders(this.prepareHeaders, headerContext).catch((error) => {
        throw toApiError({ error, status: 0, statusText: 'prepareHeaders failed' })
      })
      mergeHeaders(headers, requestDefinition.headers)
      mergeHeaders(headers, options?.headers)
      const headersForCache = getCacheableHeaders(headers, options?.cacheableHeaderKeys ? options.cacheableHeaderKeys : this.cacheableHeaders)

      // 3. Проверяем кэширование (с учётом HTTP-метода)
      const shouldCache = this.queryStorage.shouldCache(this.configCurrentEndpoint, options, requestDefinition.method)
      const [cacheKey, cacheParams] = this.queryStorage.createCacheKey(this.name, params, headersForCache, this.getKeyDiscriminator(requestDefinition, options))
      const cacheKeyStr = String(cacheKey)

      // 4. Проверяем кэш
      if (shouldCache) {
        const cachedResult = await this.queryStorage.getCachedResult<QueryResult<RequestResponse>>(cacheKey)
        if (cachedResult) {
          const result = restoreCachedResult(cachedResult)
          notify({
            fromCache: true,
            status: 'success',
            data: result.data,
            error: undefined,
            headers: result.headers,
            requestParams: params,
          })
          return result
        }
      }

      const tags = this.configCurrentEndpoint.tags ?? []
      const generation = this.queryStorage.getTagsGeneration(tags)

      // 5. Дедупликация: если запрос с таким же ключом уже летит — подключаемся к нему.
      //    Летящий запрос, чьи теги успели инвалидировать, устарел — к нему не цепляемся.
      const inflight = shouldCache ? this.inflightRequests.get(cacheKeyStr) : undefined
      if (inflight && inflight.generation === generation) {
        notify({ fromCache: false, status: 'loading' })
        inflight.refs++
        const result = await this.joinInflight(inflight, controller)
        if (!result.ok) {
          // Так же, как у исходного запроса: неуспех → reject с ApiError (а не resolve с ok: false)
          const apiError = toApiError({ ...result, fromCache: true })
          notify({
            fromCache: true,
            status: 'error',
            data: undefined,
            error: apiError,
            headers: result.headers,
            requestParams: params,
          })
          throw apiError
        }
        notify({
          fromCache: true,
          status: 'success',
          data: result.data,
          error: undefined,
          headers: result.headers,
          requestParams: params,
        })
        return { ...result, fromCache: true }
      }

      // 6. Выполняем запрос (с retry и post-processing)
      notify({ fromCache: false, status: 'loading' })

      const retryConfig = this.resolveRetryConfig(options, requestDefinition.method)
      let response: QueryResult<RequestResponse, Error>

      if (shouldCache) {
        // Кэшируемый запрос — общий для дублей: свой controller, отмена по refs (см. joinInflight)
        const sharedController = new AbortController()
        const entry: InflightEntry<RequestResponse> = {
          key: cacheKeyStr,
          promise: this.executeFetch(requestDefinition, options, sharedController, headers, retryConfig, shouldCache, cacheKey, cacheParams ?? {}, generation),
          controller: sharedController,
          refs: 1,
          generation,
        }
        this.inflightRequests.set(cacheKeyStr, entry)
        entry.promise
          .finally(() => {
            if (this.inflightRequests.get(cacheKeyStr) === entry) this.inflightRequests.delete(cacheKeyStr)
          })
          .catch(() => {})

        response = await this.joinInflight(entry, controller)
      } else {
        response = await this.executeFetch(requestDefinition, options, controller, headers, retryConfig, shouldCache, cacheKey, cacheParams ?? {}, generation)
      }

      // 7. Обрабатываем результат
      if (response.ok) {
        notify({
          fromCache: false,
          status: 'success',
          data: response.data,
          error: undefined,
          headers: response.headers,
          requestParams: params,
        })
        this.notifyEndpointSubscribers('success')
        return { ...response, fromCache: false }
      } else {
        // invalidateOnError: при ошибке выбрасываем сохранённую запись этого ключа. Реально срабатывает
        // на принудительном рефетче (disableCache): при обычном запросе до сети доходит только промах кэша
        if (this.queryStorage.shouldCache(this.configCurrentEndpoint, { ...options, disableCache: false }, requestDefinition.method)) {
          const cacheConfig = this.queryStorage.createCacheConfig(this.configCurrentEndpoint)
          if (cacheConfig.invalidateOnError !== false) {
            await this.queryStorage.invalidateCache(cacheKey)
          }
        }

        // Наружу — всегда ApiError (тело ответа в originalError, статус в meta), а не сырое тело:
        // иначе при пустом теле летел бы `undefined`, а статус терялся
        const apiError = toApiError({ ...response, fromCache: false })
        notify({
          fromCache: false,
          status: 'error',
          data: undefined,
          error: apiError,
          headers: response.headers,
          requestParams: params,
        })
        this.notifyEndpointSubscribers('error', apiError)
        throw apiError
      }
    } catch (error) {
      notify({
        fromCache: false,
        status: 'error',
        data: undefined,
        error: error as Error,
        headers: undefined,
        requestParams: params,
      })
      throw error
    }
  }

  /**
   * Выполняет HTTP-запрос с retry, инвалидацией тегов и кэшированием результата
   */
  private async executeFetch(
    requestDefinition: ReturnType<EndpointConfig<RequestParams, RequestResponse>['request']>,
    options: QueryOptions | undefined,
    controller: AbortController,
    headers: Headers,
    retryConfig: RetryConfig | undefined,
    shouldCache: boolean,
    cacheKey: ReturnType<QueryStorage['createCacheKey']>[0],
    cacheParams: Record<string, any>,
    generation: number,
  ): Promise<QueryResult<RequestResponse, Error>> {
    // Выполняем HTTP-запрос (с retry если настроен)
    const response = await this.fetchWithRetry(requestDefinition, options, controller, headers, retryConfig)

    // Post-processing при успешном ответе
    if (response.ok) {
      const { headers: responseHeaders, ...restResponse } = response
      const tags = this.configCurrentEndpoint.tags ?? []

      // Теги инвалидировали, пока запрос летел (мутация) — ответ мог устареть, в кэш не кладём.
      // Проверяем ДО собственной инвалидации invalidatesTags.
      const isFresh = this.queryStorage.getTagsGeneration(tags) === generation

      // Инвалидируем кэш по тегам
      if (this.configCurrentEndpoint.invalidatesTags?.length) {
        await this.queryStorage.invalidateCacheByTags(this.configCurrentEndpoint.invalidatesTags)
      }

      // Сохраняем в кэш (бинарные/сырые ответы — нет: JSON-хранилище их испортит)
      if (shouldCache && isFresh && isCacheableData(restResponse.data)) {
        const currentCacheConfig = this.queryStorage.createCacheConfig(this.configCurrentEndpoint)
        await this.queryStorage.setCachedResult(cacheKey, { ...restResponse, headers: headersToObject(responseHeaders) }, currentCacheConfig, cacheParams, tags)
      }
    }

    return response
  }

  /**
   * Выполняет HTTP-запрос с повторными попытками
   */
  private async fetchWithRetry(
    requestDefinition: ReturnType<EndpointConfig<RequestParams, RequestResponse>['request']>,
    options: QueryOptions | undefined,
    controller: AbortController,
    headers: Headers,
    retryConfig?: RetryConfig,
  ): Promise<QueryResult<RequestResponse, Error>> {
    const maxAttempts = (retryConfig?.count ?? 0) + 1
    const retryOn = retryConfig?.retryOn ?? DEFAULT_RETRY_ON
    const getDelay = (attempt: number): number => {
      if (typeof retryConfig?.delay === 'function') return retryConfig.delay(attempt)
      return retryConfig?.delay ?? 1000
    }

    let lastResponse!: QueryResult<RequestResponse, Error>

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Если запрос отменён — бросаем ошибку (перехватывается в executeRequest)
      if (controller.signal.aborted) throw createAbortError()

      const mergedOptions: QueryOptions = { ...options, signal: controller.signal }
      lastResponse = await this.queryFunction<RequestResponse, RequestParams>(requestDefinition, mergedOptions, headers)

      // Успех или не-retryable статус — возвращаем сразу
      if (lastResponse.ok || !retryOn.includes(lastResponse.status) || attempt === maxAttempts - 1) {
        return lastResponse
      }

      // Ждём перед следующей попыткой
      const delay = getDelay(attempt)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay)
        // Если запрос отменили во время ожидания — прерываем delay
        controller.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            resolve()
          },
          { once: true },
        )
      })
    }

    return lastResponse
  }

  /**
   * Уведомляет подписчиков эндпоинта об изменении состояния
   */
  private notifyEndpointSubscribers(status: 'success' | 'error', error?: Error): void {
    const endpointState: EndpointState = {
      status,
      fetchCounts: this.fetchCounts,
      meta: this.meta,
      cacheableHeaders: this.cacheableHeaders,
      error,
    }
    this.endpointSubscribers.forEach((cb) => cb(endpointState))
  }

  /**
   * Синхронное чтение результата из кэша (fast-path для SSR-гидрации).
   *
   * Возвращает закэшированный результат БЕЗ сетевого запроса и без async-тика,
   * поэтому хук может отдать серверные данные уже на первом рендере (без вспышки
   * loading после гидрации). Работает только когда:
   *  - хранилище синхронное (Memory/LocalStorage);
   *  - у эндпоинта нет заголовков, влияющих на ключ кэша (`cacheableHeaders`) —
   *    иначе ключ нельзя воспроизвести синхронно (заголовки готовятся async);
   *  - кэширование для эндпоинта включено и запись не протухла.
   *
   * Во всех остальных случаях возвращает `undefined` — вызывающий откатывается
   * на обычный async-`request()`.
   */
  public getCachedSync(params: RequestParams, options?: QueryOptions): QueryResult<RequestResponse, Error> | undefined {
    // Ключ кэша зависит от заголовков, а они готовятся асинхронно — синхронно
    // воспроизвести ключ нельзя. Поддерживаем fast-path только без таких заголовков.
    if (this.cacheableHeaders.length > 0 || options?.cacheableHeaderKeys?.length) return undefined
    // options учитываются так же, как в request(): disableCache → кэш не читаем
    if (!this.queryStorage.shouldCache(this.configCurrentEndpoint, options, 'GET')) return undefined

    const requestDefinition = this.configCurrentEndpoint.request(params, options?.context)
    const [cacheKey] = this.queryStorage.createCacheKey(this.name, params, {}, this.getKeyDiscriminator(requestDefinition, options))
    const cached = this.queryStorage.getCachedResultSync<QueryResult<RequestResponse, Error>>(cacheKey)
    if (!cached) return undefined

    return restoreCachedResult(cached)
  }

  /**
   * Подписка на инвалидацию кэша, затрагивающую этот эндпоинт. Колбэк вызывается,
   * когда инвалидируется любой из тегов эндпоинта (`meta.tags`) — например, после
   * мутации соседнего эндпоинта с `invalidatesTags`. Используется хуком `useApiQuery`
   * для авто-рефетча (паритет с поведением React Query).
   */
  public onCacheInvalidate(listener: VoidFunction): Unsubscribe {
    return this.queryStorage.onCacheInvalidate((invalidatedTags) => {
      if (this.meta.tags.some((tag) => invalidatedTags.includes(tag))) {
        listener()
      }
    })
  }

  public subscribe(cb: (state: EndpointState) => void): Unsubscribe {
    this.endpointSubscribers.add(cb)

    const currentState: EndpointState = {
      status: 'idle',
      fetchCounts: this.fetchCounts,
      meta: this.meta,
      cacheableHeaders: this.cacheableHeaders,
      error: undefined,
    }

    cb(currentState)
    return () => this.endpointSubscribers.delete(cb)
  }

  public async reset() {
    this.fetchCounts = 0

    // Сбрасываем только СВОИ записи: инвалидация по тегам задела бы и другие эндпоинты с теми же тегами
    await this.queryStorage.invalidateEndpoint(this.name)
  }

  /**
   * Что, кроме параметров, определяет ответ: итоговый path (его может строить `options.context`)
   * и формат ответа. Без этого разные запросы с одинаковыми params делили бы запись кэша.
   */
  private getKeyDiscriminator(requestDefinition: { path: string; responseFormat?: string }, options?: QueryOptions): Record<string, string> {
    const format = options?.responseFormat ?? requestDefinition.responseFormat
    return format ? { path: requestDefinition.path, format } : { path: requestDefinition.path }
  }

  public destroy() {
    this.endpointSubscribers.clear()
    this.inflightRequests.clear()
  }
}
