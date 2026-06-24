# Селекторы (Selectors)

> [Назад к оглавлению](./README.md) · [Пример: селекторы](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/SelectorSystemExample.tsx) · [Пример: реактивные селекторы](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/ReactiveSelectorExample.tsx)

Селекторы извлекают и вычисляют данные из хранилища. Мемоизированы — пересчитываются только при изменении
зависимостей. Могут комбинироваться. В class-форме селекторы объявляются как **поля класса** — поля сразу
настоящие `SelectorAPI` (eager-материализация).

## 1. Класс Selectors

```typescript
import { MemoryStorage, Selectors } from 'synapse-storage/core'

interface ProductState {
  products: Array<{ id: number; name: string; price: number; category: string }>
  filterCategory: 'all' | 'food' | 'tech'
  sortBy: 'name' | 'price'
}

const storage = new MemoryStorage<ProductState>({
  name: 'products',
  initialState: { products: [], filterCategory: 'all', sortBy: 'name' },
})
await storage.initialize()

// Класс привязывается к хранилищу через конструктор.
class ProductSelectors extends Selectors<ProductState> {
   products = this.select((s) => s.products)
}
const selectors = new ProductSelectors(storage)
```

## 2. this.select — простой

```typescript
class ProductSelectors extends Selectors<ProductState> {
   products = this.select((s) => s.products)
   filterCategory = this.select((s) => s.filterCategory)
   sortBy = this.select((s) => s.sortBy)

  // С пользовательским equals (для массивов/объектов, чтобы избежать лишних уведомлений)
   foodNames = this.select(
    (s) => s.products.filter((p) => p.category === 'food').map((p) => p.name),
    {
      equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      name: 'foodNames',   // необязательное имя для отладки
    },
  )
}
```

Промежуточные слайсы можно объявлять `private` — наружу не видны, но работают как зависимости в `this.combine`.

## 3. this.combine — комбинированный

Комбинированные селекторы зависят от других селекторов. Пересчитываются только при изменении зависимостей.

```typescript
class ProductSelectors extends Selectors<ProductState> {
   products = this.select((s) => s.products)
   filterCategory = this.select((s) => s.filterCategory)
   sortBy = this.select((s) => s.sortBy)

   filtered = this.combine([this.products, this.filterCategory], (items, cat) =>
    cat === 'all' ? items : items.filter((p) => p.category === cat),
  )

  // Цепочка: filtered -> sorted
   sorted = this.combine([this.filtered, this.sortBy], (items, sort) =>
    [...items].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : a.price - b.price)),
  )

  // Вычисляемое значение из зависимости
   totalPrice = this.combine([this.filtered], (items) => items.reduce((sum, p) => sum + p.price, 0))
}
```

### this.keyed — параметрический селектор

```typescript
class ProductSelectors extends Selectors<ProductState> {
  // Один SelectorAPI на ключ (кэш по ключу). По умолчанию сравнивает значения структурно.
   byId = this.keyed((id: number) => (s: ProductState) => s.products.find((p) => p.id === id))
}

selectors.byId(5).select()   // SelectorAPI для конкретного id
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
const sub = selectors.totalPrice.$.subscribe((total) => console.log('итого:', total))
sub.unsubscribe()

// Трансформация прямо в потоке
selectors.searchQuery.$
  .pipe(debounceTime(300), distinctUntilChanged())
  .subscribe((query) => runSearch(query))
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

function SearchBox() {
  const selectors = useSynapseSelectors()

  // useObservable — рендерит производное значение из потока селектора.
  // deps пересоздают цепочку (важно для stateful-операторов вроде debounceTime/scan).
  const debounced = useObservable(
    () => selectors.searchQuery.$.pipe(debounceTime(300), distinctUntilChanged()),
    '',
    [selectors],
  )

  // useSubscription — императивный side-effect без возврата значения в рендер.
  useSubscription(
    () => selectors.lastId.$.pipe(skip(1), tap(scrollToEnd)).subscribe(),
    [selectors],
  )

  return <div>{debounced}</div>
}
```

## 5. useSelector — React-хук (текущее значение)

```typescript
import { useSelector } from 'synapse-storage/react'

function ProductList() {
  // Базовое использование — возвращает T | undefined
  const sorted = useSelector(selectors.sorted)
  const total = useSelector(selectors.totalPrice)

  // С withLoading — возвращает { data: T, isLoading: boolean }
  const { data: products, isLoading } = useSelector(selectors.products, { withLoading: true })

  if (isLoading) return <div>Loading...</div>

  return <div>{sorted?.map((p) => <div key={p.id}>{p.name}: {p.price}</div>)}</div>
}
```

## 6. Программный доступ к селектору

```typescript
// select() — получить текущее значение
const value = selectors.totalPrice.select()

// selectSync() — синхронное чтение из кеша
const value = selectors.totalPrice.selectSync()

// subscribe() — ручная подписка на изменения
const unsub = selectors.totalPrice.subscribe({
  notify: (value) => console.log('итого:', value),
})
unsub()

// Метаданные
selectors.totalPrice.getId()            // уникальный ID селектора
selectors.totalPrice.isSourceReady()    // готовы ли ВСЕ источники селектора?

// Для combined-селектора isSourceReady() агрегирует готовность всех источников
// зависимостей (важно для cross-store). onSourceStatusChange — подписка на эту готовность:
const unsub = selectors.totalPrice.onSourceStatusChange((isReady) => {
  console.log('источники готовы:', isReady)
})
unsub()
```
