# Зависимости

> [Назад к оглавлению](./README.md)

Один `createSynapse` может зависеть от другого. Зависимости ожидаются перед инициализацией.

## Зависимость (хранилище Auth)

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher } from 'synapse-storage/reactive'

// Хранилище Auth — другие будут зависеть от него
const authStorePromise = createSynapse({
  createStorageFn: async () => {
    await fetchAuth()  // асинхронная инициализация
    const storage = new MemoryStorage<AuthState>({
      name: 'auth',
      initialState: { token: 'jwt-123', userId: 'user-1' },
    })
    storage.initialize()
    return storage
  },
  createSelectorsFn: (sm) => ({
    token: sm.createSelector((s) => s.token),
    userId: sm.createSelector((s) => s.userId),
  }),
  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_s, { createAction }) => ({
      login: createAction({
        type: 'login',
        action: (userId: string) => {
          storage.update((s) => { s.token = `jwt-${userId}`; s.userId = userId })
        },
      }),
      logout: createAction({
        type: 'logout',
        action: () => {
          storage.update((s) => { s.token = null; s.userId = null })
        },
      }),
    })),
})
```

## Зависимое хранилище (Settings)

```typescript
// Хранилище Settings — ожидает готовности Auth
const settingsStorePromise = createSynapse({
  // Массив зависимостей — все ожидаются параллельно через Promise.all
  dependencies: [authStorePromise],

  // Таймаут ожидания (мс, по умолчанию 30000)
  dependencyTimeout: 5000,

  // К моменту вызова createStorageFn все зависимости готовы
  createStorageFn: async () => {
    const authStore = await authStorePromise
    const userId = authStore.storage.getStateSync().userId

    const storage = new MemoryStorage<SettingsState>({
      name: 'settings',
      initialState: { theme: 'dark', loadedForUser: userId },
    })
    storage.initialize()
    return storage
  },

  createSelectorsFn: (sm) => ({
    theme: sm.createSelector((s) => s.theme),
    loadedForUser: sm.createSelector((s) => s.loadedForUser),
  }),
})
```

## Цепочка зависимостей

```typescript
// Dashboard зависит от Auth И Settings
const dashboardStorePromise = createSynapse({
  dependencies: [authStorePromise, settingsStorePromise],
  dependencyTimeout: 10000,

  createStorageFn: async () => {
    const auth = await authStorePromise
    const settings = await settingsStorePromise
    // Оба хранилища гарантированно готовы
    ...
  },
})
```

## Порядок инициализации

```typescript
// Порядок внутри createSynapse:
// 1. Зависимости готовы (Promise.all + таймаут)
// 2. Создание хранилища (storage или createStorageFn)
// 3. storage.initialize()
// 4. createSelectorsFn
// 5. createDispatcherFn
// 6. Запуск эффектов

// При таймауте — выбрасывается ошибка:
// "Dependency 0 ("auth") timed out after 5000ms"

// Зависимость должна иметь storage.waitForReady()
// Любой результат createSynapse подходит как зависимость
```
