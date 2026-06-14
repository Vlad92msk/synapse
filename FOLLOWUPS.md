# Synapse — итоги переосмысления API и предложения на будущее

> Создано после завершения ROADMAP (этапы 0–6) + миграции core-store sn_client + CLEANUP (этап 7).
> Здесь: что сделано, нерешённые острые углы DX, идеи на следующий цикл и что легко упустить.

## Что в итоге получилось

Главная ценность не в «улучшили библиотеку», а в **явном разделении двух понятий**:

- **State Manager** (`synapse-storage/core`) — где лежит состояние: `MemoryStorage` /
  `LocalStorage` / `IndexedDB` + селекторы. Самодостаточен, не требует RxJS/React.
- **Business Logic Layer** (`/reactive` · `/utils` · `/react`) — как состоянием управляет
  логика: `Dispatcher` / `Effects` / `createSynapse`. Форма в духе NestJS (класс +
  зависимости через конструктор + методы-поля), но без DI-контейнера.

Это зафиксировано в `docs/ru/architecture.md`, README (оба) и в самой форме API.

## Острые углы DX, которые стоит сгладить

### 1. `useDefineForClassFields: false` — скрытая ловушка
Cross-store eager-селекторы (`readonly x = this.combine([this.core.y], ...)`, где `core` —
параметр конструктора) работают только при `useDefineForClassFields: false`. При дефолтном
`true` (target ES2022) поле-зависимость окажется `undefined` в момент инициализатора —
и это **тихо**, без явной ошибки.
- **Предложение:** в dev-режиме в `Selectors.combine` бросать понятную ошибку, если
  любой dep === undefined на момент вызова («похоже, cross-store селектор инициализируется
  до присваивания parameter property — включите useDefineForClassFields:false или
  инициализируйте в теле конструктора»). Сейчас это только в документации — легко пропустить.

### 2. Бойлерплейт `getXSynapse = () => xSynapse.ready()`
В каждом модуле sn_client рядом с `export const xSynapse = createSynapse(...)` появляется
обёртка `export const getXSynapse = () => xSynapse.ready()` — чтобы скормить хукам контракт
`() => Promise<S>`.
- **Предложение:** дать перегрузку React-хуков, принимающую сам handle (`SynapseModule`):
  `useSynapse(xSynapse)` внутри вызывает `.ready()`. Это убрало бы обёртку из каждого модуля.
  (Сейчас `createSynapseCtx(handle)` уже это умеет — стоит распространить на остальные хуки.)

### 3. `loadX.reset()` как `skipAction` — повторяющийся паттерн
Почти в каждом эффекте `validator.skipAction: () => d.loadX.reset()`. Не критично, но
кандидат на хелпер/дефолт.

### 4. Изоляция ошибок эффектов
По умолчанию непойманная ошибка убивает конкретный эффект (остальные живы). Есть
`this.effect(fn, { resubscribeOnError: true })`. Dev-warning о «тихо умершем» эффекте
стоит сделать громче (сейчас легко не заметить, что эффект отвалился).

## Сопутствующая чистка в sn_client (userland, не библиотека)

После миграции core часть собственных обёрток приложения, вероятно, отмерла. Проверить и
удалить лишнее (см. также `_fable/CLEANUP.md` §«Сопутствующая чистка»):
- `src/store/createFeatureSynapse.ts` — встроено в `createSynapse(factory)`.
- `src/store/useSynapse.ts`, `useSynapseSelector.ts`, `useSynapseActions.ts`,
  `useKeyedSliceSelector.ts` — закрывают ли их библиотечные `useSelector` + keyed-селекторы
  + `useObservable`? Что не закрывают — кандидат на фичу библиотеки, а не на обёртку.
- Ручной lazy-singleton в core заменён на `createSynapse(factory).ready()` — обёртки вокруг
  больше не нужны.
- `core.hooks.ts`/`CoreProvider.tsx` всё ещё через userland-обёртки `useSynapse*` —
  кандидаты на перевод на библиотечные хуки (зависит от п.2 выше).

## Идеи на следующий цикл (вне текущего объёма)

- **SSR-гидрация** через Provider `hydrate` (PROPOSAL §8.4) — для Next.js-потребителя
  (sn_client) это реальная потребность: сейчас core гидрируется императивно из `CoreProvider`.
- **Агрегированный `isSourceReady`** для cross-store combined (PROPOSAL §7 п.6).
- **Возможное схлопывание entry `/utils`**: после CLEANUP там фактически только
  `createSynapse`, который и так реэкспортится из корня. Решить, оставлять ли отдельный entry.
- Декораторный сахар (`@action`) — сознательно отвергнут (не нужен IoC), фиксируем как «нет».

## Что легко упустить при релизе v5

- `peerDependenciesMeta`: `rxjs` помечен `optional`. Это корректно для core-only
  потребителей, но npm 7+ тогда не доустановит rxjs автоматически. Если важно — снять
  `optional` именно у `rxjs` (react/react-dom оставить optional).
- `rslib.config.ts`: `externals` + `bundle:false` уже гарантируют, что rxjs/react не
  зашиваются в `dist` — менять ничего не нужно (частый ложный страх).
- Проверить `exports`-карту package.json после удаления legacy: не должно остаться entry,
  ведущих в пустоту.
- Идиома типа синапса: `export type XSynapse = Awaited<typeof xSynapse>` — задокументировать
  как канон (используется во всех модулях).
