# Аудит хранилищ: RxJS-observable обёртка и реактивная подписка в React

> Дата: 2026-06-28. Только анализ, код не менялся.
> Область: `packages/synapse/src/core/storage`, `reactive/effects/utils/toObservable`,
> `react/hooks/*`.
> Контекст запроса: «создаю store, меняю обычными методами, а в компоненте
> подписываюсь через observable и работаю как с реактивным состоянием; хочу сам
> контролировать ререндеры (useRef + ручной trigger, или вообще без ререндера)».

---

## TL;DR

1. **Обёртка хранилища в RxJS Observable уже есть** — `toObservable(storage)` из
   `synapse-storage/reactive`. Превращает любой `IStorageBase` в
   `Observable<T>` (поток всего состояния) через `subscribeToAll` + `shareReplay(1)`.

2. **Связка «меняю обычными методами → реактивно в компоненте» уже работает,
   причём в двух вариантах:**
   - **RxJS-путь:** `useObservable(toObservable(storage), storage.getStateSync())`;
   - **нативный React-путь без RxJS:** `useStorageSubscribe(storage, selector)`
     (на `useSyncExternalStore`, ничего из rxjs не тянет).
   Плюс точечные `storage.subscribe(key | pathSelector, cb)` для императива.

3. **Чего реально не хватает — именно того, про что ты спрашиваешь:** хука,
   который держит актуальное значение, но **не дёргает ререндер на каждое
   изменение**, а отдаёт контроль компоненту (ref + ручной trigger, либо
   read-on-demand вовсе без ререндера). Ни один существующий хук этого не даёт:
   `useStorageSubscribe`/`useSelector`/`useObservable` всегда ререндерят при
   изменении. Это **главная рекомендация — добавить `useStorageRef`**.

4. **Мелкий, но важный пробел:** `useStorageSubscribe` (в отличие от `useSelector`)
   **не имеет `equals`/мемоизации** — ререндерит на любое изменение стора, даже
   если выбранный селектором срез не поменялся. Стоит добавить equality.

---

## Что уже есть

### 1. `toObservable(storage)` — RxJS-обёртка (реализована)
`reactive/effects/utils/toObservable.ts`, экспортируется из
`synapse-storage/reactive`:

```ts
export function toObservable<T>(storage: IStorageBase<T>): Observable<T> {
  return new Observable<T>((observer) => {
    observer.next(storage.getStateSync())                 // текущее значение сразу
    const unsub = storage.subscribeToAll(() => observer.next(storage.getStateSync()))
    return () => unsub()
  }).pipe(shareReplay(1))                                  // мультикаст + кэш последнего
}
```

Это **ровно та обёртка**, которую ты описываешь: store меняется обычными
методами (`set/update/...`), `subscribeToAll` ловит изменение, observable
эмитит новое состояние. `shareReplay(1)` даёт мультикаст и моментальную выдачу
последнего значения новым подписчикам.

Нюансы:
- эмитит **всё состояние** `T`, не срез. Селекцию делаешь оператором
  (`map(s => s.x)`, `distinctUntilChanged()`), либо на стороне хука;
- **каждый вызов `toObservable(storage)` создаёт НОВЫЙ Observable** со своей
  подпиской `subscribeToAll`. Кэширования «один observable на стор» нет — это
  важно для React (см. ниже про мемоизацию);
- живёт в `reactive` (тянет RxJS). Это **правильное** размещение: `rxjs` —
  optional peer dependency, а `core` обязан оставаться RxJS-free. То есть
  observable-обёртке место в `reactive`, а не в `core`.

### 2. `useObservable` — подписка на Observable в компоненте (реализована)
`react/hooks/useObservable.ts`: подписывается на `Observable<T>` (или фабрику),
возвращает последнее значение, ререндерит через `setState`. В паре с
`toObservable` даёт полный сценарий:

```ts
const state = useObservable(
  useMemo(() => toObservable(storage), [storage]),   // ВАЖНО: мемоизировать!
  storage.getStateSync(),
)
```

