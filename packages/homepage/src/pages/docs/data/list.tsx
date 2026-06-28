import { ReactNode } from 'react'

import {
  ArchitecturePage,
  InstallPage,
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
  ApiUseQueryPage,
  ApiUseMutationPage,
  ApiSsrPokemonPage,
  SynapseAwaiterPage,
  EventBusPage,
  PersistMigrationPage,
  SsrHydrationPage,
} from '../sections'

export const sectionsList: Record<string, ReactNode> = {
  // Обзор
  'nav.sections.overview.architecture': <ArchitecturePage />,
  'nav.sections.overview.install': <InstallPage />,
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
  // React
  'nav.sections.react.synapse-ctx': <SynapseCtxPage />,
  'nav.sections.react.await-synapse': <AwaitSynapsePage />,
  'nav.sections.react.ssr-hydration': <SsrHydrationPage />,
  // Паттерны
  'nav.sections.patterns.middlewares': <MiddlewaresPage />,
  'nav.sections.patterns.singleton': <SingletonPage />,
  'nav.sections.patterns.persist-migration': <PersistMigrationPage />,
  // Утилиты
  'nav.sections.utils.synapse-awaiter': <SynapseAwaiterPage />,
  'nav.sections.utils.event-bus': <EventBusPage />,
  // API Client
  'nav.sections.api.api-client': <ApiClientPage />,
  // API хуки
  'nav.sections.api-hooks.api-use-query': <ApiUseQueryPage />,
  'nav.sections.api-hooks.api-use-mutation': <ApiUseMutationPage />,
  'nav.sections.api-hooks.api-ssr-pokemon': <ApiSsrPokemonPage />,
  // Рецепты
  'nav.sections.recipes.pokemon-advanced': <PokemonAdvancedPage />,
}
