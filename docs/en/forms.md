# Forms — the recipe: form state on a synapse storage

> [Back to Main](../../README.md)

Managing forms is the most common application case. This page is a **copy-paste recipe**: take the
code, drop it into your project, and you get your own form management instead of `react-hook-form` /
`Formik` / `Final Form` — **zero dependencies**.

Why do it on a synapse storage at all? Because a storage gives you, **by architecture**, things a
form library bolts on from the side:

- **SSR + hydration** — the form renders on the server with values/errors already filled in, and the
  client picks it up without a flash (see [SSR hydration](./ssr-hydration.md)).
- **Cross-tab sync** — `syncBroadcastMiddleware` syncs the form draft between tabs.
- **Persist + migrations** — `LocalStorage` / `IndexedDB` keep the draft between sessions,
  `version` + `migrate` migrate the draft schema (see [Persist migrations](./persist-migration.md)).
- **Validation as a middleware** — centralized, reusable, runs on **any** write to the store
  regardless of the source (see [Middlewares](./middlewares.md)).

The recipe is built as a ladder: copy exactly the level you need.

## Honest scope — what this is and isn't

This is **not** "react-hook-form but better at everything". What we reproduce vs. do differently:

**Covered:** form state `{ values, errors, touched, isValid, isSubmitting, submitCount }`;
per-field re-render isolation via `useStorageSubscribe`; synchronous schema validation as a
middleware; `touched` / `isValid`; submit flow; `reset()`.

**Different / not out of the box (on purpose):**

- No field registration à la `register('email')` for native inputs — we use controlled inputs +
  `set`/`update`.
- Async validation (server-side checks) is a separate, more involved pattern (via effects/BLL or by
  hand); the base recipe is synchronous.
- Array / dynamic fields are shown briefly — they are a complication.
- Performance on huge forms is fine thanks to point-wise subscriptions, but **measure**, don't
  assume.

This is a recipe, not a mini-library: there is no public form API to import — you own the code.

## State shape

```typescript
type FormErrors<V> = Partial<Record<keyof V & string, string>>

interface FormState<V extends Record<string, any>> {
  values: V
  errors: FormErrors<V>
  touched: Partial<Record<keyof V & string, boolean>>
  isValid: boolean
  isSubmitting: boolean
  submitCount: number
}
```

We use a sign-up form as the running example:

```typescript
interface SignUp {
  email: string
  password: string
  confirm: string
}

const makeInitial = (): FormState<SignUp> => ({
  values: { email: '', password: '', confirm: '' },
  errors: {},
  touched: {},
  isValid: false,
  isSubmitting: false,
  submitCount: 0,
})
```

## Writing a field

Write each field by its path. Two tiny helpers keep the call sites tidy:

```typescript
import { ISyncStorage } from 'synapse-storage/core'

function setField<V extends Record<string, any>>(storage: ISyncStorage<FormState<V>>, name: keyof V & string, value: V[keyof V]) {
  storage.set(`values.${name}`, value)
}

function touchField<V extends Record<string, any>>(storage: ISyncStorage<FormState<V>>, name: keyof V & string) {
  storage.set(`touched.${name}`, true)
}
```

`set` writes **immutably** — it never mutates your `initialState`, so `reset()` always restores the
original values — and it updates `getStateSync()` **synchronously**, so the SSR snapshot and
`useStorageSubscribe` see fresh errors immediately.

Re-render isolation does **not** suffer: a field selector returns a primitive that doesn't change by
reference for untouched fields, so `useStorageSubscribe` with `equals` skips their re-render.

## Level 1 — a basic form (MemoryStorage)

A bare skeleton: controlled inputs, point-wise reads, submit, reset. No validation yet.

```tsx
import { MemoryStorage, ISyncStorage } from 'synapse-storage/core'
import { useStorageSubscribe } from 'synapse-storage/react'
import { useMemo, useEffect, useState, FormEvent } from 'react'

function useFormStorage() {
  const [storage] = useState<ISyncStorage<FormState<SignUp>>>(() => new MemoryStorage<FormState<SignUp>>({ name: 'sign-up', initialState: makeInitial() }))
  const [ready, setReady] = useState(false)
  
  useEffect(() => {
    let alive = true
    storage.initialize().then(() => alive && setReady(true))
    return () => {
      alive = false
      storage.destroy()
    }
  }, [storage])
  return { storage, ready }
}

// A single field — re-renders ONLY when its own value/error changes.
function Field({ storage, name, type = 'text' }: { storage: ISyncStorage<FormState<SignUp>>; name: keyof SignUp; type?: string }) {
  const value = useStorageSubscribe(storage, (s) => s.values[name] ?? '', { equals: Object.is })
  const error = useStorageSubscribe(storage, (s) => (s.touched[name] ? s.errors[name] : undefined), { equals: Object.is })

  return (
    <label>
      <input
        type={type}
        value={value as string}
        onChange={(e) => setField(storage, name, e.target.value)}
        onBlur={() => touchField(storage, name)}
      />
      {error ? <span role="alert">{error}</span> : null}
    </label>
  )
}

export function SignUpForm() {
  const { storage, ready } = useFormStorage()
  if (!ready) return null

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const { values } = storage.getState()
    console.log('submit', values)
  }

  return (
    <form onSubmit={onSubmit}>
      <Field storage={storage} name="email" />
      <Field storage={storage} name="password" type="password" />
      <Field storage={storage} name="confirm" type="password" />
      <button type="submit">Sign up</button>
      <button type="button" onClick={() => storage.reset()}>Reset</button>
    </form>
  )
}
```

