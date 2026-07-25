export { createEventBus, type EventBusConfig, type EventBusEvent, type EventBusState } from './createEventBus'
export {
  createSynapse,
  type CreateSynapseOptions,
  type Synapse,
  type SynapseConfig,
  type SynapseCore,
  type SynapseModule,
  type SynapseObjectConfig,
  type SynapseShellConfig,
  type SynapseWiring,
} from './createSynapse/index'
export { type AwaitableSynapse, createSynapseAwaiter, type SynapseAwaiter } from './createSynapseAwaiter'
export { dehydrateModule, type DehydrateModuleOptions } from './dehydrateModule'
