# Synapse API — DX Audit (пункты 1–6)

## Резюме: что удобно

### createSynapse() — оркестрация
- **Единая точка входа** — storage, selectors, dispatcher, effects конфигурируются в одном месте. Очень удобно для средних/крупных модулей.
- **Перегрузки по типам** — TypeScript автоматически сужает возвращаемый тип в зависимости от конфигурации (basic / dispatcher / effects). Это отлично.
- **Ленивая инициализация** через `createStorageFn` — гибко, позволяет отложить создание storage.
- **destroy()** на верхнем уровне — единая точка очистки всех ресурсов.

### Selector system
- **API селекторов минималистичный**: `select()`, `selectSync()`, `subscribe()` — легко запомнить.
- **Комбинированные селекторы** работают как в reselect — зависимости + resultFn. Привычная модель.
- **Мемоизация из коробки** — и для простых, и для комбинированных.
- **useSelector hook** с useSyncExternalStore — корректно работает в concurrent mode.
- **withLoading: true** — полезная опция, не нужен бойлерплейт для loading state.

### Dispatcher
- **createAction/createWatcher разделение** — хорошая идея. Actions — для императивных операций, watchers — для реактивного отслеживания.
- **DispatchFunction.actionType** — удобный доступ к строковому типу для фильтрации в effects.
- **Мемоизация actions** — полезно для предотвращения повторных вызовов.
- **dispatcher.actions (Observable)** — единый поток всех действий, удобно для отладки/логирования.

### createSynapseCtx()
- **Паттерн HOC + хуки контекста** — знакомая модель для React-разработчиков.
- **Автоматическое ожидание готовности** внутри contextSynapse — не нужно вручную проверять isReady.
- **Типизация хуков** — useSynapseSelectors() возвращает точный тип объекта селекторов.

### awaitSynapse()
- **Двойной API** — HOC (withSynapseReady) + hook (useSynapseReady) — выбор подхода.
- **Программный API** (waitForReady, isReady, onReady) — полезно за пределами React.

---

## Что неудобно / стоит улучшить

### 1. createSynapse() — слишком verbose конфигурация

**Проблема**: для типичного случая (storage + selectors + dispatcher) нужно передать 3 функции-фабрики. Каждая принимает storage, что создаёт ощущение избыточности:

```ts
createSynapse({
  storage: new MemoryStorage(...),
  createSelectorsFn: (selectorModule) => { ... },
  createDispatcherFn: (storage) => createDispatcher({ storage }, (storage, utils) => { ... }),
  createEffectConfig: (dispatcher) => ({ dispatchers: { main: dispatcher } }),
  effects: [...]
})
```

**Предложение**: сократить бойлерплейт для createEffectConfig — в 90% случаев он тривиален:

```ts
// Сейчас нужно:
createEffectConfig: (dispatcher) => ({ dispatchers: { main: dispatcher } }),

// Можно по умолчанию: если createEffectConfig не передан, но effects есть,
// автоматически создать { dispatchers: { self: dispatcher } }
```

### 2. createDispatcherFn внутри createSynapse — двойной storage

**Проблема**: createDispatcherFn получает storage, потом createDispatcher тоже требует { storage }:

```ts
createDispatcherFn: (storage) => createDispatcher({ storage }, (storage, { createAction }) => { ... })
//                   ^ storage передаётся сюда       ^ и сюда
```

**Предложение**: внутри createSynapse можно упростить до:

```ts
createDispatcherFn: (storage, { createAction, createWatcher }) => { ... }
// Без вложенного createDispatcher — createSynapse создаёт его сам
```

### 3. Watcher API — неочевидный жизненный цикл

**Проблема**: `dispatcher.watchers.watchX()` возвращает Observable, но подписка на storage создаётся лениво при первом subscribe. При этом watcherFn.unsubscribe() отписывает от storage, но если Observable переподписать — подписка не восстанавливается (через share()).

**Предложение**: документировать это поведение или сделать re-subscribe безопасным.

### 4. Selector subscribe — неинтуитивный формат подписчика

**Проблема**: `selector.subscribe({ notify: (value) => ... })` — зачем объект с методом notify? Почему не просто callback?

