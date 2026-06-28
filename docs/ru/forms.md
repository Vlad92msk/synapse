# Формы — рецепт: состояние формы на хранилище synapse

> [Назад к оглавлению](./README.md)

Управление формами — самый частый прикладной кейс. Эта страница — **копипастный рецепт**: берёте
код, вставляете к себе и получаете собственное управление формой вместо `react-hook-form` /
`Formik` / `Final Form` — **без зависимостей**.

Зачем вообще делать форму на хранилище synapse? Потому что хранилище даёт **по архитектуре** то,
что form-библиотеки прикручивают сбоку:

- **SSR + гидрация** — форма рендерится на сервере с уже заполненными значениями/ошибками, а клиент
  подхватывает её без вспышки (см. [SSR-гидрация](./ssr-hydration.md)).
- **Синхронизация между вкладками** — `syncBroadcastMiddleware` синхронизирует черновик формы между
  вкладками.
- **Persist + миграции** — `LocalStorage` / `IndexedDB` сохраняют черновик между сессиями,
  `version` + `migrate` мигрируют схему черновика (см. [Persist-миграции](./persist-migration.md)).
- **Валидация как middleware** — централизованная, переиспользуемая, срабатывает на **любую** запись
  в стор независимо от источника (см. [Middlewares](./middlewares.md)).

Рецепт построен лесенкой: копируйте ровно тот уровень, который нужен.

## Честные границы — что это и что нет

Это **не** «react-hook-form, но во всём лучше». Что воспроизводим, а что делаем осознанно иначе:

**Закрываем:** стейт формы `{ values, errors, touched, isValid, isSubmitting, submitCount }`;
изоляцию ре-рендеров по полю через `useStorageSubscribe`; синхронную схемную валидацию как
middleware; `touched` / `isValid`; submit-flow; `reset()`.

**Иначе / нет из коробки (осознанно):**

- Нет field-registration в стиле `register('email')` под нативные inputs — у нас контролируемые
  инпуты + `set`/`update`.
- Async-валидация (проверка на сервере) — отдельный, более сложный паттерн (через эффекты/BLL или
  вручную); базовый рецепт — синхронный.
- Array / dynamic fields показаны кратко — это уже усложнение.
- Производительность на огромных формах ок за счёт точечных подписок, но это надо **измерять**, а не
  обещать.

Это рецепт, а не мини-библиотека: публичного form-API нет — код ваш, правьте под себя.

## Форма состояния (state shape)

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

В качестве сквозного примера — форма регистрации:

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

## Запись поля

Пишем каждое поле по его пути. Две крошечные обёртки делают вызовы аккуратнее:

```typescript
import { ISyncStorage } from 'synapse-storage/core'

function setField<V extends Record<string, any>>(storage: ISyncStorage<FormState<V>>, name: keyof V & string, value: V[keyof V]) {
  storage.set(`values.${name}`, value)
}

function touchField<V extends Record<string, any>>(storage: ISyncStorage<FormState<V>>, name: keyof V & string) {
  storage.set(`touched.${name}`, true)
}
```

`set` пишет **иммутабельно** — не мутирует ваш `initialState`, поэтому `reset()` всегда возвращает
исходные значения — и обновляет `getStateSync()` **синхронно**, так что SSR-снапшот и
`useStorageSubscribe` видят свежие ошибки сразу.

Изоляция ре-рендеров при этом **не страдает**: селектор поля возвращает примитив, который у
нетронутых полей не меняется по ссылке, поэтому `useStorageSubscribe` с `equals` пропускает их
перерисовку.

## Уровень 1 — базовая форма (MemoryStorage)

Голый каркас: контролируемые инпуты, точечное чтение, submit, reset. Пока без валидации.

```tsx
import { MemoryStorage, ISyncStorage } from 'synapse-storage/core'
import { useStorageSubscribe } from 'synapse-storage/react'
import { useEffect, useState, FormEvent } from 'react'

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

// Одно поле — перерисовывается ТОЛЬКО при изменении своего value/error.
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
      <button type="submit">Зарегистрироваться</button>
      <button type="button" onClick={() => storage.reset()}>Сбросить</button>
    </form>
  )
}
```

Главное преимущество уже здесь: `useStorageSubscribe(storage, s => s.values[name], { equals })`
подписывает компонент на **одно** поле — ввод в `email` не перерисовывает `password`. Подробнее о
чтении — в [Подписках](./subscriptions.md).

## Уровень 2 — валидация как middleware

Валидация-middleware **централизована**: срабатывает на любую запись в стор, кто бы ни писал. Схема —
обычная функция, без зависимостей.

