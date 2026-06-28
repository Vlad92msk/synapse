# Dispatcher (подробно)

> [Назад к оглавлению](./README.md) · [Диспетчер модуля (`pokemon.dispatcher.ts`)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/pokemon-advanced/pokemon.dispatcher.ts) · [Песочница (Counter)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/DispatcherDetailedExample.tsx)

Полная поверхность класса `Dispatcher`. На [странице сборки](./create-synapse-dispatcher.md) показан
минимум; здесь — все фабрики (`action` / `signal` / `apiActions` / `keyedApiActions` / `watcher`),
правило `ofType` для `apiActions` и автономное использование без `createSynapse`.

Домен тот же — `pokemon-advanced`. **Имя экшена/вотчера = имя поля класса.**

## Автономное использование

`Dispatcher` работает и без `createSynapse` — достаточно `IStorage`. В автономном режиме инстанс
финализируется лениво: имена назначаются при первом вызове любого экшена или при первом обращении к
реестрам `dispatch`/`watchers`.

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { initialState } from './pokemon.store'
import { PokemonDispatcher } from './pokemon.dispatcher'
import type { PokemonState } from './pokemon.types'

const storage = new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState })
await storage.initialize()

const dispatcher = new PokemonDispatcher(storage)
dispatcher.selectPokemon(25)            // экшены — типизированные поля инстанса
```

## Поверхность диспетчера

| Фабрика-поле                        | Что создаёт                                                                     |
|-------------------------------------|---------------------------------------------------------------------------------|
| `this.action(fn)`                   | экшен с handler'ом `(store, params) => result`; payload = возвращённое значение |
| `this.signal<P>(desc)`              | чистый сигнал-намерение: `(_store, p) => p`, ничего не пишет в стор             |
| `this.apiActions<P>(accessor)`      | вызываемая группа жизненного цикла API-запроса                                  |
| `this.keyedApiActions<P>(accessor)` | то же, но статус хранится по ключу (`Record<string, ApiRequestState>`)          |
| `this.watcher(config)`              | реактивный наблюдатель за частью состояния                                      |

## this.action

`this.action((store, params) => result)` — handler в «рецептной» сигнатуре. **payload экшена =
возвращаемое значение** handler'а.

```typescript
class PokemonDispatcher extends Dispatcher<PokemonState> {
  // С параметром: return = payload (его ловят эффекты — например loadDetails по selectPokemon)
  readonly selectPokemon = this.action((store, id: number | null) => {
    store.update((s) => {
      s.selectedPokemonId = id
      if (id === null) s.selectedPokemon = null
    })
    return id
  })

  // Запись без возврата payload (применение результата запроса) — payload = void
  readonly applyPokemonDetails = this.action((store, details: PokemonDetails) =>
    store.update((s) => { s.selectedPokemon = details }),
  )

  // С meta — произвольные метаданные (2-й аргумент this.action)
  readonly toggleFavorite = this.action(
    (store, id: number) => {
      store.update((s) => {
        const idx = s.favorites.indexOf(id)
        if (idx >= 0) s.favorites.splice(idx, 1)
        else s.favorites.push(id)
      })
      return id
    },
    { meta: { description: 'Добавить/убрать из избранного' } },
  )

  // С memoize — повторный вызов с тем же аргументом пропускается (не дёргает поиск зря)
  readonly setSearchQuery = this.action(
    (store, query: string) => { store.set('searchQuery', query); return query },
    { memoize: (current, previous) => current === previous },
  )
}
```

## this.signal

Чистое намерение: ничего не пишет в стор, payload пробрасывается дальше эффектам. `description`
уходит в `meta`. В pokemon так устроен `loadMore` — сам сигнал не меняет состояние, его
подхватывает эффект `loadMore` (он же ведёт статус через `loadList.*`).

```typescript
class PokemonDispatcher extends Dispatcher<PokemonState> {
  readonly loadMore = this.signal<void>('Подгрузить следующую страницу')
}
```

## this.apiActions (вызываемая группа + жизненный цикл)

`apiActions` возвращает **вызываемую группу**. Сам вызов группы — это `init` (намерение): сбрасывает
статус в `idle` и пробрасывает payload эффектам. Жизненный цикл — через методы-поля. `accessor`
указывает на ячейку `ApiRequestState` в состоянии.

```typescript
class PokemonDispatcher extends Dispatcher<PokemonState> {
  readonly loadList = this.apiActions<void>((s) => s.api.listRequest)
  readonly loadDetails = this.apiActions<void>((s) => s.api.detailsRequest)
}

