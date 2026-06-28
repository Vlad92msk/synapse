// @vitest-environment jsdom
//
// Тесты «рецепта форм» (docs/{ru,en}/forms.md) на валидационную middleware.
// Реальные кейсы + грабли §4.2 рецепта:
//   1) middleware НЕ блокирует запись инвалидного значения (инпут показывает ввод);
//   2) запись `errors` не уходит в рекурсию (валидация не перезапускает сама себя);
//   3) подписчики на `errors` и `subscribeToAll` получают апдейт;
//   4) кросс-полевая валидация, reset, isValid.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FormState, makeForm, setField, SignUp, touchField, validateSignUp } from './fixtures/form-recipe'
import { ISyncStorage } from '../storage.interface'

describe('forms recipe — validation middleware', () => {
  let storage: ISyncStorage<FormState<SignUp>>

  afterEach(async () => {
    try {
      await storage.destroy()
    } catch {
      /* already destroyed */
    }
  })

  it('пишет инвалидное значение, но фиксирует ошибку (не блокирует ввод)', async () => {
    storage = await makeForm()

    setField(storage, 'email', 'bad')

    // Грабля §4.2.1: значение в сторе именно то, что напечатал пользователь.
    expect(storage.getState().values.email).toBe('bad')
    expect(storage.getState().errors.email).toBe('Email is invalid')
  })

  it('сбрасывает ошибку, когда значение становится валидным', async () => {
    storage = await makeForm()

    setField(storage, 'email', 'bad')
    expect(storage.getState().errors.email).toBe('Email is invalid')

    setField(storage, 'email', 'user@example.com')
    expect(storage.getState().errors.email).toBeUndefined()
  })

  it('не уходит в рекурсию: validate вызывается ровно один раз на запись в values', async () => {
    const spy = vi.fn(validateSignUp)
    storage = await makeForm(spy)

    setField(storage, 'email', 'user@example.com')

    // Если бы запись errors снова запускала валидацию — был бы >1 (или переполнение стека).
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('не валидирует при записи в не-values ключ (touched)', async () => {
    const spy = vi.fn(validateSignUp)
    storage = await makeForm(spy)

    touchField(storage, 'email')

    expect(spy).not.toHaveBeenCalled()
    expect(storage.getState().touched.email).toBe(true)
  })

  it('кросс-полевая валидация: confirm должен совпадать с password', async () => {
    storage = await makeForm()

    setField(storage, 'password', 'secret1')
    setField(storage, 'confirm', 'secret2')
    expect(storage.getState().errors.confirm).toBe('Passwords do not match')

    setField(storage, 'confirm', 'secret1')
    expect(storage.getState().errors.confirm).toBeUndefined()
  })

  it('isValid отражает валидность всей формы', async () => {
    storage = await makeForm()

    expect(storage.getState().isValid).toBe(false)

    setField(storage, 'email', 'user@example.com')
    setField(storage, 'password', 'secret1')
    setField(storage, 'confirm', 'secret1')

    expect(storage.getState().errors).toEqual({})
    expect(storage.getState().isValid).toBe(true)
  })

  it('срабатывает и через update(), а не только через set()', async () => {
    storage = await makeForm()

    // update() — иммутабельный путь записи; валидация так же ловит изменение values.
    storage.update((s) => {
      s.values.email = 'nope'
    })

    expect(storage.getState().values.email).toBe('nope')
    expect(storage.getState().errors.email).toBe('Email is invalid')
  })

  it('уведомляет подписчиков на "errors" и subscribeToAll', async () => {
    storage = await makeForm()

    const errorSnapshots: any[] = []
    storage.subscribe('errors', (v) => errorSnapshots.push(v))

    const allEvents: string[][] = []
    storage.subscribeToAll((e) => {
      if (e.changedPaths) allEvents.push(e.changedPaths)
    })

    setField(storage, 'email', 'bad')

    // Последний снапшот errors содержит ошибку email.
    expect(errorSnapshots.at(-1)?.email).toBe('Email is invalid')
    // subscribeToAll получил событие про изменение errors.
    expect(allEvents.some((paths) => paths.includes('errors'))).toBe(true)
  })

  it('reset() возвращает к initialState и очищает ошибки', async () => {
    storage = await makeForm()

    setField(storage, 'email', 'bad')
    expect(storage.getState().errors.email).toBe('Email is invalid')

    storage.reset()

    expect(storage.getState().values).toEqual({ email: '', password: '', confirm: '' })
    expect(storage.getState().errors).toEqual({})
  })

  it('getStateSync() (вид потребителя) отражает ошибки сразу после set', async () => {
    storage = await makeForm()

    setField(storage, 'email', 'bad')

    // _stateCache синхронно содержит ошибки → useStorageSubscribe увидит их.
    expect(storage.getStateSync().errors.email).toBe('Email is invalid')
  })
})
