import { StorageKeyType } from '../../utils/storage-key'

/**
 * Контекст выполнения для плагинов
 * Содержит информацию о текущей операции и хранилище
 */
export interface PluginContext {
  /** Имя хранилища, к которому применяется плагин */
  storageName: string

  /** Временная метка выполнения операции (timestamp) */
  timestamp: number

  /** Дополнительные метаданные операции (могут быть предоставлены хранилищем или другими плагинами) */
  metadata?: Record<string, any>
}

/**
 * Базовый интерфейс для всех плагинов
 * Определяет основные свойства и методы жизненного цикла
 */
export interface IPlugin {
  /** Уникальное имя плагина */
  name: string

  /**
   * Метод инициализации плагина
   * Вызывается при добавлении плагина в хранилище или при инициализации хранилища
   */
  initialize?(): Promise<void>

  /**
   * Метод уничтожения плагина
   * Вызывается при удалении плагина из хранилища или при уничтожении хранилища
   * Используется для освобождения ресурсов и очистки состояния
   */
  destroy?(): Promise<void>
}

/**
 * Интерфейс плагина для хранилища данных
 * Определяет хуки для различных операций хранилища
 */
export interface IStoragePlugin extends IPlugin {
  /**
   * Вызывается перед установкой значения в хранилище
   * Позволяет изменить значение до его сохранения
   *
   * @param value Значение, которое будет сохранено
   * @param context Контекст выполнения операции
   * @returns Модифицированное значение для сохранения
   */
  onBeforeSet?<T>(value: T, context: PluginContext): Promise<T>

  /**
   * Вызывается после установки значения в хранилище
   * Позволяет выполнить дополнительные действия или модифицировать результат
   *
   * @param key Ключ, по которому было сохранено значение
   * @param value Сохраненное значение
   * @param context Контекст выполнения операции
   * @returns Финальное значение (может быть модифицировано)
   */
  onAfterSet?<T>(key: StorageKeyType, value: T, context: PluginContext): Promise<T>

  /**
   * Вызывается перед получением значения из хранилища
   * Позволяет модифицировать запрашиваемый ключ
   *
   * @param key Ключ, по которому запрашивается значение
   * @param context Контекст выполнения операции
   * @returns Возможно модифицированный ключ для запроса
   */
  onBeforeGet?(key: StorageKeyType, context: PluginContext): Promise<StorageKeyType>

  /**
   * Вызывается после получения значения из хранилища
   * Позволяет модифицировать полученное значение
   *
   * @param key Ключ, по которому было запрошено значение
   * @param value Полученное значение (undefined, если значение не найдено)
   * @param context Контекст выполнения операции
   * @returns Финальное значение (может быть модифицировано)
   */
  onAfterGet?<T>(key: StorageKeyType, value: T | undefined, context: PluginContext): Promise<T | undefined>

  /**
   * Вызывается перед удалением значения из хранилища
   * Позволяет разрешить или запретить удаление
   *
   * @param key Ключ, по которому будет удалено значение
   * @param context Контекст выполнения операции
   * @returns Булево значение, разрешающее (true) или запрещающее (false) удаление
   */
  onBeforeDelete?(key: StorageKeyType, context: PluginContext): Promise<boolean>

  /**
   * Вызывается после удаления значения из хранилища
   * Позволяет выполнить дополнительные действия после удаления
   *
   * @param key Ключ, по которому было удалено значение
   * @param context Контекст выполнения операции
   */
  onAfterDelete?(key: StorageKeyType, context: PluginContext): Promise<void>

  /**
   * Вызывается перед очисткой хранилища
   * Позволяет выполнить дополнительные действия перед удалением всех данных
   *
   * @param context Контекст выполнения операции
   */
  onClear?(context: PluginContext): Promise<void>
}

/**
 * Исполнитель плагинов
 * Отвечает за выполнение хуков плагинов в определенной последовательности
 */
export interface IPluginExecutor {
  /**
   * Выполняет хуки onBeforeSet всех зарегистрированных плагинов
   *
   * @param value Исходное значение
   * @param metadata Дополнительные метаданные
   * @returns Модифицированное значение после прохождения всех плагинов
   */
  executeBeforeSet<T>(value: T, metadata?: Record<string, any>): Promise<T>

  /**
   * Выполняет хуки onAfterSet всех зарегистрированных плагинов
   *
   * @param key Ключ, по которому было сохранено значение
   * @param value Сохраненное значение
   * @param metadata Дополнительные метаданные
   * @returns Финальное значение после прохождения всех плагинов
   */
  executeAfterSet<T>(key: StorageKeyType, value: T, metadata?: Record<string, any>): Promise<T>

  /**
   * Выполняет хуки onBeforeGet всех зарегистрированных плагинов
   *
   * @param key Исходный ключ
   * @param metadata Дополнительные метаданные
   * @returns Модифицированный ключ после прохождения всех плагинов
   */
  executeBeforeGet(key: StorageKeyType, metadata?: Record<string, any>): Promise<StorageKeyType>

  /**
   * Выполняет хуки onAfterGet всех зарегистрированных плагинов
   *
   * @param key Ключ, по которому было запрошено значение
   * @param value Полученное значение
   * @param metadata Дополнительные метаданные
   * @returns Финальное значение после прохождения всех плагинов
   */
  executeAfterGet<T>(key: StorageKeyType, value: T | undefined, metadata?: Record<string, any>): Promise<T | undefined>

  /**
   * Выполняет хуки onBeforeDelete всех зарегистрированных плагинов
   *
   * @param key Ключ, по которому будет удалено значение
   * @param metadata Дополнительные метаданные
   * @returns Результат проверки всех плагинов (false если хотя бы один плагин запретил удаление)
   */
  executeBeforeDelete(key: StorageKeyType, metadata?: Record<string, any>): Promise<boolean>

  /**
   * Выполняет хуки onAfterDelete всех зарегистрированных плагинов
   *
   * @param key Ключ, по которому было удалено значение
   * @param metadata Дополнительные метаданные
   */
  executeAfterDelete(key: StorageKeyType, metadata?: Record<string, any>): Promise<void>

  /**
   * Выполняет хуки onClear всех зарегистрированных плагинов
   *
   * @param metadata Дополнительные метаданные
   */
  executeOnClear(metadata?: Record<string, any>): Promise<void>
}

/**
 * Менеджер плагинов
 * Отвечает за регистрацию, получение и удаление плагинов
 */
export interface IPluginManager<T extends IPlugin> {
  /**
   * Добавляет плагин в менеджер
   *
   * @param plugin Экземпляр плагина
   */
  add(plugin: T): Promise<void>

  /**
   * Удаляет плагин из менеджера по имени
   *
   * @param name Имя плагина
   */
  remove(name: string): Promise<void>

  /**
   * Получает плагин по имени
   *
   * @param name Имя плагина
   * @returns Экземпляр плагина или undefined, если плагин не найден
   */
  get(name: string): T | undefined

  /**
   * Получает все зарегистрированные плагины
   *
   * @returns Массив всех плагинов
   */
  getAll(): T[]

  /**
   * Инициализирует все зарегистрированные плагины
   */
  initialize(): Promise<void>

  /**
   * Уничтожает все зарегистрированные плагины
   */
  destroy(): Promise<void>
}
