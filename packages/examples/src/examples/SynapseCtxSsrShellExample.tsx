import { useEffect, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { IndexedDBStorage, MemoryStorage, Selectors } from 'synapse-storage/core'
import { Dispatcher } from 'synapse-storage/reactive'
import { createSynapse } from 'synapse-storage/utils'
import { createSynapseCtx, useSelector } from 'synapse-storage/react'
import { cardStyle, codeBlock, sectionTitle } from './styles'

/**
 * createSynapseCtx + SSR-оболочка — SSR для «фонового» провайдера БЕЗ серверных данных.
 *
 * Presence-подобный модуль: своих серверных данных нет, всё async (сокет/core/endpoints) живёт в
 * фабрике `effects`, которая на сервере не исполняется. Т.к. C-форма конструирует ядро СИНХРОННО из
 * `initialState`, у модуля с sync-хранилищем автоматически есть `buildSyncShell` → провайдер рендерит
 * children в серверный HTML, а на клиенте контекст бесшовно апгрейдится до реального стора (эффекты
 * стартуют в браузере). Ручной `ssrShell` / объектная форма с `wire` больше не нужны — удалены.
 *
 * Пара к SynapseCtxSsrExample: там сеется стор С серверными данными (`dehydratedState`), здесь —
 * фоновый провайдер БЕЗ данных (оболочка выводится by construction).
 */

interface PresenceState extends Record<string, any> {
  online: boolean
  peers: number
}

const initialState: PresenceState = { online: false, peers: 0 }

class PresenceSelectors extends Selectors<PresenceState> {
  readonly online = this.select((s) => s.online)
  readonly peers = this.select((s) => s.peers)
}
class PresenceDispatcher extends Dispatcher<PresenceState> {
  readonly disconnect = this.action((store) => store.update((s) => ((s.online = false), (s.peers = 0))))
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

// C-форма с СИНХРОННЫМ хранилищем: SSR-оболочка выводится автоматически из sync-ядра. Фабрика
// `effects` (только клиент) имитирует ожидание зависимостей (1.2s) и «доезжает» реальными данными.
const presenceWithShell = createSynapse<MemoryStorage<PresenceState>, PresenceDispatcher, PresenceSelectors>({
  storage: () => new MemoryStorage<PresenceState>({ name: 'presence_shell', initialState }),
  dispatcher: (s) => new PresenceDispatcher(s),
  selectors: (s) => new PresenceSelectors(s),
  effects: async ({ storage }) => {
    await delay(1200)
    storage.update((s) => ((s.online = true), (s.peers = 3))) // «данные пришли» на клиенте
    return undefined // реальных RxJS-эффектов нет — только имитация подъезда данных
  },
})

// ASYNC-хранилище (IndexedDB): синхронного SSR у него НЕТ → buildSyncShell отсутствует, провайдер
// деградирует к гейту loadingComponent (единственный оставшийся случай «нет оболочки»).
const presenceNoShell = createSynapse<IndexedDBStorage<PresenceState>, PresenceDispatcher, PresenceSelectors>({
  storage: () => new IndexedDBStorage<PresenceState>({ name: 'presence_noshell', initialState: { online: true, peers: 3 }, options: {} }),
  dispatcher: (s) => new PresenceDispatcher(s),
  selectors: (s) => new PresenceSelectors(s),
})

const CtxShell = createSynapseCtx(presenceWithShell, { loadingComponent: <em style={{ color: '#c0392b' }}>gate: loadingComponent (subtree cut)</em> })
const CtxNoShell = createSynapseCtx(presenceNoShell, { loadingComponent: <em style={{ color: '#c0392b' }}>gate: loadingComponent (subtree cut)</em> })

// «Фоновый» провайдер: просто прокидывает детей в контексте стора.
const ShellProvider = CtxShell.contextSynapse(function ShellProvider({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
})
const NoShellProvider = CtxNoShell.contextSynapse(function NoShellProvider({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
})

// Контент поддерева (SEO-значимый). Читает presence-селекторы из контекста.
function PresenceBadge({ ctx }: { ctx: typeof CtxShell | typeof CtxNoShell }) {
  const selectors = ctx.useSynapseSelectors()
  const online = useSelector(selectors.online)
  const peers = useSelector(selectors.peers)
  return (
    <article style={{ padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
      <h4 style={{ margin: '0 0 4px' }}>Profile content (must be in SSR HTML)</h4>
      <span>
        presence: <b style={{ color: online ? '#27ae60' : '#888' }}>{online ? `online · ${peers} peers` : 'offline'}</b>
      </span>
    </article>
  )
}

export function SynapseCtxSsrShellExample() {
  // «Серверный» HTML: то, что уйдёт ботам/на первый кадр. renderToStaticMarkup синхронен и
  // useEffect не вызывает — ровно как renderToString на сервере.
  const [serverHtml] = useState(() => ({
    withShell: renderToStaticMarkup(
      <ShellProvider>
        <PresenceBadge ctx={CtxShell} />
      </ShellProvider>,
    ),
    noShell: renderToStaticMarkup(
      <NoShellProvider>
        <PresenceBadge ctx={CtxNoShell} />
      </NoShellProvider>,
    ),
  }))

  // Живой апгрейд: смонтированный shell-провайдер показывает пустой presence сразу, затем
  // (через ~1.2s) контекст переключается на реальный стор и появляется online/peers.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div style={cardStyle}>
      <h2>createSynapseCtx — SSR shell (background provider)</h2>
      <p>
        Фоновый провайдер <b>без серверных данных</b>. У C-формы с sync-хранилищем оболочка выводится
        by construction (<code>buildSyncShell</code>) → его поддерево попадает в серверный HTML; у
        async-хранилища (IndexedDB) синхронной оболочки нет → гейт <code>loadingComponent</code> срезает контент.
      </p>

      <h3 style={sectionTitle}>Server HTML (renderToStaticMarkup)</h3>
      <p style={{ margin: '4px 0' }}>
        <b>sync storage (auto shell)</b> — контент в разметке:
      </p>
      <pre style={codeBlock}>{serverHtml.withShell}</pre>
      <p style={{ margin: '4px 0' }}>
        <b>async storage (no shell)</b> — только заглушка, поддерево вырезано:
      </p>
      <pre style={codeBlock}>{serverHtml.noShell}</pre>

      <h3 style={sectionTitle}>Live (client): shell → real upgrade</h3>
      <p style={{ margin: '4px 0', color: '#888' }}>
        Первый кадр — пустой presence (оболочка), через ~1.2s контекст апгрейдится до реального стора.
      </p>
      {mounted && (
        <ShellProvider>
          <PresenceBadge ctx={CtxShell} />
        </ShellProvider>
      )}
    </div>
  )
}
