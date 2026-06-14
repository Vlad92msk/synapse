# Межмодульные зависимости

> [Назад к оглавлению](./README.md)

Один `createSynapse` может зависеть от другого. Зависимости ожидаются перед исполнением фабрики.

## Зависимость (модуль Auth)

```typescript
import { MemoryStorage, Selectors } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { Dispatcher } from 'synapse-storage/reactive'

class AuthSelectors extends Selectors<AuthState> {
  readonly token = this.select((s) => s.token)
  readonly userId = this.select((s) => s.userId)
}

class AuthDispatcher extends Dispatcher<AuthState> {
  readonly login = this.action((store, userId: string) => {
    store.update((s) => { s.token = `jwt-${userId}`; s.userId = userId })
    return userId
  })
  readonly logout = this.action((store) => {
    store.update((s) => { s.token = null; s.userId = null })
  })
}

// Модуль Auth — другие будут зависеть от него
const authSynapse = createSynapse(async () => {
  await fetchAuth()  // async-пролог фабрики
  const storage = new MemoryStorage<AuthState>({
    name: 'auth',
    initialState: { token: 'jwt-123', userId: 'user-1' },
  })
  return {
    storage,
    dispatcher: new AuthDispatcher(storage),
    selectors: new AuthSelectors(storage),
  }
})

export type AuthSynapse = Awaited<typeof authSynapse>
```

## Зависимое хранилище (Settings) + cross-store селектор

```typescript
import type { IStorage, SelectorAPI } from 'synapse-storage/core'

// Cross-store: внешние селекторы приходят через конструктор
class SettingsSelectors extends Selectors<SettingsState> {
  readonly theme = this.select((s) => s.theme)
  readonly currentUserId: SelectorAPI<string | null>

  constructor(storage: IStorage<SettingsState>, private auth: AuthSynapse['selectors']) {
    super(storage)
    // зависит от селектора другого стора → реактивно пересчитывается
    this.currentUserId = this.combine([this.auth.userId], (userId) => userId)
  }
}

const settingsSynapse = createSynapse(async () => {
  const auth = await authSynapse              // handle — thenable
  const storage = new MemoryStorage<SettingsState>({ name: 'settings', initialState })
  return {
    storage,
    dependencies: [auth],                     // ждём готовности до сборки
    dependencyTimeout: 5000,                  // мс, по умолчанию 30000
    selectors: new SettingsSelectors(storage, auth.selectors),
  }
})
```

## Четыре паттерна межмодульного общения

### 1. Читать СОСТОЯНИЕ внешнего стора в эффектах — через `toObservable`

```typescript
import { toObservable } from 'synapse-storage/reactive'

class SettingsEffects extends Effects<SettingsState, SettingsDispatcher> {
  // raw-стор другого модуля как Observable
  constructor(private readonly auth$: Observable<AuthState>) { super() }

  readonly onAuthChange = this.effect((_action$, _state$, { dispatcher: d }) =>
    this.auth$.pipe(/* ... реагируем на изменения чужого состояния ... */),
  )
}

// сборка:
effects: new SettingsEffects(toObservable(auth.storage))
```

### 2. Читать СЕЛЕКТОРЫ внешнего стора — через конструктор Selectors (cross-store)

```typescript
// (см. SettingsSelectors выше)
new SettingsSelectors(storage, auth.selectors)
// → this.combine([this.auth.userId], ...) — реактивный derived state поверх чужого стора
```

### 3. Реагировать на ЭКШЕНЫ внешнего стора — через `externalDispatchers`

Внешние диспетчеры объявляются третьим генериком `Effects<…, Ext>` и приходят в `ctx.external`:

```typescript
class SettingsEffects extends Effects<SettingsState, SettingsDispatcher, { auth: AuthDispatcher }> {
  readonly onLogout = this.effect((action$, _state$, { dispatcher: d, external }) =>
    action$.pipe(
      ofType(external.auth.logout),   // экшен из ДРУГОГО модуля
      tap(() => d.resetSettings()),
    ),
  )
}

// в сборке внешние диспетчеры подключаются как externalDispatchers
return {
  storage,
  dependencies: [auth],
  dispatcher: new SettingsDispatcher(storage),
  effects: new SettingsEffects(),
  externalDispatchers: { auth: auth.dispatcher },
}
```

### 4. Медиатор / event-bus

Когда модули не должны знать друг о друге, их связывает отдельный синапс-посредник (или `createEventBus`):
он подписан на экшены/состояния обоих и транслирует события между ними. Подробнее — [createEventBus](./event-bus.md).

## Порядок инициализации

```typescript
// Порядок внутри фабрики createSynapse:
// 1. Зависимости готовы (Promise.all + таймаут)
// 2. Фабрика исполняется → создаёт storage, dispatcher, selectors, effects
// 3. storage.initialize() + запуск эффектов

// При таймауте — выбрасывается ошибка:
// "Dependency ("auth") timed out after 5000ms"

// Любой handle createSynapse подходит как зависимость (он thenable + waitForReady)
```
