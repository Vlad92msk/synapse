import { EndpointClass } from './components/endpoint'
import { QueryStorage } from './components/query-storage'
import { CreateApiClientOptions, ExtractParamsType, ExtractResultType } from './types/api.interface'
import { CreateEndpoint, Endpoint as EndpointType, EndpointConfig } from './types/endpoint.interface'
import { QueryOptions, QueryResult } from './types/query.interface'
import { apiLogger } from './utils/api-helpers'

// Тип для извлечения типов из функции endpoints
type EndpointsResult<F> = F extends (create: any) => Promise<infer R> ? R : never

// Тип для готовой карты эндпоинтов (без optional)
type EndpointsMap<EndpointsFn> = {
  [K in keyof EndpointsResult<EndpointsFn>]: EndpointType<ExtractParamsType<EndpointsResult<EndpointsFn>[K]>, ExtractResultType<EndpointsResult<EndpointsFn>[K]>>
}

export class ApiClient<EndpointsFn extends (create: CreateEndpoint) => Promise<Record<string, EndpointConfig<any, any>>>> {
  /** Хранилище запросов */
  private queryStorage!: QueryStorage

  /** Флаг завершённой инициализации */
  private _initialized = false

  /** Промис текущей инициализации (для дедупликации параллельных вызовов) */
  private _initPromise: Promise<this> | null = null

  private readonly cacheableHeaderKeys: CreateApiClientOptions['cacheableHeaderKeys']

  private readonly globalCacheConfig: CreateApiClientOptions['cache']

  private readonly baseQueryConfig: CreateApiClientOptions['baseQuery']

  private readonly storageExternal: CreateApiClientOptions['storage']

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
    this.storageExternal = options.storage
    this.createEndpoints = options.endpoints
  }

  public async init(): Promise<this> {
    if (this._initialized) return this
    if (this._initPromise) return this._initPromise

    this._initPromise = this._doInit()
    return this._initPromise
  }

  private async _doInit(): Promise<this> {
    try {
      // 1. Создаем кэшированное хранилище запросов (storage инициализируется внутри QueryStorage)
      this.queryStorage = await new QueryStorage(this.storageExternal, this.globalCacheConfig).initialize()

      // 2. Создаем эндпоинты
      await this.initializeEndpoints()

      this._initialized = true
      return this
    } catch (error) {
      this._initPromise = null
      throw error
    }
  }

  private async initializeEndpoints() {
    // Получаем конфигурацию будущих эндпоинтов
    const create: CreateEndpoint = <TParams extends Record<string, any>, TResult>(config: EndpointConfig<TParams, TResult>) => config
    // Создаем объект с конфигурациями для эндпоинтов
    const endpointsConfig = await this.createEndpoints(create)

    // Создаем эндпоинты
    for (const [endpointKey, endpointConfig] of Object.entries(endpointsConfig)) {
      const key = endpointKey as keyof EndpointsResult<EndpointsFn>
      this.endpoints[key] = new EndpointClass({
        name: endpointKey,
        queryStorage: this.queryStorage,
        config: endpointConfig,
        cacheableHeaderKeys: this.cacheableHeaderKeys,
        globalCacheConfig: this.globalCacheConfig,
        baseQueryConfig: this.baseQueryConfig,
      })
    }
  }

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('ApiClient не инициализирован. Вызовите await api.init() перед использованием.')
    }
  }

  /**
   * Получает все эндпоинты с улучшенной типизацией
   * @returns Типизированный объект эндпоинтов
   */
  public getEndpoints(): EndpointsMap<EndpointsFn> {
    this.ensureInitialized()
    return this.endpoints as EndpointsMap<EndpointsFn>
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
    this.ensureInitialized()

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
    if (!this._initialized) return

    // 1. Уничтожаем каждый эндпоинт
    Object.values(this.endpoints).forEach((endpoint) => endpoint.destroy())

    // 2. Очищаем коллекцию эндпоинтов
    this.endpoints = {}
    // 3. Уничтожаем хранилище
    await this.queryStorage.destroy()

    // 4. Сбрасываем состояние инициализации (позволяет повторный init)
    this._initialized = false
    this._initPromise = null
  }
}
