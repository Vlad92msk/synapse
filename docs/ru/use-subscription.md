# useSubscription

> [Назад к оглавлению](./README.md)

**TL;DR.** `useSubscription(factory, deps)` — императивная подписка-**side-effect** из компонента:
подписаться на `Observable` и что-то сделать на каждый эмит (показать тост, залогировать, диспатчнуть),
**ничего не возвращая в рендер**. Пара к [`useObservable`](./use-storage-observable.md): тот отдаёт
значение для JSX, а `useSubscription` — для эффектов. Отписка — автоматическая.

## Зачем

Иногда реакция на изменение стора — это не «показать значение», а «сделать что-то наружу»: тост, лог,
императивный вызов, диспатч. Класть такое в `useObservable` неправильно (нет значения для рендера), а
руками писать `useEffect` + `subscribe` + cleanup — шумно и легко забыть `unsubscribe`. `useSubscription`
инкапсулирует создание подписки и **гарантированную отписку** на unmount / смену `deps`.

## Когда использовать / когда НЕ нужно

**Использовать:** результат подписки идёт **наружу** (тост, лог, аналитика, императивный вызов), а не в
JSX. Особенно — когда нужны RxJS-операторы для агрегации (`bufferTime`, `pairwise`, …).

**НЕ нужно:**

- результат нужен **в рендере** → [`useObservable`](./use-storage-observable.md) (значение) или
  [`useStorageSubscribe`](./use-storage-subscribe.md) (срез без RxJS);
- side-effect **без потока/RxJS** — обычная реакция на проп/значение → штатный `useEffect`.

## Сигнатура

```typescript
useSubscription(factory: () => Unsubscribable, deps: DependencyList): void
```

- `factory` — создаёт подписку (`source$.subscribe(...)`); её side-effect'ы живут внутри коллбэка
  `subscribe`.
- Возвращённый `Unsubscribable` **снимается автоматически** на unmount и при смене `deps` (перед
  созданием новой подписки) — отписывать вручную не нужно.
- Ничего не рендерит и не возвращает.

## Базовое использование

```tsx
import { useSubscription } from 'synapse-storage/react'
import { toObservable } from 'synapse-storage/reactive'
import { filter } from 'rxjs/operators'

function ErrorToaster() {
  useSubscription(
    () =>
      toObservable(authStorage, (s) => s.error)
        .pipe(filter((err): err is string => Boolean(err)))
        .subscribe((message) => {
          toast.error(message)
        }),
    [],
  )

  return null
}
```

Подписка живёт ровно столько, сколько смонтирован компонент: на unmount `useSubscription` сам вызовет
`unsubscribe()`.

## Когда `useSubscription`, а когда `useObservable`

| Нужно | Хук |
|-------|-----|
| Получить **значение** для рендера (срез, дебаунс-результат) | [`useObservable`](./use-storage-observable.md) |
| Выполнить **side-effect** на каждый эмит (тост, лог, императивный вызов) | `useSubscription` |

Правило простое: если результат идёт в JSX — `useObservable`; если это «сделать что-то наружу» —
`useSubscription`. Не подписывайся вручную в `useEffect` ради того же — `useSubscription` уже
инкапсулирует создание и гарантированную отписку.

## Пример: агрегатор уведомлений

Классика — схлопнуть бёрст событий в одно уведомление (10 сообщений за пару секунд → один тост «10 новых
сообщений»). Это side-effect, поэтому `useSubscription`:

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
          filter((added) => added > 0),                      // только приходы
          bufferTime(2000),                                  // копим 2 секунды
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

Подробный разбор операторов — на странице
[useStorageObservable](./use-storage-observable.md#пример-агрегатор-уведомлений).

## Все параметры (закомментировано)

```tsx
useSubscription(
  // 1. factory — создаёт подписку и возвращает её (Unsubscribable). Side-effect'ы
  //    живут внутри .subscribe(...). Пересоздаётся при смене deps: вся цепочка
  //    (включая stateful-операторы вроде bufferTime) собирается заново.
  () =>
    toObservable(authStorage, (s) => s.error)
      .pipe(filter(Boolean))
      .subscribe((msg) => toast.error(msg as string)),

  // 2. deps — как в useEffect: всё, что factory замыкает и что может поменяться.
  //    [] для синглтон-стора; [storage] для стора из пропсов/контекста.
  [],
)
```

## Опции

| Параметр | Тип | Описание |
|---|---|---|
| `factory` | `() => Unsubscribable` | Создаёт подписку; возвращает её для авто-отписки. Side-effect внутри `.subscribe`. |
| `deps` | `DependencyList` | Как у `useEffect`. При смене — старая подписка снимается, `factory` вызывается заново. |

## Про `deps`

Те же правила, что у [useObservable](./use-storage-observable.md#про-deps--что-туда-класть): в `deps` идёт
всё, что фабрика замыкает и что может поменяться. Для синглтон-стора `[]` достаточно; для стора из
пропсов/контекста — `[storage]`, иначе подписка останется на старом инстансе.

## Отписка и память

`useSubscription` снимает подписку автоматически (cleanup в `useEffect`), а `toObservable` под капотом
использует `shareReplay({ refCount: true })` — при падении числа подписчиков до нуля он отписывается от
стора. Так что наставленные по проекту `useSubscription`/`useObservable` **не копят слушателей** на
хранилище: на unmount всё снимается.

## См. также

- [useObservable / useStorageObservable](./use-storage-observable.md) — значение потока в рендер.
- [toObservable](./to-observable.md) — сам поток (обычно источник для `factory`).
- [useStorageSubscribe](./use-storage-subscribe.md) — реактивное чтение среза без RxJS.
- [Реактивное чтение](./reactive-reads.md) — обзор и выбор инструмента.