The key win is already here: `useStorageSubscribe(storage, s => s.values[name], { equals })` subscribes
the component to **one** field — typing in `email` does not re-render `password`. More on reads in
[Subscriptions](./subscriptions.md).

## Level 2 — validation as a middleware

Validation as a middleware is **centralized**: it runs on every write to the store, no matter who
wrote it. The schema is a plain function — zero dependencies.

```typescript
import { SyncMiddleware, StorageAction } from 'synapse-storage/core'

type Validator<V> = (values: V) => FormErrors<V>

const shallowEqualErrors = (a: Record<string, any>, b: Record<string, any>) => {
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  return ak.length === bk.length && ak.every((k) => a[k] === b[k])
}

// Validate ONLY when something inside `values.*` changes (guard, see point #2 below).
const touchesValues = (action: StorageAction) => {
  if (action.type === 'set') return String(action.key ?? '').split('.')[0] === 'values'
  if (action.type === 'update') return (action.metadata?.changedPaths ?? []).some((p: string) => String(p).split('.')[0] === 'values')
  return false
}

export function createFormValidationMiddleware<V extends Record<string, any>>(validate: Validator<V>): SyncMiddleware {
  return {
    name: 'form-validation',
    reducer: (api) => (next) => (action) => {
      // 1) Write the value FIRST — never block invalid input.
      const result = next(action)
      if (!touchesValues(action)) return result

      // 2) Compute errors from the already-written state.
      const state = api.getState() as FormState<V>
      const errors = validate(state.values)
      const isValid = Object.keys(errors).length === 0

      if (shallowEqualErrors(state.errors ?? {}, errors) && state.isValid === isValid) return result

      // 3) Write derived state DIRECTLY (bypassing dispatch) → no recursive validation.
      api.storage.doSet('errors', errors)
      api.storage.doSet('isValid', isValid)

      // 4) Notify point-wise subscribers and subscribeToAll / useStorageSubscribe.
      api.storage.notifySubscribers('errors', errors)
      api.storage.notifySubscribers('isValid', isValid)
      api.storage.notifySubscribers('*', { type: 'storage:update', key: ['errors', 'isValid'], value: { errors, isValid }, changedPaths: ['errors', 'isValid'] })

      return result
    },
  }
}
```

The schema for the sign-up form:

```typescript
const validateSignUp: Validator<SignUp> = (v) => {
  const errors: FormErrors<SignUp> = {}
  if (!v.email) errors.email = 'Email is required'
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) errors.email = 'Email is invalid'
  if (v.password.length < 6) errors.password = 'Min 6 characters'
  if (v.confirm !== v.password) errors.confirm = 'Passwords do not match'
  return errors
}
```

Wire it into the storage:

```typescript
const storage = new MemoryStorage<FormState<SignUp>>({
  name: 'sign-up',
  initialState: makeInitial(),
  middlewares: () => [createFormValidationMiddleware(validateSignUp)],
})
```

That's it — `Field` from level 1 already reads `errors[name]`, so errors light up live.

### The three gotchas of a validation middleware

These are the traps that make a naive validation middleware misbehave — the recipe above already
handles all three:

1. **Don't block writing an invalid value.** The input must show what the user typed. So the
   middleware runs `next(action)` **first** (writes the value), then computes errors. Returning the
   `VALUE_NOT_CHANGED` sentinel on invalid input would make the field "stick".
2. **No recursion.** Writing `errors` inside the middleware must not re-trigger validation. We solve
   it two ways at once: write `errors` via `api.storage.doSet` + `notifySubscribers` **directly**
   (bypassing the dispatch chain), **and** only validate when a `values.*` key changes
   (`touchesValues` guard).
3. **When to validate.** Live on every write here, but the UI shows an error only for `touched`
   fields (see `Field`). Validate-on-blur or validate-on-submit are variations of the same guard.

### Alternative: validation via a selector (derived state)

You can compute errors as **derived state** with a selector instead of a middleware:
`errors = createSelector(values => validate(values))` (see [Selectors](./selector-system.md)).

