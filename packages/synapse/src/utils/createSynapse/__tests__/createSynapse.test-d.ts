// Type-level тесты C-формы (гейтятся vitest typecheck + основным tsc): вывод генериков,
// инференс колбэка postConstruct и явные генерики через `.of`. Раньше эти инварианты не были
// закрыты компилятором — регрессия вывода не роняла CI (тесты исключены из tsc). Теперь роняет.
import { describe, expectTypeOf, it } from 'vitest'

import { MemoryStorage } from '../../../core/storage/adapters/memory-storage.service'
import { Selectors } from '../../../core/selector/selectors.base'
import { Dispatcher } from '../../../reactive/dispatcher/dispatcher.base'
import { createSynapse } from '../createSynapse'

interface S extends Record<string, any> {
  n: number
}
class D extends Dispatcher<S> {
  readonly inc = this.action((store) => store.update((s) => (s.n += 1)))
}
class Sel extends Selectors<S> {
  readonly n = this.select((s) => s.n)
}

describe('createSynapse — type-level', () => {
  it('выводит TState/TDispatcher/TSelectors из фабрик (без явных генериков)', () => {
    const handle = createSynapse({
      storage: () => new MemoryStorage<S>({ name: 'x', initialState: { n: 0 } }),
      dispatcher: (s) => new D(s),
      selectors: (s) => new Sel(s),
    })
    expectTypeOf(handle.selectors).toEqualTypeOf<Sel>()
    expectTypeOf(handle.dispatcher).toEqualTypeOf<D>()
    expectTypeOf(handle.storage.getStateSync()).toEqualTypeOf<S>()
  })

  it('postConstruct (2-й аргумент): { actions } инферится как TDispatcher без аннотации', () => {
    createSynapse(
      {
        storage: () => new MemoryStorage<S>({ name: 'x', initialState: { n: 0 } }),
        dispatcher: (s) => new D(s),
      },
      {
        // Ключевой инвариант §8.2: колбэк контекстно типизируется выведенным TDispatcher.
        postConstruct: ({ actions }) => {
          expectTypeOf(actions).toEqualTypeOf<D>()
          actions.inc()
        },
      },
    )
  })

  it('.of: явные генерики работают с dependencies (без fall-through на legacy)', () => {
    const of = createSynapse.of<S, D, Sel>({
      storage: () => new MemoryStorage<S>({ name: 'x', initialState: { n: 0 } }),
      dispatcher: (s) => new D(s),
      selectors: (s) => new Sel(s),
      dependencies: [],
    })
    expectTypeOf(of.selectors).toEqualTypeOf<Sel>()
    expectTypeOf(of.dispatcher).toEqualTypeOf<D>()
  })
})
