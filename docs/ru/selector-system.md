# Селекторы (Selectors)

> [Назад к оглавлению](./README.md) · [Пример: селекторы](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/SelectorSystemExample.tsx) · [Пример: реактивные селекторы](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/ReactiveSelectorExample.tsx)

Селекторы извлекают и вычисляют данные из хранилища. Мемоизированы — пересчитываются только при изменении
зависимостей. Могут комбинироваться. В class-форме селекторы объявляются как **поля класса** — поля сразу
настоящие `SelectorAPI` (eager-материализация).

Примеры используют сквозной `todoStorage` (`TodoState = { todos: Todo[]; filter: Filter }`) из раздела
[MemoryStorage](./memory-storage.md) и его канонический набор селекторов `TodoSelectors`.

## 1. Класс Selectors

```typescript
import { MemoryStorage, Selectors } from 'synapse-storage/core'

interface Todo { id: string; title: string; done: boolean }
type Filter = 'all' | 'active' | 'completed'
interface TodoState { todos: Todo[]; filter: Filter }

const todoStorage = new MemoryStorage<TodoState>({
  name: 'todo',
  initialState: { todos: [], filter: 'all' },
})
await todoStorage.initialize()

// Класс привязывается к хранилищу через конструктор.
class TodoSelectors extends Selectors<TodoState> {
  readonly todos = this.select((s) => s.todos)
}
const selectors = new TodoSelectors(todoStorage)
```

## 2. this.select — простой

```typescript
const filterTodos = (todos: Todo[], filter: Filter) =>
  filter === 'all' ? todos : todos.filter((t) => (filter === 'active' ? !t.done : t.done))

class TodoSelectors extends Selectors<TodoState> {
  readonly todos = this.select((s) => s.todos)
  readonly filter = this.select((s) => s.filter)

  // С пользовательским equals (для массивов/объектов, чтобы избежать лишних уведомлений)
  readonly titles = this.select((s) => s.todos.map((t) => t.title), {
    equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    name: 'titles',   // необязательное имя для отладки
  })
}
```

Промежуточные слайсы можно объявлять `private` — наружу не видны, но работают как зависимости в `this.combine`.

## 3. this.combine — комбинированный

Комбинированные селекторы зависят от других селекторов. Пересчитываются только при изменении зависимостей.

```typescript
class TodoSelectors extends Selectors<TodoState> {
  readonly todos = this.select((s) => s.todos)
  readonly filter = this.select((s) => s.filter)

  // Цепочка: todos + filter -> видимые задачи
  readonly visibleTodos = this.combine([this.todos, this.filter], (todos, filter) =>
    filterTodos(todos, filter),
  )

  // Вычисляемые значения из зависимости
  readonly activeCount = this.combine([this.todos], (todos) => todos.filter((t) => !t.done).length)
  readonly completedCount = this.combine([this.todos], (todos) => todos.filter((t) => t.done).length)
}
```

### this.keyed — параметрический селектор

```typescript
class TodoSelectors extends Selectors<TodoState> {
  // Один SelectorAPI на ключ (кэш по ключу). По умолчанию сравнивает значения структурно.
  readonly byId = this.keyed((id: string) => (s: TodoState) => s.todos.find((t) => t.id === id))
}

selectors.byId('t1').select()   // SelectorAPI для конкретного id
```

### Cross-store: внешние селекторы через конструктор

Селектор может зависеть от селектора **другого стора**. Внешние селекторы приходят параметром конструктора —
parameter properties присваиваются ДО инициализаторов полей, поэтому `this.core` доступен в полях.

```typescript
import type { IStorage, SelectorAPI } from 'synapse-storage/core'

class PostsSelectors extends Selectors<PostsState> {
   list = this.select((s) => s.list)

  // cross-store: реактивно пересчитывается при изменении чужого стора
   currentUserId: SelectorAPI<number | null>

  constructor(storage: IStorage<PostsState>, private core: CoreSelectors) {
    super(storage)
    this.currentUserId = this.combine([this.core.profile], (p) => p?.id ?? null)
  }
}
```

