> [🏠 Home](../../README.md)
# API Client
___

Synapse includes an API client with caching support:

```typescript
const api = new ApiClient({
  // Request caching configuration
  cacheableHeaderKeys: ['X-Auth-Token'],
  storage: API, // Pass ready storage instance
  // Cache settings
  cache: {
    ttl: 5 * 60 * 1000, // Cache lifetime: 5 minutes
    invalidateOnError: true, // Cache invalidation on error
    cleanup: {
      enabled: true, // Periodic cache cleanup
      interval: 10 * 60 * 1000, // Cleanup interval: 10 minutes
    },
  },
  // Base request settings
  baseQuery: {
    baseUrl: 'https://api.example.com',
    timeout: 10000, // 10 seconds
    prepareHeaders: async (headers, context) => {
      // Setting headers
      headers.set('X-Auth-Token', 'some-token');
      // Getting data from storage or cookies
      const token = context.getCookie('token');
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return headers;
    },
    credentials: 'same-origin',
  },
  // Endpoint definitions
  endpoints: async (create) => ({
    getData: create({
      request: (params, context) => ({
        path: '/data',
        method: 'GET',
        query: params,
      }),
      // Can specify endpoint-specific cache settings
      cache: {
        ttl: 60 * 1000, // 1 minute for this endpoint
      },
    }),
  }),
});

// Initialization
const myApi = await api.init();

// Usage with subscription to request state
const request = myApi.getEndpoints().getData.request({ id: 1 }, {
  // Can pass additional properties to context
  context: {
    someKey: 'someValue',
  },
  // Can disable cache for specific call
  // disableCache: true,
  // Can specify headers that will participate in key formation (override all other settings)
  // cacheableHeaderKeys: ['header-key'],
  // etc...
  // Some aspects are still being refined
});

// Option 1: Subscribe to request state changes
request.subscribe((state) => {
  switch (state.status) {
    case 'idle':
      console.log('Request is inactive');
      break;
    case 'loading':
      console.log('Loading data...');
      break;
    case 'success':
      console.log('Data received:', state.data);
      break;
    case 'error':
      console.log('Error:', state.error);
      break;
  }
});

// Option 2: Wait for request result
const response = await request.wait();

// Option 3: Wait with callbacks for different states
await request.waitWithCallbacks({
  loading: () => console.log('Loading...'),
  success: (data) => console.log('Data:', data),
  error: (error) => console.error('Error:', error),
});
```

___

## 📚 Navigation

- [🏠 Home](../../README.md)
- [📖 All documentation sections](../../README.md#-documentation)

### Related sections:
- [🚀 Basic usage](./basic-usage.md)
- [⚡ Creating Effects](./create-effects.md)
- [🛠️ createSynapse utility](./create-synapse.md)
