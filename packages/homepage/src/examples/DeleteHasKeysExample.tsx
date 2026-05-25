import type { ISyncStorage } from 'synapse-storage/core'
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle, buttonRow } from './styles'

interface DictState {
  a: string
  b: number
  c: boolean
}

/**
 * Пример 10: Операции delete, has, keys
 */
export function DeleteHasKeysExample() {
  const { storage, isReady, isLoading } = useCreateStorage<DictState>({
    name: 'dict-demo',
    type: 'memory',
    initialState: { a: 'hello', b: 42, c: true },
  })

  if (isLoading) return <div>Loading...</div>
  if (!isReady || !storage) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>delete / has / keys / clear</h2>
      <StateAndControls storage={storage} />
    </div>
  )
}

function StateAndControls({ storage }: { storage: ISyncStorage<DictState> }) {
  const state = useStorageSubscribe(storage, (s) => s)

  return (
    <div>
      <pre style={{ background: '#f5f5f5', padding: 8 }}>{JSON.stringify(state, null, 2)}</pre>

      <div style={buttonRow}>
        <button onClick={() => {
          storage.remove('a')
        }}>
          remove('a')
        </button>

        <button onClick={() => {
          const result = storage.has('a')
          alert(`has('a') = ${result}`)
        }}>
          has('a')
        </button>

        <button onClick={() => {
          const result = storage.keys()
          alert(`keys() = ${JSON.stringify(result)}`)
        }}>
          keys()
        </button>

        <button onClick={() => storage.clear()}>
          clear()
        </button>

        <button onClick={() => storage.update((s) => {
          s.a = 'hello'
          s.b = 42
          s.c = true
        })}>
          restore
        </button>
      </div>
    </div>
  )
}
