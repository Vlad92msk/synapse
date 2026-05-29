# Dispatcher (standalone)

> [Back to Main](../../README.md)

`createDispatcher` can be used standalone, without `createSynapse`. Defines actions and watchers for a storage.

## Creating

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
    // ... define actions and watchers
    return { increment, decrement, setStep, reset, watchValue, watchBigChanges }
  },
)
```

## createAction

```typescript
// Simple action (no params)
const increment = createAction({
  type: 'increment',
  action: () => {
    storage.update((s) => { s.value += s.step })
  },
})

// Action with parameter
const setStep = createAction({
  type: 'setStep',
  action: (newStep: number) => {
    storage.set('step', newStep)
    return newStep  // return = payload in action stream
  },
})

// Action with meta — arbitrary metadata
const reset = createAction({
  type: 'reset',
  action: () => { storage.reset() },
  meta: { description: 'Reset to defaults', dangerous: true },
})

// Action with memoization — repeated call with the same argument is skipped
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
// Basic watcher — tracks a value
const watchValue = createWatcher({
  type: 'watchValue',
  selector: (state) => state.value,  // what to track
})

// With shouldTrigger — filter false positives
const watchBigChanges = createWatcher({
  type: 'watchBigChanges',
  selector: (state) => state.value,
  shouldTrigger: (prev, current) => Math.abs((prev ?? 0) - current) >= 5,
})

// With notifyAfterSubscribe — fire callback immediately on subscribe
const watchStep = createWatcher({
  type: 'watchStep',
  selector: (state) => state.step,
  notifyAfterSubscribe: true,
})
```

## Usage

```typescript
// Call actions
dispatcher.dispatch.increment()
dispatcher.dispatch.setStep(5)
dispatcher.dispatch.reset()

// Action function properties
dispatcher.dispatch.reset.actionType  // '[counter]reset'
dispatcher.dispatch.reset.meta        // { description: '...', dangerous: true }

// Subscribe to watchers (RxJS Observable)
const sub = dispatcher.watchers.watchValue().subscribe((action) => {
  console.log('value:', action.payload)
})
sub.unsubscribe()

// Subscribe to ALL actions
dispatcher.actions.subscribe((action) => {
  console.log(action.type, action.payload)
})

// Find action by type
dispatcher.findActionByType('increment')  // dispatch function or undefined

// Cleanup
dispatcher.destroy()
```
