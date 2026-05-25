import { useState } from 'react'
import { MemoryStorageExample } from './examples/MemoryStorageExample'
import { LocalStorageExample } from './examples/LocalStorageExample'
import { IndexedDBExample } from './examples/IndexedDBExample'
import { FactoryExample } from './examples/FactoryExample'
import { HookExample } from './examples/HookExample'
import { HookLocalStorageExample } from './examples/HookLocalStorageExample'
import { HookIndexedDBExample } from './examples/HookIndexedDBExample'
import { StaticCreateExample } from './examples/StaticCreateExample'
import { SubscriptionPatternsExample } from './examples/SubscriptionPatternsExample'
import { DeleteHasKeysExample } from './examples/DeleteHasKeysExample'
import { CreateSynapseBasicExample } from './examples/CreateSynapseBasicExample'
import { CreateSynapseDispatcherExample } from './examples/CreateSynapseDispatcherExample'
import { CreateSynapseEffectsExample } from './examples/CreateSynapseEffectsExample'
import { SelectorSystemExample } from './examples/SelectorSystemExample'
import { DispatcherDetailedExample } from './examples/DispatcherDetailedExample'
import { SynapseCtxExample } from './examples/SynapseCtxExample'
import { AwaitSynapseExample } from './examples/AwaitSynapseExample'
import { SynapseAwaiterExample } from './examples/SynapseAwaiterExample'
import { EventBusExample } from './examples/EventBusExample'
import { MiddlewaresExample } from './examples/MiddlewaresExample'
import { PluginsExample } from './examples/PluginsExample'
import { SingletonExample } from './examples/SingletonExample'
import { ApiClientExample } from './examples/ApiClientExample'
import { DependenciesExample } from './examples/DependenciesExample'

const examples = [
  // Создание хранилищ
  { id: 'memory', label: '1. MemoryStorage (new)', component: MemoryStorageExample },
  { id: 'local', label: '2. LocalStorage (new)', component: LocalStorageExample },
  { id: 'indexeddb', label: '3. IndexedDBStorage (new)', component: IndexedDBExample },
  { id: 'factory', label: '4. StorageFactory', component: FactoryExample },
  { id: 'hook-memory', label: '5. useCreateStorage (memory)', component: HookExample },
  { id: 'hook-local', label: '6. useCreateStorage (localStorage)', component: HookLocalStorageExample },
  { id: 'hook-idb', label: '7. useCreateStorage (indexedDB)', component: HookIndexedDBExample },
  { id: 'static', label: '8. Static .create()', component: StaticCreateExample },
  // Получение данных
  { id: 'selector-system', label: '14. Selector system', component: SelectorSystemExample },
  { id: 'subscriptions', label: '9. Subscription patterns', component: SubscriptionPatternsExample },
  // Прочее
  { id: 'operations', label: '10. delete/has/keys/clear', component: DeleteHasKeysExample },
  { id: 'synapse-basic', label: '11. createSynapse (basic)', component: CreateSynapseBasicExample },
  { id: 'synapse-dispatcher', label: '12. createSynapse (dispatcher)', component: CreateSynapseDispatcherExample },
  { id: 'synapse-effects', label: '13. createSynapse (effects)', component: CreateSynapseEffectsExample },
  { id: 'dispatcher-detail', label: '15. Dispatcher detailed', component: DispatcherDetailedExample },
  { id: 'synapse-ctx', label: '16. createSynapseCtx (context)', component: SynapseCtxExample },
  { id: 'await-synapse', label: '17. awaitSynapse (ready)', component: AwaitSynapseExample },
  { id: 'synapse-awaiter', label: '18. createSynapseAwaiter', component: SynapseAwaiterExample },
  { id: 'event-bus', label: '19. createEventBus', component: EventBusExample },
  { id: 'middlewares', label: '20. Middlewares', component: MiddlewaresExample },
  { id: 'plugins', label: '21. Plugins (IStoragePlugin)', component: PluginsExample },
  { id: 'singleton', label: '22. Singleton pattern', component: SingletonExample },
  { id: 'api-client', label: '23. ApiClient', component: ApiClientExample },
  { id: 'dependencies', label: '24. Dependencies', component: DependenciesExample },
]

export function App() {
  const [active, setActive] = useState<string>(examples[0].id)
  const ActiveComponent = examples.find((e) => e.id === active)!.component

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <nav style={{
        width: 280,
        padding: 16,
        borderRight: '1px solid #ddd',
        background: '#fafafa',
        flexShrink: 0,
        overflowY: 'auto',
      }}>
        <h2 style={{ marginTop: 0 }}>Synapse API Audit</h2>
        {examples.map((ex) => (
          <button
            key={ex.id}
            onClick={() => setActive(ex.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '8px 12px',
              marginBottom: 4,
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              background: active === ex.id ? '#0066cc' : 'transparent',
              color: active === ex.id ? 'white' : '#333',
              fontSize: 14,
            }}
          >
            {ex.label}
          </button>
        ))}
      </nav>

      <main style={{ flex: 1, padding: 24, maxWidth: 800 }}>
        <ActiveComponent />
      </main>
    </div>
  )
}
