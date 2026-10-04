# Установка

> [Назад к оглавлению](./README.md)

Один пакет — `synapse-storage`. Собственных зависимостей у него нет: `react` и `rxjs` — опциональные
peer-зависимости, а пакет tree-shakeable (`"sideEffects": false`) — в бандл попадает только то, что вы
импортировали. `rxjs` нужен только слою эффектов (`synapse-storage/reactive`).

## Установка пакета

```bash
# npm
npm install synapse-storage

# yarn
yarn add synapse-storage

# pnpm
pnpm add synapse-storage
```

## Peer-зависимости

```bash
# React-хуки и SSR (слой synapse-storage/react)
npm install react react-dom

# Только если пишете эффекты (synapse-storage/reactive): Effects, ofType, validateMap, toObservable…
npm install rxjs
```

**`rxjs` действительно опционален.** Без него работает всё, кроме слоя эффектов, — ставьте его, только
когда пишете `Effects`:

- **без `rxjs`:** хранилища (`MemoryStorage`, `LocalStorage`, `IndexedDBStorage`, `WorkerCacheStorage`)
  и их middleware, `Selectors`, `Dispatcher`, `createSynapse`, `createSynapseCtx`/`awaitSynapse`,
  `createEventBus`, `ApiClient` и все React-хуки (`useSelector`, `useStorageSubscribe`, `useStorage`,
  `useApiQuery`, `useApiMutation`, `useObservable`, `useSubscription`, `useStorageObservable`);
- **с `rxjs`:** только `synapse-storage/reactive` — `Effects`, операторы (`ofType`, `validateMap`,
  `mutationMap`, `apiResult`, …), `fromRequest`, `toObservable`.

Потоки ядра (`selector.$`, `dispatcher.action$`, вотчеры, `synapse.state$`) — лёгкие *interop*-потоки:
у них есть `subscribe()` и `Symbol.observable`, но нет `pipe`. На них можно подписаться напрямую или
превратить в RxJS `Observable` через `toObservable(x)` (из `synapse-storage/reactive`) или rxjs `from(x)`:

```typescript
import { toObservable } from 'synapse-storage/reactive'

selectors.query.$.subscribe((q) => console.log(q)) // rxjs не нужен
toObservable(selectors.query).pipe(debounceTime(300)) // с операторами rxjs
```

## Импорты по слоям (суб-энтрипоинты)

Корневой импорт (`synapse-storage`) — framework-agnostic ядро: ему **не нужны ни `rxjs`, ни `react`**,
и он tree-shakeable. Опциональные peer-зависимости живут только в своих энтрипоинтах: бандлер резолвит
все импорты модулей энтрипоинта *до* tree-shaking, поэтому энтрипоинт с упоминанием `react` или `rxjs`
не собрался бы без них.

```typescript
import { MemoryStorage, Selectors, Dispatcher, createSynapse, ApiClient } from 'synapse-storage'
import { useSelector, createSynapseCtx } from 'synapse-storage/react' // нужен react
import { Effects, ofType, validateMap, toObservable } from 'synapse-storage/reactive' // нужен rxjs
```

| Энтрипоинт | Что внутри | Требует |
|---|---|---|
| `synapse-storage` | `core` + `dispatcher` + `utils` + `api` | — |
| `synapse-storage/core` | Хранилища (`MemoryStorage`, `LocalStorage`, `IndexedDBStorage`, `WorkerCacheStorage`), middleware, селекторы | — |
| `synapse-storage/dispatcher` | `Dispatcher`, `ApiStatus`, middleware диспетчера | — |
| `synapse-storage/utils` | `createSynapse`, `createEventBus`, `createSynapseAwaiter`, `dehydrateModule` | — |
| `synapse-storage/react` | React-хуки и SSR-обвязка (`createSynapseCtx`) | `react`, `react-dom` |
| `synapse-storage/api` | HTTP-клиент с кэшом на тегах | — |
| `synapse-storage/reactive` | Эффекты в стиле Redux-Observable + RxJS-операторы (также реэкспортирует `Dispatcher`) | `rxjs` |

> Пакет **ESM-only** (`"type": "module"`). CommonJS-`require` не поддерживается.

## См. также

- [createSynapse (базовый)](./create-synapse-basic.md) — с чего начать сборку модуля.
- [MemoryStorage](./memory-storage.md) · [LocalStorage](./local-storage.md) — первые хранилища.
