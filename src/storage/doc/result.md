```typescript
// 1. Определяем типы и интерфейсы
interface UserState {
  profile: {
    personal: {
      name: string;
      email: string;
      age: number;
    };
    settings: {
      theme: {
        mode: 'light' | 'dark';
        colors: string[];
      };
      notifications: {
        email: boolean;
        push: boolean;
        frequency: 'daily' | 'weekly' | 'never';
      };
    };
  };
  preferences: {
    language: string;
    timezone: string;
  };
}

interface AppState {
  version: string;
  lastUpdate: number;
  features: {
    [key: string]: boolean;
  };
}

// 2. Создаем плагины
class ValidationPlugin implements IStoragePlugin {
  name = 'validation';

  constructor(private schemas: Record<string, (value: any) => boolean>) {}

  executeBeforeSet<T>(key: string, value: T): T {
    const validator = this.getValidator(key);
    if (validator && !validator(value)) {
      throw new Error(`Validation failed for key: ${key}`);
    }
    return value;
  }

  private getValidator(key: string) {
    return this.schemas[key.split('.')[0]];
  }
}

class EncryptionPlugin implements IStoragePlugin {
  name = 'encryption';

  constructor(
    private secretKey: string, 
    private sensitiveFields: string[] = ['email']
  ) {}

  executeBeforeSet<T>(key: string, value: T): T {
    if (this.isSensitive(key)) {
      return this.encrypt(value) as T;
    }
    return value;
  }

  executeAfterGet<T>(key: string, value: T): T {
    if (this.isSensitive(key)) {
      return this.decrypt(value) as T;
    }
    return value;
  }

  private isSensitive(key: string): boolean {
    return this.sensitiveFields.some(field => key.includes(field));
  }

  private encrypt<T>(value: T): T {
    // Имитация шифрования
    return value;
  }

  private decrypt<T>(value: T): T {
    // Имитация дешифрования
    return value;
  }
}

// 3. Создаем middleware
// Types
interface MiddlewareOptions {
  segments?: string[];
  [key: string]: any;
}

// Обертка для middleware с поддержкой segments
function withSegments(middleware: Middleware, segments?: string[]): Middleware {
  return (next: NextFunction) => async (context: StorageContext) => {
    // Если segments не указаны - применяем ко всем
    if (!segments) {
      return middleware(next)(context);
    }

    // Получаем имя сегмента из ключа (например, из "user.profile.name" получаем "user")
    const segmentName = context.key?.split('.')[0];

    // Если ключ нет или сегмент входит в список - применяем middleware
    if (!context.key || segments.includes(segmentName)) {
      return middleware(next)(context);
    }

    // Иначе пропускаем этот middleware
    return next(context);
  };
}

// Фабрики middleware с поддержкой сегментов
interface LoggerOptions extends MiddlewareOptions {
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  prefix?: string;
}

const createLoggerMiddleware: MiddlewareFactory<LoggerOptions> = (options = {}) => {
  const { logLevel = 'info', prefix = '', segments } = options;

  const middleware: Middleware = (next) => async (context) => {
    console[logLevel](`${prefix}Before:`, context);
    const result = await next(context);
    console[logLevel](`${prefix}After:`, { context, result });
    return result;
  };

  return withSegments(middleware, segments);
};

interface CacheOptions extends MiddlewareOptions {
  ttl?: number;
  maxSize?: number;
}

const createCacheMiddleware: MiddlewareFactory<CacheOptions> = (options = {}) => {
  const { ttl = 5000, maxSize = 100, segments } = options;
  const cache = new Map<string, { value: any; timestamp: number }>();

  const middleware: Middleware = (next) => async (context) => {
    if (context.type !== 'get' || !context.key) {
      return next(context);
    }

    const cached = cache.get(context.key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.value;
    }

    const value = await next(context);

    if (cache.size >= maxSize) {
      const oldestKey = [...cache.entries()]
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0][0];
      cache.delete(oldestKey);
    }

    cache.set(context.key, { value, timestamp: Date.now() });
    return value;
  };

  return withSegments(middleware, segments);
};

// 4. Создаем конфигурацию
const validationPlugin = new ValidationPlugin({
  user: (value: any) => {
    return value.profile && value.preferences; // Простая валидация
  },
  app: (value: any) => {
    return value.version && value.lastUpdate;
  }
});

const encryptionPlugin = new EncryptionPlugin('secret-key', ['email']);

const storageConfig: IStorageConfig = {
  type: 'memory',
  initialState: {
    app: {
      version: '1.0.0',
      lastUpdate: Date.now(),
      features: {
        darkMode: true,
        beta: false
      }
    }
  },
  plugins: [validationPlugin, encryptionPlugin],
  middlewares: (getDefaultMiddleware) => [
    ...getDefaultMiddleware({
      segments: ['user', 'app'] // эти middleware будут применяться только к указанным сегментам
    }),
    createLoggerMiddleware({
      logLevel: 'debug',
      prefix: '[Storage] ',
      segments: ['user'] // логирование только для user сегмента
    }),
    createCacheMiddleware({
      ttl: 10000,
      maxSize: 1000,
      // segments не указаны - будет применяться ко всем сегментам
    }),
  ],
};

// 5. Создаем класс для управления хранилищем
export class AppStorage {
  private static instance: StorageModule;
  private static initialized = false;

  static getInstance(): StorageModule {
    if (!this.instance) {
      this.instance = StorageModule.create(storageConfig);
    }
    return this.instance;
  }

  static async initialize(): Promise<void> {
    if (this.initialized) return;
    
    const storage = this.getInstance();
    await storage.initialize();
    this.initialized = true;
  }

  static async destroy(): Promise<void> {
    if (!this.instance) return;
    
    await this.instance.destroy();
    this.instance = null;
    this.initialized = false;
  }
}

// 6. Пример использования
async function example() {
  // Инициализация
  await AppStorage.initialize();
  const storage = AppStorage.getInstance();

  // Создаем сегменты
  const userSegment = storage.createSegment<UserState>({
    name: 'user',
    initialState: {
      profile: {
        personal: {
          name: 'John Doe',
          email: 'john@example.com',
          age: 25
        },
        settings: {
          theme: {
            mode: 'light',
            colors: ['#ffffff', '#000000']
          },
          notifications: {
            email: true,
            push: true,
            frequency: 'daily'
          }
        }
      },
      preferences: {
        language: 'en',
        timezone: 'UTC'
      }
    }
  });

  const appSegment = storage.createSegment<AppState>({
    name: 'app',
    type: 'indexDB',
    initialState: {
      version: '1.0.0',
      lastUpdate: Date.now(),
      features: {
        darkMode: true,
        beta: false
      }
    }
  });

  // Создаем селекторы
  const themeSelector = storage.createSelector<
    { user: UserState },
    { mode: string; colors: string[] }
  >(state => state.user.profile.settings.theme);

  const appStatusSelector = storage.createSelector<
    { app: AppState; user: UserState },
    { version: string; username: string; darkMode: boolean }
  >(state => ({
    version: state.app.version,
    username: state.user.profile.personal.name,
    darkMode: state.app.features.darkMode
  }));

  // Подписываемся на изменения
  const unsubscribeUser = userSegment.subscribe(state => {
    console.log('User state changed:', state);
  });

  const unsubscribeApp = appSegment.subscribe(state => {
    console.log('App state changed:', state);
  });

  try {
    // Используем различные методы для работы с данными
    
    // 1. Простое обновление через update
    await userSegment.update(state => {
      state.profile.personal.age += 1;
    });

    // 2. Работа с путями
    const notificationSettings = await userSegment.getByPath(
      'profile.settings.notifications'
    );
    
    await userSegment.setByPath(
      'profile.settings.theme.mode',
      'dark'
    );

    // 3. Частичное обновление через patch
    await userSegment.patch({
      profile: {
        settings: {
          notifications: {
            frequency: 'weekly'
          }
        }
      }
    });

    // 4. Получение данных через селекторы
    const theme = await themeSelector();
    const appStatus = await appStatusSelector();

    console.log('Current theme:', theme);
    console.log('App status:', appStatus);

    // 5. Работа с несколькими сегментами
    await Promise.all([
      userSegment.setByPath('preferences.language', 'es'),
      appSegment.patch({
        features: {
          beta: true
        }
      })
    ]);

    // 6. Получение полного состояния
    const fullState = await storage.getState();
    console.log('Full state:', fullState);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Очищаем подписки
    unsubscribeUser();
    unsubscribeApp();
  }

  // Очищаем ресурсы
  await AppStorage.destroy();
}

// Запускаем пример
example().catch(console.error);
```


Для Middleware:

Middleware отлично подходит для модификации потока выполнения операций
Имеет доступ к контексту операции (тип операции, ключ, значение)
Может накапливать операции и выполнять их пакетно
Легче контролировать порядок выполнения в цепочке middleware

Для Plugin:

Плагины больше подходят для хуков до/после операции
Менее удобно накапливать операции, так как хуки вызываются для каждой операции отдельно
Сложнее контролировать порядок выполнения пакетных операций
