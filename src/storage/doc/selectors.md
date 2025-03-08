# Селекторы

Селекторы предоставляют удобный способ доступа к данным в хранилище, позволяя создавать вычисляемые значения и комбинировать данные.

## Создание модуля селекторов

```typescript
// Создаем экземпляр модуля селекторов
const storageSelectors = new SelectorModule(storage)
```

## Простые селекторы

```typescript
// Создание простого селектора
const counterSelector = storageSelectors.createSelector(
  (state) => state.counter
)

// Подписка на изменения значения
counterSelector.subscribe({
  notify: (value) => {
    console.log('Counter changed:', value)
  }
})
```

## Комбинированные селекторы

```typescript
// Создаем базовые селекторы
const counter1Selector = storageSelectors.createSelector(
  (state) => state.counter1
)

const counter2Selector = storageSelectors.createSelector(
  (state) => state.counter2
)

// Создаем комбинированный селектор
const sumSelector = storageSelectors.createSelector(
  [counter1Selector, counter2Selector],
  (counter1, counter2) => counter1 + counter2
)
```

## Использование в React

```typescript
// Хук для работы с селекторами
const useSelector = <T>(selector: SelectorAPI<T> | undefined): T | undefined => {
  const [value, setValue] = useState<T>()

  useEffect(() => {
    if (!selector) return

    // Получаем начальное значение
    selector.select().then((value) => {
      setValue(value)
    })

    // Подписываемся на изменения
    return selector.subscribe({
      notify: async (newValue: T) => {
        setValue(newValue)
      },
    })
  }, [selector])

  return value
}

// Использование в компоненте
function Counter() {
  const counter1 = useSelector(counter1Selector)
  const counter2 = useSelector(counter2Selector)
  const sum = useSelector(sumSelector)

  return (
    <div>
      <div>Counter 1: {counter1}</div>
      <div>Counter 2: {counter2}</div>
      <div>Sum: {sum}</div>
    </div>
  )
}
```

## Важные особенности

1. Селекторы работают только с данными из хранилища:
```typescript
// ❌ Неправильно - использование внешних параметров
const userByIdSelector = (id: string) => storageSelectors.createSelector(
  (state) => state.users[id]
)

// ✅ Правильно - селектор использует только состояние
const usersSelector = storageSelectors.createSelector(
  (state) => state.users
)
```

2. Селекторы автоматически перевычисляются при изменении зависимостей:
```typescript
// Изменение counter1 или counter2 приведет к перевычислению sumSelector
await storage.update(state => {
  state.counter1 += 1
})
```

3. Селекторы могут быть вложенными:
```typescript
const combinedSelector = storageSelectors.createSelector(
  [sumSelector, otherSelector],
  (sum, other) => ({ sum, other })
)
```

## Рекомендации

1. Создавайте простые селекторы для базовых данных
2. Используйте комбинированные селекторы для вычисляемых значений
3. Избегайте сложной логики внутри селекторов
4. Не передавайте параметры в селекторы извне
5. Следите за производительностью при создании сложных селекторов