// Использование:
d.loadList()             // init: статус listRequest → idle, намерение уходит эффектам
d.loadList.loading()     // статус → loading
d.loadList.success()     // статус → success
d.loadList.failure('msg')// статус → error, error = 'msg'
d.loadList.reset()       // статус → reset
```

В pokemon-эффектах группа используется именно так: `ofType(d.loadList)` запускает запрос,
`d.loadList.loading()` / `.success()` / `.failure()` ведут статус — см. [Effects](./create-synapse-effects.md).

### Правило: `ofType(d.loadList)` ловит ТОЛЬКО init

```typescript
// В эффекте: реагируем на НАМЕРЕНИЕ загрузить (init), а не на статусы
action$.pipe(ofType(d.loadList), /* ... запускаем запрос ... */)

// Чтобы среагировать на РЕЗУЛЬТАТ — слушайте конкретную фазу явно:
action$.pipe(ofType(d.loadList.success), /* ... */)
action$.pipe(ofType(d.loadList.failure), /* ... */)
```

`keyedApiActions` устроен так же, но статус хранится **по ключу** (`Record<string, ApiRequestState>`),
а `init`/`loading`/`success`/`reset` принимают `key`, `failure` — `{ key, error }`. Удобно, когда
один эндпоинт грузится параллельно под разные сущности (например, детали нескольких покемонов со
статусом на каждый `id`):

```typescript
// гипотетическая ячейка: api.detailsByIdRequest: Record<string, ApiRequestState>
readonly loadDetailsById = this.keyedApiActions<{ key: string }>((s) => s.api.detailsByIdRequest)

d.loadDetailsById({ key: '25' })            // init под ключом '25'
d.loadDetailsById.loading('25')
d.loadDetailsById.failure({ key: '25', error: 'msg' })
```

## this.watcher

Реактивный наблюдатель за срезом состояния, отдаёт RxJS `Observable`. В pokemon —
`watchFavoriteCount` (с `meta` и `notifyAfterSubscribe`).

```typescript
class PokemonDispatcher extends Dispatcher<PokemonState> {
  // Базовый + notifyAfterSubscribe (вызвать сразу при подписке) + meta
  readonly watchFavoriteCount = this.watcher({
    selector: (state) => state.favorites.length,
    notifyAfterSubscribe: true,
    meta: { description: 'отслеживание кол-ва избранных' },
  })

  // С shouldTrigger — фильтрация ложных срабатываний
  readonly watchSelected = this.watcher({
    selector: (state) => state.selectedPokemonId,
    shouldTrigger: (prev, current) => prev !== current,
  })
}

// Подписка — через реестр watchers (вызов фабрики → Observable)
const sub = dispatcher.watchers.watchFavoriteCount().subscribe((action) => {
  console.log('избранных:', action.payload)
})
sub.unsubscribe()
```

## Зарезервированные имена полей

Имена `storage`, `action$`, `actions`, `dispatch`, `watchers`, `use`, `destroy` — члены базового класса,
их **нельзя** использовать как имена экшенов/вотчеров. Поле-алиас (один экшен под двумя именами) отклоняется
на финализации с понятной ошибкой.

## Использование

```typescript
// Вызов действий — через типизированные поля инстанса
dispatcher.selectPokemon(25)
dispatcher.setSearchQuery('pika')
dispatcher.loadMore()

// Или через реестр dispatch
dispatcher.dispatch.selectPokemon.actionType  // '[pokemon-advanced]selectPokemon'
dispatcher.dispatch.toggleFavorite.meta       // { description: 'Добавить/убрать из избранного' }

// Подписка на наблюдатели (RxJS Observable)
const sub = dispatcher.watchers.watchFavoriteCount().subscribe((action) => {
  console.log('избранных:', action.payload)
})
sub.unsubscribe()

// Подписка на ВСЕ действия (на этом потоке строятся эффекты)
dispatcher.actions.subscribe((action) => {
  console.log(action.type, action.payload)
})

// Очистка
dispatcher.destroy()
```

> В сборке `createSynapse` диспетчер доступен как `store.dispatcher`, а `store.actions` — алиас
> `store.dispatcher.dispatch`. См. [createSynapse (диспетчер)](./create-synapse-dispatcher.md).
