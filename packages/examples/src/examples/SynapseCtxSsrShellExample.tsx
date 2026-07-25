import { useEffect, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryStorage, Selectors } from 'synapse-storage/core'
import { Dispatcher } from 'synapse-storage/reactive'
import { createSynapse } from 'synapse-storage/utils'
import { createSynapseCtx, useSelector } from 'synapse-storage/react'
import { cardStyle, codeBlock, sectionTitle } from './styles'

/**
 * createSynapseCtx + `ssrShell` — SSR для «фонового» провайдера БЕЗ серверных данных.
 *
 * Presence-подобный модуль: его реальный стор строится async-фабрикой (эмуляция await зависимостей
 * — сокета/core), поэтому синхронно на сервере он НЕ готов. Без `ssrShell` провайдер упёрся бы в
 * гейт `loadingComponent` и срезал бы всё поддерево из серверного HTML. С `ssrShell` модуль
 * синхронно поднимает «пустой» стор из `initialState` → children попадают в HTML, а на клиенте
 * контекст бесшовно апгрейдится до реального стора.
 *
 * Пара к SynapseCtsSsrExample: там сеется стор С серверными данными (`dehydratedState`), здесь —
 * фоновый провайдер БЕЗ данных.
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

// Синхронное ядро — переиспользуем в фабрике и в ssrShell, чтобы не дублировать сборку слоёв.
const buildSyncCore = (name: string, seed: PresenceState) => {
  const storage = new MemoryStorage<PresenceState>({ name, initialState: seed })
  return { storage, selectors: new PresenceSelectors(storage), dispatcher: new PresenceDispatcher(storage) }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

// С ssrShell: async-фабрика имитирует ожидание зависимостей (1.2s) и «приходит» с реальными данными;
// ssrShell даёт синхронный пустой стор для сервера/первого кадра.
const presenceWithShell = createSynapse<PresenceState, PresenceDispatcher, PresenceSelectors>(
  async () => {
    await delay(1200)
    return buildSyncCore('presence_shell_real', { online: true, peers: 3 })
  },
  { ssrShell: () => buildSyncCore('presence_shell_ssr', initialState) },
)

// Без ssrShell: тот же async-стор, но синхронного SSR у него нет → гейт loadingComponent.
const presenceNoShell = createSynapse<PresenceState, PresenceDispatcher, PresenceSelectors>(async () => {
  await delay(1200)
  return buildSyncCore('presence_noshell_real', { online: true, peers: 3 })
})

const CtxShell = createSynapseCtx(presenceWithShell, { ssr: true, loadingComponent: <em style={{ color: '#c0392b' }}>gate: loadingComponent (subtree cut)</em> })
const CtxNoShell = createSynapseCtx(presenceNoShell, { ssr: true, loadingComponent: <em style={{ color: '#c0392b' }}>gate: loadingComponent (subtree cut)</em> })

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
        Фоновый провайдер над async-стором <b>без серверных данных</b>. С <code>ssrShell</code> его
        поддерево попадает в серверный HTML; без — гейт <code>loadingComponent</code> срезает контент.
      </p>

      <h3 style={sectionTitle}>Server HTML (renderToStaticMarkup)</h3>
      <p style={{ margin: '4px 0' }}>
        <b>with ssrShell</b> — контент в разметке:
      </p>
      <pre style={codeBlock}>{serverHtml.withShell}</pre>
      <p style={{ margin: '4px 0' }}>
        <b>without ssrShell</b> — только заглушка, поддерево вырезано:
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
