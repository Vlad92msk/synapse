# createSynapseAwaiter — фреймворк-независимый awaiter

> [Назад к оглавлению](./README.md) · [Песочница (Config)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/SynapseAwaiterExample.tsx)

Утилита для ожидания асинхронной инициализации модуля Synapse. Работает в любом JS-окружении:
Node.js, браузер, React Native, воркеры. React-обёртка над ней — [awaitSynapse](./await-synapse.md)
(добавляет HOC `withSynapseReady` и хук `useSynapseReady`); саму поверхность методов
(`waitForReady`/`isReady`/`getStoreIfReady`/`onReady`/`onError`/`getStatus`/`getError`/`destroy`)
`awaitSynapse` целиком проксирует отсюда.

Берёт ленивый handle из `createSynapse` (см. [create-synapse-basic](./create-synapse-basic.md)),
запускает его инициализацию и даёт синхронные/асинхронные способы дождаться готовности `storage`.

## Импорты и создание

```typescript
import { createSynapseAwaiter } from 'synapse-storage/utils'
import { pokemonSynapse } from './pokemon.synapse'

// Принимает ленивый handle (типичный случай — async-пролог initPokemonApi в фабрике),
// Promise готового synapse или сам готовый synapse.
const pokemonAwaiter = createSynapseAwaiter(pokemonSynapse)

// Вариант с уже готовым модулем:
const ready = await pokemonSynapse
const awaiter2 = createSynapseAwaiter(ready)
```

## Программная поверхность

```typescript
// Синхронные проверки
pokemonAwaiter.isReady()         // boolean
pokemonAwaiter.getStatus()       // 'pending' | 'ready' | 'error'
pokemonAwaiter.getError()        // Error | null
pokemonAwaiter.getStoreIfReady() // PokemonSynapse | undefined

// Асинхронное ожидание — Promise<PokemonSynapse>. Безопасно звать многократно: тот же стор.
const store = await pokemonAwaiter.waitForReady()
store.actions.loadList()

// Колбэки (возвращают функцию отписки). onReady на готовом модуле срабатывает немедленно.
const unsub = pokemonAwaiter.onReady((store) => {
  console.log('pokemon ready, list:', store.storage.getStateSync().pokemonList.length)
})
const unsubErr = pokemonAwaiter.onError((error) => console.error('init failed:', error.message))

// Очистка: сброс подписок, status -> 'pending', store -> undefined.
pokemonAwaiter.destroy()
```

`getStoreIfReady()` возвращает собранный модуль — его форма зависит от конфигурации `createSynapse`.
У `pokemonSynapse` это полный набор: `storage`, `selectors`, `dispatcher`/`actions`, `state$`,
`destroy()`. До готовности — `undefined`.

## SSR sync-fast-path

Ключевое отличие от обычного ожидания: если на вход подан **уже готовый** synapse (или handle, чей
`getSnapshot()` отдаёт synapse с `READY`-хранилищем), awaiter выставляет `store` и `status = 'ready'`
**синхронно в теле функции**, ещё до возврата — без микротаски. Тогда `getStoreIfReady()`/`isReady()`
отдают стор уже на первом синхронном рендере, что и нужно серверному `renderToString`. Не прогретый
handle уходит в обычную async-ветку.

```typescript
// На сервере: сперва прогреваем модуль, затем awaiter резолвится синхронно.
await pokemonSynapse.ready()           // фабрика отработала, storage READY
const awaiter = createSynapseAwaiter(pokemonSynapse)

awaiter.isReady()          // true — синхронно, без await
awaiter.getStoreIfReady()  // PokemonSynapse, доступен в том же тике
// → renderToString видит готовое состояние на первом проходе
```

Полный SSR-поток (dehydrate на сервере → hydrate на клиенте) — на странице
[createSynapseCtx](./synapse-ctx.md).

## Использование в React (без обёртки)

Если не хочется тянуть HOC/хук из `awaitSynapse`, awaiter можно использовать вручную через подписки:

```typescript
function PokemonStatus() {
  const [status, setStatus] = useState(pokemonAwaiter.getStatus())
  const [count, setCount] = useState(0)

  useEffect(() => {
    const unsubReady = pokemonAwaiter.onReady((store) => {
      setStatus('ready')
      setCount(store.storage.getStateSync().pokemonList.length)
    })
    const unsubError = pokemonAwaiter.onError(() => setStatus('error'))

    // Если модуль уже готов на момент монтирования — синхронизируемся сразу.
    if (pokemonAwaiter.isReady()) {
      setStatus('ready')
      setCount(pokemonAwaiter.getStoreIfReady()?.storage.getStateSync().pokemonList.length ?? 0)
    }

    return () => { unsubReady(); unsubError() }
  }, [])

  if (status === 'pending') return <div>Загрузка модуля...</div>
  if (status === 'error') return <div>Ошибка инициализации</div>
  return <div>Загружено покемонов: {count}</div>
}
```

> В реальном React-приложении на этот случай удобнее [awaitSynapse](./await-synapse.md) —
> он инкапсулирует ровно эту подписку в HOC/хук. `createSynapseAwaiter` нужен там, где React нет
> (Node-рендер, прелоад данных, скрипты) или где требуется sync-fast-path.

Итоговый разбор модуля целиком — в [рецепте pokemon-advanced](./pokemon-advanced.md).
