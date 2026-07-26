# createSynapse (базовый)

> [Назад к оглавлению](./README.md) · [Сборка модуля (`pokemon.synapse.ts`)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/pokemon-advanced/pokemon.synapse.ts) · [Минимальная песочница (storage + selectors)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/CreateSynapseBasicExample.tsx)

`createSynapse(config)` собирает **слой управления данными** в один ленивый модуль.
Единственная форма записи — **синхронный объект-конфиг** (C-форма): `storage` (фабрика
синхронного хранилища), опционально `dispatcher` / `selectors` / `dependencies` / `effects`.
Конструкция ядра синхронна, всё async (endpoints, сокеты, готовность зависимостей) уезжает
в жизненный цикл эффектов. Минимальная форма — **хранилище + селекторы**, без диспетчера и
эффектов: изменения идут через хранилище напрямую. Диспетчер и эффекты добавим на следующих
страницах ([Dispatcher](./create-synapse-dispatcher.md), [Effects](./create-synapse-effects.md)).

Всё на одном домене — `pokemon-advanced` (см. [Pokemon пример](./pokemon-advanced.md)).
Здесь берём из него ровно два кирпича: `pokemon.store.ts` и `pokemon.selectors.ts`.

## Хранилище и состояние (`pokemon.store.ts`)

```typescript
import type { PokemonState } from './pokemon.types'

export const initialState: PokemonState = {
  api: {
    listRequest: { status: 'idle', error: null },
    detailsRequest: { status: 'idle', error: null },
  },
  pokemonList: [],
  offset: 0,
  hasMore: true,
  selectedPokemonId: null,
  selectedPokemon: null,
  searchQuery: '',
  favorites: [],
}
```

## Селекторы (`pokemon.selectors.ts`)

Селекторы — производные значения. Поля класса становятся настоящими `SelectorAPI` сразу
после конструирования (eager), имя селектора = имя поля. Промежуточные слайсы можно
держать `private` — наружу не видны, но работают как зависимости в `combine`.

```typescript
import { Selectors } from 'synapse-storage/core'
import type { PokemonState } from './pokemon.types'

export class PokemonSelectors extends Selectors<PokemonState> {
  // private = промежуточный слайс, наружу не экспортируется
  private readonly api = this.select((s) => s.api)

  // Простые селекторы — одно поле состояния
  readonly pokemonList = this.select((s) => s.pokemonList)
  readonly searchQuery = this.select((s) => s.searchQuery)
  readonly favorites = this.select((s) => s.favorites)

  // Комбинированные — зависят от других селекторов и пересчитываются мемоизированно
  readonly isListLoading = this.combine([this.api], (a) => a.listRequest.status === 'loading')

  // Фильтр списка по строке поиска
  readonly filteredList = this.combine([this.pokemonList, this.searchQuery], (list, query) =>
    query ? list.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())) : list,
  )

  // Избранное — пересечение списка и id-шников в favorites
  readonly favoriteCount = this.combine([this.favorites], (favs) => favs.length)
  readonly favoritePokemon = this.combine([this.pokemonList, this.favorites], (list, favs) =>
    list.filter((p) => favs.includes(p.id)),
  )
}
```

> Полный набор селекторов (статусы и ошибки обоих запросов, `selectedPokemon`, `hasMore`)
> — в `pokemon.selectors.ts`. Подробнее о селекторах как таковых — [Селекторы](./selector-system.md).

## Сборка: createSynapse(config)

`createSynapse(config)` возвращает **ленивый handle**. Фабрики (`storage`/`dispatcher`/
`selectors`) исполняются лениво — при первом `await` / `ready()` (или при первом синхронном
обращении к `.storage`/`.selectors`), а не на импорте (это важно для SSR и чтобы импорт
модуля не дёргал сеть). При этом сама конструкция ядра **синхронна**: `storage` доводится
до `READY` в один тик, `state$` есть всегда — ещё до `await`.

Минимальная форма — только storage + selectors:

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'

import { PokemonSelectors } from './pokemon.selectors'
import { initialState } from './pokemon.store'
import type { PokemonState } from './pokemon.types'

