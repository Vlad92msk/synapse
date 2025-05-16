export interface Selector<T, R> {
  (state: T): R
}

export interface SelectorOptions<T> {
  equals?: (a: T, b: T) => boolean
  name?: string
}

export interface Subscriber<T> {
  notify: (value: T) => void | Promise<void>
}

export interface SelectorAPI<T> {
  select: () => Promise<T>
  subscribe: (subscriber: Subscriber<T>) => VoidFunction
}

/**
 * Интерфейс для модуля селекторов
 * Определяет контракт для работы с селекторами, который должен реализовывать SelectorModule
 */
export interface ISelectorModule<TStore extends Record<string, any>> {
  /**
   * Имя связанного хранилища
   */
  readonly storageName: string

  /**
   * Создает простой селектор на основе функции выбора
   *
   * @param selector Функция, извлекающая данные из состояния
   * @param options Опции селектора
   * @returns API селектора
   *
   * @example
   * const isActive = selectorModule.createSelector(
   *   (state) => state.user.isActive
   * );
   */
  createSelector<T>(selector: Selector<TStore, T>, options?: SelectorOptions<T>): SelectorAPI<T>

  /**
   * Создает комбинированный селектор на основе других селекторов
   *
   * @param dependencies Массив селекторов, от которых зависит новый селектор
   * @param resultFn Функция, комбинирующая результаты зависимостей
   * @param options Опции селектора
   * @returns API селектора
   *
   * @example
   * const userWithStatus = selectorModule.createSelector(
   *   [userSelector, statusSelector],
   *   (user, status) => ({ ...user, status })
   * );
   */
  createSelector<Deps extends unknown[], T>(dependencies: { [K in keyof Deps]: SelectorAPI<Deps[K]> }, resultFn: (...args: Deps) => T, options?: SelectorOptions<T>): SelectorAPI<T>

  /**
   * Освобождает ресурсы, связанные с модулем селекторов
   */
  destroy(): void
}

/**
 * Интерфейс для фабрики селекторов
 * Позволяет создавать набор связанных селекторов
 */
export interface ISelectorCreator<TStore extends Record<string, any>, TSelectors, TExternalSelectors = Record<string, any>> {
  /**
   * Создает набор селекторов
   *
   * @param selectorModule Модуль селекторов
   * @param externalSelectors Внешние селекторы (опционально)
   * @returns Объект с селекторами
   *
   * @example
   * const createUserSelectors: ISelectorCreator<UserStore, UserSelectors> =
   *   (selectorModule, externalSelectors) => {
   *     const isActive = selectorModule.createSelector(
   *       (state) => state.user.isActive
   *     );
   *
   *     return { isActive };
   *   };
   */
  (selectorModule: ISelectorModule<TStore>, externalSelectors?: TExternalSelectors): TSelectors
}

/**
 * Тип для функции, создающей селекторы
 * Более простая версия ISelectorCreator, если не нужен полный интерфейс
 */
export type SelectorCreatorFunction<TStore extends Record<string, any> = Record<string, any>, TSelectors = any, TExternalSelectors = Record<string, any>> = (
  selectorModule: ISelectorModule<TStore>,
  externalSelectors?: TExternalSelectors,
) => TSelectors
