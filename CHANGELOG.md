# Changelog

## [3.0.11] - 2024-12-27

### ✨ Added

- **Storage Status Tracking**: Monitor initialization progress with `onStatusChange()` and `waitForReady()`
- **Dependency Management**: Control synapse initialization order with `dependencies` property
- **EventBus**: New `createEventBus()` utility for decoupled communication between modules
- **Configuration Validation**: Comprehensive validation with detailed error messages

### 🛠 Improved

- Enhanced error handling during storage initialization
- Better TypeScript support and type inference
- Improved cleanup and memory management

### 📖 Usage Examples

```typescript
// Status tracking
const storage = new MemoryStorage(config)
storage.onStatusChange(status => console.log(status.status))
await storage.initialize()

// Dependencies
const synapse = await createSynapse({
  dependencies: [coreSynapse], // Wait for dependencies
  // ... config
})

// EventBus
const eventBus = await createEventBus({ name: 'app-events' })
eventBus.dispatcher.publish({ event: 'USER_UPDATED', data: {...} })
```

---
