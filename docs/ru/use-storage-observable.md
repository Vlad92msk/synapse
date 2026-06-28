# useStorageObservable

> [Назад на главную](../../README.md)

RxJS-путь «store → реактивно в компоненте». Эквивалент [useStorageSubscribe](./use-storage-subscribe.md),
но поверх потока состояния можно навесить RxJS-операторы (`debounceTime`, `scan`, `bufferTime`, …). См.
обзор [Реактивное чтение](./reactive-reads.md). В примерах — сквозной `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`).

## Базовое использование

```typescript
import { useStorageObservable } from 'synapse-storage/react'

// всё состояние
const state = useStorageObservable(todoStorage)

// срез — эмитит только при изменении среза (distinctUntilChanged)
const total = useStorageObservable(todoStorage, (s) => s.todos.length)
```

Внутри — мемоизирующая обёртка над [`toObservable`](./to-observable.md) + `useObservable`. Observable
мемоизируется по `[storage]`, поэтому хук **не** переподписывается на каждый рендер. Этого хватает, когда
нужен просто срез. Но **свой набор операторов** через `useStorageObservable` навесить нельзя — для этого
спускаемся на уровень ниже: `toObservable` (строит поток) + `useObservable` (подписывается и отдаёт
значение в рендер).

## Операторы поверх потока

`toObservable(storage, selector)` даёт `Observable<срез>`, на который можно навесить любые RxJS-операторы.
Чтобы подписка была стабильной (а не пересоздавалась каждый рендер), оборачиваем построение потока в
**фабрику** и передаём в `useObservable` — он подпишется в `useEffect` и вернёт последнее значение.

```tsx
import { useObservable } from 'synapse-storage/react'
import { toObservable } from 'synapse-storage/reactive'
import { debounceTime, map } from 'rxjs/operators'

function TodoBadge() {
  // todoStorage — модульный синглтон, ссылка стабильна → deps можно опустить
  const label = useObservable(
    () =>
      toObservable(todoStorage, (s) => s.todos.length).pipe(
        debounceTime(200),
        map((count) => `${count} задач`),
      ),
    '0 задач',
  )

  // label — обычная строка, рендерим как есть
  return <div className="badge">{label}</div>
}
```

`useObservable` возвращает **готовое значение** (здесь — строку), его сразу можно положить в JSX. До
первого эмита показывается `initialValue` (`'0 задач'`). Поток сам эмитит начальное значение при подписке,
так что бейдж не «мигает» пустотой.

## Зачем здесь `debounce`

Без операторов бейдж бы пересчитывался на **каждое** изменение `todos`. С `debounceTime(200)` — если за
200 мс прилетела пачка изменений (массовое добавление, импорт), компонент обновится **один раз**
финальным значением, а не 10 раз подряд. Это и есть смысл RxJS-пути: сглаживать поток до того, как он
доедет до рендера.

## Про `deps` — что туда класть

Третий аргумент `useObservable` — массив зависимостей для переподписки. Правило: **в `deps` идёт всё, что
фабрика замыкает и что может поменяться**.

- **Синглтон-стор** (модульная константа) — ссылка стабильна, переподписываться не на что. `deps` можно
  **опустить** (для фабрики дефолт — `[]`, подписка строится один раз на маунте). `[todoStorage]` здесь
  тоже корректно, просто избыточно.
- **Стор из пропсов / контекста / `useCreateStorage`** — ссылка может смениться. Тогда **обязательно**
  `[storage]`, иначе поток останется подписан на старый инстанс (stale).
- **Фабрика замыкает внешние значения** (проп `limit`, выбранный `userId` и т.п.) — клади их в `deps`,
  иначе при их изменении цепочка не пересоберётся и будет работать со старым замыканием.

```tsx
// стор из пропсов + внешний проп limit внутри pipe → оба в deps
const recent = useObservable(
  () =>
    toObservable(store, (s) => s.items).pipe(
      map((items) => items.slice(0, limit)),
    ),
  [],
  [store, limit],
)
```

