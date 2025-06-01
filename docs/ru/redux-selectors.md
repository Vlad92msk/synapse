> [🏠 Главная](./README.md)

# Создание вычисляемых подписок в стиле Redux
___

```typescript
import { SelectorModule } from 'synapse-storage/core'

const counter1Selector = new SelectorModule(counter1)
const counter2Selector = new SelectorModule(counter2)
const counter3Selector = new SelectorModule(counter3)

const counter1ValueSelector = counter1Selector.createSelector((s) => s.value)
const counter2ValueSelector = counter2Selector.createSelector((s) => s.value)
const counter3ValueSelector = counter3Selector.createSelector((s) => s.value)

const sum = counter3Selector.createSelector(
  [counter1ValueSelector, counter2ValueSelector, counter3ValueSelector],
  (a,b,c) => a + b + c,
  // Опционально:
  // {
  //   equals: , // Функция сравнения
  //   name: 'doubledCountSelector' // Имя селектора
  // }
)
```


## Получение значений из вычисляемых селекторов
```jsx
// Нативный способ

// Единоразовое получение
const sumValueSelector = sum.select().then(value => value)

// Подписка на изменение
counter2ValueSelector.subscribe({
  notify: (value) => {
    console.log('counter2ValueSelector', value)
  }
})

counter3ValueSelector.subscribe({
  notify: (value) => {
    console.log('counter3ValueSelector', value)
  }
})

// Для React через специальный селектор
const counter1ValueSelectorValue = useSelector(counter1ValueSelector)
const counter2ValueSelectorValue = useSelector(counter2ValueSelector)
const counter3ValueSelectorValue = useSelector(counter3ValueSelector, 
  // Можно указать доп опции
  {
    initialValue: 99,
    withLoading: true,
    equals: (a, b) =>  a !== b
  })
// Тогда получать значение так
counter3ValueSelectorValue.data
counter3ValueSelectorValue.isLoading
```

___

## 📚 Навигация

- [🏠 Главная](./README.md)
- [📖 Все разделы документации](./README.md#-документация)

### Связанные разделы:
- [🚀 Базовое использование](./basic-usage.md)
- [🛠️ Утилита createSynapse](./create-synapse.md)
