export interface NavItem {
  key: string
}

export interface NavGroup {
  titleKey: string
  // Не рендерить заголовок группы (для одиночной вводной «Архитектура»)
  hideTitle?: boolean
  items: NavItem[]
}

export interface NavPillar {
  // Заголовок блока. Отсутствует — рендерим группы без шапки блока.
  pillarKey?: string
  groups: NavGroup[]
}

// Документация сгруппирована по 3 независимым блокам библиотеки:
// State Manager (core) · Business Logic Layer (createSynapse) · API Client (api).
// Сверху — вводная «Архитектура» без заголовка блока.
export const DOC_NAV: NavPillar[] = [
  {
    groups: [{ titleKey: 'nav.sections.overview', hideTitle: true, items: [{ key: 'architecture' }] }],
  },
  {
    pillarKey: 'nav.pillars.state',
    groups: [
      {
        titleKey: 'nav.sections.create',
        items: [{ key: 'memory' }, { key: 'local' }, { key: 'indexeddb' }, { key: 'factory' }, { key: 'hook-memory' }, { key: 'hook-local' }, { key: 'hook-idb' }, { key: 'static' }],
      },
      {
        titleKey: 'nav.sections.data',
        items: [{ key: 'reading-data' }, { key: 'writing-data' }, { key: 'operations' }, { key: 'subscriptions' }, { key: 'selector-system' }],
      },
      {
        titleKey: 'nav.sections.patterns',
        items: [{ key: 'middlewares' }, { key: 'singleton' }],
      },
    ],
  },
  {
    pillarKey: 'nav.pillars.bll',
    groups: [
      {
        titleKey: 'nav.sections.synapse',
        items: [{ key: 'synapse-basic' }, { key: 'synapse-dispatcher' }, { key: 'synapse-effects' }, { key: 'dispatcher-detail' }, { key: 'dependencies' }],
      },
      {
        titleKey: 'nav.sections.react',
        items: [{ key: 'synapse-ctx' }, { key: 'await-synapse' }],
      },
      {
        titleKey: 'nav.sections.utils',
        items: [{ key: 'synapse-awaiter' }, { key: 'event-bus' }],
      },
      {
        titleKey: 'nav.sections.recipes',
        items: [{ key: 'pokemon-advanced' }],
      },
    ],
  },
  {
    pillarKey: 'nav.pillars.api',
    groups: [{ titleKey: 'nav.sections.api', items: [{ key: 'api-client' }] }],
  },
]

// Плоский список групп — для обхода секций (поиск секции по короткому ключу).
export const SECTION_LIST: NavGroup[] = DOC_NAV.flatMap((pillar) => pillar.groups)