Подробнее о межмодульных связях — [Межмодульные зависимости](./dependencies.md).

> **Агрегированная готовность источников.** Combined-селектор (`this.combine`) считается
> готовым, только когда готов локальный источник **и все источники его зависимостей**. Для
> cross-store случая выше `currentUserId.isSourceReady()` вернёт `true` только после
> готовности и `PostsState`-стора, и стора `core`. То же агрегирование — у
> `onSourceStatusChange`. Простой селектор (`this.select`) привязан к своему единственному
> источнику.

## 4. Реактивный селектор (selector.$)

У каждого селектора есть поле `.$` — это `Observable<T>`. Он эмитит текущее значение при подписке и при каждом
**реальном** изменении (та же семантика, что у `subscribe`). Это позволяет реактивно трансформировать чтение —
не только в React.

### Вне React

```typescript
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

// Обычная подписка
const sub = selectors.activeCount.$.subscribe((count) => console.log('активных:', count))
sub.unsubscribe()

// Трансформация прямо в потоке
selectors.activeCount.$
  .pipe(debounceTime(300), distinctUntilChanged())
  .subscribe((count) => console.log('debounced:', count))
```

### В эффектах

`selector.$` удобно использовать как источник эффекта — например, дебаунс поискового запроса:

```typescript
class SearchEffects extends Effects<SearchState, SearchDispatcher> {
  constructor(private  selectors: SearchSelectors) { super() }

   autoSearch = this.effect((_action$, _state$, { dispatcher: d }) =>
    this.selectors.searchQuery.$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      tap((query) => d.search(query)),
    ),
  )
}
```

### В React — useObservable / useSubscription

```typescript
import { useObservable, useSubscription } from 'synapse-storage/react'
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators'

function TodoStats() {
  // useObservable — рендерит производное значение из потока селектора.
  // deps пересоздают цепочку (важно для stateful-операторов вроде debounceTime/scan).
  const debouncedActive = useObservable(
    () => selectors.activeCount.$.pipe(debounceTime(300), distinctUntilChanged(), map((n) => `${n}`)),
    '0',
    [],
  )

  // useSubscription — императивный side-effect без возврата значения в рендер.
  useSubscription(
    () => selectors.activeCount.$.pipe(distinctUntilChanged()).subscribe((n) => console.log('changed:', n)),
    [],
  )

  return <div>активных (debounced): {debouncedActive}</div>
}
```

## 5. useSelector — React-хук (текущее значение)

```typescript
import { useSelector } from 'synapse-storage/react'

function TodoList() {
  // Базовое использование — возвращает T | undefined
  const visible = useSelector(selectors.visibleTodos)
  const active = useSelector(selectors.activeCount)

  // С withLoading — возвращает { data: T, isLoading: boolean }
  const { data: todos, isLoading } = useSelector(selectors.todos, { withLoading: true })

  if (isLoading) return <div>Loading...</div>

  return <div>{visible?.map((t) => <div key={t.id}>{t.title}</div>)}</div>
}
```

## 6. Программный доступ к селектору

```typescript
// select() — получить текущее значение
const value = selectors.activeCount.select()

// selectSync() — синхронное чтение из кеша
const value = selectors.activeCount.selectSync()

// subscribe() — ручная подписка на изменения
const unsub = selectors.activeCount.subscribe({
  notify: (value) => console.log('активных:', value),
})
unsub()

// Метаданные
selectors.activeCount.getId()            // уникальный ID селектора
selectors.activeCount.isSourceReady()    // готовы ли ВСЕ источники селектора?

// Для combined-селектора isSourceReady() агрегирует готовность всех источников
// зависимостей (важно для cross-store). onSourceStatusChange — подписка на эту готовность:
const unsub2 = selectors.activeCount.onSourceStatusChange((isReady) => {
  console.log('источники готовы:', isReady)
})
unsub2()
```
