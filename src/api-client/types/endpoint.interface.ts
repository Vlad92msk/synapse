import { ApiContext, CacheConfig, RequestDefinition } from './api.interface'
import { QueryOptions, QueryResult, Unsubscribe } from './query.interface'

/**
 * Конфигурация эндпоинта
 */
export interface EndpointConfig<RequestParams extends Record<string, any> = any, RequestResult = any> {
  /** Функция для создания определения запроса из параметров */
  request: (params: RequestParams, context?: Record<string, any>) => RequestDefinition<RequestParams>
  /** Настройки кэша для эндпоинта */
  cache?: CacheConfig
  /** Теги эндпоинта для группировки в кэше */
  tags?: string[]
  /** Теги, которые инвалидируются при успешном запросе */
  invalidatesTags?: string[]
  /** Функция для подготовки заголовков (дополняет глобальную) */
  prepareHeaders?: (headers: Headers, context: ApiContext<RequestParams>) => Promise<Headers>
  /** Добавить ключи заголовков, влияющие на кэш (Дополняет глобавльные ключи) */
  includeCacheableHeaderKeys?: string[]
  /** Исключить ключи заголовков, влияющие на кэш (Дополняет глобавльные ключи) */
  excludeCacheableHeaderKeys?: string[]
}

/**
 * Состояние эндпоинта
 * Содержит информацию о текущем состоянии запроса и данные
 */
export interface EndpointState {
  /** Статус запроса */
  status: 'idle' | 'loading' | 'success' | 'error'
  /** Ошибка (при неуспешном запросе) */
  error?: Error
  /** Количество вызовов */
  fetchCounts: number
  /** Метаданные эндпоинта */
  meta: Endpoint['meta']
  /** Какие заголовки участвовали в формировании ключа кэша (итоговые) */
  cacheableHeaders: string[]
}

/**
 * Состояние самого запроса
 */
export interface RequestState<ResponseData = any, RequestParams extends Record<string, any> = any, E = Error> {
  status: 'loading' | 'success' | 'error' | 'idle'
  data?: ResponseData
  error?: E
  headers: Record<string, any> | Headers
  requestParams: RequestParams
  fromCache: boolean
}

export interface SubscribeOptions {
  /** Автоматически отписаться после завершения запроса */
  autoUnsubscribe?: boolean
}

/**
 * Дополнительные методы для request
 */
export interface RequestResponseModify<T, P extends Record<string, any> = any> {
  id: string

  /**
   * Подписка на изменения состояния запроса
   */
  subscribe: (listener: (state: RequestState<T, P>) => void, options?: SubscribeOptions) => VoidFunction

  /**
   * Ожидание завершения запроса
   * @returns Promise с результатом запроса
   */
  wait: () => Promise<QueryResult<T, Error>>

  waitWithCallbacks: (handlers: {
    idle?: (request: RequestState<T, P>) => void
    loading?: (request: RequestState<T, P>) => void
    success?: (data: T | undefined, request: RequestState<T, P>) => void
    error?: (error: Error | undefined, request: RequestState<T, P>) => void
  }) => Promise<QueryResult<T, Error>>

  /**
   * Отменить запрос
   */
  abort: VoidFunction

  // Promise API для поддержки await и .then()
  then<TResult1 = QueryResult<T, Error>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T, Error>) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: Error) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): Promise<TResult1 | TResult2>

  catch<TResult = never>(onrejected?: ((reason: Error) => TResult | PromiseLike<TResult>) | undefined | null): Promise<QueryResult<T, Error> | TResult>

  finally(onfinally?: VoidFunction | undefined | null): Promise<QueryResult<T, Error>>
}

/**
 * Структура эндпоинта
 *
 * Эндпоинт - это всего лишь определение того6 как будет вызван метод
 * Эндпоинт может быть вызван в разных частях приложения с разными параметрами
 * По этому нет смысла хранить ответы так как они будут перезаписываться
 * метод subscribe больше нужен для мониторинга
 * meta - метаинформация по эндпоинту (то как он сконфигурирован)
 */
export interface Endpoint<RequestParams extends Record<string, any> = any, ResponseData = any> {
  /** Счетчик вызова конкретного эндпоинта в проекте */
  fetchCounts: number
  /** Выполнить запрос с параметрами */
  request: (params: RequestParams, options?: QueryOptions) => RequestResponseModify<ResponseData>
  /** Подписаться на изменения состояния эндпоинта (в основном для сбора статистики) */
  subscribe: (callback: (state: EndpointState) => void) => Unsubscribe
  /** Сбросить состояние */
  reset: () => Promise<void>
  /** Метаданные эндпоинта */
  meta: {
    /** Имя эндпоинта */
    name: string
    /** Теги эндпоинта */
    tags: string[]
    /** Теги, которые инвалидируются */
    invalidatesTags: string[]
    /** Настройки кэша */
    cache: CacheConfig
  }
  destroy: VoidFunction
}

/**
 * Функция для создания типизированных эндпоинтов
 */
export type CreateEndpoint = <RequestParams extends Record<string, any>, RequestResult>(
  config: EndpointConfig<RequestParams, RequestResult>,
) => EndpointConfig<RequestParams, RequestResult>
