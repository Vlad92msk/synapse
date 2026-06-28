# Два слоя: State Manager и Business Logic Layer

> **Русский** | [Главная](./README.md)

Synapse — это не «ещё один state-manager». Это **два независимых слоя**, и понимать их
лучше по отдельности:

```
synapse-storage
│
├── State Manager        ← «где лежит состояние»
│   └── synapse-storage/core
│       MemoryStorage · LocalStorage · IndexedDBStorage · IStorage
│       селекторы (Selectors / SelectorModule)
│
└── Business Logic Layer ← «как состоянием управляет бизнес-логика»
    └── synapse-storage/reactive · /utils · /react
        Dispatcher · Effects · createSynapse · React-хуки
```

## Слой 1. State Manager — «где лежит состояние»

Это реактивные **хранилища**. Они отвечают на один вопрос: *как хранить состояние и
подписываться на его изменения*. Единый интерфейс `IStorage<T>` поверх трёх реализаций:

| Хранилище       | Когда                                         |
|-----------------|-----------------------------------------------|
| `MemoryStorage` | состояние на время сессии (большинство фич)   |
| `LocalStorage`  | синхронная персистентность (настройки, тема)  |
| `IndexedDBStorage` | асинхронные большие данные (кэш, офлайн)    |

Сюда же входят **селекторы** — мемоизированный derived state поверх хранилища (как
`reselect`, но с cross-store зависимостями и реактивным `selector.$`).

**Этот слой самодостаточен.** Можно взять только `synapse-storage/core`, не подключая
ничего из бизнес-логики:

```typescript
import { MemoryStorage } from 'synapse-storage/core'

const storage = new MemoryStorage({ name: 'counter', initialState: { count: 0 } })
await storage.initialize()

storage.subscribe((s) => s.count, (count) => console.log(count))
storage.update((s) => { s.count++ })   // Immer-like
```

> Никакого RxJS, никаких эффектов, никакого React — просто реактивное хранилище.

## Слой 2. Business Logic Layer — «как состоянием управляет логика»

Поверх хранилища BL-слой описывает **поведение приложения**: какие бывают намерения
(actions), как они меняют состояние, какие сетевые/реактивные сайд-эффекты они запускают.
Три тонких класса над теми же движками:

| Класс          | Роль                                                          |
|----------------|---------------------------------------------------------------|
| `Dispatcher`   | намерения и обновления стора. Имя экшена = имя поля класса     |
| `Selectors`    | derived state (вынесен в State Manager, но обычно пишется рядом) |
| `Effects`      | сайд-эффекты на RxJS (стиль Redux-Observable): сеть, сокеты    |
| `createSynapse`| сборщик «модуля» — связывает хранилище, диспетчер, селекторы и эффекты |

Это и есть **Synapse в полном смысле** — слой управления бизнес-логикой, по форме
напоминающий сервисы/контроллеры NestJS: класс, зависимости через конструктор, методы-поля.
Но без тяжёлого DI-контейнера — нужна **форма**, а не IoC-механизм.

```typescript
import { Dispatcher, Effects, ofType, validateMap, fromRequest, apiResult } from 'synapse-storage/reactive'
import { Selectors, MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'

// Намерения и обновления стора. Имя экшена = имя поля.
class PostsDispatcher extends Dispatcher<PostsState> {
  loadPosts = this.apiActions<PostsParams>((s) => s.api.postsRequest) // вызываемая группа
  applyPosts = this.action((store, page: Page) => store.update((s) => { s.list = page.data }))
}

// Derived state. Поля — настоящие SelectorAPI сразу (eager).
class PostsSelectors extends Selectors<PostsState> {
  list = this.select((s) => s.list)
  isLoading = this.combine([this.list], () => /* ... */ false)
}

// Сайд-эффекты. Сервисы — через конструктор, захватываются в замыкание.
class PostsEffects extends Effects<PostsState, PostsDispatcher> {
  constructor(private api: PostsApi) { super() }

  loadPosts = this.effect((action$, _state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.loadPosts),
      validateMap({
        loadingAction: () => d.loadPosts.loading(),
        errorAction: (e) => d.loadPosts.failure(String(e)),
        apiCall: ([a]) => fromRequest(this.api.getPosts(a.payload)).pipe(
          apiResult((page) => { d.applyPosts(page); d.loadPosts.success() }),
        ),
      }),
    ),
  )
}

// Сборка модуля — ленивый singleton-handle.
export const postsSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<PostsState>({ name: 'posts', initialState })
  return {
    storage,
    dispatcher: new PostsDispatcher(storage),
    selectors: new PostsSelectors(storage),
    effects: new PostsEffects(await getPostsApi()),
  }
})
```

## Почему это разделение важно

1. **Можно брать только то, что нужно.** Нужен лишь реактивный кэш в IndexedDB — берёшь
   State Manager и не тянешь RxJS. Нужен полноценный модуль с сетью — добавляешь BL-слой.
   `rxjs`/`react` — опциональные peer-зависимости именно поэтому.

2. **Граница ответственности.** State Manager не знает про намерения и сеть; BL-слой не
   знает, *как* физически хранится состояние. Меняешь `MemoryStorage` на `IndexedDBStorage` —
   бизнес-логика не трогается.

3. **Тестируемость.** Хранилище тестируется как структура данных. Диспетчер — как набор
   чистых переходов. Эффект — в изоляции: `new PostsEffects(mockApi).loadPosts(action$, state$, ctx)`
   без поднятия всего синапса.

4. **Ментальная модель = NestJS.** `createSynapse` — это «модуль», диспетчер/эффекты —
   «сервисы». Знакомая форма для тех, кто пришёл из бэкенда, без цены полноценного DI.

## Куда дальше

- [Базовая сборка (`createSynapse`)](./create-synapse-basic.md) — storage + селекторы
- [Dispatcher](./create-synapse-dispatcher.md) — намерения и обновления стора
- [Effects](./create-synapse-effects.md) — сайд-эффекты на RxJS
- [Селекторы](./selector-system.md) — derived state и реактивный `selector.$`
- [Межмодульные зависимости](./dependencies.md) — cross-store и общение модулей
