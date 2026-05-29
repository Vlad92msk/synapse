import { handleOperationError, logError } from '../../_utils/error-handling.util'
import type { IStorageBase } from '../../core'
import type { DependencyInput } from './types'

const DEFAULT_DEPENDENCY_TIMEOUT = 30_000

/**
 * Извлекает IStorageBase из любого формата зависимости:
 * - IStorageBase напрямую (есть waitForReady)
 * - { storage: IStorageBase } — обёртка
 * - AnySynapseStore — результат createSynapse (тоже имеет .storage)
 */
function extractStorage(dep: any): IStorageBase<any> {
  if (typeof dep.waitForReady === 'function') return dep
  if (dep.storage && typeof dep.storage.waitForReady === 'function') return dep.storage
  throw new Error('Invalid dependency: expected IStorageBase or { storage: IStorageBase }')
}

export async function waitForDependencies(dependencies: DependencyInput[] = [], timeoutMs: number = DEFAULT_DEPENDENCY_TIMEOUT): Promise<void> {
  if (dependencies.length === 0) {
    return
  }

  logError(`Waiting for ${dependencies.length} dependencies to be ready...`, '', null, 'warn')

  await Promise.all(
    dependencies.map(async (dependencyOrPromise, index) => {
      try {
        const resolved = await dependencyOrPromise
        const storage = extractStorage(resolved)
        const name = storage.name || 'unnamed'

        // initialize() идемпотентен — повторный вызов безопасен
        await storage.initialize()

        await Promise.race([
          storage.waitForReady(),
          new Promise<never>((_, reject) =>
            globalThis.setTimeout(() => reject(new Error(`Dependency ${index} ("${name}") timed out after ${timeoutMs}ms. Check that it initializes correctly.`)), timeoutMs),
          ),
        ])
      } catch (error) {
        handleOperationError(`createSynapse: dependency ${index} failed to initialize`, error)
      }
    }),
  )
}
