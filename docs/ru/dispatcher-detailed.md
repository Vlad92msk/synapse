# Диспетчер (автономный)

> [Назад к оглавлению](./README.md)

`createDispatcher` можно использовать автономно, без `createSynapse`. Определяет действия и наблюдатели для хранилища.

## Создание

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { createDispatcher } from 'synapse-storage/reactive'

interface CounterState {
  value: number
  step: number
  history: number[]
}

const storage = new MemoryStorage<CounterState>({
  name: 'counter',
  initialState: { value: 0, step: 1, history: [] },
})
await storage.initialize()

const dispatcher = createDispatcher(
  { storage },
  (_storage, { createAction, createWatcher }) => {
    // ... определение действий и наблюдателей
    return { increment, decrement, setStep, reset, watchValue, watchBigChanges }
  },
)
```

## createAction

```typescript
// Простое действие (без параметров)
const increment = createAction({
  type: 'increment',
  action: () => {
    storage.update((s) => { s.value += s.step })
  },
})

// Действие с параметром
const setStep = createAction({
  type: 'setStep',
  action: (newStep: number) => {
    storage.set('step', newStep)
    return newStep  // return = payload в потоке действий
  },
})

// Действие с meta — произвольные метаданные
const reset = createAction({
  type: 'reset',
  action: () => { storage.reset() },
  meta: { description: 'Сброс к значениям по умолчанию', dangerous: true },
})

// Действие с мемоизацией — повторный вызов с тем же аргументом пропускается
const setStepMemo = createAction(
  {
    type: 'setStepMemo',
    action: (step: number) => {
      storage.set('step', step)
      return step
    },
  },
  {
    memoize: (current, previous) => current === previous,
  },
)
```

## createWatcher

```typescript
// Базовый наблюдатель — отслеживает значение
const watchValue = createWatcher({
  type: 'watchValue',
  selector: (state) => state.value,  // что отслеживать
})

// С shouldTrigger — фильтрация ложных срабатываний
const watchBigChanges = createWatcher({
  type: 'watchBigChanges',
  selector: (state) => state.value,
  shouldTrigger: (prev, current) => Math.abs((prev ?? 0) - current) >= 5,
})

// С notifyAfterSubscribe — вызвать callback сразу при подписке
const watchStep = createWatcher({
  type: 'watchStep',
  selector: (state) => state.step,
  notifyAfterSubscribe: true,
})
```

## Использование

```typescript
// Вызов действий
dispatcher.dispatch.increment()
dispatcher.dispatch.setStep(5)
dispatcher.dispatch.reset()

// Свойства функции действия
dispatcher.dispatch.reset.actionType  // '[counter]reset'
dispatcher.dispatch.reset.meta        // { description: '...', dangerous: true }

// Подписка на наблюдатели (RxJS Observable)
const sub = dispatcher.watchers.watchValue().subscribe((action) => {
  console.log('значение:', action.payload)
})
sub.unsubscribe()

// Подписка на ВСЕ действия
dispatcher.actions.subscribe((action) => {
  console.log(action.type, action.payload)
})

// Поиск действия по типу
dispatcher.findActionByType('increment')  // функция dispatch или undefined

// Очистка
dispatcher.destroy()
```
