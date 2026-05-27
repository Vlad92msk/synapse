import { CreateApiClientOptions, RetryConfig } from '../types/api.interface'
import { Endpoint as EndpointType, EndpointConfig, EndpointState, RequestResponseModify, RequestState } from '../types/endpoint.interface'
import { QueryOptions, QueryResult, Unsubscribe } from '../types/query.interface'
import { createUniqueId, headersToObject } from '../utils/api-helpers'
import { createHeaderContext } from '../utils/create-header-context'
import { createPrepareHeaders, prepareRequestHeaders } from '../utils/endpoint-headers'
import { fetchBaseQuery } from '../utils/fetch-base-query'
import { getCacheableHeaders } from '../utils/get-cacheable-headers'
import { QueryStorage } from './query-storage'

/** HTTP-статусы, при которых делать retry по умолчанию */
const DEFAULT_RETRY_ON = [0, 408, 429, 500, 502, 503, 504]

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
  private readonly endpointSubscribers = new Set<(state: EndpointState) => void>()

  /** Сколько раз был вызван метод request */
  fetchCounts: number = 0

  meta: EndpointType['meta'] = {
    cache: false,
    invalidatesTags: [],
    name: '',
    tags: [],
  }

  private readonly name: string
  private readonly queryStorage: QueryStorage
  private readonly configCurrentEndpoint: EndpointConfig<RequestParams, RequestResponse>
  private readonly cacheableHeaderKeys: CreateApiClientOptions['cacheableHeaderKeys']
  private readonly globalRetryConfig: CreateApiClientOptions['retry']
  private readonly baseQueryConfig: CreateApiClientOptions['baseQuery']

  private readonly queryFunction: ReturnType<typeof fetchBaseQuery>

  /** Массив заголовков, которые нужно включить в ключ кэширования */
  private readonly cacheableHeaders: string[]

  private readonly prepareHeaders: ReturnType<typeof createPrepareHeaders>

  /** Карта in-flight запросов для дедупликации (cacheKey → Promise) */
  private readonly inflightRequests = new Map<string, Promise<QueryResult<RequestResponse, Error>>>()

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
    if (options?.signal) {
      if (options.signal.aborted) {
        controller.abort()
      } else {
        options.signal.addEventListener('abort', () => controller.abort(), { once: true })
      }
    }

    // 2. Функция нотификации подписчиков запроса
    const notifyRequestSubscribers = (newState: Partial<RequestState<RequestResponse, RequestParams>>) => {
      Object.assign(currentState, newState)
      requestSubscribers.forEach((cb) => cb({ ...currentState }))
    }

    // 3. Запускаем выполнение запроса
    const waitPromise = this.executeRequest(params, options, controller, notifyRequestSubscribers)

    // 4. Возвращаем объект с методами управления запросом
    return {
      id: requestId,

      subscribe(listener, subscribeOptions = {}) {
        const { autoUnsubscribe = true } = subscribeOptions
        requestSubscribers.add(listener)
        listener(currentState)

        const unsubscribe = () => requestSubscribers.delete(listener)

        if (autoUnsubscribe) {
          waitPromise.finally(() => unsubscribe())
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
  private resolveRetryConfig(options?: QueryOptions): RetryConfig | undefined {
    return options?.retry ?? this.configCurrentEndpoint.retry ?? this.globalRetryConfig
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
      // 1. Формируем заголовки
      const headers = await prepareRequestHeaders(this.prepareHeaders, headerContext)
      const headersForCache = getCacheableHeaders(headers, options?.cacheableHeaderKeys ? options.cacheableHeaderKeys : this.cacheableHeaders)

      // 2. Формируем requestDefinition для определения метода
      const requestDefinition = this.configCurrentEndpoint.request(params, options?.context)

      // 3. Проверяем кэширование (с учётом HTTP-метода)
      const shouldCache = this.queryStorage.shouldCache(this.configCurrentEndpoint, options, requestDefinition.method)
      const [cacheKey, cacheParams] = this.queryStorage.createCacheKey(this.name, { ...params, ...headersForCache })
      const cacheKeyStr = String(cacheKey)

      // 4. Проверяем кэш
      if (shouldCache) {
        const cachedResult = await this.queryStorage.getCachedResult<QueryResult<RequestResponse>>(cacheKey)
        if (cachedResult) {
          notify({
            fromCache: true,
            status: 'success',
            data: cachedResult.data,
            error: undefined,
            headers: cachedResult.headers,
            requestParams: params,
          })
          return { ...cachedResult, fromCache: true }
        }
      }

      // 5. Дедупликация: если запрос с таким же ключом уже летит — ждём его
      if (shouldCache && this.inflightRequests.has(cacheKeyStr)) {
        notify({ fromCache: false, status: 'loading' })
        const result = await this.inflightRequests.get(cacheKeyStr)!
        if (!result.ok) {
          notify({
            fromCache: true,
            status: 'error',
            data: undefined,
            error: result.error,
            headers: result.headers,
            requestParams: params,
          })
          return { ...result, fromCache: true }
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

      const retryConfig = this.resolveRetryConfig(options)
      const fetchPromise = this.executeFetch(requestDefinition, options, controller, headers, retryConfig, shouldCache, cacheKey, cacheParams ?? {})

      // Регистрируем в inflight для дедупликации (только для кэшируемых)
      if (shouldCache) {
        this.inflightRequests.set(cacheKeyStr, fetchPromise)
        fetchPromise.finally(() => this.inflightRequests.delete(cacheKeyStr)).catch(() => {})
      }

      const response = await fetchPromise

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
        // invalidateOnError: инвалидируем кэш при ошибке если включено
        if (shouldCache) {
          const cacheConfig = this.queryStorage.createCacheConfig(this.configCurrentEndpoint)
          if (cacheConfig.invalidateOnError !== false) {
            await this.queryStorage.invalidateCache(cacheKey)
          }
        }

        notify({
          fromCache: false,
          status: 'error',
          data: undefined,
          error: response.error,
          headers: response.headers,
          requestParams: params,
        })
        this.notifyEndpointSubscribers('error', response.error)
        throw response.error
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
  ): Promise<QueryResult<RequestResponse, Error>> {
    // Выполняем HTTP-запрос (с retry если настроен)
    const response = await this.fetchWithRetry(requestDefinition, options, controller, headers, retryConfig)

    // Post-processing при успешном ответе
    if (response.ok) {
      const { headers: responseHeaders, ...restResponse } = response

      // Инвалидируем кэш по тегам
      if (this.configCurrentEndpoint.invalidatesTags?.length) {
        await this.queryStorage.invalidateCacheByTags(this.configCurrentEndpoint.invalidatesTags)
      }

      // Сохраняем в кэш
      if (shouldCache) {
        const currentCacheConfig = this.queryStorage.createCacheConfig(this.configCurrentEndpoint)
        await this.queryStorage.setCachedResult(
          cacheKey,
          { ...restResponse, headers: headersToObject(responseHeaders) },
          currentCacheConfig,
          cacheParams,
          this.configCurrentEndpoint.tags ?? [],
        )
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
      if (controller.signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError')

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
        controller.signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
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

    // Инвалидируем кэш по тегам эндпоинта
    if (this.meta.tags.length) {
      await this.queryStorage.invalidateCacheByTags(this.meta.tags)
    }
  }

  public destroy() {
    this.endpointSubscribers.clear()
    this.inflightRequests.clear()
  }
}
