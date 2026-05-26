import { handleOperationError, logError } from '../../_utils/error-handling.util'
import type { AnySynapseStore, SynapseDependency } from './types'

const DEFAULT_DEPENDENCY_TIMEOUT = 30_000

export async function waitForDependencies(dependencies: (SynapseDependency | Promise<SynapseDependency | AnySynapseStore>)[] = [], timeoutMs: number = DEFAULT_DEPENDENCY_TIMEOUT): Promise<void> {
  if (dependencies.length === 0) {
    return
  }

  logError(`Waiting for ${dependencies.length} dependencies to be ready...`, '', null, 'warn')

  await Promise.all(
    dependencies.map(async (dependencyOrPromise, index) => {
      try {
        const dependency = await dependencyOrPromise
        const name = dependency.storage.name || 'unnamed'

        await Promise.race([
          dependency.storage.waitForReady(),
          new Promise<never>((_, reject) =>
            globalThis.setTimeout(
              () => reject(new Error(`Dependency ${index} ("${name}") timed out after ${timeoutMs}ms. Check that it initializes correctly.`)),
              timeoutMs,
            ),
          ),
        ])
      } catch (error) {
        handleOperationError(`createSynapse: dependency ${index} failed to initialize`, error)
      }
    }),
  )
}