## Пример: debounce-поиск

Живое значение инпута и «тяжёлый» результат поиска — это **два разных** реактивных чтения. Значение
инпута должно обновляться мгновенно (обычная подписка), а фильтрацию хочется запускать только когда юзер
перестал печатать (дебаунс-поток):

```tsx
import { useStorageSubscribe, useObservable } from 'synapse-storage/react'
import { toObservable } from 'synapse-storage/reactive'
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators'

function SearchBox() {
  // 1) живое значение инпута — обновляется на каждый символ
  const query = useStorageSubscribe(searchStorage, (s) => s.query)

  // 2) результаты — пересчитываем только когда юзер замер на 300 мс
  const matches = useObservable<Product[]>(
    () =>
      toObservable(searchStorage, (s) => s.query).pipe(
        map((q) => q.trim().toLowerCase()),
        debounceTime(300),
        distinctUntilChanged(),
        map((q) => (q ? filterProducts(q) : [])),
      ),
    [],
  )

  return (
    <div>
      <input
        value={query}
        placeholder="Поиск…"
        onChange={(e) =>
          searchStorage.update((s) => {
            s.query = e.target.value
          })
        }
      />
      <ul>
        {matches.map((p) => (
          <li key={p.id}>{p.title}</li>
        ))}
      </ul>
    </div>
  )
}
```

Инпут не «тормозит» (значение из `useStorageSubscribe` идёт сразу), а `filterProducts` дёргается не на
каждый символ, а раз в 300 мс после остановки.

## Пример: агрегатор уведомлений

Классический кейс: пришло 10 сообщений за пару секунд — хочется показать **одно** уведомление «10 новых
сообщений», а не 10 тостов. Это side-effect (вызвать `toast.show`), а не значение для рендера, поэтому
берём не `useObservable`, а `useSubscription` — он подписывается и **ничего не рендерит**.

Модель: `messagesStorage` хранит `{ inbox: Message[] }`, каждое новое сообщение пушится в `inbox`.

```tsx
import { useSubscription } from 'synapse-storage/react'
import { toObservable } from 'synapse-storage/reactive'
import { bufferTime, filter, map, pairwise } from 'rxjs/operators'

function MessageNotifier() {
  useSubscription(
    () =>
      toObservable(messagesStorage, (s) => s.inbox.length)
        .pipe(
          pairwise(),                                        // [было, стало]
          map(([prev, next]) => next - prev),                // сколько добавилось
          filter((added) => added > 0),                      // только приходы (не удаления)
          bufferTime(2000),                                  // копим события 2 секунды
          filter((batch) => batch.length > 0),               // пустые окна пропускаем
          map((batch) => batch.reduce((sum, n) => sum + n, 0)), // суммарно за окно
        )
        .subscribe((count) => {
          toast.show(count === 1 ? 'Новое сообщение' : `${count} новых сообщений`)
        }),
    [],
  )

  return null
}
```

Как это читается:

- `pairwise` + `map` превращают «длину inbox» в «сколько добавилось за тик»;
- `bufferTime(2000)` копит эти приходы окнами по 2 секунды;
- на каждое окно — один `toast.show` с суммой.

Так бёрст из 10 сообщений за 2 секунды даёт **один** тост «10 новых сообщений». Это и есть ответ на «а
способен ли хук на такое»: как только ты внутри `Observable`, тебе доступен весь арсенал RxJS — нужно лишь
выбрать правильную точку входа (`useObservable` — отрендерить значение, `useSubscription` — выполнить
side-effect).

## Заметки

- Селекторный поток `toObservable` уже прогоняется через `distinctUntilChanged` — внешний
  `distinctUntilChanged` сразу после селектора почти всегда избыточен.
- Нужно простое реактивное чтение без RxJS? Бери [useStorageSubscribe](./use-storage-subscribe.md).
- Поток вне React (эффекты, не-React код) — [toObservable](./to-observable.md).
