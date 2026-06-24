import { useState } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryStorage, Selectors } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { Dispatcher } from 'synapse-storage/reactive'
import { createSynapseCtx, useSelector } from 'synapse-storage/react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

/**
 * Пример: createSynapseCtx({ ssr: true }) — серверный рендер засеянного sync-стора.
 *
 * Полный цикл SSR без mismatch:
 *   1. СЕРВЕР: dehydrate({ initialState }) → форк модуля под запрос → сериализуемый снапшот.
 *   2. СЕРВЕР: renderToString(<View dehydratedState={snapshot} />) → готовый HTML (не loadingComponent).
 *   3. Снапшот сериализуется в HTML (window.__SYNAPSE_STATE__).
 *   4. КЛИЕНТ: hydrateRoot(<View dehydratedState={snapshot} />) — стор засевается синхронно ДО
 *      первого рендера → HTML клиента совпадает с серверным → нет hydration mismatch.
 *
 * Здесь «сервер» эмулируется прямо в браузере через renderToString, чтобы пример был запускаемым.
 */

// ─── Состояние ──────────────────────────────────────────────────────────────

interface Post {
  id: number
  title: string
}

interface FeedState {
  posts: Post[]
  source: 'initial' | 'server'
}

const initialState: FeedState = {
  posts: [],
  source: 'initial',
}

// ─── Selectors / Dispatcher ──────────────────────────────────────────────────

class FeedSelectors extends Selectors<FeedState> {
  readonly posts = this.select((s) => s.posts)
  readonly source = this.select((s) => s.source)
  readonly count = this.combine([this.posts], (posts) => posts.length)
}

class FeedDispatcher extends Dispatcher<FeedState> {
  readonly addPost = this.action((store, title: string) => {
    store.update((s) => {
      s.posts.push({ id: s.posts.length + 1, title })
    })
  })
}

// ─── 1. Ленивый handle ───────────────────────────────────────────────────────

const feedSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<FeedState>({ name: 'feed-ssr', initialState })
  return {
    storage,
    dispatcher: new FeedDispatcher(storage),
    selectors: new FeedSelectors(storage),
  }
})

// ─── 2. Контекст с ssr: true ─────────────────────────────────────────────────

const {
  contextSynapse,
  dehydrate,
  useSynapseSelectors,
  useSynapseActions,
} = createSynapseCtx(feedSynapse, {
  loadingComponent: <div style={{ padding: 12, color: '#999' }}>Загрузка ленты…</div>,
  ssr: true, // включает синхронный серверный рендер засеянного sync-стора
})

// ─── 3. Презентационный компонент (он же рендерится и на сервере, и на клиенте) ─

function PostsFeed() {
  const selectors = useSynapseSelectors()
  const actions = useSynapseActions()
  const posts = useSelector(selectors.posts)
  const source = useSelector(selectors.source)
  const count = useSelector(selectors.count)

  return (
    <div>
      <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>
        Источник состояния: <strong>{source}</strong> · постов: <strong>{count}</strong>
      </div>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {(posts ?? []).map((p) => (
          <li key={p.id}>{p.title}</li>
        ))}
      </ul>
      <div style={{ ...buttonRow, marginTop: 8 }}>
        <button onClick={() => actions.addPost(`Пост ${(posts?.length ?? 0) + 1} (с клиента)`)}>
          + Добавить пост (клиент)
        </button>
      </div>
    </div>
  )
}

const PostsFeedWithCtx = contextSynapse(PostsFeed)

// ─── Эмуляция «запроса к API» на сервере ─────────────────────────────────────

async function fetchFeed(): Promise<Post[]> {
  return [
    { id: 1, title: 'Synapse 5: SSR без mismatch' },
    { id: 2, title: 'dehydrate форкает модуль под запрос' },
    { id: 3, title: 'Гидрация засевает стор синхронно' },
  ]
}

// ─── Экспорт ──────────────────────────────────────────────────────────────────

