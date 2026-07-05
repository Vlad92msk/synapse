import { useEffect, useRef, useState } from 'react'
import { MemoryStorage, syncSharedWorkerMiddleware } from 'synapse-storage/core'

import { buttonRow, cardStyle, sectionTitle } from './styles'

// syncSharedWorkerMiddleware — зеркало (sync)broadcastMiddleware, но синхронизация идёт
// через SharedWorker (общий поток на все вкладки), а не через BroadcastChannel. Сигнатура
// идентична: { storageType, storageName }. Для sync-хранилищ (MemoryStorage) берём sync-
// вариант, для async — обычный sharedWorkerMiddleware. Если SharedWorker недоступен —
// прозрачный откат на BroadcastChannel/in-memory (см. раздел «SharedWorker fallback»).
//
// Демо: мини медиа-плеер, чьё состояние (play/pause, позиция, очередь) живёт в одном
// сторе на все вкладки. Открой страницу во второй вкладке — управление синхронно.

interface Track {
  id: string
  title: string
}

interface PlayerState {
  playing: boolean
  position: number // секунды
  queue: Track[]
  currentId: string | null
  // Sketch leader-election: id вкладки, которая «владеет» реальным <audio>.
  // Только лидер реально проигрывает звук — иначе N вкладок играли бы одновременно.
  leaderId: string | null
}

const initialPlayerState: PlayerState = {
  playing: false,
  position: 0,
  queue: [
    { id: 't1', title: 'Synapse — Intro' },
    { id: 't2', title: 'Reactive Streams' },
    { id: 't3', title: 'Cross-Tab Sync' },
  ],
  currentId: 't1',
  leaderId: null,
}

// Стор в памяти + sharedWorkerMiddleware. storageName/type должны совпадать во всех
// вкладках, чтобы попасть в один канал SharedWorker.
const playerStore = new MemoryStorage<PlayerState>({
  name: 'media-player',
  initialState: initialPlayerState,
  middlewares: () => [syncSharedWorkerMiddleware({ storageType: 'memory', storageName: 'media-player' })],
})
playerStore.initialize()

/** Реактивно отдаёт всё состояние плеера (мелкий стор — подписываемся целиком). */
function usePlayerState(): PlayerState | null {
  const [state, setState] = useState<PlayerState | null>(null)
  useEffect(() => {
    let cancelled = false
    playerStore.initialize().then(() => {
      if (!cancelled) setState(playerStore.getStateSync())
    })
    const unsub = playerStore.subscribeToAll(() => setState(playerStore.getStateSync()))
    return () => {
      cancelled = true
      unsub()
    }
  }, [])
  return state
}

export function SharedWorkerMiddlewareExample() {
  const state = usePlayerState()

  // Стабильный id этой вкладки — кандидат в лидеры.
  const tabIdRef = useRef<string>(Math.random().toString(36).slice(2, 8))
  const tabId = tabIdRef.current

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const isLeader = state?.leaderId === tabId

  // Лидер «тикает» позицию раз в секунду — все вкладки видят, как двигается прогресс.
  // Так демонстрируется, что источник истины один, а отражается он везде.
  useEffect(() => {
    if (!state?.playing || !isLeader) return
    const timer = setInterval(() => {
      playerStore.set('position', (playerStore.getStateSync().position + 1) % 240)
    }, 1000)
    return () => clearInterval(timer)
  }, [state?.playing, isLeader])

  // Только лидер управляет реальным <audio> (sketch). У элемента нет src, поэтому
  // play() не вызываем — иначе промис отклонится. В реале сюда пришёл бы URL трека.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !isLeader) return
    // if (state?.playing) audio.play().catch(() => {}) else audio.pause()
  }, [state?.playing, isLeader])

  if (!state) return <div style={cardStyle}>Initializing…</div>

  const current = state.queue.find((t) => t.id === state.currentId) ?? null

  const togglePlay = () => playerStore.set('playing', !state.playing)
  const seek = (delta: number) => playerStore.set('position', Math.max(0, state.position + delta))
  const claimLeader = () => playerStore.set('leaderId', tabId)
  const releaseLeader = () => {
    if (isLeader) playerStore.set('leaderId', null)
  }
  const playTrack = (id: string) => playerStore.update((s) => {
    s.currentId = id
    s.position = 0
    s.playing = true
  })

  const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

  return (
    <div style={cardStyle}>
      <h2>sharedWorkerMiddleware (media player)</h2>
      <p>
        Состояние плеера синхронизируется между вкладками через <strong>SharedWorker</strong>.
        Открой страницу во второй вкладке: play/pause, перемотка и очередь общие. При отсутствии
        SharedWorker middleware сам откатывается на BroadcastChannel (см. раздел про fallback).
      </p>

      <h3 style={sectionTitle}>Now playing</h3>
      <p>
        <strong>{current?.title ?? '—'}</strong> · {fmt(state.position)} · {state.playing ? '▶ playing' : '⏸ paused'}
      </p>
      <div style={buttonRow}>
        <button onClick={togglePlay}>{state.playing ? 'Pause' : 'Play'}</button>
        <button onClick={() => seek(-10)}>-10s</button>
        <button onClick={() => seek(10)}>+10s</button>
      </div>

      <h3 style={sectionTitle}>Queue</h3>
      <ul>
        {state.queue.map((t) => (
          <li key={t.id}>
            <button
              disabled={t.id === state.currentId}
              onClick={() => playTrack(t.id)}
              style={{ fontWeight: t.id === state.currentId ? 700 : 400 }}
            >
              {t.title}
            </button>
          </li>
        ))}
      </ul>

      <h3 style={sectionTitle}>Leader election (sketch)</h3>
      <p style={{ fontSize: 13, color: '#888' }}>
        Реальный звук должна проигрывать ровно одна вкладка-лидер (иначе хор из копий).
        Здесь упрощённо: лидер — вкладка, чей id записан в <code>leaderId</code>. Боевой вариант
        добавил бы heartbeat/timestamp и авто-перевыбор при закрытии лидера.
      </p>
      <p>
        Моя вкладка: <code>{tabId}</code> · лидер: <code>{state.leaderId ?? '—'}</code>{' '}
        {isLeader ? '→ владею <audio>' : '→ ведомая вкладка'}
      </p>
      <div style={buttonRow}>
        <button onClick={claimLeader} disabled={isLeader}>Стать лидером</button>
        <button onClick={releaseLeader} disabled={!isLeader}>Сложить лидерство</button>
      </div>
      {/* Реальный аудиоэлемент завёл бы только лидер; src опущен намеренно. */}
      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  )
}