⚠️ **Footgun:** если передать `toObservable(storage)` инлайн в рендере, на каждый
рендер создаётся новый observable, а `useObservable` по умолчанию переподписывается
при смене ссылки `source` (`deps = [source]`) → лишние пере-подписки. Нужно
`useMemo`/вынести на уровень модуля. Стоит задокументировать или принимать
`storage` напрямую (см. рекомендацию ниже).

### 3. `useStorageSubscribe` — реактивная подписка БЕЗ RxJS (реализована)
`react/hooks/useStorageSubscribe.ts`: `useSyncExternalStore` +
`subscribeToAll` + `getStateSync()`. Это **канонический и самый дешёвый** способ
«store → реактивно в компоненте», без зависимости от RxJS и Concurrent-safe:

```ts
const todos = useStorageSubscribe(todoStorage, (s) => s.todos)
```

**Минус:** нет функции сравнения. `useSelector` умеет `equals` и кэширует
снапшот, а `useStorageSubscribe` — нет, поэтому ререндерит на **любое**
изменение стора, даже если `s.todos` по ссылке не изменился. Это первый
кандидат на доработку.

### 4. Прочее
- `storage.subscribe(key, cb)` и `storage.subscribe(pathSelector, cb)` —
  точечные подписки (императив, без React);
- `storage.subscribeToAll(cb)` — на все изменения;
- `getStateSync()` — синхронный снимок (есть у всех типов сторов, в т.ч.
  IndexedDB через in-memory кэш);
- `useSelector` — для `SelectorAPI` (мемоизация снапшота, `equals`,
  `getServerSnapshot` для SSR);
- `useStorage` / `useCreateStorage` — lifecycle (init/destroy/status),
  не про реактивное чтение.

**Итог по «что есть»:** базовый сценарий полностью закрыт. Не хватает только
контроля над ререндерами.

---

## Чего не хватает — управляемые ререндеры (суть запроса)

Все три «читающих» хука (`useStorageSubscribe`, `useSelector`, `useObservable`)
**всегда** ререндерят компонент при изменении. Нет примитива для:
- держать **всегда актуальное** значение, но **не ререндерить** на изменения;
- ререндерить **только когда компонент сам решит**;
- читать значение **по требованию** (в обработчике события) без подписки на
  рендер вовсе.

### Почему `useSyncExternalStore` тут не помощник
`useSyncExternalStore` спроектирован так, чтобы **всегда** синхронизировать
рендер с источником (для защиты от tearing в Concurrent Mode). Он **не умеет**
«пропустить ререндер по решению компонента». Поэтому для управляемого сценария
правильный примитив — **ref + ручной форс-апдейт**, осознанно отказываясь от
tearing-гарантий (что для «я сам контролирую ререндеры» приемлемо).

### Рекомендуемый хук: `useStorageRef`
Держит актуальное значение в `ref` (обновляется по подписке, **без ререндера**)
и отдаёт ручной триггер:

```ts
// предлагаемое API
function useStorageRef<S, R = S>(
  storage: IStorageBase<S>,
  selector: (s: S) => R = (s) => s as unknown as R,
): {
  ref: React.MutableRefObject<R>     // ref.current — всегда свежее, без ререндера
  get: () => R                       // читать по требованию
  rerender: () => void               // форс-апдеть, когда компонент сам решит
} {
  const selRef = useRef(selector); selRef.current = selector
  const ref = useRef<R>(selector(storage.getStateSync()))
  const [, force] = useReducer((c) => c + 1, 0)

  useEffect(() => {
    ref.current = selRef.current(storage.getStateSync()) // на случай смены storage
    return storage.subscribeToAll(() => {
      ref.current = selRef.current(storage.getStateSync())
      // НИЧЕГО не ререндерим — значение просто свежее в ref
    })
  }, [storage])

  return { ref, get: () => ref.current, rerender: force }
}
```

