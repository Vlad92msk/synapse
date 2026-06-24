// src/i18n/config.ts
import { initReactI18next } from 'react-i18next'
import i18n from 'i18next'

// Переводы для UI элементов (не для документации!)
const resources = {
  ru: {
    translation: {
      // Навигация
      'nav.home': 'Главная',
      'nav.docs': 'Документация',
      'nav.examples': 'Примеры',
      'nav.github': 'GitHub',

      // Документация — ссылки на примеры
      'docs.examples.single': 'Рабочий пример на GitHub',
      'docs.examples.multiple': 'Рабочие примеры на GitHub',

      // Homepage
      'homepage.hero.title': 'Synapse',
      'homepage.hero.subtitle': 'Стейт-менеджер, слой бизнес-логики и API-клиент — три независимых инструмента в одной библиотеке. Берите то, что нужно именно вам.',
      'homepage.hero.getStarted': 'Документация',
      'homepage.hero.threeBlocks': 'Три блока',
      'homepage.hero.learnMore': 'Ключевые особенности',

      // Три блока (столпы)
      'homepage.pillars.title': 'Три независимых блока',
      'homepage.pillars.subtitle': 'Каждый блок — отдельный модуль, который можно подключать сам по себе. Поймите, что нужно именно вам.',
      'homepage.pillars.more': 'Подробнее →',

      'homepage.pillars.state.name': 'State Manager',
      'homepage.pillars.state.when': 'Нужно только состояние',
      'homepage.pillars.state.tagline': 'Реактивные хранилища с единым API. Без RxJS, без React — просто состояние и подписки.',
      'homepage.pillars.state.point1': 'Memory · LocalStorage · IndexedDB под одним интерфейсом',
      'homepage.pillars.state.point2': 'Иммутабельные обновления в стиле Immer',
      'homepage.pillars.state.point3': 'Мемоизированные селекторы с зависимостями между хранилищами',
      'homepage.pillars.state.point4': 'Подписки на изменения из коробки',

      'homepage.pillars.bll.name': 'Business Logic Layer',
      'homepage.pillars.bll.when': 'Нужно полноценное решение',
      'homepage.pillars.bll.tagline': 'Слой бизнес-логики поверх хранилища: действия, эффекты и сборка модуля. Форма как у сервисов NestJS, но без тяжёлого DI.',
      'homepage.pillars.bll.point1': 'Dispatcher — действия (actions) и обновления стора',
      'homepage.pillars.bll.point2': 'Effects на RxJS в стиле Redux-Observable / NgRx Effects',
      'homepage.pillars.bll.point3': 'createSynapse — сборка модуля и связывание synapse между собой',
      'homepage.pillars.bll.point4': 'React-хуки, SSR (ssr: true) и гидрация, готовые рецепты',

      'homepage.pillars.api.name': 'API Client',
      'homepage.pillars.api.when': 'Нужны только запросы',
      'homepage.pillars.api.tagline': 'Встроенный HTTP-клиент с умным кэшированием — как RTK Query, но проще.',
      'homepage.pillars.api.point1': 'Декларативные эндпоинты с типизацией',
      'homepage.pillars.api.point2': 'Умное кэширование и инвалидация',
      'homepage.pillars.api.point3': 'Кэш можно хранить в IndexedDB — переживает перезагрузку (в отличие от RTK Query)',
      'homepage.pillars.api.point4': 'Работает самостоятельно или внутри эффектов',

      'homepage.features.title': 'Почему Synapse?',

      // Features (сквозные особенности)
      'homepage.features.frameworkAgnostic.title': 'Не привязан к фреймворку',
      'homepage.features.frameworkAgnostic.description': 'Ядро на чистом TypeScript: работает с любым фреймворком или вообще без него. rxjs и react — опциональные peer-зависимости.',

      'homepage.features.typescript.title': 'TypeScript-first',
      'homepage.features.typescript.description': 'Строгая типизация и автокомплит сквозь действия, селекторы и эффекты. Типы выводятся, а не дублируются вручную.',

      'homepage.features.storageChoice.title': 'Хранилище под любой кейс',
      'homepage.features.storageChoice.description': 'Memory, LocalStorage и IndexedDB под единым интерфейсом IStorage — смена реализации в одну строку, без боли.',

      'homepage.features.middlewares.title': 'Расширяемость через middleware',
      'homepage.features.middlewares.description': 'Готовые middleware (batching, shallow-compare) и свои собственные — для оптимизации и перехвата операций хранилища.',

      'homepage.features.broadcast.title': 'Синхронизация между вкладками',
      'homepage.features.broadcast.description': 'Broadcast-шаринг состояния между вкладками браузера из коробки — без сторонних библиотек.',

      'homepage.features.ssr.title': 'SSR и Next.js',
      'homepage.features.ssr.description': 'Серверный рендеринг через createSynapseCtx({ ssr: true }) с dehydrate/hydrate — контент в HTML без рассинхронизации при гидрации.',

      // Блоки документации
      'nav.pillars.overview': 'Обзор',
      'nav.pillars.state': 'State Manager',
      'nav.pillars.api': 'API Client',
      'nav.pillars.bll': 'Business Logic Layer',

      'nav.sections.overview': 'Начало',
      'nav.sections.overview.architecture': 'Архитектура',

      // Секции документации
      'nav.sections.create': 'Создание хранилищ',
      'nav.sections.create.memory': 'MemoryStorage (new)',
      'nav.sections.create.local': 'LocalStorage (new)',
      'nav.sections.create.indexeddb': 'IndexedDBStorage (new)',
      'nav.sections.create.factory': 'StorageFactory',
      'nav.sections.create.hook-memory': 'useCreateStorage (memory)',
      'nav.sections.create.hook-local': 'useCreateStorage (localStorage)',
      'nav.sections.create.hook-idb': 'useCreateStorage (indexedDB)',
      'nav.sections.create.static': 'Static .create()',

      'nav.sections.data': 'Работа с данными',
      'nav.sections.data.reading-data': 'Чтение данных (get/getState)',
      'nav.sections.data.writing-data': 'Запись данных (set/update)',
      'nav.sections.data.operations': 'remove / has / keys / clear / reset',
      'nav.sections.data.subscriptions': 'Подписки (subscribe)',
      'nav.sections.data.selector-system': 'Селекторы (createSelector)',

      'nav.sections.synapse': 'createSynapse',
      'nav.sections.synapse.synapse-basic': 'createSynapse (basic)',
      'nav.sections.synapse.synapse-dispatcher': 'createSynapse (dispatcher)',
      'nav.sections.synapse.synapse-effects': 'createSynapse (effects)',
      'nav.sections.synapse.dispatcher-detail': 'Dispatcher (подробно)',
      'nav.sections.synapse.dependencies': 'Dependencies',

      'nav.sections.react': 'React',
      'nav.sections.react.synapse-ctx': 'createSynapseCtx',
      'nav.sections.react.await-synapse': 'awaitSynapse',

      'nav.sections.patterns': 'Паттерны',
      'nav.sections.patterns.middlewares': 'Middlewares',
      'nav.sections.patterns.singleton': 'Singleton pattern',

      'nav.sections.utils': 'Утилиты',
      'nav.sections.utils.synapse-awaiter': 'createSynapseAwaiter',
      'nav.sections.utils.event-bus': 'createEventBus',

      'nav.sections.recipes': 'Рецепты',
      'nav.sections.recipes.pokemon-advanced': 'Pokemon Pokedex (advanced)',

      'nav.sections.api': 'API-клиент',
      'nav.sections.api.api-client': 'ApiClient',

      'docs.placeholder.title': 'Раздел в разработке',
      'docs.placeholder.description': 'Этот раздел документации еще не готов. Я работаю над его созданием.',
      'docs.placeholder.backToStart': 'Вернуться к началу',

      // Общие элементы
      'common.readingTime': '{{time}} мин чтения',
      'common.wordCount': '{{count}} слов',
      'common.lastUpdated': 'Обновлено {{date}}',
      'common.tableOfContents': 'Содержание',

      // Метаданные документов
      'docs.readingTime': 'Время чтения: {{time}} мин',
      'docs.wordCount': '{{count}} слов',
      'docs.lastUpdated': 'Обновлено: {{date}}',

      // Кнопки и действия
      'actions.viewDocs': 'Посмотреть документацию',
      'actions.tryNow': 'Попробовать сейчас',
      'actions.downloadExample': 'Скачать пример',
      'actions.copyCode': 'Копировать код',

      // Сообщения
      'messages.copiedToClipboard': 'Скопировано в буфер обмена',
      'messages.failedToCopy': 'Не удалось скопировать',

      // Поиск
      'search.placeholder': 'Поиск в документации...',
      'search.noResults': 'Ничего не найдено',
      'search.results': 'Результаты поиска',

      'quickStart.createStorage': 'Создание хранилища',
      'quickStart.updateValue': 'Обновление значения',
      'quickStart.subscribe': 'Подписка',
    },
  },
  en: {
    translation: {
      // Navigation
      'nav.home': 'Home',
      'nav.docs': 'Documentation',
      'nav.examples': 'Examples',
      'nav.github': 'GitHub',

      // Documentation — example links
      'docs.examples.single': 'Working example on GitHub',
      'docs.examples.multiple': 'Working examples on GitHub',

      // Homepage
      'homepage.hero.title': 'Synapse',
      'homepage.hero.subtitle': 'A state manager, a business logic layer and an API client — three independent tools in one library. Take exactly what you need.',
      'homepage.hero.getStarted': 'Documentation',
      'homepage.hero.threeBlocks': 'Three blocks',
      'homepage.hero.learnMore': 'Key features',

      // Three blocks (pillars)
      'homepage.pillars.title': 'Three independent blocks',
      'homepage.pillars.subtitle': 'Each block is a standalone module you can use on its own. Figure out which one you actually need.',
      'homepage.pillars.more': 'Learn more →',

      'homepage.pillars.state.name': 'State Manager',
      'homepage.pillars.state.when': 'You need only state',
      'homepage.pillars.state.tagline': 'Reactive storages with a unified API. No RxJS, no React — just state and subscriptions.',
      'homepage.pillars.state.point1': 'Memory · LocalStorage · IndexedDB under one interface',
      'homepage.pillars.state.point2': 'Immutable updates, Immer-style',
      'homepage.pillars.state.point3': 'Memoized selectors with cross-store dependencies',
      'homepage.pillars.state.point4': 'Subscriptions to changes out of the box',

      'homepage.pillars.bll.name': 'Business Logic Layer',
      'homepage.pillars.bll.when': 'You need a full solution',
      'homepage.pillars.bll.tagline': 'A business logic layer on top of storage: actions, effects and module assembly. Shaped like NestJS services, but without a heavy DI container.',
      'homepage.pillars.bll.point1': 'Dispatcher — actions and store updates',
      'homepage.pillars.bll.point2': 'Effects on RxJS, Redux-Observable / NgRx Effects style',
      'homepage.pillars.bll.point3': 'createSynapse — module assembly and wiring synapses together',
      'homepage.pillars.bll.point4': 'React hooks, SSR (ssr: true) and hydration, ready-made recipes',

      'homepage.pillars.api.name': 'API Client',
      'homepage.pillars.api.when': 'You need only requests',
      'homepage.pillars.api.tagline': 'A built-in HTTP client with smart caching — like RTK Query, but simpler.',
      'homepage.pillars.api.point1': 'Declarative, typed endpoints',
      'homepage.pillars.api.point2': 'Smart caching and invalidation',
      'homepage.pillars.api.point3': 'Cache can live in IndexedDB — survives reloads (unlike RTK Query)',
      'homepage.pillars.api.point4': 'Works standalone or inside effects',

      'homepage.features.title': 'Why Synapse?',

      // Features (cross-cutting)
      'homepage.features.frameworkAgnostic.title': 'Framework agnostic',
      'homepage.features.frameworkAgnostic.description': 'A pure-TypeScript core: works with any framework or none at all. rxjs and react are optional peer dependencies.',

      'homepage.features.typescript.title': 'TypeScript-first',
      'homepage.features.typescript.description': 'Strict typing and autocomplete across actions, selectors and effects. Types are inferred, not duplicated by hand.',

      'homepage.features.storageChoice.title': 'A storage for any case',
      'homepage.features.storageChoice.description': 'Memory, LocalStorage and IndexedDB under one IStorage interface — swap the implementation in a single line, painlessly.',

      'homepage.features.middlewares.title': 'Extensible via middleware',
      'homepage.features.middlewares.description': 'Ready-made middleware (batching, shallow-compare) plus your own — for optimization and intercepting storage operations.',

      'homepage.features.broadcast.title': 'Cross-tab sync',
      'homepage.features.broadcast.description': 'Broadcast state sharing between browser tabs out of the box — no third-party libraries.',

      'homepage.features.ssr.title': 'SSR and Next.js',
      'homepage.features.ssr.description': 'Server rendering via createSynapseCtx({ ssr: true }) with dehydrate/hydrate — content in HTML with no hydration mismatch.',

      // Documentation blocks
      'nav.pillars.overview': 'Overview',
      'nav.pillars.state': 'State Manager',
      'nav.pillars.api': 'API Client',
      'nav.pillars.bll': 'Business Logic Layer',

      'nav.sections.overview': 'Getting started',
      'nav.sections.overview.architecture': 'Architecture',

      // Documentation sections
      'nav.sections.create': 'Creating Storages',
      'nav.sections.create.memory': 'MemoryStorage (new)',
      'nav.sections.create.local': 'LocalStorage (new)',
      'nav.sections.create.indexeddb': 'IndexedDBStorage (new)',
      'nav.sections.create.factory': 'StorageFactory',
      'nav.sections.create.hook-memory': 'useCreateStorage (memory)',
      'nav.sections.create.hook-local': 'useCreateStorage (localStorage)',
      'nav.sections.create.hook-idb': 'useCreateStorage (indexedDB)',
      'nav.sections.create.static': 'Static .create()',

      'nav.sections.data': 'Working with Data',
      'nav.sections.data.reading-data': 'Reading data (get/getState)',
      'nav.sections.data.writing-data': 'Writing data (set/update)',
      'nav.sections.data.operations': 'remove / has / keys / clear / reset',
      'nav.sections.data.subscriptions': 'Subscriptions (subscribe)',
      'nav.sections.data.selector-system': 'Selectors (createSelector)',

      'nav.sections.synapse': 'createSynapse',
      'nav.sections.synapse.synapse-basic': 'createSynapse (basic)',
      'nav.sections.synapse.synapse-dispatcher': 'createSynapse (dispatcher)',
      'nav.sections.synapse.synapse-effects': 'createSynapse (effects)',
      'nav.sections.synapse.dispatcher-detail': 'Dispatcher (detailed)',
      'nav.sections.synapse.dependencies': 'Dependencies',

      'nav.sections.react': 'React',
      'nav.sections.react.synapse-ctx': 'createSynapseCtx',
      'nav.sections.react.await-synapse': 'awaitSynapse',

      'nav.sections.patterns': 'Patterns',
      'nav.sections.patterns.middlewares': 'Middlewares',
      'nav.sections.patterns.singleton': 'Singleton pattern',

      'nav.sections.utils': 'Utilities',
      'nav.sections.utils.synapse-awaiter': 'createSynapseAwaiter',
      'nav.sections.utils.event-bus': 'createEventBus',

      'nav.sections.recipes': 'Recipes',
      'nav.sections.recipes.pokemon-advanced': 'Pokemon Pokedex (advanced)',

      'nav.sections.api': 'API Client',
      'nav.sections.api.api-client': 'ApiClient',

      'docs.placeholder.title': 'Section under development',
      'docs.placeholder.description': "This documentation section is not ready yet. I'm working on creating it.",
      'docs.placeholder.backToStart': 'Back to start',

      // Common elements
      'common.readingTime': '{{time}} min read',
      'common.wordCount': '{{count}} words',
      'common.lastUpdated': 'Updated {{date}}',
      'common.tableOfContents': 'Table of Contents',

      // Document metadata (добавлено)
      'docs.readingTime': 'Reading time: {{time}} min',
      'docs.wordCount': '{{count}} words',
      'docs.lastUpdated': 'Updated: {{date}}',

      // Actions
      'actions.viewDocs': 'View Documentation',
      'actions.tryNow': 'Try Now',
      'actions.downloadExample': 'Download Example',
      'actions.copyCode': 'Copy Code',

      // Messages
      'messages.copiedToClipboard': 'Copied to clipboard',
      'messages.failedToCopy': 'Failed to copy',

      // Search
      'search.placeholder': 'Search documentation...',
      'search.noResults': 'No results found',
      'search.results': 'Search Results',

      'quickStart.createStorage': 'Create storage',
      'quickStart.updateValue': 'Update value',
      'quickStart.subscribe': 'Subscribe',
    },
  },
}

i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem('preferred-locale') || 'en',
  react: {
    useSuspense: false,
  },
  fallbackLng: 'en',

  interpolation: {
    escapeValue: false,
  },

  // Настройки для корректной работы с проверкой существования переводов
  returnEmptyString: false,
  returnNull: false,
})

// Обновляем lang атрибут при каждой смене языка
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng

  // Обновляем мета-теги
  const description = document.querySelector('meta[name="description"]')
  const ogDescription = document.querySelector('meta[property="og:description"]')

  if (lng === 'ru') {
    description?.setAttribute('content', 'Мощный TypeScript инструмент для управления состоянием с API клиентом, адаптерами хранения и реактивными возможностями.')
    ogDescription?.setAttribute('content', 'Мощный TypeScript инструмент для управления состоянием с API клиентом, адаптерами хранения и реактивными возможностями.')
  } else {
    description?.setAttribute('content', 'Powerful TypeScript state management toolkit with API client, storage adapters, and reactive capabilities.')
    ogDescription?.setAttribute('content', 'Powerful TypeScript state management toolkit with API client, storage adapters, and reactive capabilities.')
  }
})

export default i18n
