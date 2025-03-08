import { EndpointClass } from './components/endpoint'
import { QueryStorage } from './components/query-storage'
import { CreateApiClientOptions, ExtractParamsType, ExtractResultType } from './types/api.interface'
import { CreateEndpoint, Endpoint as EndpointType, EndpointConfig } from './types/endpoint.interface'
import { QueryOptions, QueryResult } from './types/query.interface'
import { apiLogger } from './utils/api-helpers'

// Тип для извлечения типов из функции endpoints
type EndpointsResult<F> = F extends (create: any) => Promise<infer R> ? R : never

export class ApiClient<EndpointsFn extends (create: CreateEndpoint) => Promise<Record<string, EndpointConfig<any, any>>>> {
  /** Хранилище запросов */
  // @ts-ignore
  private queryStorage: QueryStorage

  private readonly cacheableHeaderKeys: CreateApiClientOptions['cacheableHeaderKeys']

  private readonly globalCacheConfig: CreateApiClientOptions['cache']

  private readonly baseQueryConfig: CreateApiClientOptions['baseQuery']

  private readonly storageType: CreateApiClientOptions['storageType']

  private readonly storageOptions: CreateApiClientOptions['storageOptions']

  private readonly createEndpoints: EndpointsFn

  /** Реестр эндпоинтов */
  private endpoints: {
    [K in keyof EndpointsResult<EndpointsFn>]?: EndpointType<ExtractParamsType<EndpointsResult<EndpointsFn>[K]>, ExtractResultType<EndpointsResult<EndpointsFn>[K]>>
  } = {}

  constructor(options: Omit<CreateApiClientOptions, 'endpoints'> & { endpoints: EndpointsFn }) {
    // Сохраняем переданные параметры
    this.cacheableHeaderKeys = options.cacheableHeaderKeys
    this.globalCacheConfig = options.cache
    this.baseQueryConfig = options.baseQuery
    this.storageType = options.storageType
    this.storageOptions = options.storageOptions
    this.createEndpoints = options.endpoints
  }

  public async init(): Promise<this> {
    // 1. Создаем кэшированное хранилище запросов
    this.queryStorage = await new QueryStorage(this.storageType, this.storageOptions, this.globalCacheConfig).initialize()

    // 2. Создаем эндпоинты
    await this.initializeEndpoints()

    return this
  }

  private async initializeEndpoints() {
    // Получаем конфигурацию будущих эндпоинтов
    const create: CreateEndpoint = <TParams extends Record<string, any>, TResult>(config: EndpointConfig<TParams, TResult>) => config
    // Создаем объект с конфигурациями для эндпоинтов
    const endpointsConfig = (await this.createEndpoints(create)) || {}

    // Создаем эндпоинты
    for (const [endpointKey, endpointConfig] of Object.entries(endpointsConfig)) {
      const key = endpointKey as keyof EndpointsResult<EndpointsFn>
      this.endpoints[key] = new EndpointClass(endpointKey, this.queryStorage, endpointConfig, this.cacheableHeaderKeys, this.globalCacheConfig, this.baseQueryConfig)
    }
  }

  /**
   * Получает все эндпоинты с улучшенной типизацией
   * @returns Типизированный объект эндпоинтов
   */
  public getEndpoints(): {
    [K in keyof EndpointsResult<EndpointsFn>]: EndpointType<ExtractParamsType<EndpointsResult<EndpointsFn>[K]>, ExtractResultType<EndpointsResult<EndpointsFn>[K]>>
  } {
    return this.endpoints as any
  }

  /**
   * Выполняет запрос к API с типизацией и обработкой ошибок
   * @param endpointName Имя эндпоинта (с подсказками TypeScript)
   * @param params Параметры запроса (с типизацией)
   * @param options Опции запроса
   * @returns Promise с типизированным результатом запроса
   */
  public async request<K extends keyof EndpointsResult<EndpointsFn> & string>(
    endpointName: K,
    params: ExtractParamsType<EndpointsResult<EndpointsFn>[K]>,
    options?: QueryOptions,
  ): Promise<QueryResult<ExtractResultType<EndpointsResult<EndpointsFn>[K]>, Error>> {
    const endpoints = this.getEndpoints()
    const endpoint = endpoints[endpointName]

    if (!endpoint) {
      throw new Error(`Эндпоинт ${String(endpointName)} не найден`)
    }

    try {
      const stateRequest = endpoint.request(params, options)
      return await stateRequest.wait()
    } catch (error) {
      apiLogger.error(`Ошибка запроса к ${String(endpointName)}`, { error, params })
      throw error
    }
  }

  public async destroy() {
    // 1. Сначала уничтожаем каждый эндпоинт
    await Promise.all(
      Object.values(this.endpoints).map(async (endpoint) => {
        endpoint.destroy()
        return Promise.resolve()
      }),
    )

    // 2. Очищаем коллекцию эндпоинтов
    this.endpoints = {}
    // 3. Уничтожаем хранилище
    await this.queryStorage.destroy()
  }
}
