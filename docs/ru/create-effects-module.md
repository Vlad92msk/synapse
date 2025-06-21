> [🏠 Главная](./README.md)
> [🏠 Журнал изменений](../../CHANGELOG.md)

# Создание Модуля эффектов

Модуль эффектов (EffectsModule) позволяет создавать реактивные эффекты для обработки действий и состояний без использования утилиты createSynapse. Это полезно, когда вам нужен более детальный контроль над настройкой эффектов.

## Пререквизиты

Для создания модуля эффектов нам понадобятся готовые компоненты:

- [🚀 Создание хранилищ](./basic-usage.md#создание-хранилищ)
- [⚡ Создание Диспетчера](./create-dispatcher.md)
- [⚡ Создание Эффектов](./create-effects.md)
- [🌐 API-клиент](./api-client.md) (опционально)

## Создание модуля эффектов

```typescript
import { EffectsModule } from 'synapse-storage/reactive'

// 1. Создаем хранилище
const storage = await new MemoryStorage<PokemonState>({...}).initialize()

// 2. Получаем вычисляемые селекторы (опционально)
const selectors = new SelectorModule(storage)

// 3. Создаем диспетчер
const dispatcher = createDispatcher({ storage }, (...) => ({...}))

// 4. Подготавливаем внешние состояния (другие EffectsModule.state$)
const externalStates = {
  userState$: userEffectsModule.state$,
  settingsState$: settingsEffectsModule.state$
}

// 5. Создаем модуль эффектов
const effectsModule = new EffectsModule(
  storage,                             // Хранилище состояния
  externalStates,                      // Внешние состояния (state$ от других модулей)
  { pokemonDispatcher: dispatcher },   // Объект с диспетчерами
  { pokemonApi },                      // Объект с API/сервисами
  { apiTimeout: 5000 }                 // Конфигурация для эффектов/проекта
)

// 6. Добавляем объединенные эффекты
effectsModule.add(pokemonEffects)

// 7. Запускаем эффекты
effectsModule.start()

// 8. Получаем поток состояния
const state$ = effectsModule.state$
```

## Связывание модулей

Основная особенность - externalStates это state$ от других EffectsModule:

```typescript
// Базовые модули
const userModule = new EffectsModule(userStorage, {}, { userDispatcher }, {}, {})
const settingsModule = new EffectsModule(settingsStorage, {}, { settingsDispatcher }, {}, {})

userModule.start()
settingsModule.start()

// Главный модуль использует состояния базовых
const pokemonModule = new EffectsModule(
  pokemonStorage,
  {
    userState$: userModule.state$,        // 👈 state$ от другого модуля
    settingsState$: settingsModule.state$ // 👈 state$ от другого модуля
  },
  { pokemonDispatcher },
  { pokemonApi },
  {}
)

pokemonModule.add(pokemonEffects).start()
```

## Использование в эффектах

```typescript
const crossModuleEffect = createEffect((action$, state$, externalStates, dispatchers, api) =>
  action$.pipe(
    ofType(dispatchers.pokemonDispatcher.dispatch.loadPokemon),
    withLatestFrom(
      externalStates.userState$,    // 👈 Данные из userModule
      externalStates.settingsState$ // 👈 Данные из settingsModule
    ),
    switchMap(([action, userState, settingsState]) => {
      // Используем данные из других модулей
      return from(api.pokemonApi.fetchPokemon({
        id: action.payload.id,
        userId: userState.id,
        lang: settingsState.language
      }))
    })
  )
)
```

## Управление жизненным циклом

```typescript
// Добавление эффектов во время выполнения
effectsModule.add(newEffect)

// Остановка
effectsModule.stop()

// Очистка ресурсов
await storage.destroy()
```

## Когда использовать

- Детальный контроль над инициализацией
- Сложные многоуровневые системы состояния
- Модульная архитектура с независимыми доменами
- Интеграция с существующими системами

---

## 📚 Навигация

- [🏠 Главная](./README.md)
- [📖 Все разделы документации](./README.md#-документация)

### Связанные разделы:
- [⚡ Создание Диспетчера](./create-dispatcher.md)
- [⚡ Создание Эффектов](./create-effects.md)
- [🛠️ Утилита createSynapse](./create-synapse.md)
- [🚀 Базовое использование](./basic-usage.md)
