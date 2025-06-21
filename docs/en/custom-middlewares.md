> [🏠 Home](../../README.md)
> [🏠 Changelog](../../CHANGELOG.md)

# Creating Custom Middlewares

Synapse provides two systems for extending functionality: middlewares and plugins. They serve different roles and have different scopes of application.

Middlewares in Synapse work on the principle of "handler chain" and allow intercepting any storage operations. Each middleware can modify actions before and after their processing by the base storage.


### Middleware Execution Order

Middlewares are executed in the order they are declared in the array:
1. Action goes through all middlewares from top to bottom
2. Then the base storage operation is executed
3. Result goes through middlewares from bottom to top

```
Action → BroadcastMiddleware → ShallowCompare → Batching → Base Operation
Result ← BroadcastMiddleware ← ShallowCompare ← Batching ← Base Operation
```

> ⚠️ Important: Middleware order matters!
> - BroadcastMiddleware should be first for tab synchronization
> - ShallowCompare optimizes repeated calls
> - Batching groups operations for performance

#### Creating Custom Middleware

```typescript
import { Middleware } from 'synapse-storage/core';

const loggingMiddleware = (): Middleware => ({
  // Unique middleware name
  name: 'logging',
  
  // Initialization when adding middleware to storage
  setup: (api) => {
    console.log('Logging middleware initialized');
  },
  
  // Main logic for intercepting and handling actions
  reducer: (api) => (next) => async (action) => {
    console.log('Before action:', action);
    
    try {
      // Call next middleware in chain
      const result = await next(action);
      
      console.log('After action:', {
        action,
        result,
      });
      
      return result;
    } catch (error) {
      console.error('Action error:', error);
      throw error;
    }
  },
  
  // Resource cleanup when storage is destroyed
  cleanup: () => {
    console.log('Logging middleware cleanup');
  }
});
```

I'll add more detailed examples later

___


## 📚 Navigation

- [🏠 Home](../../README.md)
- [📖 All documentation sections](../../README.md#-documentation)

### Related sections:
- [⚙️ Middlewares](./middlewares.md)
- [🔌 Creating custom plugins](./custom-plugins.md)
- [🚀 Basic usage](./basic-usage.md)