```ts
// Сейчас:
selector.subscribe({ notify: (value) => console.log(value) })

// Ожидаемо (по аналогии с storage.subscribe):
selector.subscribe((value) => console.log(value))
```

### 5. useSelector — неконсистентный return type

**Проблема**: без опций возвращает `T | undefined`, с `{ withLoading: true }` возвращает `{ data, isLoading }`. Это два разных API за одним именем — TypeScript справляется, но runtime-код пишется по-разному для двух вариантов.

**Предложение**: либо отдельный хук `useSelectorWithLoading()`, либо всегда возвращать `{ data, isLoading }` (breaking change, но консистентнее).

### 6. createSynapseCtx vs awaitSynapse — пересечение ответственности

**Проблема**: оба решают задачу "подождать, пока store готов, и потом рендерить". contextSynapse внутри себя делает await. awaitSynapse — тоже await + HOC. Когда использовать что?

**Предложение**: чётко разграничить:
- `createSynapseCtx` — когда нужен React Context (несколько уровней вложенности)
- `awaitSynapse` — когда Context не нужен, просто "подожди и рендери"

Или объединить: сделать `createSynapseCtx` опционально поддерживающим withSynapseReady/useSynapseReady.

### 7. Effects — непрозрачная связь с dispatcher

**Проблема**: в effect-функции доступ к actions через `dispatchers.main.dispatch.actionName`. Имя "main" задаётся в createEffectConfig, и если забыть — ошибка будет только в runtime.

```ts
// В createEffectConfig:
dispatchers: { main: dispatcher }

// В effect:
dispatchers.main.dispatch.setQuery  // "main" — магическая строка
```

**Предложение**: если dispatcher один (наиболее частый случай), позволить обращаться без имени:

```ts
// Вместо dispatchers.main.dispatch.setQuery:
dispatcher.dispatch.setQuery  // прямой доступ
```

### 8. Именование: createSynapseCtx, contextSynapse, awaitSynapse

**Проблема**: непоследовательное именование:
- `createSynapseCtx` → возвращает `{ contextSynapse, useSynapseStorage, ... }`
- `contextSynapse` — это HOC, но по имени не очевидно (выглядит как контекст)
- `awaitSynapse` — глагол без create-префикса

**Предложение**:
- `contextSynapse` → `withSynapseContext` (HOC-конвенция: with*)
- Все фабрики с create-префиксом: `createSynapseCtx`, `createSynapseAwaiter`

### 9. Типизация: Awaited<typeof promise> — неудобно

**Проблема**: чтобы получить тип store, нужно писать `type MyStore = Awaited<typeof synapsePromise>`. Библиотека не экспортирует удобного хелпера.

**Предложение**: добавить type-helper:

```ts
import type { InferSynapseStore } from 'synapse-storage/utils'
type MyStore = InferSynapseStore<typeof synapsePromise>
```

### 10. Отсутствие DevTools / debug mode

**Проблема**: при отладке нет способа увидеть текущие подписки, историю actions, или какие селекторы пересчитались. `dispatcher.actions` помогает, но это ручная подписка.

**Предложение**: встроенный debug mode или интеграция с browser devtools.

---

## Общая оценка DX (пункты 1–6)

| Аспект                 | Оценка | Комментарий                                                                               |
|------------------------|--------|-------------------------------------------------------------------------------------------|
| Простота начала работы | 7/10   | Минимальный пример (storage only) прост, но полный (с effects) требует много бойлерплейта |
| Типобезопасность       | 9/10   | Отличная работа с перегрузками и inference                                                |
| Консистентность API    | 6/10   | subscribe({notify}) vs subscribe(callback), разные return types useSelector               |
| Документируемость      | 7/10   | API логичный, но пересечение awaitSynapse/createSynapseCtx сбивает                        |
| Модульность            | 9/10   | Можно использовать любой слой отдельно (storage, selectors, dispatcher)                   |
| React-интеграция       | 8/10   | useSelector, createSynapseCtx — всё на месте, concurrent-safe                             |

**Итого**: библиотека мощная и гибкая, основные проблемы DX — в verbose конфигурации и некоторой неконсистентности API-контрактов. Исправление пунктов 2, 4, 5 сделает API значительно приятнее.
