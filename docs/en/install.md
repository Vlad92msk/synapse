# Install

The core pulls in no extra dependencies. `rxjs` and `react` are only needed if you use the
matching layer.

```bash
npm install synapse-storage
# or
yarn add synapse-storage
```

Optional peer dependencies — install them as needed:

```bash
# effects on RxJS
npm install rxjs

# React hooks and SSR
npm install react
```

> Need only the reactive store? A single `synapse-storage` is enough — no `rxjs`, no `react`.
