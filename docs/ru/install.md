# Установка

Ядро не тянет лишних зависимостей. `rxjs` и `react` подключаются только если нужен
соответствующий слой.

```bash
yarn add synapse-storage
```

Опциональные peer-зависимости — ставьте по необходимости:

```bash
# эффекты на RxJS
npm install rxjs

# React-хуки и SSR
npm install react
```

> Нужен только реактивный стор? Достаточно одного `synapse-storage` — без `rxjs` и `react`.
