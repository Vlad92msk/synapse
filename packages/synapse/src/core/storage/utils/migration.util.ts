import { loggerConsole } from '../../../_utils'
import type { MigrateFn } from '../storage.interface'

/**
 * Решение о миграции персистентного состояния, принимаемое до записи. Чистая функция —
 * не трогает хранилище; применяет результат вызывающий (`initializeWithMiddlewares`),
 * т.к. запись отличается в sync/async адаптерах.
 */
export type MigrationDecision<T> =
  /** Данных нет — записать `initialState` (если задан) и текущую версию. */
  | { kind: 'seed' }
  /** Данные старой версии — записать `state` (результат `migrate`) и текущую версию. */
  | { kind: 'migrate'; state: T }
  /** Данные актуальной формы, но версию надо обновить (например, поднята без `migrate`). */
  | { kind: 'bump' }
  /** Ничего не делать (версии совпадают либо сохранённая новее текущей). */
  | { kind: 'none' }

export interface DecideMigrationOptions<T extends Record<string, any>> {
  hasExisting: boolean
  existingState: any
  persistedVersion: number | undefined
  targetVersion: number
  migrate?: MigrateFn<T>
}

/**
 * Сравнивает сохранённую версию схемы с текущей (`config.version`) и решает, что делать
 * с персистентными данными при инициализации. Dev-предупреждения (в non-production) —
 * только при потенциально опасных рассогласованиях (версия поднята без `migrate`,
 * сохранённая версия новее текущей).
 */
export function decideMigration<T extends Record<string, any>>(options: DecideMigrationOptions<T>): MigrationDecision<T> {
  const { hasExisting, existingState, targetVersion, migrate } = options

  if (!hasExisting) {
    return { kind: 'seed' }
  }

  const persistedVersion = options.persistedVersion ?? 0

  if (persistedVersion === targetVersion) {
    return { kind: 'none' }
  }

  if (persistedVersion > targetVersion) {
    if (process.env.NODE_ENV !== 'production') {
      loggerConsole.warn(
        `[synapse] persisted state version (${persistedVersion}) новее текущей config.version (${targetVersion}). ` +
          'Оставляю данные как есть. Похоже, открыта старая сборка поверх данных новой схемы.',
      )
    }
    return { kind: 'none' }
  }

  // persistedVersion < targetVersion → нужна миграция
  if (migrate) {
    return { kind: 'migrate', state: migrate(existingState, persistedVersion) }
  }

  if (process.env.NODE_ENV !== 'production') {
    loggerConsole.warn(
      `[synapse] config.version поднята до ${targetVersion} (в хранилище версия ${persistedVersion}), но migrate не задан. ` +
        'Оставляю сохранённые данные старой схемы как есть — задайте migrate(oldState, oldVersion) для преобразования.',
    )
  }
  return { kind: 'bump' }
}
