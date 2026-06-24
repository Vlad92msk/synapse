# LocalStorage

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/LocalStorageExample.tsx)

Данные хранятся в `localStorage` браузера. Сохраняются после перезагрузки страницы. Синхронный API (идентичен MemoryStorage).

## Создание

```typescript
import { LocalStorage } from 'synapse-storage/core'

interface ThemeState {
  theme: 'light' | 'dark'
  fontSize: number
}

// Через new
const storage = new LocalStorage<ThemeState>({
  name: 'theme-settings',           // ключ в localStorage
  initialState: { theme: 'light', fontSize: 14 },
})

// Или через статический .create()
const storage = LocalStorage.create<ThemeState>({
  name: 'theme-settings',
  initialState: { theme: 'light', fontSize: 14 },
})

// Инициализация — загружает данные из localStorage, если они есть
await storage.initialize()
```

## Запись данных

```typescript
// set() — установить значение по ключу
storage.set('theme', 'dark')
storage.set('fontSize', 16)

// update() — изменить несколько полей сразу
storage.update((s) => {
  s.theme = 'dark'
  s.fontSize = 18
})
```

## Чтение данных

```typescript
// Все методы идентичны MemoryStorage:
const theme = storage.get<string>('theme')     // 'dark'
const state = storage.getState()               // { theme: 'dark', fontSize: 16 }
const state = storage.getStateSync()           // то же самое
```

## Проверка, удаление, сброс

```typescript
// Все методы идентичны MemoryStorage:
storage.has('theme')     // true
storage.keys()           // ['theme', 'fontSize']
storage.remove('theme')  // удалить ключ
storage.clear()          // очистить всё (state = {})
storage.reset()          // вернуть к initialState
```

## Подписки

```typescript
// Идентично MemoryStorage:
const unsub = storage.subscribe('theme', (newValue) => {
  console.log('тема изменилась:', newValue)
})

const unsub = storage.subscribe(
  (state) => state.fontSize,
  (newSize) => console.log('fontSize:', newSize)
)

const unsub = storage.subscribeToAll((event) => {
  console.log('изменено:', event)
})
```

## Отличия от MemoryStorage

API полностью идентичен MemoryStorage. Единственное отличие — данные сохраняются в localStorage браузера:

- При `initialize()` данные загружаются из localStorage
- При `set/update/clear/reset` данные автоматически синхронизируются
- Ключ в localStorage равен полю `name` в конфигурации

## destroy() и clearOnDestroy

`destroy()` по умолчанию **не стирает** данные в localStorage — состояние переживает
уничтожение хранилища (так же ведёт себя персистентный IndexedDB). Поведение управляется
флагом конфига `clearOnDestroy?: boolean` (`SyncStorageConfig`): по умолчанию `false` для
`localStorage` и `true` для `memory` (эфемерное). Чтобы `destroy()` чистил localStorage,
передайте `{ clearOnDestroy: true }`.

## Persist-миграции и SSR

Так как данные персистентны, при смене формы `initialState` между релизами их можно
мигрировать через `version` + `migrate` — см. [Persist-миграции](./persist-migration.md).
Серверное состояние можно засеять через [`hydrate(state)`](./ssr-hydration.md).