```typescript
import { SyncMiddleware, StorageAction } from 'synapse-storage/core'

type Validator<V> = (values: V) => FormErrors<V>

const shallowEqualErrors = (a: Record<string, any>, b: Record<string, any>) => {
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  return ak.length === bk.length && ak.every((k) => a[k] === b[k])
}

// Валидируем ТОЛЬКО когда меняется что-то внутри `values.*` (guard, см. пункт №2 ниже).
const touchesValues = (action: StorageAction) => {
  if (action.type === 'set') return String(action.key ?? '').split('.')[0] === 'values'
  if (action.type === 'update') return (action.metadata?.changedPaths ?? []).some((p: string) => String(p).split('.')[0] === 'values')
  return false
}

export function createFormValidationMiddleware<V extends Record<string, any>>(validate: Validator<V>): SyncMiddleware {
  return {
    name: 'form-validation',
    reducer: (api) => (next) => (action) => {
      // 1) Сначала пишем значение — НЕ блокируем инвалидный ввод.
      const result = next(action)
      if (!touchesValues(action)) return result

      // 2) Считаем ошибки от уже записанного состояния.
      const state = api.getState() as FormState<V>
      const errors = validate(state.values)
      const isValid = Object.keys(errors).length === 0

      if (shallowEqualErrors(state.errors ?? {}, errors) && state.isValid === isValid) return result

      // 3) Пишем производное НАПРЯМУЮ (минуя dispatch) → нет рекурсии валидации.
      api.storage.doSet('errors', errors)
      api.storage.doSet('isValid', isValid)

      // 4) Уведомляем точечных подписчиков и subscribeToAll / useStorageSubscribe.
      api.storage.notifySubscribers('errors', errors)
      api.storage.notifySubscribers('isValid', isValid)
      api.storage.notifySubscribers('*', { type: 'storage:update', key: ['errors', 'isValid'], value: { errors, isValid }, changedPaths: ['errors', 'isValid'] })

      return result
    },
  }
}
```

Схема для формы регистрации:

```typescript
const validateSignUp: Validator<SignUp> = (v) => {
  const errors: FormErrors<SignUp> = {}
  if (!v.email) errors.email = 'Email обязателен'
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) errors.email = 'Email некорректен'
  if (v.password.length < 6) errors.password = 'Минимум 6 символов'
  if (v.confirm !== v.password) errors.confirm = 'Пароли не совпадают'
  return errors
}
```

Подключаем к хранилищу:

```typescript
const storage = new MemoryStorage<FormState<SignUp>>({
  name: 'sign-up',
  initialState: makeInitial(),
  middlewares: () => [createFormValidationMiddleware(validateSignUp)],
})
```

Всё — `Field` из уровня 1 уже читает `errors[name]`, поэтому ошибки загораются вживую.

### Три грабли валидационной middleware

Это ловушки, из-за которых наивная валидация-middleware ломается — рецепт выше уже обходит все три:

1. **Не блокировать запись инвалидного значения.** Инпут должен показывать то, что напечатал
   пользователь. Поэтому middleware сначала делает `next(action)` (пишет значение), и только потом
   считает ошибки. Если вернуть символ `VALUE_NOT_CHANGED` на инвалидный ввод — поле «залипнет».
2. **Никакой рекурсии.** Запись `errors` внутри middleware не должна снова запускать валидацию.
   Решаем сразу двумя способами: пишем `errors` через `api.storage.doSet` + `notifySubscribers`
   **напрямую** (минуя dispatch-цепочку) **и** валидируем только при изменении ключа из `values.*`
   (guard `touchesValues`).
3. **Когда валидировать.** Здесь — вживую на каждую запись, но UI показывает ошибку только для
   `touched`-полей (см. `Field`). Валидация на blur или на submit — вариации того же guard.

### Альтернатива: валидация через селектор (derived state)

Ошибки можно считать как **производное состояние** селектором, а не middleware:
`errors = createSelector(values => validate(values))` (см. [Селекторы](./selector-system.md)).

- **Селектор** — проще, рекурсии нет в принципе. Но ошибки не часть персистентного / шаренного
  состояния, и нет единой точки, где валидация навязана всем писателям.
- **Middleware** — берём, когда нужна централизованность или нужно **персистить / шарить** ошибки как
  часть состояния (например, между вкладками). В этом рецепте middleware — основной подход.

## Уровень 3 — персист черновика + синхронизация между вкладками

Превращаем форму в черновик, который переживает перезагрузку и синхронизируется между вкладками.
Меняем `MemoryStorage` на `LocalStorage` и добавляем `syncBroadcastMiddleware`:

