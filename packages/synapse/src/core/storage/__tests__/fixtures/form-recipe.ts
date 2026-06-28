// Эталонная реализация «рецепта форм» (docs/{ru,en}/forms.md), вынесенная в
// фикстуру, чтобы её проверяли сразу несколько тестов (ядро + React-интеграция)
// и чтобы в доке и в тестах был ОДИН источник правды. Файл не оканчивается на
// `.test.ts`, поэтому vitest его как тест не собирает.
import { MemoryStorage } from '../../adapters/memory-storage.service'
import { ISyncStorage } from '../../storage.interface'
import { StorageAction, SyncMiddleware } from '../../utils/middleware-module'

export type FormErrors<V> = Partial<Record<keyof V & string, string>>
export type Validator<V> = (values: V) => FormErrors<V>

export interface FormState<V extends Record<string, any>> extends Record<string, any> {
  values: V
  errors: FormErrors<V>
  touched: Partial<Record<keyof V & string, boolean>>
  isValid: boolean
  isSubmitting: boolean
  submitCount: number
}

const shallowEqualErrors = (a: Record<string, any>, b: Record<string, any>): boolean => {
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  return ak.every((k) => a[k] === b[k])
}

// Валидируем ТОЛЬКО когда меняется что-то внутри `values.*` — иначе запись
// `errors`/`touched` снова дёрнет валидацию (грабля рецепта §4.2.2).
const touchesValues = (action: StorageAction): boolean => {
  if (action.type === 'set') {
    return String(action.key ?? '').split('.')[0] === 'values'
  }
  if (action.type === 'update') {
    const paths: string[] = action.metadata?.changedPaths ?? []
    return paths.some((p) => String(p).split('.')[0] === 'values')
  }
  return false
}

export function createFormValidationMiddleware<V extends Record<string, any>>(validate: Validator<V>): SyncMiddleware {
  return {
    name: 'form-validation',
    reducer: (api) => (next) => (action) => {
      // 1) Сначала пишем значение — НЕ блокируем инвалидный ввод (грабля §4.2.1).
      const result = next(action)

      if (!touchesValues(action)) return result

      // 2) Считаем ошибки от уже записанного состояния.
      const state = api.getState() as FormState<V>
      const errors = validate(state.values)
      const isValid = Object.keys(errors).length === 0

      const errorsChanged = !shallowEqualErrors(state.errors ?? {}, errors)
      if (!errorsChanged && state.isValid === isValid) return result

      // 3) Пишем производное НАПРЯМУЮ (минуя dispatch) → нет рекурсии (грабля §4.2.2).
      api.storage.doSet('errors', errors)
      api.storage.doSet('isValid', isValid)

      // 4) Уведомляем точечных подписчиков и subscribeToAll/useStorageSubscribe.
      api.storage.notifySubscribers('errors', errors)
      api.storage.notifySubscribers('isValid', isValid)
      api.storage.notifySubscribers('*', {
        type: 'storage:update',
        key: ['errors', 'isValid'],
        value: { errors, isValid },
        changedPaths: ['errors', 'isValid'],
      })

      return result
    },
  }
}

// ─── Тестовая форма ──────────────────────────────────────────────────────────

export interface SignUp extends Record<string, any> {
  email: string
  password: string
  confirm: string
}

export const makeInitial = (): FormState<SignUp> => ({
  values: { email: '', password: '', confirm: '' },
  errors: {},
  touched: {},
  isValid: false,
  isSubmitting: false,
  submitCount: 0,
})

export const validateSignUp: Validator<SignUp> = (v) => {
  const errors: FormErrors<SignUp> = {}
  if (!v.email) errors.email = 'Email is required'
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) errors.email = 'Email is invalid'
  if (v.password.length < 6) errors.password = 'Min 6 characters'
  if (v.confirm !== v.password) errors.confirm = 'Passwords do not match'
  return errors
}

// Пишем поле вложенным путём `values.<name>`. Запись иммутабельна и reset-safe:
// `set` не мутирует общий `initialState`, а `getStateSync()` после `set` синхронно
// свежий → `useStorageSubscribe`/SSR видят ошибки сразу. Изоляция ре-рендеров не
// страдает: селектор поля возвращает примитив, который у нетронутых полей не
// меняется по ссылке.
export function setField<V extends Record<string, any>>(storage: ISyncStorage<FormState<V>>, name: keyof V & string, value: V[keyof V]): void {
  storage.set(`values.${name}`, value)
}

export function touchField<V extends Record<string, any>>(storage: ISyncStorage<FormState<V>>, name: keyof V & string): void {
  storage.set(`touched.${name}`, true)
}

let uid = 0

export async function makeForm(validate: Validator<SignUp> = validateSignUp): Promise<ISyncStorage<FormState<SignUp>>> {
  const storage = new MemoryStorage<FormState<SignUp>>({
    name: `signup_${uid++}`,
    initialState: makeInitial(),
    middlewares: () => [createFormValidationMiddleware<SignUp>(validate)],
  })
  await storage.initialize()
  return storage as ISyncStorage<FormState<SignUp>>
}
