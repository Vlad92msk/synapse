> [🏠 Home](../../README.md)
> [🏠 Changelog](../../CHANGELOG.md)

# Creating Redux-style Computed Subscriptions

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
  // Optional:
  // {
  //   equals: , // Comparison function
  //   name: 'doubledCountSelector' // Selector name
  // }
)
```


## Getting Values from Computed Selectors
```jsx
// Native way

// One-time value retrieval
const sumValueSelector = sum.select().then(value => value)

// Subscribe to changes
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

// For React via special selector
const counter1ValueSelectorValue = useSelector(counter1ValueSelector)
const counter2ValueSelectorValue = useSelector(counter2ValueSelector)
const counter3ValueSelectorValue = useSelector(counter3ValueSelector, 
  // Can specify additional options
  {
    initialValue: 99,
    withLoading: true,
    equals: (a, b) =>  a !== b
  })
// Then get value like this
counter3ValueSelectorValue.data
counter3ValueSelectorValue.isLoading
```

___

## 📚 Navigation

- [🏠 Home](../../README.md)
- [📖 All documentation sections](../../README.md#-documentation)

### Related sections:
- [🚀 Basic usage](./basic-usage.md)
- [🛠️ createSynapse utility](./create-synapse.md)
