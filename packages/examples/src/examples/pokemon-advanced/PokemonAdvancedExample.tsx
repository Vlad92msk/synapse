import { useState, useEffect } from 'react'
import { cardStyle, codeBlock, sectionTitle } from '../styles'
import { pokemonSynapse, type PokemonSynapse } from '../pokemon-class'
import { PokemonDemo } from './PokemonDemo'

/**
 * Pokemon Pokedex — продвинутый пример на CLASS-based API (этап 4+ ROADMAP).
 *
 * Модуль декомпозирован в `../pokemon-class`: Dispatcher / Selectors / Effects классы +
 * сборка через `createSynapse(factory)`. Здесь — только UI-обёртка и пояснения.
 */
export function PokemonAdvancedExample() {
  const [store, setStore] = useState<PokemonSynapse | null>(null)

  useEffect(() => {
    let cancelled = false
    pokemonSynapse.then((s) => {
      if (!cancelled) {
        setStore(s)
        s.actions.loadList()
      }
    })
    return () => { cancelled = true }
  }, [])

  if (!store) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>Pokemon Pokedex (advanced)</h2>
      <p>
        Продвинутый пример на class-based API: декомпозиция на модули, несколько API-запросов,
        Effects на RxJS, составные селекторы, watcher.
      </p>

      {/* ─── Декомпозиция ──────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Декомпозиция на файлы</h3>
      <pre style={codeBlock}>{`pokemon-class/
  pokemon.dispatcher.ts  — class PokemonDispatcher extends Dispatcher<State>
  pokemon.selectors.ts   — class PokemonSelectors extends Selectors<State>
  pokemon.effects.ts     — class PokemonEffects extends Effects<State, Dispatcher>
  pokemon.synapse.ts     — createSynapse(async () => ({ storage, dispatcher, selectors, effects }))
  index.ts               — re-export

// Переиспользуемые (не зависят от формы API):
pokemon-advanced/
  pokemon.types.ts       — типы и интерфейсы
  pokemon.api.ts         — ApiClient + endpoints + response mappers
  pokemon.store.ts       — state shape + initialState
  pokemon.settings.ts    — внешний стор настроек (зависимость)
  helpers.ts             — утилиты (typeColor, ...)`}</pre>

      {/* ─── Dispatcher ────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Dispatcher (class-based)</h3>
      <pre style={codeBlock}>{`// pokemon.dispatcher.ts — имя экшена = имя поля
export class PokemonDispatcher extends Dispatcher<PokemonState> {
  // apiActions — вызываемая группа: loadList() = init, .loading/.success/.failure/.reset
  readonly loadList = this.apiActions<void>((s) => s.api.listRequest)
  readonly loadMore = this.signal<void>('Подгрузить следующую страницу')
  readonly loadDetails = this.apiActions<void>((s) => s.api.detailsRequest)

  readonly selectPokemon = this.action((store, id: number | null) => {
    store.update((s) => { s.selectedPokemonId = id; if (id === null) s.selectedPokemon = null })
    return id
  })

  readonly toggleFavorite = this.action((store, id: number) => { ... })

  readonly watchFavoriteCount = this.watcher({
    selector: (s) => s.favorites.length,
    notifyAfterSubscribe: true,
  })
}`}</pre>

      {/* ─── Selectors ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Селекторы (class-based)</h3>
      <pre style={codeBlock}>{`// pokemon.selectors.ts — поля = настоящие SelectorAPI (eager)
export class PokemonSelectors extends Selectors<PokemonState> {
  private readonly api = this.select((s) => s.api)        // private = промежуточный

  readonly pokemonList = this.select((s) => s.pokemonList)
  readonly searchQuery = this.select((s) => s.searchQuery)
  readonly favorites = this.select((s) => s.favorites)

  readonly isListLoading = this.combine([this.api], (a) => a.listRequest.status === 'loading')

  // Композиция pokemonList + searchQuery → filteredList
  readonly filteredList = this.combine([this.pokemonList, this.searchQuery], (list, query) =>
    query ? list.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())) : list,
  )

  readonly favoritePokemon = this.combine([this.pokemonList, this.favorites], (list, favs) =>
    list.filter((p) => favs.includes(p.id)),
  )
}`}</pre>

      {/* ─── Effects ───────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Effects (class-based, с ApiClient)</h3>
      <pre style={codeBlock}>{`// pokemon.effects.ts — сервисы и внешние сторы через конструктор
export class PokemonEffects extends Effects<PokemonState, PokemonDispatcher> {
  constructor(
    private readonly api: PokemonApiEndpoints,
    private readonly settings$: Observable<PokemonSettings>,
  ) { super() }

  readonly loadList = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.loadList),                                  // ловит ТОЛЬКО init
      withLatestFrom(selectorObject(state$, { listStatus: (s) => s.api.listRequest.status }), this.settings$),
      validateMap({
        validator: ([, { listStatus }]) => ({ conditions: [listStatus !== 'loading'], skipAction: () => d.loadList.reset() }),
        loadingAction: () => d.loadList.loading(),
        errorAction: (err) => d.loadList.failure(String(err)),
        apiCall: ([, , { pageSize }]) => fromRequest(this.api.getList.request({ limit: pageSize, offset: 0 })).pipe(
          apiResult((data) => { d.applyPokemonList({ ...mapListResponse(data), append: false }); d.loadList.success() }),
        ),
      }),
    ),
  )
}`}</pre>

      {/* ─── Assembly ──────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Assembly (createSynapse)</h3>
      <pre style={codeBlock}>{`// pokemon.synapse.ts — ленивый handle
export const pokemonSynapse = createSynapse(async () => {
  await initPokemonApi()  // async-пролог (бывший setup)
  const storage = new MemoryStorage<PokemonState>({ name: 'pokemon-class', initialState })
  return {
    storage,
    dependencies: [settingsStorage],   // зависимость от другого стора
    dependencyTimeout: 10000,
    dispatcher: new PokemonDispatcher(storage),
    selectors: new PokemonSelectors(storage),
    // сервисы (endpoints) и внешний стор (settings$) — через конструктор эффектов
    effects: new PokemonEffects(pokemonApiClient.getEndpoints(), toObservable(settingsStorage)),
  }
})

export type PokemonSynapse = Awaited<typeof pokemonSynapse>`}</pre>

      {/* ─── Demo ──────────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Demo</h3>
      <PokemonDemo store={store} />
    </div>
  )
}
