# Synapse Storage

>  **🇷🇺 Русский** | [🇺🇸 English](../../README.md)

Набор инструментов для управления состоянием + API-клиент

[![npm version](https://badge.fury.io/js/synapse-storage.svg)](https://badge.fury.io/js/synapse-storage)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/synapse-storage)](https://bundlephobia.com/package/synapse-storage)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)
[![RxJS Version](https://img.shields.io/badge/RxJS-%5E7.8.2-red?logo=reactivex)](https://rxjs.dev/)

## ✨ Ключевые особенности

- 🚀 **Не зависит от фреймворка** - Вы можете использовать Synapse в контексте любого фреймворка или независимо от него
- 💾 **Разнообразные адаптеры хранилищ** - Memory, LocalStorage, IndexedDB
- 🧮 **Различный способ получения данных** - Computed values with memoization
    - Возможность создания вычисляемых селекторов в стиле Redux
    - Возможность прямой подписки на конкретное свойство в хранилище
    - Возможность подписки на реактивное состояние
- 🌐 **Создание API клиентов** - HTTP клиент с возможностью кэширования (Похож на RTK Query)
- ⚛️ **React** - Несколько удобных хуков для React
- ⚡ **RxJS** - Возможность создания эффектов в стиле Redux-Observable
- ⚙️ **Поддержка кастомных middleware** - Возможность расширения функционала хранилища с помощью кастомных middlewares
- 🔌 **Поддержка кастомных плагинов** - Возможность расширения функционала хранилища с помощью кастомных middlewares

---
## Автор

**Владислав** — Senior Frontend Developer (React, TypeScript)


> ### 🔎 Нахожусь в поиске новых карьерных возможностей!
>
> [GitHub](https://github.com/Vlad92msk/) | [LinkedIn](https://www.linkedin.com/in/vlad-firsov/)


---
*PS: Пока не рекоммендую использовать в production т.к разработкой занимаюсь в свободное время.
Библиотека в целом работает, но дать гарантии смогу после полной интеграции ее в свой пет-проект Социальная сеть.
Но произойдет это не раньше смены моего текущего места работы и страны проживания*
---

## 📦 Установка

```bash
npm install synapse-storage
```

```bash
# Для реактивных возможностей
npm install rxjs

# Для React интеграции  
npm install react react-dom

# Все сразу для полного функционала
npm install synapse-storage rxjs react react-dom
```


| Модуль | Описание    | Зависимости |
|--------|-------------|-------------|
| `synapse-storage/core` | base        | -           |
| `synapse-storage/react` | React       | React 18+   |
| `synapse-storage/reactive` | RxJS        | RxJS 7.8.2+ |
| `synapse-storage/api` | HTTP client | -           |
| `synapse-storage/utils` | Utils       | -           |

> **💡 Совет:** Импортируйте только нужные модули для оптимального размера бандла

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


## 📚 Документация

- [📖 Главная](./README.md)
- [🚀 Базовое использование](./basic-usage.md)
- [🧮 Вычисляемые селекторы в стиле Redux](./redux-selectors.md)
- [⚙️ Middlewares](./middlewares.md)
- [🌐 API-клиент](./api-client.md)
- ⚡ Реактивный подход
  - [⚡ Создание Диспетчера](./create-dispatcher.md)
  - [⚡ Создание Эффектов](./create-effects.md)
  - [⚡ Создание Модуля эффектов](./create-effects-module.md)
- [🛠️ Утилита createSynapse](./create-synapse.md)
- [🔌 Создание пользовательских плагинов](./custom-plugins.md)
- [⚙️ Создание пользовательских middlewares](./custom-middlewares.md)
- [📋 Дополнительное](./additional.md)


## 🎯 Примеры

- [GitHub](https://github.com/Vlad92msk/synapse-examples)
- [YouTube](https://www.youtube.com/channel/UCGENI_i4qmBkPp98P2HvvGw)

---

## 📁 Структура документации

```
docs/
├── ru/                           # 🇷🇺 Русская документация
│   ├── README.md                # Главная страница
│   ├── basic-usage.md           # Базовое использование
│   ├── storage-creation.md      # Создание хранилищ
│   ├── value-updates.md         # Изменения значений
│   ├── subscriptions.md         # Создание подписок
│   ├── redux-selectors.md       # Вычисляемые селекторы в стиле Redux
│   ├── middlewares.md           # Middlewares
│   ├── api-client.md            # API-клиент
│   ├── reactive.md              # Реактивный подход
│   ├── create-dispatcher.md     # Создание Диспетчера
│   ├── create-effects.md        # Создание Эффектов
│   ├── create-effects-module.md # Создание модуля эффектов
│   ├── create-synapse.md        # Утилита createSynapse
│   ├── custom-plugins.md        # Создание пользовательских плагинов
│   ├── custom-middlewares.md    # Создание пользовательских middlewares
│   └── additional.md            # Дополнительное
│   
└── en/                          # 🇺🇸 English documentation
    └── ...
```


---
