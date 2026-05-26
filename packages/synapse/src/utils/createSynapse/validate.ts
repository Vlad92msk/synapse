export function validateSynapseConfig(config: any): void {
  // Проверяем базовые требования к хранилищу
  if (!config.storage && !config.createStorageFn) {
    throw new Error('Synapse config must have either "storage" or "createStorageFn"')
  }

  if (config.storage && config.createStorageFn) {
    throw new Error('Synapse config cannot have both "storage" and "createStorageFn". Choose one.')
  }

  // Проверяем зависимости эффектов от диспетчера
  if (config.effects && !config.createDispatcherFn) {
    throw new Error('Effects require dispatcher. Add "createDispatcherFn" to config.')
  }

  if (config.createEffectConfig && !config.createDispatcherFn) {
    throw new Error('Effect config requires dispatcher. Add "createDispatcherFn" to config.')
  }

  // Проверяем зависимости
  if (config.dependencies) {
    if (!Array.isArray(config.dependencies)) {
      throw new Error('Dependencies must be an array')
    }

    config.dependencies.forEach((dependency: any, index: number) => {
      if (!dependency || typeof dependency !== 'object') {
        throw new Error(`Dependency at index ${index} must be an object`)
      }

      // Skip validation for Promises — they will be resolved and validated in waitForDependencies
      if (dependency instanceof Promise || typeof dependency.then === 'function') {
        return
      }

      if (!dependency.storage || typeof dependency.storage.waitForReady !== 'function') {
        throw new Error(`Dependency at index ${index} must have a storage with waitForReady method`)
      }
    })
  }

  // Проверяем функции создания
  if (config.createStorageFn && typeof config.createStorageFn !== 'function') {
    throw new Error('"createStorageFn" must be a function')
  }

  if (config.createDispatcherFn && typeof config.createDispatcherFn !== 'function') {
    throw new Error('"createDispatcherFn" must be a function')
  }

  if (config.createSelectorsFn && typeof config.createSelectorsFn !== 'function') {
    throw new Error('"createSelectorsFn" must be a function')
  }

  if (config.createEffectConfig && typeof config.createEffectConfig !== 'function') {
    throw new Error('"createEffectConfig" must be a function')
  }

  // Проверяем эффекты
  if (config.effects) {
    if (!Array.isArray(config.effects)) {
      throw new Error('Effects must be an array')
    }

    config.effects.forEach((effect: any, index: number) => {
      if (typeof effect !== 'function') {
        throw new Error(`Effect at index ${index} must be a function`)
      }
    })
  }

  // Проверяем setup
  if (config.setup && typeof config.setup !== 'function') {
    throw new Error('"setup" must be a function')
  }

  // Проверяем внешние селекторы
  if (config.externalSelectors && typeof config.externalSelectors !== 'object') {
    throw new Error('External selectors must be an object')
  }
}
