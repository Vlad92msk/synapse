import { ApiContext } from '../types/api.interface'
import { createHeaderContext } from './create-header-context'

/**
 * Тип функции для подготовки заголовков запроса
 */
export type PrepareHeadersFunction = (headers: Headers, context: ApiContext<any>) => Promise<Headers>

/**
 * Подготавливает заголовки для запроса на основе контекста и пользовательских функций
 *
 * @param prepareHeadersFn - функция подготовки заголовков
 * @param context - контекст запроса
 * @returns - подготовленные заголовки
 */
export async function prepareRequestHeaders<RequestParams extends Record<string, any>>(
  prepareHeadersFn?: PrepareHeadersFunction,
  context?: ApiContext<RequestParams>,
): Promise<Headers> {
  // Создаем заголовки
  let headers = new Headers()

  // Создаем контекст, если он не передан
  const headerContext = context || createHeaderContext({} as ApiContext<RequestParams>, {})

  // Применяем функцию подготовки заголовков, если она определена. Ошибку НЕ глотаем:
  // запрос без заголовков авторизации хуже упавшего — его валит вызывающий (Endpoint → ApiError)
  if (prepareHeadersFn) {
    headers = await Promise.resolve(prepareHeadersFn(headers, headerContext))
  }

  return headers
}

/**
 * Создает комбинированную функцию для подготовки заголовков, объединяющую
 * глобальные заголовки и заголовки эндпоинта
 *
 * @param globalPrepareHeaders - функция подготовки заголовков на глобальном уровне
 * @param endpointPrepareHeaders - функция подготовки заголовков на уровне эндпоинта
 * @returns - функция для подготовки заголовков
 */
export function createPrepareHeaders(globalPrepareHeaders?: PrepareHeadersFunction, endpointPrepareHeaders?: PrepareHeadersFunction): PrepareHeadersFunction {
  return async (headers: Headers, context: ApiContext<any>): Promise<Headers> => {
    let processedHeaders = new Headers(headers)

    // Применяем глобальную функцию подготовки заголовков, если она определена
    // Ошибки пробрасываются (см. prepareRequestHeaders)
    if (globalPrepareHeaders) {
      processedHeaders = await Promise.resolve(globalPrepareHeaders(processedHeaders, context))
    }

    // Применяем функцию подготовки заголовков эндпоинта, если она определена
    if (endpointPrepareHeaders) {
      processedHeaders = await Promise.resolve(endpointPrepareHeaders(processedHeaders, context))
    }

    return processedHeaders
  }
}

/**
 * Накладывает заголовки `source` поверх `target` (перезаписывая одноимённые).
 * Используется для заголовков эндпоинта (`RequestDefinition.headers`) и вызова (`QueryOptions.headers`)
 * поверх результата `prepareHeaders`.
 */
export function mergeHeaders(target: Headers, source?: HeadersInit): Headers {
  if (!source) return target
  new Headers(source).forEach((value, key) => target.set(key, value))
  return target
}
