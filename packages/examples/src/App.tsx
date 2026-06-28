import { useState } from 'react'
import { MemoryStorageExample } from './examples/MemoryStorageExample'
import { LocalStorageExample } from './examples/LocalStorageExample'
import { IndexedDBExample } from './examples/IndexedDBExample'
import { FactoryExample } from './examples/FactoryExample'
import { HookExample } from './examples/HookExample'
import { HookLocalStorageExample } from './examples/HookLocalStorageExample'
import { HookIndexedDBExample } from './examples/HookIndexedDBExample'
import { StaticCreateExample } from './examples/StaticCreateExample'
import { PersistMigrationExample } from './examples/PersistMigrationExample'
import { HydrateExample } from './examples/HydrateExample'
import { SubscriptionPatternsExample } from './examples/SubscriptionPatternsExample'
import { ReadingDataExample } from './examples/ReadingDataExample'
import { WritingDataExample } from './examples/WritingDataExample'
import { DeleteHasKeysExample } from './examples/DeleteHasKeysExample'
import { SelectorSystemExample } from './examples/SelectorSystemExample'
import { ReactiveSelectorExample } from './examples/ReactiveSelectorExample'
import { SynapseCtxExample } from './examples/SynapseCtxExample'
import { SynapseCtxSsrExample } from './examples/SynapseCtxSsrExample'
import { SynapseAwaiterExample } from './examples/SynapseAwaiterExample'
import { EventBusExample } from './examples/EventBusExample'
import { MiddlewaresExample } from './examples/MiddlewaresExample'
import { SingletonExample } from './examples/SingletonExample'
import { ApiClientExample } from './examples/ApiClientExample'
import { PokemonAdvancedExample } from './examples/pokemon-advanced'

const groupLabels: Record<string, string> = {
  create: 'Создание хранилищ',
  data: 'Работа с данными',
  synapse: 'createSynapse',
  react: 'React',
  patterns: 'Паттерны',
  utils: 'Утилиты',
}

const examples = [
  // Создание хранилищ
  { id: 'memory', label: 'MemoryStorage (new)', component: MemoryStorageExample, group: 'create' },
  { id: 'local', label: 'LocalStorage (new)', component: LocalStorageExample, group: 'create' },
  { id: 'indexeddb', label: 'IndexedDBStorage (new)', component: IndexedDBExample, group: 'create' },
  { id: 'factory', label: 'StorageFactory', component: FactoryExample, group: 'create' },
  { id: 'hook-memory', label: 'useCreateStorage (memory)', component: HookExample, group: 'create' },
  { id: 'hook-local', label: 'useCreateStorage (localStorage)', component: HookLocalStorageExample, group: 'create' },
  { id: 'hook-idb', label: 'useCreateStorage (indexedDB)', component: HookIndexedDBExample, group: 'create' },
  { id: 'static', label: 'Static .create()', component: StaticCreateExample, group: 'create' },
  { id: 'persist-migration', label: 'Persist-миграции (version/migrate)', component: PersistMigrationExample, group: 'create' },
  { id: 'hydrate', label: 'SSR-гидрация (hydrate)', component: HydrateExample, group: 'create' },
  // Работа с данными
  { id: 'reading-data', label: 'Чтение данных (get/getState)', component: ReadingDataExample, group: 'data' },
  { id: 'writing-data', label: 'Запись данных (set/update)', component: WritingDataExample, group: 'data' },
  { id: 'operations', label: 'remove / has / keys / clear / reset', component: DeleteHasKeysExample, group: 'data' },
  { id: 'subscriptions', label: 'Подписки (subscribe)', component: SubscriptionPatternsExample, group: 'data' },
  { id: 'selector-system', label: 'Селекторы (Selectors)', component: SelectorSystemExample, group: 'data' },
  { id: 'reactive-selector', label: 'Реактивный селектор (selector.$)', component: ReactiveSelectorExample, group: 'data' },
  // createSynapse / BLL (канонический пример — Pokemon)
  { id: 'pokemon-advanced', label: 'Pokemon Pokedex (advanced)', component: PokemonAdvancedExample, group: 'synapse' },
  // React
  { id: 'synapse-ctx', label: 'createSynapseCtx', component: SynapseCtxExample, group: 'react' },
  { id: 'synapse-ctx-ssr', label: 'createSynapseCtx (SSR)', component: SynapseCtxSsrExample, group: 'react' },
  // Паттерны
  { id: 'middlewares', label: 'Middlewares', component: MiddlewaresExample, group: 'patterns' },
  { id: 'singleton', label: 'Singleton pattern', component: SingletonExample, group: 'patterns' },
  // Утилиты
  { id: 'api-client', label: 'ApiClient', component: ApiClientExample, group: 'utils' },
  { id: 'synapse-awaiter', label: 'createSynapseAwaiter', component: SynapseAwaiterExample, group: 'utils' },
  { id: 'event-bus', label: 'createEventBus', component: EventBusExample, group: 'utils' },
]

export function App() {
  const [active, setActive] = useState<string>(examples[0].id)
  const ActiveComponent = examples.find((e) => e.id === active)!.component

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', height: '100vh', position: 'relative', overflow: 'auto' }}>
      <nav style={{
        width: 280,
        padding: 16,
        borderRight: '1px solid #ddd',
        background: '#fafafa',
        flexShrink: 0,
        overflowY: 'auto',
        position: 'sticky',
        top: '0'
      }}>
        <h2 style={{ marginTop: 0 }}>Synapse API Audit</h2>
        {Object.entries(groupLabels).map(([group, label]) => (
          <div key={group} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#888',
              padding: '4px 12px',
              marginBottom: 4,
            }}>
              {label}
            </div>
            {examples.filter((ex) => ex.group === group).map((ex) => (
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
          </div>
        ))}
      </nav>

      <main style={{ flex: 1, padding: 24, maxWidth: 800 }}>
        <ActiveComponent />
      </main>
    </div>
  )
}


