import type { IAsyncStorage } from 'synapse-storage/core'
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

interface NotesState {
  notes: Array<{ id: number; text: string }>
  nextId: number
}

/**
 * useCreateStorage с type: 'indexedDB'
 */
export function HookIndexedDBExample() {
  const { storage, isReady, isLoading, hasError, status } = useCreateStorage<NotesState>({
    name: 'hook-notes',
    type: 'indexedDB',
    initialState: { notes: [], nextId: 1 },
  })

  if (isLoading) return <div>Loading...</div>
  if (hasError) return <div>Error: {status.error?.message}</div>
  if (!isReady) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>useCreateStorage (indexedDB)</h2>
      <p>Тот же хук с <code>type: 'indexedDB'</code>. Возвращает <code>IAsyncStorage</code>. Важно: <code>destroyOnUnmount</code> по умолчанию <code>false</code> для IndexedDB.</p>

      {/* ─── Код ──────────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Использование</h3>
      <pre style={codeBlock}>{`import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

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
  // Чтобы уничтожать при unmount:
  const result = useCreateStorage<NotesState>(
    { type: 'indexedDB', name: 'notes', initialState: { notes: [], nextId: 1 } },
    { destroyOnUnmount: true }
  )

  if (!isReady) return <div>Loading...</div>

  // useStorageSubscribe работает одинаково для sync и async
  const notes = useStorageSubscribe(storage, (s) => s.notes)

  // set/update — возвращают Promise (но можно не await в обработчиках)
  storage.set('nextId', 5)
  storage.update((s) => { s.notes.push({ id: s.nextId, text: 'New' }) })
}`}</pre>

      {/* ─── Демо ─────────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Демо</h3>
      <NotesUI storage={storage} />
    </div>
  )
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
            [{note.id}] {note.text}
            <button style={{ marginLeft: 8 }} onClick={() =>
              storage.update((s) => { s.notes = s.notes.filter((n) => n.id !== note.id) })
            }>x</button>
          </li>
        ))}
      </ul>

      <p>Next ID: {nextId}</p>

      <div style={buttonRow}>
        <button onClick={() => storage.clear()}>clear()</button>
        <button onClick={() => storage.reset()}>reset()</button>
        <button onClick={async () => alert(`keys() = ${JSON.stringify(await storage.keys())}`)}>await keys()</button>
        <button onClick={async () => alert(`has('notes') = ${await storage.has('notes')}`)}>await has('notes')</button>
      </div>
    </div>
  )
}
