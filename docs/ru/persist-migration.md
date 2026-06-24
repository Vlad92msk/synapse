# Persist-миграции (version + migrate)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/PersistMigrationExample.tsx)

Когда форма `initialState` меняется между релизами, в персистентном хранилище
(`LocalStorage` / `IndexedDB`) остаются данные **старой схемы**. Опции конфига
`version` и `migrate` позволяют преобразовать их к текущей схеме при инициализации —
без ручной проверки версий и без потери пользовательских данных.

Для `MemoryStorage` опции игнорируются (нечего персистить). Без `version` поведение
не меняется — миграция выключена.

## Как это работает

```typescript
import { LocalStorage } from 'synapse-storage/core'

interface Settings {
  theme: 'light' | 'dark'
  locale: string
}

const storage = new LocalStorage<Settings>({
  name: 'settings',
  version: 2,                            // текущая версия схемы
  initialState: { theme: 'light', locale: 'en' },
  migrate: (oldState, oldVersion) => {
    // oldVersion < 1 — самая первая схема (хранили { dark: boolean })
    if (oldVersion < 1) {
      return { theme: oldState.dark ? 'dark' : 'light', locale: 'en' }
    }
    // 1 → 2: добавили locale
    return { ...oldState, locale: oldState.locale ?? 'en' }
  },
})

await storage.initialize()
```

При `initialize()`:

1. Хранилище пустое → записывается `initialState` и фиксируется текущая `version`.
2. Есть данные, сохранённая версия **равна** текущей → данные используются как есть.
3. Есть данные, сохранённая версия **ниже** текущей → вызывается
   `migrate(oldState, oldVersion)`, результат записывается, версия обновляется.
4. Сохранённая версия **выше** текущей (открыта старая сборка) → данные не трогаются
   (+ dev-предупреждение).

Версия хранится **рядом** с данными, не засоряя само состояние:

- **LocalStorage** — отдельный sidecar-ключ `${name}::__synapse_version__`.
- **IndexedDB** — reserved-запись `__synapse_version__` в том же сторе. Она исключена
  из `getState()` / `keys()` и переживает `clear()` / перезапись всего состояния.

## Поднятие версии без migrate

Если поднять `version`, но не задать `migrate`, данные старой схемы останутся как есть,
а версия обновится. В dev-режиме выводится предупреждение — обычно это ошибка (забыли
написать миграцию).

```typescript
const storage = new LocalStorage<Settings>({
  name: 'settings',
  version: 3,                 // подняли
  initialState: { theme: 'light', locale: 'en' },
  // migrate не задан → старые данные останутся, версия станет 3 (+ dev warn)
})
```

## migrate вызывается один раз

После успешной миграции записывается новая версия, поэтому при следующих запусках с той
же `version` функция `migrate` больше не вызывается. Миграция идемпотентна по версии.

## SSR / гидрация

Если хранилище гидрируется серверным снапшотом через
[`hydrate(state)`](./ssr-hydration.md), снапшот считается уже актуальной схемой —
текущая `version` фиксируется, миграция на нём не запускается.

## Типы

```typescript
import type { MigrateFn } from 'synapse-storage/core'

// (persistedState, persistedVersion) => нормализованное состояние текущей схемы
type MigrateFn<T> = (persistedState: any, persistedVersion: number) => T

interface BaseStorageConfig<T> {
  name: string
  initialState?: T
  version?: number
  migrate?: MigrateFn<T>
  // ...
}
```

## См. также

- [LocalStorage](./local-storage.md) · [IndexedDB Storage](./indexeddb-storage.md)
- [SSR-гидрация](./ssr-hydration.md)
