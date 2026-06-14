import { IStorage, IStorageBase } from '../../core'

// Вспомогательные типы для извлечения типов из других типов
export type ExtractPromiseType<T> = T extends Promise<infer U> ? U : T
export type ExtractStorageType<T> = T extends IStorageBase<infer U> ? U : never

export type StorageCreatorFunction<T extends Record<string, any>> = () => Promise<IStorage<T>>

export type SynapseDependency = {
  storage: IStorageBase<any>
}

/**
 * Всё, что можно передать в `dependencies[]`: raw storage, обёртка `{ storage }`,
 * или Promise/Handle другого synapse (любой объект с `.storage: IStorageBase`).
 */
export type DependencyInput = IStorageBase<any> | SynapseDependency | PromiseLike<{ storage: IStorageBase<any> }>