export function SynapseCtxSsrExample() {
  const [serverHtml, setServerHtml] = useState<string>('')
  const [snapshot, setSnapshot] = useState<string>('')
  const [hydrated, setHydrated] = useState<FeedState | null>(null)

  // ── Шаг СЕРВЕРА: добыть данные → dehydrate → renderToString ──
  const runServer = async () => {
    const feed = await fetchFeed()

    // dehydrate создаёт per-request форк, сеет initialState через hydrate и (при ssr:true)
    // прогревает основной handle тем же снапшотом — чтобы renderToString отдал готовый стор.
    const dehydrated = await dehydrate({ initialState: { posts: feed, source: 'server' } })

    // Синхронный серверный рендер: контент уже в HTML, без loadingComponent.
    const html = renderToString(<PostsFeedWithCtx dehydratedState={dehydrated} />)

    setSnapshot(JSON.stringify(dehydrated))
    setServerHtml(html)
    setHydrated(null)
  }

  // ── Шаг КЛИЕНТА: тот же снапшот пропом → синхронный засев → совпадающий первый кадр ──
  const runClient = () => {
    if (!snapshot) return
    // На реальном клиенте: const dehydrated = JSON.parse(window.__SYNAPSE_STATE__)
    //                      hydrateRoot(container, <PostsFeedWithCtx dehydratedState={dehydrated} />)
    setHydrated(JSON.parse(snapshot) as FeedState)
  }

  return (
    <div style={cardStyle}>
      <h2>createSynapseCtx — SSR (ssr: true)</h2>
      <p>
        Серверный рендер засеянного sync-стора (Memory/LocalStorage): контент попадает в HTML
        на сервере, а клиент гидрирует тем же снапшотом без mismatch. «Сервер» здесь эмулируется
        прямо в браузере через <code>renderToString</code>.
      </p>

      {/* ─── Сервер ───────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Сервер: dehydrate → renderToString</h3>
      <pre style={codeBlock}>{`const { contextSynapse, dehydrate } = createSynapseCtx(feedSynapse, {
  loadingComponent: <Spinner />,
  ssr: true, // синхронный серверный рендер засеянного sync-стора
})

const PostsFeedWithCtx = contextSynapse(PostsFeed)

// На сервере (любой контур добычи данных → снапшот):
const feed = await fetchFeed()
const dehydrated = await dehydrate({ initialState: { posts: feed, source: 'server' } })

const html = renderToString(<PostsFeedWithCtx dehydratedState={dehydrated} />)
// dehydrated сериализуем в HTML:
// window.__SYNAPSE_STATE__ = JSON.stringify(dehydrated)`}</pre>

      <div style={buttonRow}>
        <button onClick={runServer}>1. Выполнить рендер на «сервере»</button>
      </div>

      {serverHtml && (
        <>
          <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>Серверный HTML (содержит контент, а не loadingComponent):</div>
          <pre style={{ ...codeBlock, background: '#f0f7ff' }}>{serverHtml}</pre>
          <div style={{ fontSize: 12, color: '#666' }}>Сериализованный снапшот (window.__SYNAPSE_STATE__):</div>
          <pre style={{ ...codeBlock, background: '#fff7f0' }}>{snapshot}</pre>
        </>
      )}

      {/* ─── Клиент ───────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Клиент: гидрация тем же снапшотом</h3>
      <pre style={codeBlock}>{`// На клиенте:
const dehydrated = JSON.parse(window.__SYNAPSE_STATE__)
hydrateRoot(container, <PostsFeedWithCtx dehydratedState={dehydrated} />)
// Снапшот синхронно засевается в стор ДО первого рендера →
// первый кадр клиента совпадает с серверным HTML → нет mismatch.`}</pre>

      <div style={buttonRow}>
        <button onClick={runClient} disabled={!snapshot}>2. Гидрировать на клиенте</button>
      </div>

      {hydrated && (
        <div style={{ marginTop: 12, padding: 12, border: '1px solid #cde', borderRadius: 6, background: '#fafdff' }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Живой клиентский компонент (засеян снапшотом, дальше — обычный клиент):</div>
          <PostsFeedWithCtx dehydratedState={hydrated} />
        </div>
      )}

      {/* ─── server-safe dehydrateModule (RSC) ────────────────────── */}
      <h3 style={sectionTitle}>RSC / 'server only': dehydrateModule</h3>
      <pre style={codeBlock}>{`// createSynapseCtx обычно живёт в 'use client'-модуле, поэтому его dehydrate
// (замыкание) не импортнуть на сервер. Для RSC есть server-safe аналог —
// принимает сам модуль явно, без React-зависимостей:
import { dehydrateModule } from 'synapse-storage/utils'

const dehydrated = await dehydrateModule(feedSynapse, {
  ssr: true,
  state: { posts: feed, source: 'server' },
})`}</pre>
    </div>
  )
}
