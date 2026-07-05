import { useEffect, useState } from 'react'
import { MemoryStorage, syncSharedWorkerMiddleware } from 'synapse-storage/core'

import { buttonRow, cardStyle, codeBlock, sectionTitle } from './styles'

// Что происходит, если SharedWorker недоступен (Firefox private mode, часть мобильных
// браузеров, старые движки, SSR). (sync)sharedWorkerMiddleware НЕ падает: WorkerChannel внутри
// прозрачно откатывается — на BroadcastChannel (кросс-таб сохраняется), а если и его нет,
// на in-process канал (кросс-таба нет, но стор работает и ничего не ломается).

interface CounterState {
  count: number
}

// Тот же самый код, что и в «боевом» примере — никаких спец-веток под отсутствие воркера.
const counterStore = new MemoryStorage<CounterState>({
  name: 'sw-fallback-counter',
  initialState: { count: 0 },
  middlewares: () => [syncSharedWorkerMiddleware({ storageType: 'memory', storageName: 'sw-fallback-counter' })],
})
counterStore.initialize()

// Определяем доступность транспорта, чтобы показать, какой путь реально используется.
const hasSharedWorker = typeof SharedWorker !== 'undefined'
const hasBroadcastChannel = typeof BroadcastChannel !== 'undefined'

const activeTransport = hasSharedWorker
  ? 'SharedWorker (общий поток на все вкладки)'
  : hasBroadcastChannel
    ? 'BroadcastChannel (fallback — кросс-таб сохранён)'
    : 'in-process (fallback — без кросс-таба, но без падений)'

function useCount(): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    counterStore.initialize().then(() => {
      if (!cancelled) setCount(counterStore.getStateSync().count)
    })
    const unsub = counterStore.subscribeToAll(() => setCount(counterStore.getStateSync().count))
    return () => {
      cancelled = true
      unsub()
    }
  }, [])
  return count
}

export function SharedWorkerFallbackExample() {
  const count = useCount()

  return (
    <div style={cardStyle}>
      <h2>SharedWorker fallback</h2>
      <p>
        <code>syncSharedWorkerMiddleware</code> деградирует безопасно: при отсутствии SharedWorker
        синхронизация уходит на BroadcastChannel, а при отсутствии и его — на in-process канал.
        Стор работает в любом окружении, приложение не падает.
      </p>

      <h3 style={sectionTitle}>Обнаруженное окружение</h3>
      <pre style={codeBlock}>
        {`SharedWorker:     ${hasSharedWorker ? 'доступен' : 'НЕТ'}
BroadcastChannel: ${hasBroadcastChannel ? 'доступен' : 'НЕТ'}
Активный транспорт → ${activeTransport}`}
      </pre>

      <h3 style={sectionTitle}>Стор работает независимо от транспорта</h3>
      <p>Счётчик: <strong>{count ?? '…'}</strong></p>
      <div style={buttonRow}>
        <button onClick={() => counterStore.set('count', counterStore.getStateSync().count + 1)}>+1</button>
        <button onClick={() => counterStore.set('count', 0)}>reset</button>
      </div>
      <p style={{ fontSize: 13, color: '#888' }}>
        Если активен SharedWorker или BroadcastChannel — счётчик синхронен между вкладками. На
        in-process fallback инкремент виден только в текущей вкладке, но по-прежнему без ошибок.
        Тот же принцип и у <code>WorkerCacheStorage</code>: без
        SharedWorker он ведёт себя как обычный MemoryStorage (round-trip тот же, шеринга нет).
      </p>
    </div>
  )
}
