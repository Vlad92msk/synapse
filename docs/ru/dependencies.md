# Межмодульные зависимости

> [Назад к оглавлению](./README.md) · [Сборка модуля (`pokemon.synapse.ts`)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/pokemon-advanced/pokemon.synapse.ts) · [Песочница (Auth → Settings)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/DependenciesExample.tsx)

Один `createSynapse` может зависеть от другого хранилища или модуля. `dependencies` — это **гейт
СТАРТА эффектов, а не конструкции**: ядро (storage/dispatcher/selectors) собирается синхронно сразу,
а `waitForDependencies` отрабатывает в `ready()` перед запуском эффектов — к моменту старта эффектов
зависимости гарантированно инициализированы.

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

export const pokemonSynapse = createSynapse({
  storage: () => new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState }),
  dependencies: [settingsStorage],             // гейт СТАРТА эффектов (ядро строится сразу)
  dependencyTimeout: 10000,                     // мс, по умолчанию 30000
  dispatcher: (s) => new PokemonDispatcher(s),
  selectors: (s) => new PokemonSelectors(s),
  // settings$ — состояние внешнего стора как Observable (паттерн 1, см. ниже)
  effects: async () => {
    await initPokemonApi()                     // async-пролог уехал в фабрику эффектов
    return new PokemonEffects(pokemonApiClient.getEndpoints(), toObservable(settingsStorage))
  },
})
```

**Зависимостью может быть** (`DependencyInput`):

- сырое хранилище `IStorage` — как `settingsStorage` выше (его `initialize()` дождутся за нас);
- другой synapse-handle — `dependencies: [otherSynapse]` (handle сам thenable — `await` не нужен);
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

// сборка: cross-store DI СИНХРОННО — C-форма отдаёт `authSynapse.selectors` без await
createSynapse({
  storage: () => new MemoryStorage<SettingsState>({ name: 'settings', initialState }),
  dependencies: [authSynapse],                                  // гейт старта эффектов
  selectors: (s) => new SettingsSelectors(s, authSynapse.selectors),
})
```

> `combineAcross` / `createLazyForeignSelector` больше не нужны и **удалены** — cross-store связь
> строится напрямую через конструкторный DI (`authSynapse.selectors` доступен синхронно).

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

// в сборке внешние диспетчеры подключаются как externalDispatchers — ленивый слот-функция
// (не форсит eager-конструкцию чужого стора на импорте; резолвится на старте эффектов)
createSynapse({
  storage: () => new MemoryStorage<SettingsState>({ name: 'settings', initialState }),
  dependencies: [authSynapse],
  dispatcher: (s) => new SettingsDispatcher(s),
  effects: () => new SettingsEffects(),
  externalDispatchers: () => ({ auth: authSynapse.dispatcher }),
})
```

### 4. Медиатор / event-bus

Когда модули не должны знать друг о друге, их связывает отдельный синапс-посредник (или `createEventBus`):
он подписан на экшены/состояния обоих и транслирует события между ними. Подробнее — [createEventBus](./event-bus.md).

## Порядок инициализации

```typescript
// Порядок в C-форме createSynapse:
// 1. Конструкция СИНХРОННА: storage.initializeSync() → READY, dispatcher финализирован,
//    selectors материализованы, state$ есть — всё доступно ДО ready()/await (cross-store DI)
// 2. ready()/await: waitForDependencies (Promise.all + таймаут) — гейт СТАРТА эффектов
// 3. Резолв фабрики effects (может быть async) + externalDispatchers → запуск эффектов

// При таймауте — выбрасывается ошибка (по умолчанию 30000 мс, у pokemon — 10000):
// 'Dependency 0 ("pokemon-settings") timed out after 10000ms. Check that it initializes correctly.'
```

Как отдать собранный `pokemonSynapse` в React и дождаться готовности — [createSynapseCtx](./synapse-ctx.md)
и [awaitSynapse](./await-synapse.md). Весь модуль целиком — [Pokemon (рецепт)](./pokemon-advanced.md).
