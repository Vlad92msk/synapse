# awaitSynapse

> [Назад к оглавлению](./README.md) · [Канонический модуль (`PokemonAdvancedExample.tsx`)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/pokemon-advanced/PokemonAdvancedExample.tsx) · [Песочница (Timer)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/AwaitSynapseExample.tsx)

React-утилита для ожидания готовности модуля Synapse: HOC + хук + программный API.

`createSynapse` возвращает **ленивый handle** (см. [create-synapse-basic](./create-synapse-basic.md)) —
фабрика стартует при первом `await`/подписке, а не на импорте. `awaitSynapse` поднимает этот handle:
запускает инициализацию, держит `loadingComponent` на время async-пролога и отдаёт готовый synapse, когда
`storage` инициализирован.

Домен тот же — собранный на прошлых страницах `pokemonSynapse`. Это «ручной» способ отдать модуль в
компоненты (без Context): альтернатива провайдеру [createSynapseCtx](./synapse-ctx.md). Именно `awaitSynapse`
использует демо модуля — `PokemonAdvancedExample.tsx`.

## Создание

`awaitSynapse(handle, options?)` создаётся **один раз, на уровне модуля** — не внутри компонента, иначе
awaiter (и инициализация) пересоздавались бы на каждый рендер.

```typescript
import { awaitSynapse } from 'synapse-storage/react'
import { pokemonSynapse } from './pokemon.synapse'

// pokemonSynapse — ленивый handle из createSynapse (async-пролог: initPokemonApi).
const pokemonAwaiter = awaitSynapse(pokemonSynapse, {
  loadingComponent: <div>Initializing...</div>,
  errorComponent: (error) => <div>Init failed: {error.message}</div>,
})
```

`options` необязателен: по умолчанию `loadingComponent` — `<div>Инициализация...</div>`,
`errorComponent` — текст ошибки. Принимается не только handle, но и Promise готового synapse или сам
готовый synapse.

## withSynapseReady (HOC) — как поднят демо-модуль

HOC показывает `loadingComponent`, пока модуль не готов, и рендерит компонент **только** когда `storage`
полностью инициализирован. Это ровно то, что делает `PokemonAdvancedExample.tsx`:

```typescript
import { useEffect } from 'react'

function PokemonContent() {
  // HOC гарантирует готовность — store доступен синхронно, без проверок на undefined.
  const store = pokemonAwaiter.getStoreIfReady()!

  // Первичная загрузка списка — один раз, когда модуль готов.
  useEffect(() => {
    store.actions.loadList()
  }, [store])

  return <PokemonDemo store={store} />
}

// В JSX сначала покажет loadingComponent, затем PokemonContent с готовым store:
export const PokemonAdvancedExample = pokemonAwaiter.withSynapseReady(PokemonContent)
```

Внутри `PokemonContent` доступна вся поверхность модуля: `store.selectors` (см.
[selector-system](./selector-system.md)), `store.actions` (намерения диспетчера) и `store.dispatcher`.

## useSynapseReady (хук)

Хук для ручного контроля готовности — когда нужно показать статус инициализации, а не просто прятать
компонент за загрузкой:

```typescript
function PokemonStatus() {
  const { isReady, isPending, isError, store, error } = pokemonAwaiter.useSynapseReady()

  if (isPending) return <div>Загрузка модуля...</div>
  if (isError)   return <div>Ошибка: {error?.message}</div>
  if (isReady)   return <div>Загружено покемонов: {store!.storage.getStateSync().pokemonList.length}</div>
}

// Поля возвращаемого объекта:
// isReady:   boolean — модуль инициализирован
// isPending: boolean — ожидание инициализации
// isError:   boolean — ошибка инициализации
// store:     PokemonSynapse | undefined  (определён только при isReady)
// error:     Error | null
```

## Программный API

Доступен вне React — в эффектах, утилитах, на сервере:

```typescript
// Синхронные проверки
pokemonAwaiter.isReady()         // boolean
pokemonAwaiter.getStatus()       // 'pending' | 'ready' | 'error'
pokemonAwaiter.getError()        // Error | null
pokemonAwaiter.getStoreIfReady() // PokemonSynapse | undefined

// Асинхронное ожидание
const store = await pokemonAwaiter.waitForReady()
store.actions.loadList()

// Колбэки (возвращают функцию отписки)
const unsub = pokemonAwaiter.onReady((store) => {
  console.log('Pokemon module ready', store.storage.getStateSync())
})

const unsubErr = pokemonAwaiter.onError((error) => {
  console.error('Init failed:', error.message)
})

// Если модуль уже готов — onReady срабатывает немедленно.

// Очистка
pokemonAwaiter.destroy()
```

## Связь с createSynapseAwaiter

`awaitSynapse` — тонкая React-обёртка над фреймворк-независимым `createSynapseAwaiter`:

```typescript
// awaitSynapse добавляет: withSynapseReady (HOC) и useSynapseReady (хук).
// Проксирует: waitForReady, isReady, getStoreIfReady, onReady, onError, getStatus, getError, destroy.

// Для vanilla JS / Node.js / без React — createSynapseAwaiter напрямую:
import { createSynapseAwaiter } from 'synapse-storage/utils'
const awaiter = createSynapseAwaiter(pokemonSynapse)
// Тот же программный API, но без React-хуков.
```

Подробнее о фреймворк-независимом варианте и SSR sync-fast-path — на странице
[synapse-awaiter](./synapse-awaiter.md). Итоговый разбор модуля целиком — в
[рецепте pokemon-advanced](./pokemon-advanced.md).