Применение под все три твоих сценария:
- **«ререндер когда я решу»:** читаешь `ref.current`, в нужный момент зовёшь
  `rerender()` (или свой `setState`);
- **«вообще без ререндера»:** просто `get()` в обработчике события/коллбэке;
- **«ререндер по условию»:** в подписке внутри расширенной версии хука можно
  передать предикат `shouldRerender(prev, next)` и звать `force()` только когда
  он `true`.

### Альтернатива/дополнение: предикат в `useStorageSubscribe`
Дешевле — расширить существующий `useStorageSubscribe` опциями как у
`useSelector`:
- `equals?: (a, b) => boolean` + кэш снапшота → не ререндерить, если срез не
  изменился (закрывает «не на каждое изменение»);
- этого, однако, **недостаточно** для «ререндер только когда я сам решу» — для
  этого нужен именно ref-путь выше.

---

## Дополнительные наблюдения (не блокеры)

1. **`useObservable` + `toObservable` — мемоизация обязательна.** Стоит либо
   задокументировать `useMemo`, либо добавить перегрузку `useObservable(storage)`
   /отдельный `useStorageObservable(storage, selector)`, который сам мемоизирует
   `toObservable` по `[storage]` и снимает footgun.

2. **`toObservable` создаёт по observable на вызов.** Для частого использования
   имеет смысл либо кэшировать observable на инстансе стора (ленивый геттер
   `storage.$` / `storage.observable`), либо мемоизировать на уровне хука.
   Геттер `$` на сторе нельзя положить в `core` (RxJS там запрещён) — значит
   либо это утилита в `reactive`, либо опциональный mixin.

3. **Селекторный observable.** Сейчас `toObservable` отдаёт только полный `T`.
   Полезна была бы перегрузка `toObservable(storage, selector)` с
   `map + distinctUntilChanged`, чтобы поток эмитил только изменения среза.

4. **Размещение и tree-shaking.** observable-обёртки и RxJS-хуки правильно живут
   в `reactive`/`react`. Чисто-`core` сценарий (без RxJS) полностью закрывается
   `useStorageSubscribe` + предлагаемым `useStorageRef` — оба **не** требуют
   RxJS. То есть пользователь, которому не нужен RxJS, получит реактивность и
   управляемые ререндеры без единой зависимости от rxjs.

---

## Итоговые рекомендации (приоритезированно)

| # | Действие | Объём | Зачем |
|---|----------|-------|-------|
| 1 | `useStorageRef(storage, selector?)` — ref + ручной `rerender()` / `get()` | малый | прямой ответ на запрос: контроль ререндеров, в т.ч. «без ререндера» |
| 2 | Добавить `equals`/кэш снапшота в `useStorageSubscribe` | малый | не ререндерить, когда срез не изменился |
| 3 | `useStorageObservable(storage, selector?)` — мемоизирующая обёртка над `toObservable`+`useObservable` | малый | убрать footgun с пере-подпиской, удобный RxJS-путь |
| 4 | Перегрузка `toObservable(storage, selector)` с `distinctUntilChanged` | малый | поток изменений среза, а не всего state |
| 5 | Док-раздел «реактивное чтение хранилища»: RxJS-путь vs нативный путь vs управляемые ререндеры | малый | сейчас возможности разрознены по хукам |

**Ответ на исходный вопрос:**
- RxJS-обёртка хранилища — **уже есть** (`toObservable`), и сценарий «меняю
  обычными методами → реактивно в компоненте» закрыт уже сейчас (RxJS-путь через
  `useObservable`, нативный путь через `useStorageSubscribe`).
- Чего **нет** и что стоит добавить — это именно управление ререндерами:
  `useStorageRef` (ref + ручной триггер / read-on-demand) как основной новый хук,
  плюс `equals` в `useStorageSubscribe`. `useSyncExternalStore` для «ререндер по
  моему решению» не подходит — нужен ref-путь.
</content>
