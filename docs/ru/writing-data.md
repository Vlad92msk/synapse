# Запись данных (set/update)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/WritingDataExample.tsx)

Все способы записи данных в хранилище. Работают одинаково для Memory и LocalStorage (синхронно), для IndexedDB — с `await`.

## set(key, value) — Установить значение по ключу

```typescript
// ── Синхронное хранилище (MemoryStorage / LocalStorage) ──

storage.set('name', 'Bob')
storage.set('age', 30)
storage.set('tags', ['admin', 'editor'])
storage.set('settings', { theme: 'dark', notifications: false })

// ── Асинхронное хранилище (IndexedDBStorage) ──

await storage.set('name', 'Bob')
await storage.set('age', 30)
```

## update(updater) — Изменить несколько полей сразу

`update()` использует мутации в стиле immer. Можно мутировать состояние напрямую внутри коллбека. Все изменения применяются атомарно — одно уведомление подписчикам.

```typescript
// ── Синхронное хранилище ──

storage.update((state) => {
  state.name = 'Charlie'
  state.age += 5
  state.tags.push('moderator')
  state.settings.theme = 'dark'
})

// Удобно для вложенных объектов:
storage.update((state) => {
  state.settings.notifications = false
})

// ── Асинхронное хранилище ──

await storage.update((state) => {
  state.name = 'Charlie'
  state.age += 5
})
```

## set() vs update() — Когда что использовать

```typescript
// set() — полная замена значения по одному ключу.
// Подходит для изменения одного поля или полной замены объекта.
storage.set('name', 'Bob')
storage.set('settings', { theme: 'dark', notifications: false })

// update() — мутация нескольких полей сразу.
// Подходит для атомарного изменения нескольких полей.
// Одно уведомление подписчикам вместо нескольких.
storage.update((s) => {
  s.name = 'Bob'
  s.age = 30
  s.settings.theme = 'dark'
})

// При set() каждый вызов = отдельное уведомление:
storage.set('name', 'Bob')     // уведомление 1
storage.set('age', 30)         // уведомление 2

// При update() — одно уведомление:
storage.update((s) => {
  s.name = 'Bob'               // уведомление 1 (объединённое)
  s.age = 30
})
```

## reset() — Сброс к initialState

```typescript
// Возвращает хранилище к начальному состоянию (initialState из конфига).

// Синхронно
storage.reset()

// Асинхронно
await storage.reset()
```
