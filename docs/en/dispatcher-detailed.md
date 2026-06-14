# Dispatcher (in detail)

> [Back to Main](../../README.md)

The `Dispatcher` class can also be used standalone, without `createSynapse`. It defines actions and watchers
for a storage. **Action/watcher name = class field name.**

In standalone mode the instance is finalized lazily: names are assigned on the first call of any action
or on the first access to the `dispatch`/`watchers` registries.

## Creating

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { Dispatcher } from 'synapse-storage/reactive'

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

class CounterDispatcher extends Dispatcher<CounterState> {
  readonly increment = this.action((store) => store.update((s) => { s.value += s.step }))
  readonly watchValue = this.watcher({ selector: (s) => s.value })
}

const dispatcher = new CounterDispatcher(storage)
```

## Dispatcher surface

| Factory field         | What it creates                                                              |
|-----------------------|------------------------------------------------------------------------------|
| `this.action(fn)`     | an action with a handler `(store, params) => result`; payload = the returned value |
| `this.signal<P>(desc)`| a pure intent signal: `(_store, p) => p`, writes nothing to the store        |
| `this.apiActions<P>(accessor)` | a callable group for an API request lifecycle                       |
| `this.keyedApiActions<P>(accessor)` | the same, but status is stored per key (`Record<string, ApiRequestState>`) |
| `this.watcher(config)`| a reactive watcher over part of the state                                    |

## this.action

```typescript
class CounterDispatcher extends Dispatcher<CounterState> {
  // Simple action (no parameters)
  readonly increment = this.action((store) => {
    store.update((s) => { s.value += s.step })
  })

  // Action with a parameter (return = payload in the action stream)
  readonly setStep = this.action((store, newStep: number) => {
    store.set('step', newStep)
    return newStep
  })

  // Action with meta — arbitrary metadata (2nd argument of this.action)
  readonly reset = this.action(
    (store) => { store.reset() },
    { meta: { description: 'Reset to default values', dangerous: true } },
  )

  // Action with memoization — a repeated call with the same argument is skipped
  readonly setStepMemo = this.action(
    (store, step: number) => { store.set('step', step); return step },
    { memoize: (current, previous) => current === previous },
  )
}
```

## this.signal

```typescript
class CounterDispatcher extends Dispatcher<CounterState> {
  // A pure intent: writes nothing to the store, the payload is passed further to effects.
  // description goes into meta.
  readonly pinged = this.signal<number>('Manual ping')
}
```

## this.apiActions (callable group + lifecycle)

`apiActions` returns a **callable group**. Calling the group itself is `init` (an intent): it resets the status
to `idle` and passes the payload to effects. The lifecycle — through field-methods.

```typescript
class PostsDispatcher extends Dispatcher<PostsState> {
  // the accessor points to the ApiRequestState cell in the state
  readonly loadPosts = this.apiActions<{ page: number }>((s) => s.api.postsRequest)
}

// Usage:
d.loadPosts({ page: 1 })      // init: status → idle, the intent goes to effects
d.loadPosts.loading()         // status → loading
d.loadPosts.success()         // status → success
d.loadPosts.failure('msg')    // status → error, error = 'msg'
d.loadPosts.reset()           // status → reset
```

### Rule: `ofType(d.loadPosts)` catches ONLY init

```typescript
// In an effect: we react to the INTENT to load (init), not to statuses
action$.pipe(ofType(d.loadPosts), /* ... start the request ... */)

// To react to a RESULT — listen for the specific phase explicitly:
action$.pipe(ofType(d.loadPosts.success), /* ... */)
action$.pipe(ofType(d.loadPosts.failure), /* ... */)
```

`keyedApiActions` works the same way, but `init`/`loading`/`success`/`reset` accept a `key`, and `failure` accepts
`{ key, error }`.

## this.watcher

```typescript
class CounterDispatcher extends Dispatcher<CounterState> {
  // Basic watcher — tracks a value
  readonly watchValue = this.watcher({ selector: (state) => state.value })

  // With shouldTrigger — filtering out false triggers
  readonly watchBigChanges = this.watcher({
    selector: (state) => state.value,
    shouldTrigger: (prev, current) => Math.abs((prev ?? 0) - current) >= 5,
  })

  // With notifyAfterSubscribe — call the callback immediately on subscribe
  readonly watchStep = this.watcher({
    selector: (state) => state.step,
    notifyAfterSubscribe: true,
  })
}
```

## Reserved field names

The names `storage`, `action$`, `actions`, `dispatch`, `watchers`, `use`, `destroy` are members of the base class,
they **cannot** be used as action/watcher names. A field-alias (one action under two names) is rejected
at finalization with a clear error.

## Usage

```typescript
// Calling actions — through the instance's typed fields
dispatcher.increment()
dispatcher.setStep(5)
dispatcher.reset()

// Or through the dispatch registry
dispatcher.dispatch.reset.actionType  // '[counter]reset'
dispatcher.dispatch.reset.meta        // { description: '...', dangerous: true }

// Subscribing to watchers (RxJS Observable)
const sub = dispatcher.watchers.watchValue().subscribe((action) => {
  console.log('value:', action.payload)
})
sub.unsubscribe()

// Subscribing to ALL actions
dispatcher.actions.subscribe((action) => {
  console.log(action.type, action.payload)
})

// Cleanup
dispatcher.destroy()
```
