# Межмодульные зависимости

> [Назад к оглавлению](./README.md) · [Сборка модуля (`pokemon.synapse.ts`)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/pokemon-advanced/pokemon.synapse.ts) · [Песочница (Auth → Settings)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/DependenciesExample.tsx)

Один `createSynapse` может зависеть от другого хранилища или модуля. Зависимости **ожидаются перед
исполнением фабрики** — к моменту сборки они гарантированно инициализированы.

Домен тот же — `pokemon-advanced`. Он зависит от отдельного `settingsStorage` (`pageSize`).

## Реальный случай: pokemon → settingsStorage

`settingsStorage` — самостоятельное хранилище настроек, живущее вне модуля pokemon:

```typescript
// pokemon.settings.ts
import { MemoryStorage } from 'synapse-storage/core'

export interface PokemonSettings { pageSize: number }

export const settingsStorage = new MemoryStorage<PokemonSettings>({
  name: 'pokemon-settings',
  initialState: { pageSize: 12 },
})
```

Модуль pokemon объявляет его в `dependencies` и подмешивает `settings$` в эффекты:

```typescript
// pokemon.synapse.ts
import { MemoryStorage } from 'synapse-storage/core'
import { toObservable } from 'synapse-storage/reactive'
import { createSynapse } from 'synapse-storage/utils'

export const pokemonSynapse = createSynapse(async () => {
  await initPokemonApi()                       // async-пролог фабрики
  const storage = new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState })

  return {
    storage,
    dependencies: [settingsStorage],           // ждём готовности до сборки
    dependencyTimeout: 10000,                   // мс, по умолчанию 30000
    dispatcher: new PokemonDispatcher(storage),
    selectors: new PokemonSelectors(storage),
    // settings$ — состояние внешнего стора как Observable (паттерн 1, см. ниже)
    effects: new PokemonEffects(pokemonApiClient.getEndpoints(), toObservable(settingsStorage)),
  }
})
```

**Зависимостью может быть** (`DependencyInput`):

- сырое хранилище `IStorage` — как `settingsStorage` выше (его `initialize()` дождутся за нас);
- другой synapse-handle — `dependencies: [await otherSynapse]` (handle thenable + `waitForReady`);
- любой `PromiseLike<{ storage }>`.

В эффектах `pageSize` приезжает через `withLatestFrom(this.settings$)` — см.
[Effects](./create-synapse-effects.md). Поменяли `settingsStorage.set('pageSize', 24)` — следующая
загрузка списка возьмёт новый размер страницы, без связки модулей напрямую.

## Четыре паттерна межмодульного общения

Pokemon использует **паттерн 1** (читает состояние `settingsStorage`). Остальные три нужны, когда
связь богаче — их демонстрирует [песочница Auth → Settings](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/DependenciesExample.tsx).

### 1. Читать СОСТОЯНИЕ внешнего стора в эффектах — через `toObservable`

Ровно то, что делает pokemon с настройками:

```typescript
import { toObservable } from 'synapse-storage/reactive'

class PokemonEffects extends Effects<PokemonState, PokemonDispatcher> {
  constructor(private readonly api: PokemonApiEndpoints, private readonly settings$: Observable<PokemonSettings>) {
    super()
  }
  // this.settings$ подмешивается в пайп через withLatestFrom → апиколл берёт pageSize
}

// сборка:
effects: new PokemonEffects(pokemonApiClient.getEndpoints(), toObservable(settingsStorage))
```

### 2. Читать СЕЛЕКТОРЫ внешнего стора — через конструктор Selectors (cross-store)

Внешние селекторы приходят через конструктор и участвуют в `this.combine(...)` как реактивные
зависимости (пример из песочницы — Settings зависит от Auth):

```typescript
import type { IStorage, SelectorAPI } from 'synapse-storage/core'

class SettingsSelectors extends Selectors<SettingsState> {
  theme = this.select((s) => s.theme)
  currentUserId: SelectorAPI<string | null>

  constructor(storage: IStorage<SettingsState>, private auth: AuthSynapse['selectors']) {
    super(storage)
    // зависит от селектора ДРУГОГО стора → реактивно пересчитывается
    this.currentUserId = this.combine([this.auth.userId], (userId) => userId)
  }
}

// сборка (фабрика дождалась auth и прокинула его селекторы):
const auth = await authSynapse
return {
  storage,
  dependencies: [auth],
  selectors: new SettingsSelectors(storage, auth.selectors),
}
```

### 3. Реагировать на ЭКШЕНЫ внешнего стора — через `externalDispatchers`

Внешние диспетчеры объявляются третьим генериком `Effects<…, Ext>` и приходят в `ctx.external`
(их экшены уже влиты в общий `action$`):

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
// 1. Зависимости готовы (Promise.all + таймаут); их storage.initialize() идемпотентен
// 2. Фабрика исполняется → создаёт storage, dispatcher, selectors, effects
// 3. storage.initialize() + запуск эффектов

// При таймауте — выбрасывается ошибка (по умолчанию 30000 мс, у pokemon — 10000):
// 'Dependency 0 ("pokemon-settings") timed out after 10000ms. Check that it initializes correctly.'
```

Как отдать собранный `pokemonSynapse` в React и дождаться готовности — [createSynapseCtx](./synapse-ctx.md)
и [awaitSynapse](./await-synapse.md). Весь модуль целиком — [Pokemon (рецепт)](./pokemon-advanced.md).
