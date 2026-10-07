# Ролик 1 — synapse-storage: от стора до модуля

> **Статус: черновик v2** — переписан по правкам автора: всё на экране
> появляется только тогда, когда о нём говорит диктор; код печатается по шагам на одном полотне;
> синапс собирается как логотип. synapse-storage 7.0.0. Сквозной пример — покедекс
> (`pokemon-advanced` из `packages/examples`), реальный проект — модуль мессенджера из `sn_client`.
> Код взят из `docs/ru`, `packages/examples` и `sn_client`, сокращён для экрана.
> Слайды — [дека на claude.ai](https://claude.ai/artifact/HEL3H8SJxiB3YpdyvCQhsR), локальная копия — [`decks/overview/`](decks/overview/).
>
> Пара к этому ролику — [ролик 2, «Сколько стоит synapse-storage»](SIZE_COMPARISON.md). Там цена и
> честное сравнение, здесь — что это и как этим пользоваться.

## Как читать

Один блок = одна сцена. Внутри блока — **раскадровка**: нумерованные шаги, каждый шаг = одна фраза
диктора + то, что в этот момент появляется на экране. В деке шаг = один клик, в видео шаг = ключевой
кадр, привязанный к фразе. Сверху блока — **итоговый кадр** (что на экране в конце сцены). Текст диктора
целиком = фразы шагов подряд (он же лежит в `<aside>` слайдов деки).

**Значки действий на экране:**

| Значок | Что происходит | Видео | Дека |
|---|---|---|---|
| ✚ | элемент появляется (блок, бейдж, стрелка, строка таблицы) | ✓ | ✓ клик → появление (fade / rise / pop) |
| ⌨ | код печатается посимвольно | ✓ | ≈ строка появляется целиком по клику |
| ⌫ | код стирается и печатается заново (замена) | ✓ | ≈ переход на копию слайда с плавной сменой (magic move) |
| ◎ | схема движется: перелёт, масштаб, «сворачивание» в точку | ✓ | ≈ magic move между двумя слайдами; промежуточного движения нет |
| ✦ | подсветка части кода или схемы | ✓ | ✓ рамка-подсветка появляется по клику |

**Пометки об ограничениях** — в каждом блоке строкой `🎬`. Общие ограничения:

- 🎬 **Дека.** Пошаговое появление есть (до 50 шагов на слайд). Посимвольной печати под клик нет:
  живой фрагмент в слайде умеет печатать сам по таймеру, но не знает о кликах ведущего, а в PDF/PPTX
  он превращается в картинку — поэтому в деке код появляется построчно. «Перелёты» элементов — только
  между слайдами (magic move), внутри одного слайда элемент может лишь появиться/исчезнуть.
- 🎬 **Видео.** Делаю его сам: каждая сцена — HTML-страница с таймлайном, Chrome рендерит кадры,
  ffmpeg склеивает в mp4. Печать кода, перелёты, масштаб, marble-диаграммы RxJS — всё доступно. Пока
  нет озвучки, тайминг шагов считаю по длине фраз (~140 слов/мин), а текст диктора выводится
  субтитрами — чтобы ты мог оценить темп.
- 🎬 **Невозможно у меня ни там, ни там:** живой голос, запись настоящего браузера с DevTools «вживую»
  (могу только нарисованный макет окна), видео с лицом. Если нужна настоящая запись экрана — её
  делаешь ты, я вставлю в монтаж.

## Блоки

| #  | Блок                                         | ⏱      | Рецепт из ролика 2 |
|----|----------------------------------------------|--------|:------------------:|
| 0  | Обложка                                      | 0:20   |                    |
| 1  | Зачем: стек из четырёх библиотек и клей      | 1:00   |                    |
| 2  | Два слоя                                     | 1:15   |                    |
| 3  | Хранилище                                    | 1:45   |         1          |
| 4  | Смена хранилища: LocalStorage и IndexedDB    | 2:00   |         5          |
| 5  | Middleware                                   | 2:15   |         5          |
| 6  | В React                                      | 0:45   |         2          |
| 7  | Селекторы                                    | 2:30   |         4          |
| 8  | API-клиент                                   | 3:30   |         6          |
| 9  | Диспетчер и сборка синапса                   | 3:00   |         7          |
| 10 | Эффекты                                      | 5:00   |         7          |
| 11 | SSR                                          | 3:00   |         3          |
| 12 | Синапсы в реальном проекте                   | 3:30   |         8          |
| 13 | Что ещё есть на полке                        | 1:00   |                    |
| 14 | Чего нет и куда дальше                       | 0:45   |                    |
|    | **Итого**                                    | **~32 мин** |               |

> ⚠ **Длина.** После расширения ролик вырос с ~19 до ~32 минут. Варианты: оставить одним роликом с
> главами YouTube; или разрезать на два — «State Manager» (блоки 0–7, ~12 мин) и «Бизнес-логика»
> (блоки 8–14, ~20 мин). Решать тебе после просмотра черновика.

---

### Блок 0 — Крючок и обложка

Сначала финал (см. `IDEAS.md`, п. 1): первые секунды — сеть модулей настоящего проекта из блока 12 и обещание,
потом сеть сжимается в логотип — обложка.

**Итоговый кадр крючка:** сеть модулей (масштаб 3 блока 12) по центру кадра, без заголовка и подписей-пояснений
(обещание — заголовок обложки).
**Итоговый кадр обложки:** логотип synapse · `SYNAPSE-STORAGE 7.0.0` · заголовок «От стора на две строки до архитектуры бизнес-логики» ·
три бейджа: `State manager` `API-клиент` `Бизнес-логика`.

🎙 **Диктор по шагам:**

*Крючок (слайд `hook`)*

1. «Привет. Это пример проекта на Next.js. Каждое кольцо здесь — модуль, а внутри модуля — свои узлы с
   данными и логикой.» — сеть модулей уже на экране, камера медленно облетает
2. «Сегодня разберём, как организовать работу с данными так, чтобы логика жила в отдельном слое, независимом
   от интерфейса. Начнём со стора на две строки — и дойдём до этой сети.» — сеть без изменений, камера продолжает облёт

*Обложка (слайд `cover`)*

3. «Это synapse-storage.» — ◎ сеть сжимается в логотип; ✚ версия, заголовок
4. «В одной библиотеке — стейт-менеджер,» — ✚ бейдж `State manager`
5. «API-клиент» — ✚ бейдж `API-клиент`
6. «и слой бизнес-логики.» — ✚ бейдж `Бизнес-логика`
7. «Разберём её по частям — от самого простого к сложному.»

🎬 Дека: крючок — статичная сеть, переход на обложку — затемнение. Видео: сеть сжимается в логотип
(отъезд камеры, `ZOOM_OUT` в рендере).

---

### Блок 1 — Зачем: стек из четырёх библиотек и клей

**Итоговый кадр:**

```text
  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐
  │   стор   │  │ кэш запросов │  │   персист    │  │ логика/эффекты│
  └────┬─────┘  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘
       └───────────────┴────── клей ─────┴─────────────────┘
               HTTP-обёртка · статусы · SSR · вкладки

synapse:  ┌──────────────────────────────────────────────────────────┐
          │  storage · selectors · ApiClient · dispatcher · effects  │
          └──────────────────────────────────────────────────────────┘
```

🎙 **Диктор по шагам:**

1. «Обычно слой данных во фронтенде собирают из нескольких библиотек.»
2. «Одна — для стора,» — ✚ карточка «стор»
3. «другая — для кэша запросов,» — ✚ «кэш запросов»
4. «третья — для персиста,» — ✚ «персист»
5. «четвёртая — для бизнес-логики.» — ✚ «логика/эффекты»
6. «Каждая хороша сама по себе. Но связывать их приходится самому: обёртка над fetch, статусы загрузки,
   SSR, синхронизация вкладок.» — ✚ линия «клей», по слову — ✚ каждый пункт под ней
7. «synapse закрывает это одной библиотекой с общими соглашениями.» — ◎ четыре карточки съезжаются и
   сливаются в одну полосу `storage · selectors · ApiClient · dispatcher · effects`
8. «При этом она tree-shakeable: всё, что вы не импортировали, в бандл не попадает. Сколько это стоит в
   килобайтах — в отдельном ролике.» — ✚ подпись «tree-shakeable»

🎬 Шаг 7 в деке ≈: карточки исчезают, полоса появляется (без «съезжания»). В видео — настоящее слияние.

---

### Блок 2 — Два слоя

**Итоговый кадр:**

```text
┌─────────────────────── Business Logic Layer ───────────────────────┐
│   Dispatcher — намерения     Effects — реакции     createSynapse   │
└──────────────────────────────────┬─────────────────────────────────┘
                                   │ читает селекторами / пишет экшенами
┌─────────────────────────── State Manager ──────────────────────────┐
│   Storage: Memory · LocalStorage · IndexedDB    Selectors          │
│   middleware · миграции                                            │
└────────────────────────────────────────────────────────────────────┘
          ApiClient — отдельно: можно взять без всего остального
```

🎙 **Диктор по шагам:**

1. «Главное, что нужно понять про synapse: у него два слоя.»
2. «Нижний — State Manager. Это то, где лежит состояние.» — ✚ рамка `State Manager`
3. «В нём хранилища: в памяти, в localStorage или в IndexedDB,» — ✚ в рамке бейдж `Storage`
4. «селекторы — вычисляемые данные,» — ✚ `Selectors`
5. «и middleware с миграциями.» — ✚ `middleware · миграции`
6. «Верхний — слой бизнес-логики. То, как логика управляет состоянием.» — ✚ рамка `Business Logic Layer`
7. «Диспетчер описывает намерения,» — ✚ `Dispatcher`
8. «эффекты на них реагируют,» — ✚ `Effects`
9. «а createSynapse собирает всё в модуль.» — ✚ `createSynapse`
10. «Логика читает состояние селекторами и меняет его экшенами.» — ✚ стрелки между слоями
11. «Нижний слой работает сам по себе: можно взять только хранилище.» — ✦ подсветка нижней рамки
12. «А API-клиент вообще отдельный. Его можно взять без диспетчера, эффектов и даже без React.» — ✚ карточка `ApiClient` сбоку
13. «Дальше идём снизу вверх.»

Доки: `architecture.md`

🎬 Дека и видео — одинаково (всё на появлениях).

---

### Блок 3 — Хранилище: стор за пару строк

**Итоговый кадр** (одно полотно кода, печатается по шагам):

```typescript
import { MemoryStorage } from 'synapse-storage/core'

const todoStorage = new MemoryStorage<TodoState>({
  name: 'todo',
  initialState: { todos: [], filter: 'all' },
})
await todoStorage.initialize()

todoStorage.set('filter', 'active')
todoStorage.update((s) => {
  s.todos.push({ id: 't3', title: 'Снять видео', done: false })
  s.filter = 'all'
})

todoStorage.subscribe('filter', (filter) => …)
todoStorage.subscribe((s) => s.todos.length, (count) => …)
todoStorage.subscribeToAll((event) => event.changedPaths)
```

🎙 **Диктор по шагам:**

1. «Начнём с самого нижнего кирпича — хранилища.»
2. «Импортируем MemoryStorage из synapse-storage/core.» — ⌨ `import`
3. «Создаём экземпляр. Нужны имя и начальное состояние. Тип состояния выводится из initialState или
   задаётся дженериком.» — ⌨ `new MemoryStorage<TodoState>({ name, initialState })`
4. «Перед работой хранилище инициализируем. У всех хранилищ это одинаковый шаг: персистентные в этот
   момент подтягивают сохранённые данные.» — ⌨ `await todoStorage.initialize()`
5. «Писать можно двумя способами. set меняет одно поле.» — ⌨ `set`
6. «update позволяет „мутировать“ черновик прямо в коллбэке, как в Immer. Неизменяемое состояние
   библиотека соберёт сама, а подписчики получат одно уведомление на весь коллбэк.» — ⌨ `update`
7. «Подписаться можно на ключ,» — ⌨ `subscribe('filter', …)`
8. «на вычисляемое значение — тогда коллбэк сработает, только когда это значение изменилось,» — ⌨ `subscribe((s) => …, …)`
9. «или на любые изменения сразу. В событии придут пути полей, которые поменялись. Это удобно для
   логирования и синхронизации.» — ⌨ `subscribeToAll`
10. «Хранилище работает и на сервере, и без React.»

Доки: `memory-storage.md`, `writing-data.md`, `subscriptions.md`

🎬 Видео: посимвольная печать. Дека ≈: каждая строка (группа строк шага) появляется по клику.

---

### Блок 4 — Смена хранилища: LocalStorage и IndexedDB

**Продолжение того же полотна** — код блока 3 остаётся на экране и правится.

**Итоговый кадр:**

```typescript
import { IndexedDBStorage } from 'synapse-storage/core'

const todoStorage = new IndexedDBStorage<TodoState>({
  name: 'todo',
  initialState: { todos: [], filter: 'all' },
  options: { dbName: 'my_app_db' },          // обязательное поле: имя базы
  version: 2,                                 // версия схемы данных
  migrate: (old, fromVersion) => (fromVersion < 2 ? toV2(old) : old),
})
await todoStorage.initialize()

await todoStorage.set('filter', 'active')     // API асинхронный
await todoStorage.update((s) => { … })
todoStorage.subscribe('filter', (filter) => …) // подписки — те же
const cached = todoStorage.getStateSync()       // синхронно из кэша, хоть в рендере
```

| Хранилище          | API   | Сервер                 | После перезагрузки   |
|--------------------|-------|------------------------|----------------------|
| `MemoryStorage`    | sync  | работает               | теряется             |
| `LocalStorage`     | sync  | через `browserStorage` | сохраняется (~5 МБ)  |
| `IndexedDBStorage` | async | —                      | сохраняется, много   |

🎙 **Диктор по шагам:**

1. «Состояние в памяти пропадает при перезагрузке страницы. Чтобы оно сохранялось, меняем тип
   хранилища. Просто меняем класс.» — ⌫ `MemoryStorage` → ⌨ `LocalStorage` (в импорте и в `new`)
2. «Всё остальное не меняется: те же set, update и подписки.» — ✦ подсветка нижней части кода
3. «Данные пишутся в localStorage под ключом из name и подхватываются при следующей загрузке, как раз
   на шаге initialize.» — ✦ подсветка `name` и `initialize`
4. «Если форма данных меняется между релизами, указываем версию схемы и функцию migrate. Старые данные
   один раз переведутся в новую схему при инициализации.» — ⌨ `version: 2`, `migrate`
5. «Но localStorage — это около пяти мегабайт и только строки. Для больших объёмов и бинарных данных
   берём IndexedDB.» — ⌫ `LocalStorage` → ⌨ `IndexedDBStorage`
6. «У него есть обязательное поле options. В нём имя базы — dbName. Хранилища с одинаковым dbName
   живут в одной базе.» — ⌨ `options: { dbName: 'my_app_db' }`
7. «Главное отличие — API асинхронный. Запись и чтение возвращают промис.» — ⌨ `await` перед `set` и `update`
8. «Подписки работают так же. А для синхронного чтения есть getStateSync — он отдаёт состояние из кэша,
   например прямо в рендере.» — ⌨ `getStateSync()`
9. «Итого. Memory — в памяти, работает и на сервере.» — ✚ строка таблицы
10. «LocalStorage — синхронный и переживает перезагрузку.» — ✚ строка
11. «IndexedDB — асинхронный, для больших данных.» — ✚ строка
12. «А чтобы LocalStorage не падал на сервере, есть browserStorage: в браузере он LocalStorage, на
    сервере — MemoryStorage. К нему вернёмся в блоке про SSR.» — ✦ подсветка ячейки «через browserStorage»

Доки: `local-storage.md`, `indexeddb-storage.md`, `persist-migration.md`, `browser-storage.md`

🎬 Видео: настоящая правка кода на месте (стирание → печать). Дека ≈: три слайда-копии
(Memory → Local → IndexedDB) с magic-переходом; добавленные строки появляются по клику.

---

### Блок 5 — Middleware: точка расширения хранилища

**Итоговый кадр** — схема сверху, код снизу:

```text
storage.set() ──▶ [ shallowCompare ] ──▶ [ batching ] ──▶ [ logger ] ──▶ [ ваша ] ──▶ хранилище ──▶ подписчики
```

```typescript
const todoStorage = new LocalStorage<TodoState>({
  name: 'todo',
  initialState,
  middlewares: (getDefault) => [
    getDefault().shallowCompare(),                          // то же значение — без уведомления
    getDefault().batching({ batchSize: 5, batchDelay: 100 }), // частые записи — одним уведомлением
    getDefault().logger({ collapsed: true }),                // dev-лог: действие, prev, next
    syncBroadcastMiddleware({ storageType: 'localStorage', storageName: 'todo' }), // все вкладки
    analyticsMiddleware(),                                   // своя
  ],
})

const analyticsMiddleware = (): SyncMiddleware => ({
  name: 'analytics',
  reducer: (api) => (next) => (action) => {
    const result = next(action)                // пропустить операцию дальше
    if (action.type === 'set') analytics.track('todo_changed', { key: action.key })
    return result
  },
})
```

🎙 **Диктор по шагам:**

1. «Между вызовом set и записью в хранилище есть точка расширения — middleware.» — ✚ схема: `set()` → … → хранилище → подписчики (пустая цепочка)
2. «Middleware подключают полем middlewares при создании хранилища. Встроенные берём из getDefault.» — ⌨ `middlewares: (getDefault) => [`
3. «shallowCompare: если записали то же самое значение, подписчики не получат уведомление.» — ⌨ строка + ✚ звено в схеме; ◎ в видео: две записи `'all'` — вторая гаснет на звене
4. «batching схлопывает частые записи: двенадцать быстрых set — одно уведомление.» — ⌨ + ✚ звено; ◎ пачка точек сливается в одну
5. «logger пишет в консоль каждую операцию: действие, состояние до и после. Подключайте его только в
   разработке.» — ⌨ + ✚ звено
6. «Синхронизация между вкладками — тоже middleware. Одна строка, и правка в одной вкладке видна во
   всех остальных.» — ⌨ `syncBroadcastMiddleware` + ✚ два окна браузера рядом; ◎ правка слева появляется справа
7. «Порядок в массиве — это порядок обработки.» — ✦ подсветка цепочки слева направо
8. «Свою middleware пишем как обычный объект с именем и функцией reducer. Это каррирование в стиле
   Redux: получаем действие и вызываем next, чтобы пропустить его дальше.» — ⌨ `analyticsMiddleware`
9. «Здесь мы сначала выполняем запись, а потом отправляем событие в аналитику — например, в Google
   Analytics.» — ✦ подсветка `analytics.track`
10. «Не вызвали next — запись заблокирована. Так делается валидация. Передали в next изменённое
    значение — это нормализация, например обрезать пробелы.» — ◎ в видео: тело reducer'а дважды
    переписывается (⌫⌨) на валидацию и нормализацию, затем возвращается
11. «Подключаем её рядом со встроенными.» — ⌨ `analyticsMiddleware()` в массив + ✚ звено «ваша»

Доки: `middlewares.md`

🎬 Видео: «бегущая» по цепочке запись, гаснущий дубль, слияние пачки, два окна браузера (нарисованный
макет, не живой браузер). Дека ≈: звенья цепочки и окна появляются по клику, без движения; варианты
reducer'а (валидация/нормализация) — три маленьких карточки вместо перепечатывания.

---

### Блок 6 — В React: один хук

**Итоговый кадр:**

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

function TodoList() {
  const todos = useStorageSubscribe(todoStorage, (s) => s.todos)
  return <ul>{todos.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
}
```

```text
storage ──▶ useSyncExternalStore ──▶ компонент перерисуется, только если изменился его срез
```

🎙 **Диктор по шагам:**

1. «Теперь в React. Нужен один хук — useStorageSubscribe.» — ⌨ `import`
2. «Передаём хранилище и функцию, которая выбирает нужный срез.» — ⌨ компонент
3. «Под капотом — useSyncExternalStore. Это безопасно для конкурентного рендеринга, а компонент
   перерисуется, только если изменился его срез.» — ✚ схема
4. «Никаких провайдеров для простого случая не нужно.»

Доки: `use-storage-subscribe.md`, `hook-memory.md`

---

### Блок 7 — Селекторы: вычисляемые данные с мемоизацией

**Итоговый кадр, часть 1** (своё хранилище):

```typescript
import { Selectors } from 'synapse-storage/core'

export class PokemonSelectors extends Selectors<PokemonState> {
  readonly pokemonList = this.select((s) => s.pokemonList)
  readonly searchQuery = this.select((s) => s.searchQuery)

  readonly filteredList = this.combine(
    [this.pokemonList, this.searchQuery],
    (list, query) => (query ? list.filter((p) => p.name.includes(query)) : list),
    { name: 'filteredList' },                       // опции: equals, name
  )

  readonly byId = this.keyed((id: number) => (s: PokemonState) => s.pokemonList.find((p) => p.id === id))
}

const selectors = new PokemonSelectors(pokemonStorage)
const filtered = useSelector(selectors.filteredList)   // в React
```

**Итоговый кадр, часть 2** (селектор другого модуля):

```typescript
export class PokemonSelectors extends Selectors<PokemonState> {
  readonly favorites = this.select((s) => s.favorites)
  readonly canAddFavorite: SelectorAPI<boolean>

  constructor(storage: IStorage<PokemonState>, private readonly user: UserSelectors) {
    super(storage)
    this.canAddFavorite = this.combine(
      [this.favorites, this.user.plan],                 // свой селектор + чужой
      (favorites, plan) => plan === 'pro' || favorites.length < 10,
    )
  }
}

const selectors = new PokemonSelectors(pokemonStorage, userSelectors)
```

```text
favorites ───────┐
                 ├─▶ canAddFavorite ─▶ компонент
user.plan ┄┄┄┄┄┄┘      (мемо)
(модуль пользователя)
```

🎙 **Диктор по шагам:**

1. «Дальше — вычисляемые данные. Селекторы.»
2. «Чтобы создать селекторы, импортируем базовый класс Selectors.» — ⌨ `import`
3. «Объявляем свой класс» — ⌨ `export class PokemonSelectors`
4. «и наследуемся от Selectors, указав тип состояния.» — ⌨ `extends Selectors<PokemonState> {`
5. «select берёт часть состояния. Имя поля становится именем селектора.» — ⌨ два `select`
6. «combine собирает новое значение из других селекторов.» — ⌨ `combine([...], …)` + ✚ схема `pokemonList`, `searchQuery` → `filteredList`
7. «И пересчитывает его, только когда изменились входы.» — ✚ подпись «мемо»; ◎ в видео: меняется `searchQuery` — вспыхивает `filteredList`; меняется чужое поле — не вспыхивает
8. «У select и combine есть необязательные опции. equals говорит, как сравнивать старое и новое
   значение. По умолчанию — по ссылке, а для массивов можно задать своё сравнение и убрать лишние
   перерисовки. name — имя для отладки.» — ⌨ `{ name: 'filteredList' }` + ✚ сноска `equals?: (a, b) => boolean · name?: string`
9. «Если нужен параметр, например id, есть keyed. Он создаёт отдельный селектор на каждый ключ и
   кэширует их.» — ⌨ `byId = this.keyed(...)`
10. «Экземпляр создаём, передав хранилище. В React селектор читают хуком useSelector.» — ⌨ две последние строки
11. «Теперь важная деталь. Селектор может зависеть от селектора другого модуля. Например, лимит
    избранного зависит от тарифа пользователя, а тариф живёт в модуле пользователя.» — ⌫ полотно
    очищается → ⌨ класс с `favorites`
12. «Чужие селекторы приходят через конструктор.» — ⌨ `constructor(storage, private readonly user: UserSelectors)`
13. «И в combine участвуют наравне со своими.» — ⌨ `this.combine([this.favorites, this.user.plan], …)` + ✚ схема с пунктирным `user.plan`
14. «Сменился тариф — пересчитался и наш селектор, хотя хранилища разные.» — ◎ в видео: вспышка от `user.plan` к `canAddFavorite`
15. «Такой combine создавайте в теле конструктора, после super. В инициализаторе поля чужой селектор
    ещё не присвоен.» — ✦ подсветка `super(storage)` и строки ниже
16. «А при сборке передаём селекторы пользователя вторым аргументом.» — ⌨ `new PokemonSelectors(pokemonStorage, userSelectors)`

Доки: `selector-system.md`, `dependencies.md`

🎬 Видео: печать, «вспышки» пересчёта по схеме. Дека ≈: построчное появление, схема без вспышек;
часть 2 — отдельный слайд с magic-переходом.

---

### Блок 8 — API-клиент: эндпоинты, кэш, запросы

**Итоговый кадр, часть 1** (создание):

```typescript
import { ApiClient } from 'synapse-storage/api'

export const pokemonApi = new ApiClient({
  storage: new MemoryStorage({ name: 'pokemon-api-cache', initialState: {} }), // кэш — обычное хранилище
  baseQuery: {
    baseUrl: 'https://pokeapi.co/api/v2',
    timeout: 10000,
    prepareHeaders: async (headers) => { headers.set('Accept', 'application/json'); return headers },
  },
  cache: { ttl: 60000, invalidateOnError: true },
  retry: { count: 3, delay: (attempt) => attempt * 500 },  // только идемпотентные методы
  endpoints: async (create) => ({
    getList: create<{ limit: number; offset: number }, PokemonListApiResponse>({
      request: (params) => ({ path: '/pokemon', method: 'GET', query: params }),
      cache: { ttl: 120000 },                 // своя политика для эндпоинта
      tags: ['pokemon-list'],
    }),
    getDetails: create<{ id: number }, PokemonApiResponse>({
      request: ({ id }) => ({ path: `/pokemon/${id}`, method: 'GET' }),
      cache: true,
      tags: ['pokemon-details'],
    }),
    createPokemon: create<{ name: string }, PokemonApiResponse>({
      request: (body) => ({ path: '/pokemon', method: 'POST', body }),
      invalidatesTags: ['pokemon-list'],      // после успеха список перезапросится
    }),
  }),
})

await pokemonApi.init()                       // обязательно перед первым запросом
export const endpoints = pokemonApi.getEndpoints()
```

**Итоговый кадр, часть 2** (как вызвать — три способа):

```typescript
// 1. React — чтение
const { data, isLoading, error, refetch } = useApiQuery(endpoints.getDetails, { id }, { enabled: id != null })

// 2. React — запись
const { mutate, isLoading } = useApiMutation(endpoints.createPokemon)

// 3. Без React — запрос как объект
const req = endpoints.getDetails.request({ id: 25 })
req.subscribe((state) => state.status)        // idle → loading → success | error
const result = await req.wait()               // или просто await req
req.abort()                                   // отмена — вместе с HTTP

endpoints.getDetails.subscribe((s) => s.fetchCounts)  // состояние всего эндпоинта
```

```text
✓ одинаковые параллельные запросы — один fetch   ✓ кэш + инвалидация по тегам
✓ любой неуспех — один ApiError (сеть/таймаут — status 0)   ✓ 204 / пустое тело — успех
```

🎙 **Диктор по шагам:**

1. «Следующий кирпич — данные с сервера. ApiClient. Если вы работали с RTK Query, многое будет знакомо,
   только без Redux.»
2. «Импортируем ApiClient» — ⌨ `import`
3. «и создаём экземпляр.» — ⌨ `new ApiClient({`
4. «Первое поле — хранилище для кэша. Это обычное хранилище synapse, поэтому тип можно выбрать любой:
   память, localStorage или IndexedDB, если кэш должен пережить перезагрузку.» — ⌨ `storage`;
   ◎ в видео: `MemoryStorage` ⌫⌨ `IndexedDBStorage` ⌫⌨ обратно
5. «baseQuery — это транспорт: базовый адрес, таймаут и заголовки. В prepareHeaders, например,
   подставляют токен. Можно передать и свой fetch.» — ⌨ `baseQuery`
6. «cache — глобальная политика: сколько живёт запись и сбрасывать ли её при ошибке.» — ⌨ `cache`
7. «retry — повторы. Глобально они срабатывают только для идемпотентных методов, чтобы не создать
   сущность дважды.» — ⌨ `retry`
8. «И эндпоинты. Каждый описывается один раз: тип параметров, тип ответа, путь и метод.» — ⌨ `getList` (request)
9. «Политику кэша можно настроить точечно: свой срок жизни, свои теги.» — ⌨ `cache: { ttl }`, `tags`
10. «Второй эндпоинт берёт глобальные настройки кэша.» — ⌨ `getDetails`
11. «Мутация объявляет, какие теги она сбрасывает. После успешного запроса связанные данные сами
    перезапросятся.» — ⌨ `createPokemon` + ◎ в видео: стрелка от `invalidatesTags` к `tags` списка
12. «После создания клиент нужно инициализировать — вызвать init. Он поднимает хранилище кэша и
    эндпоинты. В модуле это обычно делают в фабрике эффектов — увидим дальше.» — ⌨ `await pokemonApi.init()`
13. «getEndpoints отдаёт типизированные эндпоинты.» — ⌨ `getEndpoints()`
14. «Вызвать запрос можно тремя способами.» — ⌫ полотно → часть 2, ✚ три заголовка
15. «В React для чтения — useApiQuery. Он отдаёт данные, статусы и refetch, стартует при монтировании и
    отменяет запрос при размонтировании. Опция enabled откладывает запрос, пока параметры не готовы.» — ⌨ способ 1
16. «Для записи — useApiMutation. Он сам не стартует: мутацию запускает mutate.» — ⌨ способ 2
17. «А без React — напрямую через эндпоинт. request возвращает объект запроса.» — ⌨ `const req = …`
18. «На него можно подписаться и видеть смену статусов,» — ⌨ `req.subscribe`
19. «можно дождаться результата, как промиса,» — ⌨ `await req.wait()`
20. «и можно отменить — вместе с HTTP-запросом.» — ⌨ `req.abort()`
21. «Подписаться можно и на весь эндпоинт: его статус и число запросов. А в эффектах этот же запрос
    превращается в поток — это будет в блоке про эффекты.» — ⌨ `endpoints.getDetails.subscribe`
22. «Что ещё внутри. Одинаковые параллельные запросы схлопываются в один. Любая ошибка — сеть, таймаут
    или ответ сервера — приходит одним типом, ApiError. А пустой ответ, например 204, считается
    успехом.» — ✚ четыре галочки по одной

Доки: `api-client.md`, `api-use-query.md`, `api-use-mutation.md`, `cache-layers.md`

🎬 Видео: часть 1 и часть 2 — одно полотно с прокруткой. Дека ≈: два слайда; часть 1 — около 30 строк,
появляются группами по шагам (на пределе читаемости — шрифт 22–24px).

---

### Блок 9 — Диспетчер и сборка синапса

**Анимация-сквозняк (с этого блока до конца ролика) — логотип собирается из частей.**

```text
        ( Storage )                    логотип synapse:
             ┊                          большое разорванное кольцо = createSynapse,
( Selectors )┄┄( createSynapse )┄┄( Dispatcher )   маленькие кольца на пунктирах = части модуля
             ┊
        ( Effects )   ← добавится в блоке 10
```

**Итоговый кадр (код):**

```typescript
import { Dispatcher } from 'synapse-storage/reactive'

export class PokemonDispatcher extends Dispatcher<PokemonState> {
  readonly selectPokemon = this.action((store, id: number | null) => {
    store.update((s) => { s.selectedPokemonId = id })
    return id                                            // payload — его увидят эффекты
  })

  readonly setSearchQuery = this.action(
    (store, query: string) => { store.set('searchQuery', query); return query },
    { memoize: (cur, prev) => cur === prev },            // тот же аргумент — вызов пропускается
  )

  readonly loadMore = this.signal<void>('Подгрузить следующую страницу')  // чистое намерение

  readonly loadDetails = this.apiActions<void>((s) => s.api.detailsRequest)
  // d.loadDetails() — намерение · .loading() · .success() · .failure(msg) · .reset()

  readonly watchFavoriteCount = this.watcher({ selector: (s) => s.favorites.length })
}
```

```typescript
import { createSynapse } from 'synapse-storage/utils'

export const pokemonSynapse = createSynapse({
  storage:    () => new MemoryStorage<PokemonState>({ name: 'pokemon', initialState }),
  selectors:  (storage) => new PokemonSelectors(storage),
  dispatcher: (storage) => new PokemonDispatcher(storage),
})

const pokemon = await pokemonSynapse          // модуль ленивый: собирается при первом await
pokemon.actions.selectPokemon(25)
```

🎙 **Диктор по шагам:**

1. «Поднимаемся на слой бизнес-логики. Хранилище и селекторы мы уже умеем создавать.» — ◎ на пустом
   фоне появляются два маленьких кольца: `Storage`, `Selectors`
2. «Теперь диспетчер: что это такое и как его создать. А потом соберём всё в один модуль — синапс.» — ✚ третье кольцо `Dispatcher` (пока бледное)
3. «Диспетчер — это список всего, что модуль умеет делать. В одном классе.» — ◎ кольца уезжают в угол, открывается полотно кода
4. «Импортируем Dispatcher» — ⌨ `import`
5. «и наследуемся от него, указав тип состояния.» — ⌨ `export class PokemonDispatcher extends Dispatcher<PokemonState> {`
6. «Первый вид — action. Это экшен, который сам меняет состояние. Он получает хранилище и параметр.» — ⌨ `selectPokemon` до `store.update`
7. «То, что он вернёт, станет payload: его увидят эффекты.» — ⌨ `return id`
8. «У action есть опции. memoize пропускает повторный вызов с тем же аргументом. Ещё можно передать
   meta — произвольное описание.» — ⌨ `setSearchQuery` с `memoize`
9. «Второй вид — signal. Он ничего не меняет. Это чистое намерение, например „подгрузить следующую
   страницу“. Что именно делать — решат эффекты.» — ⌨ `loadMore`
10. «Третий — apiActions. Это готовая группа статусов запроса.» — ⌨ `loadDetails`
11. «Вызов группы — это намерение загрузить. А loading, success и failure пишут статус в ячейку
    состояния, на которую вы указали.» — ⌨ комментарий со списком методов; ✦ подсветка `s.api.detailsRequest`
12. «И четвёртый — watcher: поток изменений части состояния.» — ⌨ `watchFavoriteCount`
13. «Имя поля — это имя экшена. Компонент вызывает selectPokemon и не знает, что произойдёт дальше.
    Читаем селекторами, пишем диспетчером.» — ✚ полоса `UI ── selectPokemon(25) ──▶ стор ──▶ action$ ──▶ эффекты`
14. «Теперь соберём части. Центр модуля — createSynapse.» — ◎ кольца возвращаются в центр, между ними
    появляется большое разорванное кольцо `createSynapse`; ⌨ `createSynapse({`
15. «Передаём фабрику хранилища,» — ⌨ `storage` + ◎ пунктир от центра к `Storage`
16. «селекторов» — ⌨ `selectors` + ◎ пунктир к `Selectors`
17. «и диспетчера.» — ⌨ `dispatcher` + ◎ пунктир к `Dispatcher`, кольцо становится ярким
18. «Модуль ленивый: соберётся при первом await. После этого у него есть хранилище, селекторы, экшены и
    поток состояния.» — ⌨ `await pokemonSynapse`, `pokemon.actions.selectPokemon(25)`
19. «Не хватает одной части — реакций. Это эффекты.» — ✚ пустое пунктирное место под четвёртое кольцо

Доки: `create-synapse-basic.md`, `create-synapse-dispatcher.md`, `dispatcher-detailed.md`

🎬 Видео: логотип собирается по-настоящему — кольца выезжают, пунктиры «прорастают» от центра. Дека ≈:
кольца и пунктиры (SVG-фигуры) появляются по клику на месте; перемещение «в угол и обратно» —
magic-переход между слайдами «логотип» ↔ «код».

---

### Блок 10 — Эффекты: реакции на намерения

**Итоговый кадр, часть 1** (базовый эффект):

```typescript
import { withLatestFrom } from 'rxjs'
import { ApiStatus } from 'synapse-storage'
import { Effects, apiResult, fromRequest, ofType, selectorMap, validateMap } from 'synapse-storage/reactive'

export class PokemonEffects extends Effects<PokemonState, PokemonDispatcher> {
  constructor(private readonly api: PokemonApiEndpoints) { super() }

  readonly loadDetails = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.selectPokemon),
      withLatestFrom(selectorMap(state$, (s) => s.selectedPokemonId, (s) => s.api.detailsRequest.status)),
      validateMap({
        validator: ([, [id, status]]) => ({ conditions: [id !== null, status !== ApiStatus.Loading] }),
        loadingAction: () => d.loadDetails.loading(),
        errorAction: (err) => d.loadDetails.failure(String(err)),
        apiCall: ([, [id]]) =>
          fromRequest(this.api.getDetails.request({ id: id! })).pipe(
            apiResult((data) => {
              d.applyPokemonDetails(mapDetailsResponse(data))
              d.loadDetails.success()
            }),
          ),
      }),
    ),
  )
}
```

**Итоговый кадр, часть 2** (запись — `mutationMap`):

```typescript
createPost = this.effect((action$, _state$, { dispatcher: d }) =>
  action$.pipe(
    ofType(d.createPost),
    mutationMap({
      flatten: exhaustMap,                              // повторный клик игнорируется, пока первый в полёте
      loadingAction: () => d.createPost.loading(),
      errorAction: (err) => d.createPost.failure(String(err)),
      prepare: (payload) => buildFormData(payload),     // тело запроса заранее, можно async
      apiCall: (_payload, body) =>
        fromRequest(this.api.createPost.request({ body })).pipe(
          apiResult((post) => { d.prependPost(post); d.createPost.success() }),
        ),
    }),
  ),
)

removePost = this.effect((action$, _state$, { dispatcher: d }) =>
  action$.pipe(
    ofType(d.removePost),
    mutationMap({
      flatten: mergeMap,                                // разные посты — параллельно
      apiCall: (id) => fromRequest(this.api.removePost.request({ id })).pipe(apiResult(() => d.dropPost(id))),
    }),
  ),
)
```

**Итоговый кадр, часть 3** (сокет и другие источники — по реальному мессенджеру из `sn_client`):

```typescript
export class TypingEffects extends Effects<MessengerState, MessengerDispatcher> {
  constructor(private readonly socket: MessengerSocketService) { super() }

  // входящее: событие сокета → экшен
  typing = this.effect((_action$, _state$, { dispatcher: d }) =>
    this.socket.on('chat:typing').pipe(tap((event) => d.applyTyping(event))),
  )

  // исходящее: экшен → троттлинг → сокет
  typingSend = this.effect((action$, _state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.typingInput),
      throttleTime(3000),
      tap(({ payload }) => this.socket.typing({ chat_id: payload, action: 'typing' })),
    ),
  )
}
```

```typescript
// сборка: эффекты — четвёртая часть синапса
export const pokemonSynapse = createSynapse({
  storage:    () => new MemoryStorage<PokemonState>({ name: 'pokemon', initialState }),
  selectors:  (storage) => new PokemonSelectors(storage),
  dispatcher: (storage) => new PokemonDispatcher(storage),
  effects: async () => {
    await pokemonApi.init()                               // async-пролог: только при старте модуля
    return new PokemonEffects(pokemonApi.getEndpoints())
  },
})
```

**Панель операторов** — справа от кода, «загорается» по мере использования:

| Оператор                         | Что делает                                                       |
|----------------------------------|------------------------------------------------------------------|
| `ofType` / `ofTypes`             | фильтр по одному / нескольким экшенам и сигналам, с типами       |
| `selectorMap` / `selectorObject` | срез состояния кортежем / объектом                               |
| `validateMap`                    | чтение: условия → loading → запрос → success / failure; switchMap |
| `mutationMap`                    | запись: тот же цикл + стратегия `flatten` + `prepare`            |
| `fromRequest`                    | запрос ApiClient как поток: отписка прерывает HTTP               |
| `apiResult`                      | разворачивает ответ; ошибка — `ApiError` в `errorAction`         |

🎙 **Диктор по шагам:**

*Часть 1 — базовый эффект*

1. «Эффекты — это реакции на намерения, написанные на RxJS. RxJS нужен только здесь, остальная
   библиотека обходится без него.»
2. «Если вы знакомы с redux-observable или с эффектами в Angular, ничего необычного тут не будет.»
3. «Эффекты — это класс. Наследуемся от Effects, указав тип состояния и диспетчер модуля.» — ⌨ `export class PokemonEffects extends Effects<…> {`
4. «Сервисы приходят через конструктор: API-клиент, сокет, что угодно. Поэтому эффекты легко
   тестировать — подставляете заглушку.» — ⌨ `constructor(private readonly api …)`
5. «Каждый эффект — поле класса, созданное через this.effect. Он получает поток экшенов, поток
   состояния и диспетчер модуля.» — ⌨ `readonly loadDetails = this.effect((action$, state$, { dispatcher: d }) =>`
6. «Что даёт synapse для эффектов? Набор операторов. Разберём их по порядку, на одном примере.» — ✚ панель операторов (пустые серые плашки)
7. «ofType подписывается на один экшен. ofTypes — на несколько сразу. Это могут быть и экшены, и
   сигналы, которые мы объявили в диспетчере. Тип payload выводится сам.» — ⌨ `ofType(d.selectPokemon)` + ✚ плашка загорается
8. «Дальше нужны данные из хранилища. selectorMap отдаёт их массивом, по порядку. selectorObject —
   объектом с именами.» — ⌨ `withLatestFrom(selectorMap(…))` + ✚ плашка; ◎ в видео: `selectorMap` на
   секунду ⌫⌨ `selectorObject(state$, { id: …, status: … })` и обратно
9. «Теперь сам запрос. validateMap — это весь цикл запроса в одном операторе.» — ⌨ `validateMap({` + ✚ плашка + ✚ схема цикла `validator → loading → apiCall → success / failure`
10. «validator — условия, при которых запрос имеет смысл. Здесь: покемон выбран, и запрос ещё не в
    полёте. Статус сравниваем с константой ApiStatus. Не выполнено условие — запроса не будет. При
    желании можно задать skipAction.» — ⌨ `validator` + ✦ звено схемы
11. «loadingAction выставляет статус загрузки.» — ⌨ + ✦ звено
12. «errorAction ловит ошибку. Это всегда ApiError: в нём статус и тело ответа сервера.» — ⌨ + ✦ звено
13. «apiCall делает запрос. Вызов эндпоинта передаём в fromRequest — он превращает запрос в поток.
    Отписались от потока — HTTP-запрос прервался.» — ⌨ `fromRequest(…)` + ✚ плашка
14. «apiResult разворачивает успешный ответ. Здесь записываем данные и ставим success.» — ⌨ `apiResult(…)` + ✚ плашка
15. «Внутри validateMap — switchMap. Если пользователь успел выбрать другого покемона, старый запрос
    отменится вместе с HTTP. Для чтения это именно то, что нужно: важен только последний ответ.» — ◎
    marble-диаграмма: `25` → запрос… `6` → запрос `25` перечёркнут, приходит только `6`

*Часть 2 — запись*

16. «Для записи так нельзя. Двойной клик по кнопке „отправить“ отменил бы первый POST, а сервер мог
    его уже принять. Для записи есть mutationMap. Словарь тот же, но стратегию выбираете вы.» — ⌫ полотно → ⌨ `createPost`, ✚ плашка `mutationMap`
17. «exhaustMap — для одиночной операции, вроде формы. Повторное нажатие игнорируется, пока первое в
    полёте.» — ⌨ `flatten: exhaustMap` + ◎ marble: второй клик гаснет
18. «prepare собирает тело запроса заранее, хоть асинхронно: FormData, файлы. Результат приходит в
    apiCall вторым аргументом.» — ⌨ `prepare` + `apiCall: (_payload, body)`
19. «mergeMap — для операций над разными сущностями. Например, удаляем несколько постов — запросы идут
    параллельно, и ошибка одного не ломает остальные.» — ⌨ `removePost` + ◎ marble: три параллельные линии
20. «А concatMap выполнит их строго по очереди.» — ✚ сноска `concatMap`

*Часть 3 — сокеты и другие источники*

21. «Эффект не обязан быть HTTP-запросом. Источником может быть что угодно: сокет, таймер, другое
    хранилище. Пример из реального мессенджера — индикатор „печатает“.» — ⌫ полотно → ⌨ класс `TypingEffects`
22. «Сокет приходит через конструктор, как и API-клиент.» — ⌨ `constructor(private readonly socket …)`
23. «Входящее событие сокета — это просто поток. Пишем его в хранилище через экшен.» — ⌨ эффект `typing`
    + ◎ схема: `socket ──▶ effect ──▶ d.applyTyping ──▶ стор`
24. «Исходящее — реакция на сигнал диспетчера. Пользователь печатает — троттлим раз в три секунды и
    отправляем в сокет.» — ⌨ эффект `typingSend` + ◎ схема в обратную сторону
25. «Так же через конструктор приходят другие API-клиенты, диспетчер соседнего модуля или поток его
    состояния через toObservable. Это мы увидим в реальном проекте.» — ✚ подписи-сноски у конструктора

*Сборка*

26. «Осталось подключить эффекты к модулю. Фабрика effects может быть асинхронной. Здесь мы
    инициализируем API-клиент и отдаём эндпоинты в конструктор.» — ⌫ полотно → ⌨ `createSynapse` с `effects`
27. «Эффекты стартуют сами при первом await модуля. И только в браузере: на сервере они не нужны.» — ✦ подсветка `effects`
28. «Синапс собран: хранилище, селекторы, диспетчер, эффекты. А в центре — createSynapse.» — ◎ четвёртое
    кольцо `Effects` встаёт на пустое место, пунктир прорастает от центра; весь логотип вспыхивает

Доки: `create-synapse-effects.md`, `to-observable.md`, `dependencies.md`

🎬 Видео: три полотна кода, marble-диаграммы (switchMap / exhaustMap / mergeMap) и стрелки сокета —
анимированы. Дека ≈: 4 слайда (база, mutationMap, сокет, сборка); marble-диаграммы статичные,
нарисованы фигурами и появляются по шагам. Слайд «готовые операторы» удалён — операторы разобраны на
примере, их таблица стала панелью справа.

---

### Блок 11 — SSR: свой стор на каждый запрос

**Итоговый кадр — три полосы:**

```text
СЕРВЕР, запрос A ──▶ dehydrate: fork ─▶ залить данные ─▶ снапшот JSON ─▶ fork ✕
                 ──▶ renderToString: одноразовый стор ◀─ снапшот ─▶ HTML с данными
СЕРВЕР, запрос B ──▶ то же самое, свой fork и свой одноразовый стор   (A и B не пересекаются)
КЛИЕНТ           ──▶ HTML + снапшот ─▶ засев до первого рендера ─▶ кадр = HTML ─▶ эффекты стартуют
```

```typescript
// pokemon.context.ts
export const PokemonCtx = createSynapseCtx(pokemonSynapse)

// сервер (страница Next.js / свой SSR)
const list = await fetchPokemonList()
const dehydrated = await PokemonCtx.dehydrate({ initialState: { pokemonList: list } })
const html = renderToString(<Pokedex dehydratedState={dehydrated} />)

// Pokedex = PokemonCtx.contextSynapse(PokedexView); внутри — хуки контекста
const selectors = useSynapseSelectors()
const actions = useSynapseActions()
const list = useSelector(selectors.pokemonList)
```

🎙 **Диктор по шагам:**

1. «Серверный рендер, например в Next.js. Здесь две проблемы, которых нет в браузере.»
2. «Первая. Модуль, объявленный в файле, на сервере один на все запросы. Данные пользователя A могут
   попасть в ответ пользователю B.» — ✚ иллюстрация: запросы A и B упираются в один стор, красная стрелка «утечка»
3. «Вторая. Клиент должен стартовать ровно с тем состоянием, которое отрисовал сервер. Иначе React
   увидит расхождение, выбросит серверный HTML и перерисует страницу. Это hydration mismatch.» — ✚ иллюстрация: HTML ≠ первый кадр
4. «Как это решает synapse. Модуль оборачиваем в createSynapseCtx: получаем React-контекст, хуки и
   функцию dehydrate.» — ⌨ `createSynapseCtx(pokemonSynapse)`
5. «Шаг первый, на сервере. Получили данные для страницы и вызываем dehydrate.» — ⌨ `fetchPokemonList`, `dehydrate(…)` + ✚ полоса «сервер»
6. «Внутри dehydrate делает fork: создаёт отдельную копию модуля из той же фабрики, только для этого
   запроса.» — ◎ от модуля отпочковывается копия `fork A`
7. «Собирает её без эффектов: на сервере они не нужны.» — ✚ метка `effects: off`
8. «Заливает в копию данные, снимает снапшот — обычный JSON того же типа, что и состояние, — и
   уничтожает копию. На снапшот ставится метка времени.» — ◎ из `fork A` выезжает `{ … }` с часами; `fork A` исчезает
9. «Шаг второй — рендер на сервере. Снапшот передаём компоненту пропом dehydratedState.» — ⌨ `renderToString(<Pokedex dehydratedState=… />)`
10. «На сервере провайдер строит одноразовое синхронное хранилище и засевает его снапшотом ещё до
    рендера. React читает его и выдаёт HTML уже с данными.» — ◎ снапшот → одноразовый стор → HTML
11. «Каждый запрос получает свой форк и свой одноразовый стор. Поэтому утечки между пользователями
    нет — по построению.» — ✚ полоса «запрос B» рядом, без пересечений
12. «Шаг третий — клиент. В браузер приходят HTML и тот же снапшот в JSON.» — ✚ полоса «клиент», ◎ HTML и `{ … }` перелетают
13. «На первом рендере провайдер синхронно засевает клиентский модуль этим снапшотом. Именно синхронно,
    в инициализаторе useState, а не в useEffect: первый кадр должен совпасть с серверным HTML.» — ✚ «засев до первого рендера»
14. «Совпал — и React просто подключает обработчики к готовой разметке. Мисматча нет, лишнего запроса за
    теми же данными тоже.» — ✚ «кадр = HTML» ✓
15. «И только после этого, на клиенте, стартуют эффекты.» — ✚ «эффекты стартуют»
16. «Метка времени нужна при навигации: если в клиенте уже есть более свежие данные, старый снапшот их
    не перетрёт.» — ✦ подсветка часов на снапшоте
17. «Компоненты внутри читают модуль через хуки контекста: селекторы и экшены.» — ⌨ три строки хуков
18. «Если вы работали с TanStack Query, схема знакома: новый клиент на каждый запрос, dehydrate на
    сервере, гидрация на клиенте, метка свежести как dataUpdatedAt. Разница в том, что здесь гидрируется
    не только кэш запросов, а весь модуль. А у самого ApiClient есть свои dehydrate и hydrate — ровно
    как у TanStack.» — ✚ сноска «≈ TanStack Query»
19. «Ограничения. Синхронный рендер на сервере работает для синхронных хранилищ — память или
    localStorage через browserStorage. Поддержан классический серверный рендер, streaming и Suspense пока
    вне гарантий.» — ✚ плашка «ограничения»

Доки: `synapse-ctx.md`, `ssr-hydration.md`, `api-ssr-pokemon.md`, `await-synapse.md`, `browser-storage.md`

<details><summary>Подробнее — механика по исходникам (на экран не идёт; шпаргалка к собеседованию)</summary>

- `createSynapseCtx(module).dehydrate({ initialState })` → `dehydrateModule(module, { state })`
  (`packages/synapse/src/utils/dehydrateModule.ts`): `module.fork()` → `fork.ready({ withEffects: false })` →
  `storage.hydrate({ ...getStateSync(), ...state })` (shallow-мердж, чтобы частичный state не занулил
  остальное) → `snapshot = getStateSync()` → `fork.destroy()` → `stampHydration(snapshot)` (служебный
  ключ `__hydratedAt`, в стор не попадает).
- Провайдер `contextSynapse` (`react/utils/createSynapseCtx.tsx`), инициализатор `useState`:
  - **сервер** (`typeof window === 'undefined'`): `synapseModule.buildSyncShell()` — свежий
    одноразовый стор из `initialState`, синхронный засев `storage.hydrate(dehydratedState)` → рендер.
    Общий модуль-синглтон («main») на сервере не трогается. Async-фабрика без оболочки → `loadingComponent`.
  - **клиент**: `getClientStore()` — общий `main`; на самом первом маунте засев прямо в рендере
    (подписчиков ещё нет), при навигации — в `useEffect` (иначе «setState in render» у соседа).
    Идемпотентность — по ссылке на снапшот.
  - `useEffect` → `synapseModule.ready()` — тут стартуют эффекты (только клиент).
- Гейт свежести (`hydration-meta.util.ts`, аналог `dataUpdatedAt` в TanStack): `replace` —
  снапшот с `hydratedAt <= текущего` пропускается; `merge` (`hydrateStrategy: 'merge'`) — по ключам.
  В `sn_client` панель мессенджера использует `merge`, чтобы серверный снапшот не перетёр черновики из
  localStorage.
- Параллель с TanStack Query: `new QueryClient()` на запрос ≈ `fork()`; `dehydrate(queryClient)` ≈
  `dehydrateModule`; `<HydrationBoundary>` ≈ `contextSynapse` с `dehydratedState`; `dataUpdatedAt` ≈
  `__hydratedAt`. Отличие: гидрируется весь модуль (стор + селекторы + диспетчер), эффекты не стартуют на сервере.

</details>

🎬 Видео: три полосы с перелётами снапшота, отпочкование и исчезновение форка, два параллельных
запроса. Дека ≈: полосы и узлы появляются по клику, «перелёт» снапшота сервер → клиент — magic-переход
на второй слайд. Это самый «анимационный» блок после блока 12.

---

### Блок 12 — Синапсы в реальном проекте

Модуль мессенджера из `sn_client` (Next.js). Цель блока — показать, **почему библиотека называется
synapse**: синапс собирается из частей, сворачивается в точку, такие точки связываются в модуль, модуль
сам становится точкой, а приложение — сетью таких точек. Это и есть слой управления бизнес-логикой.

**Масштабы (анимация «петля наверх» — каждый раз отъезжаем на уровень выше):**

```text
Масштаб 1 — один синапс           Масштаб 2 — модуль: 7 синапсов тянутся к родителю
                                                                   ◯ chat
 (Storage)┄┐                        ◯ core ┄┐                      ◯ chat-list
 (Selectors)┄( messenger )            ( messenger.synapse )┄┄┄┄┄┄┄ ◯ chat-info
 (Dispatcher ×11)┄┘                 ◯ relations ┄┘                 ◯ contacts
 (Effects ×11)┄┘                                                   ◯ call-history
                                                                   ◯ panel
Масштаб 3 — проект: модуль = одно кольцо среди 16, связи по dependencies
   ◯ messenger ┄┄┄ ( core ) ┄┄┄ ◯ posts ◯ calls ◯ streaming ◯ user …
        ┊                ┊
   ◯ relations ┄ ◯ social      ◯ notifications ┄ ◯ presence ┄ ◯ streaming
```

**Граф зависимостей мессенджера** (стрелка = «зависит от», по `dependencies`):

```text
coreSynapse ◀────────┬───────────────── contacts, call-history
panelSynapse ◀───────┤
relationsSynapse ◀───┤
                     messengerSynapse ◀── chat, chat-list, chat-info, contacts, call-history
panelSynapse ◀────────────────────────── chat-list, chat-info
```

**Организация кода** — каждая фича повторяет одну раскладку:

```text
modules/messenger/
  core/synapse/
    messenger.synapse.ts        ← сборка: 3 зависимости, 11 классов эффектов
    messenger.dispatcher.ts     ← composeMixins(Dispatcher, 11 миксинов)
    dispatcher/  sync · message-events · chat-events · typing · counters · list
                 history · thread · topics · outbox · privacy   (.mixin.ts)
    effects/     те же 11 доменов   (.effects.ts)
    messenger.selectors.ts
  chat/       synapse/ chat.synapse · .dispatcher · .effects · .selectors · .context   + ui/
  chat-list/  synapse/ …то же…                                                        + ui/
  chat-info/  synapse/ …                                                               + ui/
  contacts/   synapse/ … + dispatcher/ 3 миксина + effects/ 3 класса                   + ui/
  call-history/ synapse/ …                                                             + ui/
```

**Код — только сборка, без деталей:**

```typescript
export const messengerSynapse = createSynapse({
  storage:    () => new MemoryStorage<MessengerState>({ name: 'messenger', initialState }),
  dispatcher: (storage) => new MessengerDispatcher(storage),               // 11 миксинов
  selectors:  (storage) => new MessengerSelectors(storage, coreSynapse.selectors),
  dependencies: [coreSynapse, panelSynapse, relationsSynapse],
  effects: async () => {
    const { getMessengerSocket } = await import('@services/socket')       // только в браузере
    const socket = getMessengerSocket()
    const core$ = toObservable(coreSynapse.state$)
    return [
      new MessengerTypingEffects(socket),
      new MessengerCountersEffects(chats, socket, panel$),
      new MessengerPrivacyEffects(chats, invites, privacy, socket, core$, relationsSynapse.dispatcher),
      /* … ещё 8 классов */
    ]
  },
})

export const chatSynapse = createSynapse({
  storage:    () => new MemoryStorage<ChatState>({ name: 'messengerChat', initialState }),
  selectors:  (storage) => new ChatSelectors(storage, messengerSynapse.selectors),
  dispatcher: (storage) => new ChatDispatcher(storage),
  dependencies: [messengerSynapse],
  effects: async () => new ChatEffects(/* api, */ messengerSynapse.dispatcher, toObservable(messengerSynapse.state$)),
})
```

| Даёт библиотека | Даёт проект |
|---|---|
| `createSynapse`: сборка, `dependencies` (старт эффектов после готовности соседей), async-фабрика эффектов | разбиение диспетчера на миксины (`composeMixins` — хелпер проекта, 5 строк) |
| `Dispatcher` / `Effects` — классы, которые можно наследовать и композировать | раскладка по доменам и файлам |
| связи модулей: чужие селекторы в конструктор, чужой диспетчер в эффекты, `toObservable(other.state$)` | |

🎙 **Диктор по шагам:**

*Масштаб 1 — один синапс*

1. «Как это выглядит в живом проекте. Это мессенджер из приложения на Next.js.»
2. «Начнём с одного синапса — ядра мессенджера. В центре createSynapse, вокруг — его части.» — ◎ логотип
   из блока 10 перекрашивается: центр `messenger`, кольца `Storage`, `Selectors`, `Dispatcher`, `Effects`
3. «Диспетчер здесь разбит на миксины, по одному на домен: синхронизация, сообщения, набор текста,
   история и так далее.» — ◎ кольцо `Dispatcher` раскрывается веером из 11 мелких точек; ✚ рядом папка `dispatcher/`
4. «Эффекты — на классы по тем же доменам. Домен описан дважды: в миксине — что можно
   сделать, в классе эффектов — как на это реагировать.» — ◎ кольцо `Effects` раскрывается веером; ✚ папка `effects/`; ✦ подсветка пары `typing.mixin.ts` ↔ `typing.effects.ts`
5. «Сборка — один файл. Зависимости, селекторы ядра приложения, сокет, который подключается лениво и
   только в браузере.» — ⌨ `messengerSynapse` (сокращённый)
6. «Это всё — один синапс.» — ◎ веера сворачиваются, весь логотип сжимается в одну точку `messenger`

*Масштаб 2 — «петля наверх»: синапс оказывается частью модуля*

7. «Но мессенджер — это не один синапс. Отъедем на уровень выше. Рядом с ядром — чат, список чатов,
   информация о чате, контакты, история звонков. У каждого свой синапс со своим хранилищем, диспетчером и
   эффектами.» — ◎ логотип сжимается в кольцо `messenger.synapse` и уезжает влево-вперёд; справа в
   «глубине» появляются кольца `chat`, `chat-list`, `chat-info`, `contacts`, `call-history` — ближние крупнее,
   дальние меньше и тусклее; к родителю тянутся тонкие линии. В видео — медленный наезд камеры с параллаксом
8. «Связи между ними задаёт dependencies. Чат зависит от ядра мессенджера: его эффекты стартуют, только
   когда ядро готово.» — ✦ линия `chat → messenger` загорается; ✚ плашка `dependencies: [messengerSynapse]`
9. «Селекторы чата берут селекторы ядра в конструктор. Так id текущего пользователя проходит по цепочке:
   из ядра приложения — в мессенджер — в чат.» — ✚ дальнее тусклое кольцо `core` со связью; ◎ импульс бежит
   `core → messenger → chat` (стрелки от `core` к `messenger` и от `messenger` к `chat`)
10. «А эффекты чата получают диспетчер мессенджера и пишут прямо в его хранилище.» — ◎ импульс `chat → messenger`
11. «Само ядро мессенджера тоже зависит от соседей: от ядра приложения, панели и связей между
    пользователями.» — ✚ дальние тусклые кольца `relations`, `panel` (`core` уже виден с шага 9)
12. «Все синапсы модуля тянутся к одному родителю. Каждая линия — явная связь, объявленная в коде.» — ✦ все линии подсвечиваются

*Масштаб 3 — ещё выше: модуль становится точкой проекта*

13. «Отъедем ещё. Снаружи весь мессенджер — тоже один узел. Его синапсы — маленькие точки
    вокруг.» — ◎ кольцо `messenger` уменьшается, вокруг — 7 точек-спутников
14. «А в проекте таких модулей много: посты, звонки, стриминг, медиа — и дальше по списку.» —
    ✚ «сеть проекта»: кольца модулей разного размера на разной глубине, тонкие линии зависимостей
15. «И каждый устроен так же, как мессенджер: внутри — свои синапсы. Где-то один, где-то несколько.
    Сколько их будет — решает проект, библиотека не ограничивает.» — ✚ у каждого модуля появляются
    точки-спутники по числу его синапсов
16. «Отсюда и название. Синапс — это узел, который соединяется с другими узлами. Маленький собирается из
    частей, большой — из маленьких.» — ✚ подпись и логотип synapse

*Организация кода — зачем так делить*

17. «Теперь — как это разложено в коде и зачем.» — ⌫ сеть → пустое полотно
18. «Если модуль большой, его сразу делим по доменам: ядро, чат, список чатов, информация о чате,
    контакты, история звонков. Каждый домен — своя папка и свой синапс с одной и той же раскладкой
    файлов.» — ✚ ряд папок-доменов, ✚ под ними одинаковый набор файлов
19. «Большой домен режем дальше по обычным паттернам ООП. Например, миксины: каждый миксин — маленький
    кусок диспетчера про одну тему — набор текста, счётчики, история.» — ⌨ миксин `CountersMixin`
20. «А собираем их в один класс — фасад. Снаружи виден один диспетчер мессенджера, внутри — сколько
    угодно миксинов. Компонент вызывает экшен и не знает, в каком миксине он живёт.» — ⌨ `class MessengerDispatcher
    extends composeMixins(…)` + ✚ схема `11 миксинов → фасад MessengerDispatcher → useMessengerActions()`
21. «Эффекты режутся так же — на классы с теми же именами доменов. Миксин отвечает, что можно сделать,
    класс эффектов — как на это реагировать.» — ✚ пары `typing.mixin.ts ↔ typing.effects.ts`
22. «Миксины и фасад — решение проекта, это несколько строк своего хелпера. Библиотека даёт классы, которые
    можно так композировать. Это удобно, если вы следуете ООП или просто хотите разделять логику по
    доменам.» — ✚ таблица «Даёт библиотека / Даёт проект»
23. «React-компоненты при этом только читают селекторы и вызывают экшены. Вся логика — здесь. Это и есть
    слой управления бизнес-логикой.» — ✚ итоговая плашка
24. «Честно: для маленького приложения это лишняя церемония. Один синапс без миксинов — уже нормальный
    модуль.» — ✚ сноска

Доки: `dependencies.md`, `create-synapse-effects.md`, `synapse-ctx.md`

<details><summary>Подробнее — фактура по sn_client (на экран не идёт)</summary>

- 7 синапсов в `modules/messenger`: `messengerSynapse` (core/synapse), `panelSynapse` (LocalStorage через
  `browserStorage`, `hydrateStrategy: 'merge'`), `chatSynapse`, `chatListSynapse`, `chatInfoSynapse`,
  `contactsSynapse`, `callHistorySynapse`. Внешние: `coreSynapse` (без эффектов, селекторы доступны
  сразу), `relationsSynapse`.
- Граф: messenger → core, panel, relations; chat → messenger; chatList, chatInfo → messenger, panel;
  contacts, callHistory → core, messenger.
- Миксинов 14 (11 в ядре + 3 в contacts), классов эффектов 19 (11 + 3 + 5).
- Связи сверх `dependencies`: чужие `.selectors` в конструктор селекторов; чужой `.dispatcher` в
  конструктор эффектов (chat пишет в messenger, privacy пишет в relations); `toObservable(other.state$)`.
- Сокет: `MessengerSocketService` держит `Subject`, `on(event)` = `incoming.pipe(filter, map)`;
  ref-counted `acquire/release`; подключение привязано к пользователю из `core$`
  (`sync.effects.ts`, `distinctUntilChanged` + `switchMap` + `finalize(release)`).
- React: на каждую фичу `createSynapseCtx` → `withX`, `useXSelectors`, `useXActions`; фича-стор
  монтируется вместе со своим экраном, messenger и panel — один раз в корне.
- Во всём приложении 33 вызова `createSynapse`: 32 в 16 модулях (messenger 7, streaming 5, social 3, media 3,
  notifications 2, accounts 2, остальные по одному) + `coreSynapse` ядра приложения. Связи между модулями
  на «масштабе 4» не рисуем — их не разбирали, кроме messenger → relations.

</details>

🎬 Видео: главная анимация ролика — веер, сворачивание логотипа в кольцо, «петля наверх» на три масштаба,
импульсы по связям. Дека ≈: каждый масштаб — отдельный слайд, кольцо `messenger` переезжает между слайдами
magic-переходом (тот же id), остальное появляется по клику; импульсы — статичные стрелки.

---

### Блок 13 — Что ещё есть на полке

```text
┌────────────────────┬──────────────────────────────────────────────────────────────────┐
│ createEventBus     │ шина событий: посредник между независимыми синапсами              │
│ WorkerCacheStorage │ общий живой кэш для всех вкладок — через Shared Worker            │
│ свой fetchFn       │ свой транспорт API-клиента: обновление токена, ServiceWorker       │
│ формы              │ рецепт: форма на хранилище, валидация — своей middleware           │
│ toObservable       │ мост любого потока synapse в RxJS                                  │
└────────────────────┴──────────────────────────────────────────────────────────────────┘
```

🎙 **Диктор по шагам:**

1. «Всё не уместить в один ролик. Коротко о том, что ещё есть на полке.»
2. «Шина событий. Это посредник между двумя независимыми синапсами: один публикует событие, другой на
   него подписан, и они ничего не знают друг о друге.» — ✚ строка + ◎ в видео: две точки, между ними
   шина, импульс проходит через неё
3. «Общий кэш через Shared Worker — если нужно, чтобы все вкладки видели одно живое состояние и не
   дублировали работу.» — ✚ строка
4. «Свой транспорт для API-клиента — если запросы должны идти иначе: например, с обновлением токена и
   повтором, или через ServiceWorker.» — ✚ строка
5. «Рецепт для форм: состояние формы — это хранилище, а свои правила валидации пишутся middleware.
   Персист черновика и синхронизация вкладок достаются бесплатно.» — ✚ строка
6. «И мост в RxJS: любой поток synapse превращается в Observable одной функцией.» — ✚ строка
7. «Всё это описано в документации, ссылка — в описании.»

Доки: `event-bus.md`, `worker-cache-storage.md`, `custom-fetch-fn.md`, `custom-fetch-service-worker.md`, `forms.md`, `to-observable.md`

---

### Блок 14 — Чего нет и куда дальше

| Есть из коробки             | Пока нет               |
|-----------------------------|------------------------|
| ✓ персист и миграции        | × DevTools             |
| ✓ IndexedDB и вкладки       | × polling, refetch     |
| ✓ HTTP-слой и кэш           | × optimistic updates   |
| ✓ SSR-гидрация              | × большая экосистема   |
| ✓ эффекты на RxJS           |                        |
| ✓ связи между синапсами     |                        |

> **Дальше:** ролик «Сколько стоит synapse-storage» — честное сравнение с Redux, effector, MobX, zustand и
> TanStack Query · документация · `npm install synapse-storage`

🎙 **Диктор по шагам:**

1. «И честно о том, чего пока нет.» — ✚ левая колонка целиком
2. «DevTools.» — ✚ строка
3. «Polling и перезапроса при возврате на вкладку.» — ✚
4. «Optimistic updates.» — ✚
5. «Экосистема тоже пока маленькая.» — ✚
6. «Сколько всё это стоит в килобайтах и как выглядит рядом с Redux, effector, zustand и TanStack Query —
   разбираю в следующем ролике. Спасибо.» — ✚ плашка «Дальше» + логотип
