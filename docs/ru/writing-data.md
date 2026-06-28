# Запись данных (set/update)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/WritingDataExample.tsx)

Все способы записать данные в хранилище. Примеры используют сквозной `todoStorage` из раздела
[MemoryStorage](./memory-storage.md) (`TodoState = { todos: Todo[]; filter: Filter }`). Для Memory и
LocalStorage запись синхронна, для IndexedDB — с `await`.

## set(key, value) — Установить значение по ключу

```typescript
// ── Синхронное хранилище (MemoryStorage / LocalStorage) ──

todoStorage.set('filter', 'completed')
todoStorage.set('todos', [{ id: 't1', title: 'Новая', done: false }])

// ── Асинхронное хранилище (IndexedDBStorage) ──

await todoStorage.set('filter', 'completed')
```

## update(updater) — Изменить несколько полей сразу

`update()` использует мутации в стиле immer. Можно мутировать состояние напрямую внутри коллбека. Все изменения применяются атомарно — одно уведомление подписчикам.

```typescript
// ── Синхронное хранилище ──

todoStorage.update((state) => {
  state.todos.push({ id: 't2', title: 'Купить молоко', done: false })
  state.filter = 'active'
})

// Удобно для точечного изменения вложенного элемента:
todoStorage.update((state) => {
  const target = state.todos.find((t) => t.id === 't2')
  if (target) target.done = true
})

// ── Асинхронное хранилище ──

await todoStorage.update((state) => {
  state.filter = 'completed'
})
```

## set() vs update() — Когда что использовать

```typescript
// set() — полная замена значения по одному ключу.
// Подходит для изменения одного поля или полной замены массива/объекта.
todoStorage.set('filter', 'active')
todoStorage.set('todos', [])

// update() — мутация нескольких полей сразу.
// Подходит для атомарного изменения нескольких полей.
// Одно уведомление подписчикам вместо нескольких.
todoStorage.update((s) => {
  s.todos.push({ id: 't3', title: 'Задача', done: false })
  s.filter = 'all'
})

// При set() каждый вызов = отдельное уведомление:
todoStorage.set('filter', 'active')   // уведомление 1
todoStorage.set('todos', [])          // уведомление 2

// При update() — одно уведомление:
todoStorage.update((s) => {
  s.filter = 'active'                  // уведомление 1 (объединённое)
  s.todos = []
})
```

## reset() — Сброс к initialState

```typescript
// Возвращает хранилище к начальному состоянию (initialState из конфига).

// Синхронно
todoStorage.reset()

// Асинхронно
await todoStorage.reset()
```
