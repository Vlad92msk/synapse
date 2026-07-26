# Установка

> [Назад к оглавлению](./README.md)

Один пакет — `synapse-storage`. Ядро не тянет лишних зависимостей: `rxjs` и `react` подключаются
только если нужен соответствующий слой.

## Установка пакета

```bash
# npm
npm install synapse-storage

# yarn
yarn add synapse-storage

# pnpm
pnpm add synapse-storage
```

## Опциональные peer-зависимости

Ставьте по необходимости — только под те слои, которые реально используете:

```bash
# эффекты на RxJS (слой synapse-storage/reactive)
npm install rxjs

# React-хуки и SSR (слой synapse-storage/react)
npm install react react-dom
```

> Нужен только реактивный стор (`MemoryStorage`, селекторы, диспетчер)? Достаточно одного
> `synapse-storage` — без `rxjs` и `react`.

## Импорты по слоям (суб-энтрипоинты)

Библиотека разбита на суб-пакеты, чтобы в бандл попадало только нужное. Импортируйте из конкретного
слоя, а не из корня:

```typescript
import { MemoryStorage, LocalStorage, Selectors } from 'synapse-storage/core'
import { Dispatcher, createEffect } from 'synapse-storage/reactive'
import { useStorageSubscribe, createSynapseCtx } from 'synapse-storage/react'
import { createSynapse, createEventBus } from 'synapse-storage/utils'
import { ApiClient } from 'synapse-storage/api'
```

| Энтрипоинт | Что внутри | Требует |
|---|---|---|
| `synapse-storage/core` | Хранилища (`MemoryStorage`, `LocalStorage`, `IndexedDBStorage`), middleware, селекторы | — |
| `synapse-storage/reactive` | Диспетчеры (`Dispatcher`) и эффекты в стиле Redux-Observable | `rxjs` |
| `synapse-storage/react` | React-хуки (`useStorageSubscribe`) и SSR-обвязка (`createSynapseCtx`) | `react`, `react-dom` |
| `synapse-storage/utils` | `createSynapse`, `createEventBus`, `createSynapseAwaiter`, `dehydrateModule` | — |
| `synapse-storage/api` | HTTP-клиент с кэшом на тегах | — |

> Пакет **ESM-only** (`"type": "module"`). CommonJS-`require` не поддерживается.

## См. также

- [createSynapse (базовый)](./create-synapse-basic.md) — с чего начать сборку модуля.
- [MemoryStorage](./memory-storage.md) · [LocalStorage](./local-storage.md) — первые хранилища.
