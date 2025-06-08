# Synapse Storage

> **🇺🇸 English** | [🇷🇺 Русский](./docs/ru/README.md) | [📝  ChangeLog](./CHANGELOG.md)

State management toolkit + API client

[![npm version](https://badge.fury.io/js/synapse-storage.svg)](https://badge.fury.io/js/synapse-storage)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/synapse-storage)](https://bundlephobia.com/package/synapse-storage)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)
[![RxJS Version](https://img.shields.io/badge/RxJS-%5E7.8.2-red?logo=reactivex)](https://rxjs.dev/)

## ✨ Key Features

- 🚀 **Framework Agnostic** - You can use Synapse with any framework or independently
- 💾 **Various Storage Adapters** - Memory, LocalStorage, IndexedDB
- 🧮 **Different Ways to Access Data** - Computed values with memoization
    - Ability to create Redux-style computed selectors
    - Ability to directly subscribe to specific properties in storage
    - Ability to subscribe to reactive state
- 🌐 **API Client Creation** - HTTP client with caching capabilities (Similar to RTK Query)
- ⚛️ **React** - Several convenient hooks for React
- ⚡ **RxJS** - Ability to create Redux-Observable style effects
- ⚙️ **Custom Middleware Support** - Ability to extend storage functionality with custom middlewares
- 🔌 **Custom Plugin Support** - Ability to extend storage functionality with custom plugins

---
## Author

**Vladislav** — Senior Frontend Developer (React, TypeScript)

> ### 🔎 Currently looking for new career opportunities!
>
> [GitHub](https://github.com/Vlad92msk/) | [LinkedIn](https://www.linkedin.com/in/vlad-firsov/)

---
*PS: Not recommended for production use yet as I develop this in my free time.
The library works in general, but I can provide guarantees only after full integration into my pet project - Social Network.
This won't happen before changing my current workplace and country of residence*
---

## 📦 Installation

```bash
npm install synapse-storage
```

```bash
# For reactive capabilities
npm install rxjs

# For React integration  
npm install react react-dom

# All at once for full functionality
npm install synapse-storage rxjs react react-dom
```

| Module | Description | Dependencies |
|--------|-------------|--------------|
| `synapse-storage/core` | base | - |
| `synapse-storage/react` | React | React 18+ |
| `synapse-storage/reactive` | RxJS | RxJS 7.8.2+ |
| `synapse-storage/api` | HTTP client | - |
| `synapse-storage/utils` | Utils | - |

> **💡 Tip:** Import only the modules you need for optimal bundle size

### tsconfig.json:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022", 
    "moduleResolution": "bundler"
  }
}
```

## 📚 Documentation

- [📖 Main](./docs/ru/README.md)
- [🚀 Basic Usage](./docs/ru/basic-usage.md)
- [🧮 Redux-style Computed Selectors](./docs/ru/redux-selectors.md)
- [⚙️ Middlewares](./docs/ru/middlewares.md)
- [🌐 API Client](./docs/ru/api-client.md)
- ⚡ Reactive Approach
    - [⚡ Creating Dispatcher](./docs/ru/create-dispatcher.md)
    - [⚡ Creating Effects](./docs/ru/create-effects.md)
    - [⚡ Creating Effects Module](./docs/ru/create-effects-module.md)
- [🛠️ createSynapse Utility](./docs/ru/create-synapse.md)
- [🔌 Creating Custom Plugins](./docs/ru/custom-plugins.md)
- [⚙️ Creating Custom Middlewares](./docs/ru/custom-middlewares.md)
- [📋 Additional](./docs/ru/additional.md)

## 🎯 Examples

- [GitHub](https://github.com/Vlad92msk/synapse-examples)
- [YouTube](https://www.youtube.com/channel/UCGENI_i4qmBkPp98P2HvvGw)

---

## 📊 Why Synapse Storage?

**One library instead of many** - Synapse combines functionality that usually requires multiple dependencies:

| What you get | Traditional approach | Synapse Storage |
|--------------|---------------------|---------|
| **State Management** | Redux + RTK (~45KB) | ✅ |
| **HTTP Client + Caching** | React Query (~39KB) | ✅|
| **Reactive Effects** | Redux-Observable (~25KB) | ✅|
| **Storage Adapters** | Custom solutions | ✅|
| **React Integration** | Custom hooks | ✅|
| **Computed Selectors** | Reselect (~5KB) | ✅|
| **Middleware System** | Custom implementation | ✅|
| **Plugin Architecture** | Custom implementation | ✅|

### Bundle Size Comparison

```typescript
// Traditional stack
import { configureStore } from '@reduxjs/toolkit'     // ~45KB
import { createApi } from '@reduxjs/toolkit/query'    // included in RTK
import { QueryClient } from '@tanstack/react-query'  // ~39KB  
import { createEpicMiddleware } from 'redux-observable' // ~25KB
// Total: ~109KB + custom implementations

// Synapse Storage
import { createSynapse } from 'synapse-storage'       // ~171KB
// Total: 171KB with ALL features included
```

### Modular Usage

Don't need everything? Import only what you use:

| Use Case          | Import                 | Size | Comparison                |
|-------------------|------------------------|------|---------------------------|
| **Basic state**   | `synapse-storage/core` | ~42KB | vs Redux: 45KB            |
| **+ HTTP client** | `+ /api`               | +13KB | vs React Query: 39KB      |
| **+ Reactive**    | `+ /reactive`          | +8KB | vs Redux-Observable: 25KB |
| **+ React hooks** | `+ /react`             | +5KB | vs Custom hooks           |
| **Full package**  | all modules            | ~171KB |vs 109KB stack + custom   |

> **🎯 Result:** Similar or better performance with unified API and TypeScript support out of the box

## 🧩 Modular Architecture "Like a Constructor"

**Use only what you need** - each module works independently:

### 🎯 Flexible Usage Scenarios

```typescript
// 📦 Minimal project - storage only
import { MemoryStorage } from 'synapse-storage/core'        // 42KB

// 📦 + Add HTTP client when needed  
import { ApiClient } from 'synapse-storage/api'             // +13KB

// 📦 + Add reactive effects when required
import { createDispatcher } from 'synapse-storage/reactive' // +8KB

// 📦 + Add React hooks for UI
import { useSelector } from 'synapse-storage/react'         // +5KB
```

### 🔧 Or Create Your Own Implementation

```typescript
// Use core + your solutions
import { IStorage } from 'synapse-storage/core'

// Implement your HTTP client
class MyApiClient { /* your logic */ }

// Implement your React hooks  
const useMyCustomHook = () => { /* your logic */ }

// Combine as convenient!
```

### 🎨 Constructor Approach Benefits

- **🚀 Quick Start** - begin with core, add modules as project grows
- **📦 Optimal Bundle** - don't pay for unused functionality
- **🔄 Flexibility** - replace any module with your implementation
- **🛠️ Compatibility** - modules work independently but integrate perfectly
- **📈 Scalability** - from simple state to full-featured architecture

> **💡 Evolution Example:** Started with MemoryStorage → added ApiClient → connected reactive effects → integrated React hooks. **Each step is optional!**
> 
---

## 📁 Documentation Structure

```
docs/
├── ru/                           # 🇷🇺 Russian documentation
│   └── ...
│   
└── en/                          # 🇺🇸 English documentation
    ├── README.md               # Main page
    ├── basic-usage.md          # Basic Usage
    ├── storage-creation.md     # Storage Creation
    ├── value-updates.md        # Value Updates
    ├── subscriptions.md        # Subscriptions
    ├── redux-selectors.md      # Redux-style Selectors
    ├── middlewares.md          # Middlewares
    ├── api-client.md           # API Client
    ├── reactive.md             # Reactive Approach
    ├── create-dispatcher.md    # Create Dispatcher
    ├── create-effects.md       # Create Effects
    ├── create-synapse.md       # createSynapse Utility
    ├── custom-plugins.md       # Custom Plugins
    ├── custom-middlewares.md   # Custom Middlewares
    └── additional.md           # Additional
```

---
