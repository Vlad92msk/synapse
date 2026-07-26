# Запись данных (set / update)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/WritingDataExample.tsx)

Все способы **записать** данные в хранилище. Два основных метода различаются охватом:

| Метод | Что делает | Уведомлений подписчикам | Когда использовать |
|---|---|---|---|
| `set(key, value)` | заменяет **одно поле** целиком | одно на вызов | точечно поменять/заменить одно поле |
| `update(updater)` | Immer-like мутация **нескольких полей** атомарно | **одно** на весь коллбек | менять несколько полей / точечно править вложенное |
| `reset()` | возврат к `initialState` | одно | откатить стор к исходному |

Примеры используют сквозной `todoStorage` из раздела [MemoryStorage](./memory-storage.md)
(`TodoState = { todos: Todo[]; filter: Filter }`). Для Memory и LocalStorage запись синхронна,
для IndexedDB — с `await`.

## set(key, value) — заменить одно поле

**Когда:** нужно установить/заменить значение одного ключа верхнего уровня. **Когда НЕ нужно:**
меняешь несколько полей сразу (тогда `update` — одно уведомление вместо нескольких) или правишь
глубоко вложенный элемент (в `update` это делается мутацией без ручного копирования).

```typescript
// ── Синхронное хранилище (MemoryStorage / LocalStorage) ──

todoStorage.set('filter', 'completed')
todoStorage.set('todos', [{ id: 't1', title: 'Новая', done: false }])

// ── Асинхронное хранилище (IndexedDBStorage) ──

await todoStorage.set('filter', 'completed')
```

`set` — **полная замена** значения по ключу: старое значение отбрасывается целиком.

## update(updater) — изменить несколько полей сразу

`update()` использует мутации в стиле Immer: внутри коллбека состояние можно менять напрямую
(`push`, присваивание, правка вложенных объектов) — библиотека сама соберёт иммутабельный результат.
Все изменения применяются **атомарно — одно уведомление подписчикам** на весь коллбек.

**Когда:** менять несколько полей за раз или точечно править вложенный элемент. **Когда НЕ нужно:**
меняешь ровно одно поле целиком — короче `set`.

```typescript
// ── Синхронное хранилище ──

todoStorage.update((state) => {
  state.todos.push({ id: 't2', title: 'Купить молоко', done: false })
  state.filter = 'active'
})

// Точечное изменение вложенного элемента — без ручного копирования массива:
todoStorage.update((state) => {
  const target = state.todos.find((t) => t.id === 't2')
  if (target) target.done = true
})

// ── Асинхронное хранилище ──

await todoStorage.update((state) => {
  state.filter = 'completed'
})
```

## set() vs update() — что выбрать

Главный практический критерий — **число уведомлений подписчикам**. Несколько `set` подряд = несколько
ре-рендеров/срабатываний подписок; один `update` = одно.

```typescript
// set() — полная замена одного поля.
todoStorage.set('filter', 'active')
todoStorage.set('todos', [])

// update() — несколько полей атомарно, одно уведомление.
todoStorage.update((s) => {
  s.todos.push({ id: 't3', title: 'Задача', done: false })
  s.filter = 'all'
})

// Два set() = два уведомления:
todoStorage.set('filter', 'active')   // уведомление 1
todoStorage.set('todos', [])          // уведомление 2

// Тот же результат через update() = одно уведомление:
todoStorage.update((s) => {
  s.filter = 'active'                  // }
  s.todos = []                         // } одно объединённое уведомление
})
```

## reset() — сброс к initialState

Возвращает хранилище к `initialState` из конфига. В отличие от `clear()` (полностью очищает состояние
до `{}`) — восстанавливает исходные поля. Подробнее про разницу — в
[remove / has / keys / clear / reset](./delete-has-keys.md).

```typescript
// Синхронно
todoStorage.reset()

// Асинхронно
await todoStorage.reset()
```

## См. также

- [Чтение данных](./reading-data.md) — прочитать записанное.
- [remove / has / keys / clear / reset](./delete-has-keys.md) — удаление ключей, `clear` vs `reset`.
- [Подписки](./subscriptions.md) — как записи доходят до подписчиков.
