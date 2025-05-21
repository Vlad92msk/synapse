import { CreateApiClientOptions } from '../types/api.interface'
import { Endpoint as EndpointType, EndpointConfig, EndpointState, RequestResponseModify, RequestState } from '../types/endpoint.interface'
import { QueryOptions, QueryResult, Unsubscribe } from '../types/query.interface'
import { createUniqueId, headersToObject } from '../utils/api-helpers'
import { createHeaderContext } from '../utils/create-header-context'
import { createPrepareHeaders, prepareRequestHeaders } from '../utils/endpoint-headers'
import { fetchBaseQuery } from '../utils/fetch-base-query'
import { getCacheableHeaders } from '../utils/get-cacheable-headers'
import { QueryStorage } from './query-storage'

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

  private readonly queryFunction: ReturnType<typeof fetchBaseQuery>

  /** Массив заголовков, которые нужно включить в ключ кэширования */
  private readonly cacheableHeaders: string[]

  private readonly prepareHeaders: ReturnType<typeof createPrepareHeaders>

  constructor(
    private readonly name: string,
    private readonly queryStorage: QueryStorage,
    private readonly configCurrentEndpoint: EndpointConfig<RequestParams, RequestResponse>,
    private readonly cacheableHeaderKeys: CreateApiClientOptions['cacheableHeaderKeys'],
    private readonly globalCacheConfig: CreateApiClientOptions['cache'],
    private readonly baseQueryConfig: CreateApiClientOptions['baseQuery'],
  ) {
    // 1. Создаем функцию подготовки заголовков
    this.prepareHeaders = createPrepareHeaders(baseQueryConfig.prepareHeaders, configCurrentEndpoint.prepareHeaders)
    // 2. Создаем функцию исполнения запроса
    this.queryFunction = fetchBaseQuery({
      baseUrl: baseQueryConfig.baseUrl,
      fetchFn: baseQueryConfig.fetchFn,
      timeout: baseQueryConfig.timeout,
      credentials: baseQueryConfig.credentials,
    })
    // 3. Создаем массив тех заголовков, которые нужно включить в ключ кэширования
    this.cacheableHeaders = [...(cacheableHeaderKeys || []), ...(configCurrentEndpoint.includeCacheableHeaderKeys || [])].filter(
      (key) => !configCurrentEndpoint.excludeCacheableHeaderKeys?.includes(key),
    )
    // 4. Сохраняем информацию в meta
    this.meta.name = name
    this.meta.tags = configCurrentEndpoint.tags ?? this.meta.tags
    this.meta.invalidatesTags = configCurrentEndpoint.invalidatesTags ?? this.meta.invalidatesTags
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
    const headerContext = createHeaderContext({ requestParams: params }, options?.context || {})

    // 2. Создаем функции для управления состоянием
    const notifyRequestSubscribers = (newState: Partial<RequestState<RequestResponse, RequestParams>>) => {
      Object.assign(currentState, newState)
      requestSubscribers.forEach((cb) => {
        cb({ ...currentState })
      })
    }

    // 3. Создаем промис для метода wait()
    const waitPromise = new Promise<QueryResult<RequestResponse, Error>>(async (resolve, reject) => {
      try {
        // Формируем заголовки
        const headers = await prepareRequestHeaders(this.prepareHeaders, headerContext)
        // Получаем заголовки для кэширования
        const headersForCache = getCacheableHeaders(headers, options?.cacheableHeaderKeys ? options.cacheableHeaderKeys : this.cacheableHeaders)
        // Проверяем включено ли кэширование
        const shouldCache = this.queryStorage.shouldCache(this.configCurrentEndpoint, options)
        // Формируем ключ кэша
        const [cacheKey, cacheParams] = this.queryStorage.createCacheKey(this.name, { ...params, ...headersForCache })

        // 4. Проверяем кэш до установки loading
        let cachedResult: QueryResult<RequestResponse> | undefined
        if (shouldCache) {
          cachedResult = await this.queryStorage.getCachedResult<QueryResult<RequestResponse> | undefined>(cacheKey)
        }

        if (cachedResult) {
          // Есть данные в кэше - сразу переходим к success
          notifyRequestSubscribers({
            fromCache: true,
            status: 'success',
            data: cachedResult.data,
            error: undefined,
            headers: cachedResult.headers,
            requestParams: params,
          })
          resolve({
            ...cachedResult,
            fromCache: true,
          })
        } else {
          // Нет данных в кэше - устанавливаем loading и делаем запрос
          notifyRequestSubscribers({
            fromCache: false,
            status: 'loading',
          })

          // 5. Выполняем запрос
          const requestDefinition = this.configCurrentEndpoint.request(params, options?.context)
          const mergedOptions: QueryOptions = { ...options, signal: controller.signal }

          const response = await this.queryFunction<RequestResponse, RequestParams>(requestDefinition, mergedOptions, headers)

          // 6. Обрабатываем результат запроса
          if (response.ok) {
            const { headers, ...restResponse } = response
            // Сохраняем в кэш, если нужно
            if (shouldCache) {
              const currentCacheConfig = this.queryStorage.createCacheConfig(this.configCurrentEndpoint)
              await this.queryStorage.setCachedResult(
                cacheKey,
                { ...restResponse, headers: headersToObject(headers) },
                currentCacheConfig,
                cacheParams ?? {},
                this.configCurrentEndpoint.tags ?? [],
                this.configCurrentEndpoint.invalidatesTags ?? [],
              )
            }

            // Оповещаем о success
            notifyRequestSubscribers({
              fromCache: false,
              status: 'success',
              data: response.data,
              error: undefined,
              headers: response.headers,
              requestParams: params,
            })

            // Уведомляем подписчиков эндпоинта
            this.endpointSubscribers.forEach((cb) => {
              const endpointState: EndpointState = {
                status: 'success',
                fetchCounts: this.fetchCounts,
                meta: this.meta,
                cacheableHeaders: this.cacheableHeaders,
                error: undefined,
              }
              cb(endpointState)
            })
            resolve({
              ...response,
              fromCache: false,
            })
          } else {
            // Оповещаем об ошибке
            notifyRequestSubscribers({
              fromCache: false,
              status: 'error',
              data: undefined,
              error: response.error,
              headers: response.headers,
              requestParams: params,
            })

            // Уведомляем подписчиков эндпоинта
            this.endpointSubscribers.forEach((cb) => {
              const endpointState: EndpointState = {
                status: 'error',
                fetchCounts: this.fetchCounts,
                meta: this.meta,
                cacheableHeaders: this.cacheableHeaders,
                error: response.error,
              }
              cb(endpointState)
            })

            reject(response.error)
          }
        }
      } catch (error) {
        // Обрабатываем неожиданные ошибки
        notifyRequestSubscribers({
          fromCache: false,
          status: 'error',
          data: undefined,
          error: error as Error,
          headers: undefined,
          requestParams: params,
        })
        reject(error)
      }
    })

    // 4. Возвращаем объект с методами управления запросом
    return {
      id: requestId,

      subscribe(listener, options = {}) {
        const { autoUnsubscribe = true } = options
        requestSubscribers.add(listener)
        listener(currentState)

        const unsubscribe = () => requestSubscribers.delete(listener)

        if (autoUnsubscribe) {
          waitPromise.finally(() => {
            unsubscribe()
          })
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
        if (controller && !controller.signal.aborted) {
          controller.abort()
        }
      },

      then: (onfulfilled, onrejected) => waitPromise.then(onfulfilled, onrejected),
      catch: (onrejected) => waitPromise.catch(onrejected),
      finally: (onfinally) => waitPromise.finally(onfinally),
    }
  }

  public subscribe(cb: (state: EndpointState) => void): Unsubscribe {
    this.endpointSubscribers.add(cb)

    // Создаем объект с текущей статистикой, соответствующий интерфейсу EndpointState
    const currentState: EndpointState = {
      status: 'idle',
      fetchCounts: this.fetchCounts,
      meta: this.meta,
      cacheableHeaders: this.cacheableHeaders,
      error: undefined,
    }

    // Вызываем callback с текущим состоянием
    cb(currentState)

    // Возвращаем функцию отписки
    return () => this.endpointSubscribers.delete(cb)
  }

  public reset() {
    this.fetchCounts = 0
    return Promise.resolve()
  }

  public destroy() {
    this.endpointSubscribers.clear()
  }
}
