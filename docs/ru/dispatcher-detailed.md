# Dispatcher (подробно)

> [Назад к оглавлению](./README.md)

Класс `Dispatcher` можно использовать и автономно, без `createSynapse`. Определяет действия и наблюдатели
для хранилища. **Имя экшена/вотчера = имя поля класса.**

В автономном режиме инстанс финализируется лениво: имена назначаются при первом вызове любого экшена
или при первом обращении к реестрам `dispatch`/`watchers`.

## Создание

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { Dispatcher } from 'synapse-storage/reactive'

interface CounterState {
  value: number
  step: number
  history: number[]
}

const storage = new MemoryStorage<CounterState>({
  name: 'counter',
  initialState: { value: 0, step: 1, history: [] },
})
await storage.initialize()

class CounterDispatcher extends Dispatcher<CounterState> {
  readonly increment = this.action((store) => store.update((s) => { s.value += s.step }))
  readonly watchValue = this.watcher({ selector: (s) => s.value })
}

const dispatcher = new CounterDispatcher(storage)
```

## Поверхность диспетчера

| Фабрика-поле          | Что создаёт                                                                 |
|-----------------------|------------------------------------------------------------------------------|
| `this.action(fn)`     | экшен с handler'ом `(store, params) => result`; payload = возвращённое значение |
| `this.signal<P>(desc)`| чистый сигнал-намерение: `(_store, p) => p`, ничего не пишет в стор           |
| `this.apiActions<P>(accessor)` | вызываемая группа жизненного цикла API-запроса                      |
| `this.keyedApiActions<P>(accessor)` | то же, но статус хранится по ключу (`Record<string, ApiRequestState>`) |
| `this.watcher(config)`| реактивный наблюдатель за частью состояния                                   |

## this.action

```typescript
class CounterDispatcher extends Dispatcher<CounterState> {
  // Простой экшен (без параметров)
  readonly increment = this.action((store) => {
    store.update((s) => { s.value += s.step })
  })

  // Экшен с параметром (return = payload в потоке действий)
  readonly setStep = this.action((store, newStep: number) => {
    store.set('step', newStep)
    return newStep
  })

  // Экшен с meta — произвольные метаданные (2-й аргумент this.action)
  readonly reset = this.action(
    (store) => { store.reset() },
    { meta: { description: 'Сброс к значениям по умолчанию', dangerous: true } },
  )

  // Экшен с мемоизацией — повторный вызов с тем же аргументом пропускается
  readonly setStepMemo = this.action(
    (store, step: number) => { store.set('step', step); return step },
    { memoize: (current, previous) => current === previous },
  )
}
```

## this.signal

```typescript
class CounterDispatcher extends Dispatcher<CounterState> {
  // Чистое намерение: ничего не пишет в стор, payload пробрасывается дальше эффектам.
  // description уходит в meta.
  readonly pinged = this.signal<number>('Ручной пинг')
}
```

## this.apiActions (вызываемая группа + жизненный цикл)

`apiActions` возвращает **вызываемую группу**. Сам вызов группы — это `init` (намерение): сбрасывает статус
в `idle` и пробрасывает payload эффектам. Жизненный цикл — через методы-поля.

```typescript
class PostsDispatcher extends Dispatcher<PostsState> {
  // accessor указывает на ячейку ApiRequestState в состоянии
  readonly loadPosts = this.apiActions<{ page: number }>((s) => s.api.postsRequest)
}

// Использование:
d.loadPosts({ page: 1 })      // init: статус → idle, намерение уходит эффектам
d.loadPosts.loading()         // статус → loading
d.loadPosts.success()         // статус → success
d.loadPosts.failure('msg')    // статус → error, error = 'msg'
d.loadPosts.reset()           // статус → reset
```

### Правило: `ofType(d.loadPosts)` ловит ТОЛЬКО init

```typescript
// В эффекте: реагируем на НАМЕРЕНИЕ загрузить (init), а не на статусы
action$.pipe(ofType(d.loadPosts), /* ... запускаем запрос ... */)

// Чтобы среагировать на РЕЗУЛЬТАТ — слушайте конкретную фазу явно:
action$.pipe(ofType(d.loadPosts.success), /* ... */)
action$.pipe(ofType(d.loadPosts.failure), /* ... */)
```

`keyedApiActions` устроен так же, но `init`/`loading`/`success`/`reset` принимают `key`, а `failure` —
`{ key, error }`.

## this.watcher

```typescript
class CounterDispatcher extends Dispatcher<CounterState> {
  // Базовый наблюдатель — отслеживает значение
  readonly watchValue = this.watcher({ selector: (state) => state.value })

  // С shouldTrigger — фильтрация ложных срабатываний
  readonly watchBigChanges = this.watcher({
    selector: (state) => state.value,
    shouldTrigger: (prev, current) => Math.abs((prev ?? 0) - current) >= 5,
  })

  // С notifyAfterSubscribe — вызвать callback сразу при подписке
  readonly watchStep = this.watcher({
    selector: (state) => state.step,
    notifyAfterSubscribe: true,
  })
}
```

## Зарезервированные имена полей

Имена `storage`, `action$`, `actions`, `dispatch`, `watchers`, `use`, `destroy` — члены базового класса,
их **нельзя** использовать как имена экшенов/вотчеров. Поле-алиас (один экшен под двумя именами) отклоняется
на финализации с понятной ошибкой.

## Использование

```typescript
// Вызов действий — через типизированные поля инстанса
dispatcher.increment()
dispatcher.setStep(5)
dispatcher.reset()

// Или через реестр dispatch
dispatcher.dispatch.reset.actionType  // '[counter]reset'
dispatcher.dispatch.reset.meta        // { description: '...', dangerous: true }

// Подписка на наблюдатели (RxJS Observable)
const sub = dispatcher.watchers.watchValue().subscribe((action) => {
  console.log('значение:', action.payload)
})
sub.unsubscribe()

// Подписка на ВСЕ действия
dispatcher.actions.subscribe((action) => {
  console.log(action.type, action.payload)
})

// Очистка
dispatcher.destroy()
```