export const pokemonSynapse = createSynapse({
  // storage — фабрика СИНХРОННОГО хранилища (Memory/LocalStorage); TState выводится из неё
  storage: () => new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState }),
  selectors: (s) => new PokemonSelectors(s),
  // dispatcher / effects — добавим на следующих страницах
})

export type PokemonSynapse = Awaited<typeof pokemonSynapse>
```

> `TState` (тип `PokemonState`) **выводится** из фабрики `storage` — руками генерики
> перечислять не нужно. Если тип неудобно вывести из фабрики, есть явная форма
> `createSynapse.of<State, Dispatcher, Selectors>({ … })`.

## Возвращаемое значение

```typescript
// Handle — thenable: await стартует эффекты и возвращает собранный модуль
const store = await pokemonSynapse

// Результат (базовый — без диспетчера):
store.storage    // IStorage<PokemonState> — хранилище
store.selectors  // экземпляр PokemonSelectors — поля = SelectorAPI
store.state$     // Observable<PokemonState> — поток состояния (есть ВСЕГДА, даже без эффектов)
store.dispatcher // undefined (диспетчера нет)
store.actions    // undefined (алиас диспетчера)

// C-форма отдаёт main-ядро СИНХРОННО (без await) — основа cross-store DI:
pokemonSynapse.storage        // IStorage<PokemonState> — доступно сразу
pokemonSynapse.selectors      // PokemonSelectors — можно передать в конструктор чужих селекторов
pokemonSynapse.state$         // Observable<PokemonState>

// Сам handle:
pokemonSynapse.ready()        // Promise<store> — то же, что await (стартует эффекты)
pokemonSynapse.isReady()      // boolean
pokemonSynapse.getSnapshot()  // store | undefined — синхронный доступ (нужен SSR)
pokemonSynapse.destroy()      // Promise<void> — очистка + сброс мемоизации (handle пересоздаваем)
```

## Использование в React

Без диспетчера читаем через `useSelector`, а пишем через хранилище **напрямую**:

```typescript
import { useSelector } from 'synapse-storage/react'

const filteredList = useSelector(store.selectors.filteredList)
const favoriteCount = useSelector(store.selectors.favoriteCount)
const searchQuery = useSelector(store.selectors.searchQuery)

// Изменение состояния — через хранилище напрямую
store.storage.set('searchQuery', 'pika')

store.storage.update((s) => {
  const i = s.favorites.indexOf(25)
  if (i >= 0) s.favorites.splice(i, 1)
  else s.favorites.push(25)
})
```

> Прямые `storage.set/update` хороши для простого state. Как только появляются
> именованные намерения и побочные эффекты (загрузка из API) — это работа
> [Dispatcher](./create-synapse-dispatcher.md) и [Effects](./create-synapse-effects.md).

## Async — в фабрике `effects`

Конструкция ядра **синхронна**, поэтому всё async живёт в фабрике `effects`: она может быть
`async` и лениво резолвит browser-only ресурсы (init API-клиента, endpoints, IndexedDB-кэш
`ApiClient`, сокеты) — уже после того, как ядро собрано, и только на клиенте:

```typescript
export const pokemonSynapse = createSynapse({
  storage: () => new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState }),
  selectors: (s) => new PokemonSelectors(s),
  // async — только здесь; конструкция ядра и рендер этого не касаются
  effects: async () => new PokemonEffects(await getPokemonEndpoints()),
})
```

> Сервер и клиент строят стор одинаково из `initialState`, SSR-оболочка выводится сама (см.
> [SSR](./ssr-hydration.md)), а импорт модуля не дёргает сеть. Как `effects` выглядит вместе с
> диспетчером и зависимостями — [Effects](./create-synapse-effects.md) и [Pokemon пример](./pokemon-advanced.md).

## Полная форма — все поля конфига

Обычно нужны 2–3 поля, но вот **вся поверхность** C-формы разом (закомментированные поля —
опциональные), чтобы видеть, что она умеет:

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'

export const pokemonSynapse = createSynapse(
  {
    // 1. storage — ЕДИНСТВЕННОЕ обязательное поле. Фабрика синхронного хранилища
    //    (MemoryStorage/LocalStorage). Из её типа выводится TState.
    storage: () => new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState }),

    // 2. dispatcher — фабрика class-диспетчера (намерения + апдейты стора). Получает storage.
    dispatcher: (s) => new PokemonDispatcher(s),

    // 3. selectors — фабрика class-селекторов. Получает storage; сюда же прокидывают
    //    cross-store DI (селекторы ЧУЖОГО модуля доступны синхронно): new X(s, coreSynapse.selectors).
    selectors: (s) => new PokemonSelectors(s),

    // 4. dependencies — гейт СТАРТА эффектов (не конструкции): ядро собирается сразу,
    //    а эффекты ждут готовности этих сторов/модулей. Элемент — IStorage, synapse-handle
    //    или любой PromiseLike<{ storage }>.
    dependencies: [settingsStorage],

    // 5. dependencyTimeout — таймаут ожидания dependencies, мс (по умолчанию 30000).
    dependencyTimeout: 10000,

    // 6. externalDispatchers — чужие диспетчеры, чьи экшены вливаются в общий action$
    //    (вариант коммуникации 3). Предпочтителен ленивый слот-функция — не форсит
    //    eager-конструкцию чужого стора на импорте; резолвится на старте эффектов.
    externalDispatchers: () => ({ settings: settingsSynapse.dispatcher }),

    // 7. effects — фабрика эффектов; МОЖЕТ быть async (весь async-пролог здесь).
    //    ctx = { storage, dispatcher, selectors, deps }. Возвращает инстанс(ы) Effects /
    //    функции-эффекты / undefined.
    effects: async ({ selectors }) =>
      new PokemonEffects(await getPokemonEndpoints(), selectors),
  },
  {
    // 8. ВТОРОЙ аргумент — опции. postConstruct: синхронный хук после конструкции ядра
    //    (storage READY, dispatcher финализирован), ДО первого рендера. Дом для нормализации
    //    persisted-состояния (гашение транзитных флагов).
    postConstruct: ({ actions }) => actions.resetTransient(),
  },
)
```

