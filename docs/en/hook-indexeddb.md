# useCreateStorage (indexedDB)

> [Back to Main](../../README.md)

The same hook with `type: 'indexedDB'`. Returns `IAsyncStorage`. Note: `destroyOnUnmount` defaults to `false` for IndexedDB.

## Usage

```typescript
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

interface NotesState {
  notes: Array<{ id: number; text: string }>
  nextId: number
}

function NotesPage() {
  const { storage, isReady } = useCreateStorage<NotesState>({
    type: 'indexedDB',
    name: 'hook-notes',
    initialState: { notes: [], nextId: 1 },
  })
  // storage has type IAsyncStorage<NotesState> | null

  // Important: destroyOnUnmount = false by default for indexedDB
  // To destroy it on unmount:
  const result = useCreateStorage<NotesState>(
    { type: 'indexedDB', name: 'notes', initialState: { notes: [], nextId: 1 } },
    { destroyOnUnmount: true }
  )

  if (!isReady) return <div>Loading...</div>

  // useStorageSubscribe works identically for synchronous and asynchronous storages
  const notes = useStorageSubscribe(storage, (s) => s.notes)

  // set/update — return a Promise (but await isn't needed in handlers)
  storage.set('nextId', 5)
  storage.update((s) => { s.notes.push({ id: s.nextId, text: 'New' }) })
}
```

## Full example

```tsx
function NotesPage() {
  const { storage, isReady, hasError, status } = useCreateStorage<NotesState>({
    type: 'indexedDB',
    name: 'hook-notes',
    initialState: { notes: [], nextId: 1 },
  })

  if (hasError) return <div>Error: {status.error?.message}</div>
  if (!isReady) return <div>Loading...</div>

  return <NotesUI storage={storage} />
}

function NotesUI({ storage }: { storage: IAsyncStorage<NotesState> }) {
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
        Add note
      </button>

      <ul>
        {(notes ?? []).map((note) => (
          <li key={note.id}>
            {note.text}
            <button onClick={() =>
              storage.update((s) => { s.notes = s.notes.filter((n) => n.id !== note.id) })
            }>x</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```
