# Плагины

Плагины позволяют расширять функциональность хранилища, добавляя пользовательскую логику для обработки данных на разных этапах работы с хранилищем.

## Интерфейс плагина

```typescript
interface IStoragePlugin {
  name: string
  // Инициализация плагина
  initialize?(): Promise<void>
  // Очистка при уничтожении
  destroy?(): Promise<void>

  // Хуки для работы со значениями
  onBeforeSet?<T>(value: T, context: PluginContext): Promise<T>
  onAfterSet?<T>(key: StorageKeyType, value: T, context: PluginContext): Promise<T>
  onBeforeGet?(key: StorageKeyType, context: PluginContext): Promise<StorageKeyType>
  onAfterGet?<T>(key: StorageKeyType, value: T | undefined, context: PluginContext): Promise<T | undefined>
  onBeforeDelete?(key: StorageKeyType, context: PluginContext): Promise<boolean>
  onAfterDelete?(key: StorageKeyType, context: PluginContext): Promise<void>
  onClear?(context: PluginContext): Promise<void>

  // Хуки для трансформации ключей
  onKeyTransform?: {
    encode(key: StorageKeyType): Promise<StorageKeyType>
    decode(key: StorageKeyType): Promise<StorageKeyType>
  }
}
```

## Создание простого плагина

```typescript
// Плагин для логирования операций
const loggingPlugin: IStoragePlugin = {
  name: 'logging',
  
  onBeforeSet: async (value, context) => {
    console.log('Before set:', { value, context })
    return value
  },
  
  onAfterGet: async (key, value, context) => {
    console.log('After get:', { key, value, context })
    return value
  }
}

// Плагин для шифрования данных
const encryptionPlugin: IStoragePlugin = {
  name: 'encryption',
  
  onBeforeSet: async (value, context) => {
    return encrypt(value)
  },
  
  onAfterGet: async (key, value, context) => {
    return value ? decrypt(value) : value
  }
}
```

## Использование с хранилищем

```typescript
// Создание плагинов
const plugins = new StoragePluginModule(
  undefined, // parentExecutor
  logger,    // logger
  'myStore'  // storageName
)

// Добавление плагинов
await plugins.add(loggingPlugin)
await plugins.add(encryptionPlugin)

// Создание хранилища с плагинами
const storage = await new IndexedDBStorage({
  name: 'appStorage',
  options: {
    dbName: 'myApp',
    storeName: 'main-store',
    dbVersion: 1
  }
}, plugins).initialize()
```

## Примеры плагинов

### 1. Плагин для валидации данных

```typescript
const validationPlugin: IStoragePlugin = {
  name: 'validation',
  
  onBeforeSet: async (value, context) => {
    if (context.metadata?.schema) {
      const isValid = validateSchema(value, context.metadata.schema)
      if (!isValid) {
        throw new Error('Invalid data structure')
      }
    }
    return value
  }
}
```

### 2. Плагин для трансформации ключей

```typescript
const prefixPlugin: IStoragePlugin = {
  name: 'prefix',
  
  onKeyTransform: {
    encode: async (key) => {
      return `prefix_${key}`
    },
    decode: async (key) => {
      return key.replace('prefix_', '')
    }
  }
}
```

### 3. Плагин для сжатия данных

```typescript
const compressionPlugin: IStoragePlugin = {
  name: 'compression',
  
  onBeforeSet: async (value, context) => {
    return await compress(value)
  },
  
  onAfterGet: async (key, value, context) => {
    return value ? await decompress(value) : value
  }
}
```

## Порядок выполнения

1. Хуки выполняются в порядке добавления плагинов
2. Для операций get/set:
   ```
   beforeSet → plugin1.beforeSet → plugin2.beforeSet → SET → plugin2.afterSet → plugin1.afterSet
   beforeGet → plugin1.beforeGet → plugin2.beforeGet → GET → plugin2.afterGet → plugin1.afterGet
   ```
3. Для трансформации ключей:
   ```
   encode: plugin1.encode → plugin2.encode
   decode: plugin2.decode → plugin1.decode (в обратном порядке)
   ```

## Контекст плагина

```typescript
interface PluginContext {
  storageName: string   // Имя хранилища
  timestamp: number     // Время операции
  metadata?: Record<string, any> // Дополнительные метаданные
}
```

## Лучшие практики

1. **Атомарность**
   - Каждый плагин должен отвечать за одну конкретную функцию
   - Избегайте сложной логики в одном плагине

2. **Производительность**
   - Минимизируйте асинхронные операции
   - Кэшируйте результаты где возможно
   - Избегайте тяжелых вычислений в часто вызываемых хуках

3. **Обработка ошибок**
   - Всегда обрабатывайте возможные ошибки
   - Предоставляйте понятные сообщения об ошибках
   - Используйте метаданные для передачи дополнительной информации

4. **Совместимость**
   - Проверяйте совместимость плагинов друг с другом
   - Учитывайте порядок выполнения плагинов
   - Документируйте требования и ограничения