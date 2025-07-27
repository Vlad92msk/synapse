/**
 * @example
 * ```typescript
 * // Строгая проверка - выбросит ошибку при любых различиях
 * const storage1 = new MemoryStorage({
 *   name: 'user',
 *   singleton: {
 *     enabled: true,
 *     mergeStrategy: ConfigMergeStrategy.STRICT
 *   },
 *   initialState: { name: 'John' }
 * })
 *
 * // Глубокое слияние - объединит объекты
 * const storage2 = new MemoryStorage({
 *   name: 'settings',
 *   singleton: {
 *     enabled: true,
 *     mergeStrategy: ConfigMergeStrategy.DEEP_MERGE
 *   },
 *   initialState: { theme: 'dark', notifications: { email: true } }
 * })
 * ```
 */
export enum ConfigMergeStrategy {
  /**
   * Строгая проверка - выбрасывает ошибку при любых отличиях в конфигурации
   *
   * Используйте когда требуется абсолютная идентичность конфигураций
   * для обеспечения предсказуемого поведения
   */
  STRICT = 'strict',

  /**
   * Первая конфигурация побеждает - игнорирует последующие конфигурации
   *
   * **По умолчанию**. Безопасная стратегия, которая использует настройки
   * первого созданного экземпляра и игнорирует все последующие
   */
  FIRST_WINS = 'first_wins',

  /**
   * Глубокое слияние объектов - рекурсивно объединяет initialState
   *
   * Полезно когда разные компоненты должны дополнять начальное состояние.
   * Примитивные значения из первой конфигурации сохраняются
   */
  DEEP_MERGE = 'deep_merge',

  /**
   * Последняя конфигурация перезаписывает предыдущие (кроме name)
   *
   * **Осторожно!** Может привести к непредсказуемому поведению,
   * так как результат зависит от порядка создания компонентов
   */
  OVERRIDE = 'override',

  /**
   * Предупреждение в консоли + использование первой конфигурации
   *
   * Как FIRST_WINS, но с подробными предупреждениями в консоли
   * о конфликтующих настройках. Полезно для отладки
   */
  WARN_AND_USE_FIRST = 'warn_and_use_first',
}

/**
 * Позволяет переиспользовать экземпляры хранилищ между компонентами
 * по имени, что особенно полезно в React при частых ре-рендерах
 *
 * @example
 * ```typescript
 * // Базовое использование
 * const storage = new MemoryStorage({
 *   name: 'user-preferences',
 *   singleton: { enabled: true },
 *   initialState: { theme: 'light' }
 * })
 *
 * // Продвинутые настройки
 * const storage = new MemoryStorage({
 *   name: 'shared-state',
 *   singleton: {
 *     enabled: true,
 *     mergeStrategy: ConfigMergeStrategy.DEEP_MERGE,
 *     warnOnConflict: true,
 *     key: 'custom-singleton-key'
 *   },
 *   initialState: { user: null, settings: {} }
 * })
 * ```
 *
 * @see {@link ConfigMergeStrategy} для стратегий разрешения конфликтов
 */
export interface SingletonOptions {
  /**
   * Включить Singleton Pattern для данного хранилища
   *
   * При `true` хранилища с одинаковым именем (или ключом) будут
   * возвращать один и тот же экземпляр вместо создания нового
   *
   * @default false
   */
  enabled: boolean

  /**
   * Стратегия разрешения конфликтов при различающихся конфигурациях
   *
   * Определяет как поступать, когда singleton с тем же именем
   * создается с отличающимися параметрами (initialState, middlewares и т.д.)
   *
   * @default ConfigMergeStrategy.FIRST_WINS
   * @see {@link ConfigMergeStrategy}
   */
  mergeStrategy?: ConfigMergeStrategy

  /**
   * Выводить предупреждения при обнаружении конфликтов конфигурации
   *
   * При `true` будет логировать в консоль информацию о различиях
   * в конфигурациях между экземплярами singleton (кроме стратегии STRICT)
   *
   * @default true
   */
  warnOnConflict?: boolean

  /**
   * Кастомный ключ для идентификации singleton экземпляра
   *
   * По умолчанию используется комбинация `{StorageType}_{name}`,
   * но можно задать собственный ключ для более тонкого контроля
   *
   * @example
   * ```typescript
   * // Разные хранилища с одним именем, но разными ключами
   * const userCache = new MemoryStorage({
   *   name: 'user',
   *   singleton: { enabled: true, key: 'user-cache' }
   * })
   *
   * const userSettings = new LocalStorage({
   *   name: 'user', // То же имя!
   *   singleton: { enabled: true, key: 'user-settings' } // Но разный ключ
   * })
   * ```
   *
   * @default `${StorageType}_${name}`
   */
  key?: string
}