## Дополнительно (DX)

- **`browserStorage(config, { client })`** (экспорт из `synapse-storage/core`) — server-safe фабрика
  хранилища: `MemoryStorage` на сервере (нет `window`), `client(config)` в браузере. Убирает ручной
  `const isServer = typeof window === …` + ветку; client-only middleware (`syncBroadcastMiddleware`)
  добавляй внутри `client`. Обе ветки — sync-стор одной формы, тип выводится без ручных дженериков.
  ```typescript
  // browserStorage(...) сам возвращает фабрику () => ISyncStorage — передаётся как есть
  storage: browserStorage(
    { name: 'draft', initialState },
    { client: (cfg) => new LocalStorage(cfg) },
  )
  ```
- **`postConstruct` — второй аргумент** `createSynapse(config, { postConstruct })`. Синхронный хук
  после конструкции ядра (storage `READY`, dispatcher финализирован), ДО первого рендера — для
  нормализации persisted-состояния (гашение транзитных флагов). Отдельным аргументом (а не полем
  конфига), чтобы колбэк контекстно типизировался уже выведенным `TDispatcher`:
  ```typescript
  export const accounts = createSynapse(
    {
      storage: () => new LocalStorage<AccountsState>({ name: 'accounts', initialState }),
      dispatcher: (s) => new AccountsDispatcher(s),
    },
    // persisted-состояние из localStorage могло сохранить транзитные флаги (isSubmitting и т.п.) —
    // гасим их синхронно ДО первого рендера. `actions` типизирован как AccountsDispatcher.
    { postConstruct: ({ actions }) => actions.resetTransient() },
  )
  ```
- **`createSynapse.of<State, Dispatcher, Selectors>(config, options?)`** — явно-типизированная C-форма,
  когда `TState` неудобно вывести из фабрики `storage` (ручные дженерики без fall-through на ошибку
  констрейнта):
  ```typescript
  // генерики заданы вручную; поля конфига и второй аргумент — те же, что у createSynapse
  export const accounts = createSynapse.of<AccountsState, AccountsDispatcher, AccountsSelectors>(
    {
      storage: () => new LocalStorage({ name: 'accounts', initialState }),
      dispatcher: (s) => new AccountsDispatcher(s),
      selectors: (s) => new AccountsSelectors(s),
    },
    { postConstruct: ({ actions }) => actions.resetTransient() },
  )
  ```
