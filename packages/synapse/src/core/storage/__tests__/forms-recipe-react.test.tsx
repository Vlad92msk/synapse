// @vitest-environment jsdom
//
// React-интеграция «рецепта форм»: контролируемые инпуты, чтение через
// useStorageSubscribe с `equals`, показ ошибки только для тронутых полей и —
// главное — изоляция ре-рендеров по полю (ввод в одно поле не перерисовывает
// соседнее).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { FormState, makeForm, setField, SignUp, touchField } from './fixtures/form-recipe'
import { ISyncStorage } from '../storage.interface'
import { useStorageSubscribe } from '../../../react/hooks/useStorageSubscribe'

const renderCounts: Record<string, number> = {}

function Field({ storage, name }: { storage: ISyncStorage<FormState<SignUp>>; name: keyof SignUp & string }) {
  renderCounts[name] = (renderCounts[name] ?? 0) + 1

  const value = useStorageSubscribe(storage, (s) => s.values[name] ?? '', { equals: Object.is })
  // Ошибку показываем только для тронутого поля → нетронутые соседи не ре-рендерятся.
  const error = useStorageSubscribe(storage, (s) => (s.touched[name] ? s.errors[name] : undefined), { equals: Object.is })

  return (
    <div>
      <input
        aria-label={name}
        value={value as string}
        onChange={(e) => setField(storage, name, e.target.value)}
        onBlur={() => touchField(storage, name)}
      />
      {error ? (
        <span role="alert" data-field={name}>
          {error as string}
        </span>
      ) : null}
    </div>
  )
}

describe('forms recipe — React integration', () => {
  let storage: ISyncStorage<FormState<SignUp>>

  afterEach(async () => {
    cleanup()
    for (const k of Object.keys(renderCounts)) delete renderCounts[k]
    try {
      await storage.destroy()
    } catch {
      /* already destroyed */
    }
  })

  it('контролируемый инпут пишет значение и показывает ошибку после blur', async () => {
    storage = await makeForm()
    render(
      <>
        <Field storage={storage} name="email" />
        <Field storage={storage} name="password" />
      </>,
    )

    const email = screen.getByLabelText('email') as HTMLInputElement
    fireEvent.change(email, { target: { value: 'bad' } })
    expect(email.value).toBe('bad')
    // До blur ошибка не показывается (поле не тронуто).
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.blur(email)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Email is invalid')
    expect(alert.getAttribute('data-field')).toBe('email')
  })

  it('изоляция ре-рендеров: ввод в email не перерисовывает поле password', async () => {
    storage = await makeForm()
    render(
      <>
        <Field storage={storage} name="email" />
        <Field storage={storage} name="password" />
      </>,
    )

    const emailRendersBefore = renderCounts.email
    const passwordRendersBefore = renderCounts.password

    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'x' } })

    // email перерисовался (его срез изменился)…
    expect(renderCounts.email).toBeGreaterThan(emailRendersBefore)
    // …а password — нет: его value не менялось, error скрыт (поле не тронуто).
    expect(renderCounts.password).toBe(passwordRendersBefore)
  })

  it('ошибка исчезает после исправления значения', async () => {
    storage = await makeForm()
    render(<Field storage={storage} name="email" />)

    const email = screen.getByLabelText('email')
    fireEvent.change(email, { target: { value: 'bad' } })
    fireEvent.blur(email)
    expect(screen.queryByRole('alert')).not.toBeNull()

    fireEvent.change(email, { target: { value: 'user@example.com' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