- **Selector** — simpler, no recursion to worry about. But errors are not part of the persisted /
  shared state, and there is no single point that forces validation on every writer.
- **Middleware** — pick it when you need centralization, or to **persist / share** errors as part of
  the state (e.g. across tabs). This recipe uses the middleware as the primary approach.

## Level 3 — draft persistence + cross-tab sync

Turn the form into a draft that survives reloads and stays in sync across tabs. Swap
`MemoryStorage` for `LocalStorage` and add `syncBroadcastMiddleware`:

```typescript
import { LocalStorage, syncBroadcastMiddleware } from 'synapse-storage/core'

const storage = new LocalStorage<FormState<SignUp>>({
  name: 'sign-up',
  initialState: makeInitial(),
  version: 1, // bump when the form shape changes (see persist-migration)
  middlewares: () => [
    createFormValidationMiddleware(validateSignUp),
    syncBroadcastMiddleware({ storageType: 'localStorage', storageName: 'sign-up' }),
  ],
})
```

- **Persist** — `LocalStorage` saves the draft automatically; on the next visit the user continues
  where they left off.
- **Cross-tab** — `syncBroadcastMiddleware` broadcasts `set`/`update` to other tabs over the
  `localStorage-sign-up` channel; the same draft is mirrored everywhere.
- **Migrations** — if the form shape changes between releases, bump `version` and add `migrate` so an
  old draft is converted instead of breaking. See [Persist migrations](./persist-migration.md).

> Order matters: keep validation **before** broadcast so other tabs receive an already-validated
> state.

For drafts you usually don't want to wipe storage on unmount — set `clearOnDestroy: false`
(the `LocalStorage` default) so the draft survives.

## Level 4 — SSR (server-rendered form)

The form can render on the server with values/errors already in place, then hydrate on the client
with no flash. The same pattern as [SSR hydration](./ssr-hydration.md): call `hydrate(snapshot)`
**before** `initialize()` so the server snapshot is not overwritten by `initialState`.

```typescript
// On the server: build a snapshot (e.g. from a failed POST with field errors) and serialize it.
const serverState: FormState<SignUp> = {
  ...makeInitial(),
  values: { email: 'taken@example.com', password: '', confirm: '' },
  errors: { email: 'This email is already registered' },
  touched: { email: true },
}
// → embed JSON.stringify(serverState) into the HTML.
```

```typescript
// On the client: seed the storage from the embedded snapshot BEFORE initialize().
const storage = new MemoryStorage<FormState<SignUp>>({
  name: 'sign-up',
  initialState: makeInitial(),
  middlewares: () => [createFormValidationMiddleware(validateSignUp)],
})

storage.hydrate(window.__FORM_STATE__) // BEFORE initialize() → initialState won't clobber it
await storage.initialize()
```

`getStateSync()` gives you the snapshot to serialize; `hydrate()` called **after** `initialize()`
replaces the state and notifies subscribers. At module level there is `dehydrateModule()` and the
React wrapper `createSynapseCtx` — reuse the same pattern when the form is part of a larger module.

## Submit flow

`isSubmitting` blocks a double submit; on failure you can push server errors into the same `errors`
slice:

```typescript
async function submit(storage: ISyncStorage<FormState<SignUp>>, send: (values: SignUp) => Promise<void>) {
  const state = storage.getState()
  if (state.isSubmitting) return // guard against double submit
  if (!state.isValid) {
    // mark everything touched so all errors show
    storage.set('touched', Object.fromEntries(Object.keys(state.values).map((k) => [k, true])))
    return
  }

  storage.update((s) => {
    s.isSubmitting = true
    s.submitCount += 1
  })
  try {
    await send(state.values)
    storage.reset() // success → back to initialState
  } catch (e: any) {
    storage.set('errors', { email: e?.message ?? 'Submit failed' })
  } finally {
    storage.set('isSubmitting', false)
  }
}
```

## Dynamic / array fields (brief)

Arrays live in `values` like everything else; replace the array by its path on edits:

```typescript
function addItem(storage: ISyncStorage<FormState<any>>, key: string, item: unknown) {
  const list = storage.getState().values[key] ?? []
  storage.set(`values.${key}`, [...list, item])
}
```

Validation stays the same — the middleware re-validates the whole `values` on each change.

## See also

- [Middlewares](./middlewares.md) — the middleware API used here
- [Subscriptions](./subscriptions.md) · [Selectors](./selector-system.md) — point-wise reads and the
  selector-based validation alternative
- [Persist migrations](./persist-migration.md) — draft persistence + schema migrations
- [SSR hydration](./ssr-hydration.md) — server-rendered form
- [Pokemon Advanced](./pokemon-advanced.md) — the reference recipe for a full module
