# MemoryStorage

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/MemoryStorageExample.tsx)

Хранилище в оперативной памяти. Данные существуют только пока открыта страница. Синхронный API.

Все примеры раздела State Manager построены на одном сквозном домене — todo-list. Это
канонический стор, который дальше переиспользуется в разделах «Работа с данными» и «Паттерны».

## Домен

```typescript
export interface Todo {
  id: string
  title: string
  done: boolean
}

export type Filter = 'all' | 'active' | 'completed'

export interface TodoState {
  todos: Todo[]
  filter: Filter
}

export const initialTodoState: TodoState = {
  todos: [
    { id: 't1', title: 'Изучить Synapse', done: true },
    { id: 't2', title: 'Собрать todo-приложение', done: false },
  ],
  filter: 'all',
}
```

## Создание

```typescript
import { MemoryStorage } from 'synapse-storage/core'

// Через new
export const todoStorage = new MemoryStorage<TodoState>({
  name: 'todo',
  initialState: initialTodoState,
})

// Или через статический .create() — полный эквивалент
const todoStorage = MemoryStorage.create<TodoState>({
  name: 'todo',
  initialState: initialTodoState,
})

// Инициализация обязательна перед использованием
await todoStorage.initialize()
```

## Когда брать

- Эфемерное UI-состояние: фильтры, формы, состояние модалок, выбранные элементы.
- Состояние, которое не должно переживать перезагрузку страницы.
- Базовый выбор по умолчанию — если не нужна персистентность.

## Когда не брать

- Нужно сохранять данные между перезагрузками → [LocalStorage](./local-storage.md) или
  [IndexedDB](./indexeddb-storage.md).
- Большие объёмы данных или бинарные данные → [IndexedDB](./indexeddb-storage.md).

## Работа с данными

Чтение, запись, подписки и селекторы одинаковы для всех синхронных хранилищ и разобраны в
разделе «Работа с данными»:

- [Чтение данных](./reading-data.md) — `get`, `getState`, `getStateSync`
- [Запись данных](./writing-data.md) — `set`, `update`, `reset`
- [remove / has / keys / clear / reset](./delete-has-keys.md)
- [Подписки](./subscriptions.md) и [Селекторы](./selector-system.md)

## Жизненный цикл

```typescript
await todoStorage.initialize()    // инициализация
await todoStorage.waitForReady()  // ожидание готовности
todoStorage.initStatus            // { status: 'ready' }

// Подписка на изменение статуса
const unsub = todoStorage.onStatusChange((status) => {
  console.log(status) // { status: 'ready' | 'loading' | 'error' | 'idle' }
})

await todoStorage.destroy()       // уничтожение (для memory очищает данные)
```
