import { ReactNode } from 'react'

import {
  MemoryStoragePage,
  LocalStoragePage,
  IndexedDBStoragePage,
  StorageFactoryPage,
  HookMemoryPage,
  HookLocalStoragePage,
  HookIndexedDBPage,
  StaticCreatePage,
  ReadingDataPage,
  WritingDataPage,
  OperationsPage,
  SubscriptionsPage,
  SelectorSystemPage,
  SynapseBasicPage,
  SynapseDispatcherPage,
  SynapseEffectsPage,
  DispatcherDetailPage,
  DependenciesPage,
  PokemonAdvancedPage,
  SynapseCtxPage,
  AwaitSynapsePage,
  MiddlewaresPage,
  SingletonPage,
  ApiClientPage,
  SynapseAwaiterPage,
  EventBusPage,
} from '../sections'

export const sectionsList: Record<string, ReactNode> = {
  // Создание хранилищ
  'nav.sections.create.memory': <MemoryStoragePage />,
  'nav.sections.create.local': <LocalStoragePage />,
  'nav.sections.create.indexeddb': <IndexedDBStoragePage />,
  'nav.sections.create.factory': <StorageFactoryPage />,
  'nav.sections.create.hook-memory': <HookMemoryPage />,
  'nav.sections.create.hook-local': <HookLocalStoragePage />,
  'nav.sections.create.hook-idb': <HookIndexedDBPage />,
  'nav.sections.create.static': <StaticCreatePage />,
  // Работа с данными
  'nav.sections.data.reading-data': <ReadingDataPage />,
  'nav.sections.data.writing-data': <WritingDataPage />,
  'nav.sections.data.operations': <OperationsPage />,
  'nav.sections.data.subscriptions': <SubscriptionsPage />,
  'nav.sections.data.selector-system': <SelectorSystemPage />,
  // createSynapse
  'nav.sections.synapse.synapse-basic': <SynapseBasicPage />,
  'nav.sections.synapse.synapse-dispatcher': <SynapseDispatcherPage />,
  'nav.sections.synapse.synapse-effects': <SynapseEffectsPage />,
  'nav.sections.synapse.dispatcher-detail': <DispatcherDetailPage />,
  'nav.sections.synapse.dependencies': <DependenciesPage />,
  'nav.sections.synapse.pokemon-advanced': <PokemonAdvancedPage />,
  // React
  'nav.sections.react.synapse-ctx': <SynapseCtxPage />,
  'nav.sections.react.await-synapse': <AwaitSynapsePage />,
  // Паттерны
  'nav.sections.patterns.middlewares': <MiddlewaresPage />,
  'nav.sections.patterns.singleton': <SingletonPage />,
  // Утилиты
  'nav.sections.utils.api-client': <ApiClientPage />,
  'nav.sections.utils.synapse-awaiter': <SynapseAwaiterPage />,
  'nav.sections.utils.event-bus': <EventBusPage />,
}