```typescript
import { LocalStorage, syncBroadcastMiddleware } from 'synapse-storage/core'

const storage = new LocalStorage<FormState<SignUp>>({
  name: 'sign-up',
  initialState: makeInitial(),
  version: 1, // повышайте при изменении формы (см. persist-migration)
  middlewares: () => [
    createFormValidationMiddleware(validateSignUp),
    syncBroadcastMiddleware({ storageType: 'localStorage', storageName: 'sign-up' }),
  ],
})
```

- **Persist** — `LocalStorage` сохраняет черновик автоматически; при следующем визите пользователь
  продолжает с того же места.
- **Между вкладками** — `syncBroadcastMiddleware` транслирует `set`/`update` в другие вкладки по
  каналу `localStorage-sign-up`; один и тот же черновик отражается везде.
- **Миграции** — если форма меняется между релизами, повышайте `version` и добавляйте `migrate`,
  чтобы старый черновик конвертировался, а не ломался. См. [Persist-миграции](./persist-migration.md).

> Порядок важен: держите валидацию **до** broadcast, чтобы другие вкладки получали уже
> провалидированное состояние.

Для черновиков обычно не нужно стирать хранилище при размонтировании — поставьте
`clearOnDestroy: false` (дефолт `LocalStorage`), чтобы черновик сохранялся.

## Уровень 4 — SSR (форма с серверным рендером)

Форма может рендериться на сервере с уже заполненными значениями/ошибками и гидрироваться на клиенте
без вспышки. Паттерн тот же, что в [SSR-гидрации](./ssr-hydration.md): вызвать `hydrate(snapshot)`
**до** `initialize()`, чтобы серверный снапшот не был перезатёрт `initialState`.

```typescript
// На сервере: собираем снапшот (например, из неудачного POST с ошибками полей) и сериализуем.
const serverState: FormState<SignUp> = {
  ...makeInitial(),
  values: { email: 'taken@example.com', password: '', confirm: '' },
  errors: { email: 'Этот email уже зарегистрирован' },
  touched: { email: true },
}
// → вшиваем JSON.stringify(serverState) в HTML.
```

```typescript
// На клиенте: засеваем хранилище из вшитого снапшота ДО initialize().
const storage = new MemoryStorage<FormState<SignUp>>({
  name: 'sign-up',
  initialState: makeInitial(),
  middlewares: () => [createFormValidationMiddleware(validateSignUp)],
})

storage.hydrate(window.__FORM_STATE__) // ДО initialize() → initialState не перезатрёт снапшот
await storage.initialize()
```

`getStateSync()` даёт снапшот для сериализации; `hydrate()`, вызванный **после** `initialize()`,
заменяет состояние и уведомляет подписчиков. На уровне модуля есть `dehydrateModule()` и
React-обвязка `createSynapseCtx` — переиспользуйте тот же паттерн, когда форма часть большего модуля.

## Submit-flow

`isSubmitting` блокирует повторный сабмит; при ошибке можно положить серверные ошибки в тот же срез
`errors`:

```typescript
async function submit(storage: ISyncStorage<FormState<SignUp>>, send: (values: SignUp) => Promise<void>) {
  const state = storage.getState()
  if (state.isSubmitting) return // защита от двойного сабмита
  if (!state.isValid) {
    // помечаем все поля тронутыми, чтобы показать все ошибки
    storage.set('touched', Object.fromEntries(Object.keys(state.values).map((k) => [k, true])))
    return
  }

  storage.update((s) => {
    s.isSubmitting = true
    s.submitCount += 1
  })
  try {
    await send(state.values)
    storage.reset() // успех → обратно к initialState
  } catch (e: any) {
    storage.set('errors', { email: e?.message ?? 'Не удалось отправить' })
  } finally {
    storage.set('isSubmitting', false)
  }
}
```

## Динамические / массивные поля (кратко)

Массивы живут в `values` как и всё остальное; при правке заменяйте массив по его пути:

```typescript
function addItem(storage: ISyncStorage<FormState<any>>, key: string, item: unknown) {
  const list = storage.getState().values[key] ?? []
  storage.set(`values.${key}`, [...list, item])
}
```

Валидация не меняется — middleware ревалидирует весь `values` на каждое изменение.

## Смотрите также

- [Middlewares](./middlewares.md) — API middleware, который здесь используется
- [Подписки](./subscriptions.md) · [Селекторы](./selector-system.md) — точечное чтение и
  альтернатива-селектор для валидации
- [Persist-миграции](./persist-migration.md) — персист черновика + миграции схемы
- [SSR-гидрация](./ssr-hydration.md) — форма с серверным рендером
- [Pokemon Advanced](./pokemon-advanced.md) — эталонный рецепт целого модуля
