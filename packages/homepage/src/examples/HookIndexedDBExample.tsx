import type { IStorage } from 'synapse-storage/core'
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle, buttonRow } from './styles'

interface NotesState {
  notes: Array<{ id: number; text: string }>
  nextId: number
}

/**
 * Пример 7: useCreateStorage с type: 'indexedDB'
 */
export function HookIndexedDBExample() {
  const { storage, isReady, isLoading, hasError, status } = useCreateStorage<NotesState>({
    name: 'hook-notes',
    type: 'indexedDB',
    initialState: { notes: [], nextId: 1 },
  })

  if (isLoading) return <div>Loading...</div>
  if (hasError) return <div>Error: {status.error?.message}</div>
  if (!isReady || !storage) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>useCreateStorage (indexedDB)</h2>
      <NotesUI storage={storage} />
    </div>
  )
}

function NotesUI({ storage }: { storage: IStorage<NotesState> }) {
  const notes = useStorageSubscribe(storage, (s) => s.notes)
  const nextId = useStorageSubscribe(storage, (s) => s.nextId)

  return (
    <div>
      <button onClick={() => {
        storage.update((s) => {
          s.notes.push({ id: s.nextId, text: `Note #${s.nextId}` })
          s.nextId++
        })
      }}>
        Add note (update with multiple fields)
      </button>

      <ul>
        {(notes ?? []).map((note) => (
          <li key={note.id}>
            [{note.id}] {note.text}
            <button style={{ marginLeft: 8 }} onClick={() =>
              storage.update((s) => {
                s.notes = s.notes.filter((n) => n.id !== note.id)
              })
            }>
              delete
            </button>
          </li>
        ))}
      </ul>

      <p>Next ID: {nextId}</p>

      <div style={buttonRow}>
        <button onClick={() => storage.clear()}>clear()</button>
        <button onClick={async () => {
          const keys = await storage.keys()
          alert(`keys() = ${JSON.stringify(keys)}`)
        }}>
          await keys()
        </button>
        <button onClick={async () => {
          const has = await storage.has('notes')
          alert(`has('notes') = ${has}`)
        }}>
          await has('notes')
        </button>
      </div>
    </div>
  )
}
