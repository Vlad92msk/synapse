// Среда по умолчанию — node: здесь есть глобальный BroadcastChannel, но нет
// SharedWorker. Значит WorkerChannel уходит в фолбэк на SyncBroadcastChannel —
// именно это поведение мы и проверяем (реальный фолбэк, без моков).
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WorkerChannel } from '../utils/worker-channel.util'

// Уникальное имя канала на каждый тест — BroadcastChannel в node глобален для процесса.
let uid = 0
const nextChannel = () => `worker_channel_test_${uid++}`

// BroadcastChannel в node доставляет сообщения асинхронно — даём событийному циклу тик.
const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))

// Каналы, которые нужно закрыть после теста, чтобы не держать процесс живым.
let opened: WorkerChannel<any>[] = []
const track = <T>(ch: WorkerChannel<T>) => {
  opened.push(ch)
  return ch
}

afterEach(() => {
  for (const ch of opened) {
    ch.close()
  }
  opened = []
  vi.useRealTimers()
})

describe('WorkerChannel (фолбэк на SyncBroadcastChannel)', () => {
  it('конструируется без исключений (SharedWorker недоступен → фолбэк)', () => {
    expect(typeof SharedWorker).toBe('undefined')
    expect(() => track(new WorkerChannel(nextChannel()))).not.toThrow()
  })

  it('broadcast/subscribe: сообщение доходит до другого экземпляра того же канала', async () => {
    const channelName = nextChannel()
    const sender = track(new WorkerChannel<{ value: number }>(channelName))
    const receiver = track(new WorkerChannel<{ value: number }>(channelName))

    const received: any[] = []
    receiver.subscribe((message) => {
      received.push(message)
    })

    sender.broadcast('UPDATE', { value: 42 })
    await tick()

    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('UPDATE')
    expect(received[0].payload).toEqual({ value: 42 })
    // senderId проставлен и это НЕ id получателя
    expect(typeof received[0].senderId).toBe('string')
  })

  it('фильтрация собственных сообщений по senderId: отправитель не получает свой broadcast', async () => {
    const channelName = nextChannel()
    const a = track(new WorkerChannel(channelName))
    const b = track(new WorkerChannel(channelName))

    const onA = vi.fn()
    const onB = vi.fn()
    a.subscribe(onA)
    b.subscribe(onB)

    a.broadcast('PING', { n: 1 })
    await tick()

    // Свой же обработчик не должен сработать
    expect(onA).not.toHaveBeenCalled()
    // А другой экземпляр — получает
    expect(onB).toHaveBeenCalledTimes(1)
  })

  it('requestSync возвращает null по таймауту, если никто не ответил', async () => {
    vi.useFakeTimers()
    const ch = track(new WorkerChannel(nextChannel()))

    const promise = ch.requestSync()
    // Проматываем 1000ms таймаут
    await vi.advanceTimersByTimeAsync(1000)

    await expect(promise).resolves.toBeNull()
  })

  it('несериализуемый payload даёт понятную ошибку (structured clone)', () => {
    const ch = track(new WorkerChannel(nextChannel()))

    // Функция не проходит structured clone
    expect(() => ch.broadcast('BAD', (() => {}) as any)).toThrow(/clone/i)
  })

  it('close(): снимает обработчики и не течёт — после закрытия сообщения не приходят', async () => {
    const channelName = nextChannel()
    const sender = track(new WorkerChannel(channelName))
    const receiver = new WorkerChannel(channelName)

    const onMessage = vi.fn()
    receiver.subscribe(onMessage)

    // Закрываем получателя
    receiver.close()

    sender.broadcast('AFTER_CLOSE', { n: 1 })
    await tick()

    expect(onMessage).not.toHaveBeenCalled()
    // Повторный close не бросает
    expect(() => receiver.close()).not.toThrow()
  })

  it('unsubscribe отписывает конкретный обработчик', async () => {
    const channelName = nextChannel()
    const sender = track(new WorkerChannel(channelName))
    const receiver = track(new WorkerChannel(channelName))

    const onMessage = vi.fn()
    const unsubscribe = receiver.subscribe(onMessage)
    unsubscribe()

    sender.broadcast('MSG', { n: 1 })
    await tick()

    expect(onMessage).not.toHaveBeenCalled()
  })
})
