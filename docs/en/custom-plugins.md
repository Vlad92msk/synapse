> [🏠 Home](../../README.md)
> [🏠 Журнал изменений](../../CHANGELOG.md)

# Creating Custom Plugins
___

Plugins in Synapse represent a system of storage event handlers with a defined lifecycle. Unlike middlewares, they don't form a chain but work as independent "observers" of storage operations.

```typescript
import { IStoragePlugin, StoragePluginModule } from 'synapse-storage/core';

// Create plugin module
const plugins = new StoragePluginModule(
  undefined,      // Parent plugin module (optional)
  console,        // Logger
  'appStorage'    // Storage name
);

// Example validation plugin
class ValidationPlugin implements IStoragePlugin {
  name = 'validation';
  private validators = new Map();
  private options: any;

  constructor(options = {}) {
    this.options = options;
  }

  // Add validation rule for key
  addValidator(key, validator) {
    this.validators.set(key, validator);
    return this;
  }

  // Called before saving value
  async onBeforeSet(value, context) {
    const { key } = context.metadata || {};
    
    if (key && this.validators.has(key)) {
      const validator = this.validators.get(key);
      const result = validator(value);
      
      if (!result.valid) {
        if (this.options.throwOnInvalid) {
          throw new Error(`Validation failed for ${key}: ${result.message}`);
        }
        
        this.options.onValidationError?.(key, value, result.message);
      }
    }
    
    return value;
  }
  
  // Plugin initialization
  async initialize() {
    console.log('Validation plugin initialized');
  }
  
  // Resource cleanup
  async destroy() {
    this.validators.clear();
  }
}

// Adding plugins to module
await plugins.add(new ValidationPlugin({
  throwOnInvalid: true,
  onValidationError: (key, value, message) => {
    console.error(`Validation error: ${message}`);
  }
}));

// Creating storage with plugins
const storage = await new MemoryStorage(
  { name: 'app-storage' },
  plugins  // Pass plugin module
).initialize();
```

#### Plugin Lifecycle

Plugins have the following lifecycle methods:

1. **Initialization**: `initialize()` - called when adding plugin to storage
2. **Storage operations**:
    - `onBeforeSet` / `onAfterSet` - before/after saving value
    - `onBeforeGet` / `onAfterGet` - before/after getting value
    - `onBeforeDelete` / `onAfterDelete` - before/after deleting value
    - `onClear` - when clearing storage
3. **Destruction**: `destroy()` - called when removing plugin or destroying storage

#### When to use middlewares vs plugins?

- **Middlewares** are better for:
    - Intercepting all storage operations in one place
    - Changing behavior of base storage operations
    - Optimization (batching, deduplication)
    - Synchronization between storages/tabs

- **Plugins** are better for:
    - Handling specific storage events
    - Data validation
    - Operation logging
    - Implementing business logic related to data storage
    - Integration with external services


I'll add more detailed examples later

___

## 📚 Navigation

- [🏠 Home](../../README.md)
- [📖 All documentation sections](../../README.md#-documentation)

### Related sections:
- [⚙️ Middlewares](./middlewares.md)
- [⚙️ Creating custom middlewares](./custom-middlewares.md)
- [🚀 Basic usage](./basic-usage.md)
