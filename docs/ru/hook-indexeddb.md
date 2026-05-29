# useCreateStorage (indexedDB)

> [Назад к оглавлению](./README.md)

Тот же хук с `type: 'indexedDB'`. Возвращает `IAsyncStorage`. Примечание: `destroyOnUnmount` по умолчанию равен `false` для IndexedDB.

## Использование

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
  // storage имеет тип IAsyncStorage<NotesState> | null

  // Важно: destroyOnUnmount = false по умолчанию для indexedDB
  // Чтобы уничтожить при размонтировании:
  const result = useCreateStorage<NotesState>(
    { type: 'indexedDB', name: 'notes', initialState: { notes: [], nextId: 1 } },
    { destroyOnUnmount: true }
  )

  if (!isReady) return <div>Loading...</div>

  // useStorageSubscribe работает идентично для синхронных и асинхронных хранилищ
  const notes = useStorageSubscribe(storage, (s) => s.notes)

  // set/update — возвращают Promise (но await в обработчиках не нужен)
  storage.set('nextId', 5)
  storage.update((s) => { s.notes.push({ id: s.nextId, text: 'New' }) })
}
```

## Полный пример

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
        Добавить заметку
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
