import { useMemo } from 'react'
import { CodeBlock } from '@shared/components/ui/code-block'
import { Background, BackgroundVariant, Controls, type Edge, Handle, MarkerType, type Node, type NodeProps, type NodeTypes, Position, ReactFlow } from '@xyflow/react'

import { CodeSample, ConceptInsert, DataPanel, FLOW_STEPS, FlowStep, FOUNDATION, Lang, Loc, Zone } from './steps'
import { loc, TXT } from './text'

import '@xyflow/react/dist/style.css'
import style from './FlowView.module.css'

const ZONE_COLOR: Record<Zone, string> = {
  server: 'hsl(142 64% 46%)',
  transfer: 'hsl(25 95% 53%)',
  client: 'hsl(212 78% 62%)',
}

// Вертикальный отступ хэндлов от верха узла: фиксирован, чтобы связи шли по прямой
// независимо от высоты узлов.
const HANDLE_TOP = 30

// ── Геометрия раскладки ───────────────────────────────────────────────────────
// Спайн (шаги 1→…→13) идёт горизонтальным рядом по y=0. Ответвления (теория/код)
// поднимаются ВВЕРХ, в отрицательный y: там всегда свободно, т.к. узел-шаг растёт
// вниз (блоки before/after). Branch-слоты считаются динамически снизу вверх.
const H_GAP = 660
const ROW_Y = 0
const NODE_W = 360
const CODE_W = 520
const THEORY_W = 380
// Высота branch-узлов жёстко ограничена в CSS (.codeBranch ≤ ~450, .theory ≤ ~370 c учётом
// паддингов + scroll). Слоты разнесены С ЗАПАСОМ под эти максимумы, чтобы узлы НИКОГДА не
// налезали друг на друга и на спайн:
//   · BRANCH_BASE > высоты code-узла  → нижний слот гарантированно выше спайна (y=0);
//   · BRANCH_STEP > высоты theory-узла → верхний слот не достаёт до нижнего.
const BRANCH_BASE = 560
const BRANCH_STEP = 500

// Подпись данных, «текущих» по ребру (что вышло из узла-источника и поехало дальше).
const EDGE_DATA: Record<string, Loc> = {
  fetch: { ru: 'DTO', en: 'DTO' },
  'hydrate-fork': { ru: 'PokemonState', en: 'PokemonState' },
  'warm-main': { ru: 'snapshot · JSON', en: 'snapshot · JSON' },
  prop: { ru: 'dehydratedState', en: 'dehydratedState' },
  seed: { ru: 'стор засеян', en: 'store seeded' },
}

interface StepNodeData extends Record<string, unknown> {
  step: FlowStep
  lang: Lang
}
interface TheoryNodeData extends Record<string, unknown> {
  concept: ConceptInsert
  lang: Lang
  /** Узел-преамбула (FOUNDATION) — связывается вправо со спайном, а не вверх. */
  intro?: boolean
}
interface CodeNodeData extends Record<string, unknown> {
  samples: CodeSample[]
  lang: Lang
}

const DataMini = ({ panel, lang, kind }: { panel: DataPanel; lang: Lang; kind: 'in' | 'out' }) => (
  <div className={style.dataMini}>
    <span className={`${style.dataTag} ${kind === 'in' ? style.tagIn : style.tagOut}`}>
      {kind === 'in' ? '▸ ' : '◂ '}
      {loc(kind === 'in' ? TXT.in : TXT.out, lang)} · {loc(panel.label, lang)}
    </span>
    {/* nowheel — колесо скроллит блок, а не зумит холст; nodrag — выделение/копирование
        кода не таскает узел */}
    <pre className={`${style.codePre} nowheel nodrag`}>
      <code>{panel.code}</code>
    </pre>
  </div>
)

const StepNode = ({ data }: NodeProps<Node<StepNodeData>>) => {
  const { step, lang } = data
  return (
    <div className={`${style.node} ${style[`z_${step.zone}`]}`}>
      {/* хэндлы слева/справа с фиксированным верхним отступом — связи идут горизонтально
          и остаются прямыми независимо от высоты узлов */}
      <Handle type="target" position={Position.Left} className={style.handle} style={{ top: HANDLE_TOP }} />
      {/* верхний хэндл — к ответвлениям (теория/код) */}
      <Handle id="up" type="source" position={Position.Top} className={style.handle} />

      <div className={style.nHead}>
        <span className={style.nNum}>{step.num}</span>
        <span className={style.nTitle}>{loc(step.call, lang)}</span>
      </div>

      <code className={style.nFn}>{step.fn}</code>
      <span className={style.nFile}>{step.file}</span>

      <p className={style.nRole}>{loc(step.role, lang)}</p>
      <p className={style.nWhat}>{loc(step.what, lang)}</p>

      {step.before && <DataMini panel={step.before} lang={lang} kind="in" />}
      {step.after && <DataMini panel={step.after} lang={lang} kind="out" />}

      <Handle type="source" position={Position.Right} className={style.handle} style={{ top: HANDLE_TOP }} />
    </div>
  )
}

const TheoryNode = ({ data }: NodeProps<Node<TheoryNodeData>>) => {
  const { concept, lang, intro } = data
  return (
    <div className={`${style.branch} ${style.theory} ${intro ? style.intro : ''} nowheel`}>
      <Handle id="down" type="target" position={Position.Bottom} className={style.bHandle} />
      <Handle id="up" type="source" position={Position.Top} className={style.bHandle} />
      {intro && <Handle id="out" type="source" position={Position.Right} className={style.bHandle} style={{ top: HANDLE_TOP }} />}

      <span className={style.branchKind}>{intro ? (lang === 'ru' ? 'основа' : 'foundation') : lang === 'ru' ? 'теория' : 'theory'}</span>
      <h4 className={style.theoryTitle}>{loc(concept.title, lang)}</h4>
      {loc(concept.body, lang)
        .split('\n\n')
        .map((para, i) => (
          <p key={i} className={style.theoryText}>
            {para}
          </p>
        ))}
    </div>
  )
}

const CodeNode = ({ data }: NodeProps<Node<CodeNodeData>>) => {
  const { samples, lang } = data
  return (
    <div className={`${style.branch} ${style.codeBranch} nowheel`}>
      <Handle id="down" type="target" position={Position.Bottom} className={style.bHandle} />
      <Handle id="up" type="source" position={Position.Top} className={style.bHandle} />

      <span className={style.branchKind}>{lang === 'ru' ? 'код' : 'code'}</span>
      {samples.map((s, i) => (
        <div key={i} className={style.sample}>
          <span className={`${style.sampleTag} ${s.kind === 'app' ? style.kindApp : style.kindLib}`}>
            {s.kind === 'app' ? (lang === 'ru' ? 'приложение' : 'app') : lang === 'ru' ? 'библиотека' : 'library'} · {loc(s.label, lang)}
          </span>
          <div className="nodrag">
            <CodeBlock language={s.lang} maxHeight="240px">
              {s.code}
            </CodeBlock>
          </div>
        </div>
      ))}
    </div>
  )
}

const nodeTypes: NodeTypes = { step: StepNode, theory: TheoryNode, code: CodeNode }

const dashedEdge = (id: string, source: string, target: string, color: string): Edge => ({
  id,
  source,
  target,
  sourceHandle: 'up',
  targetHandle: 'down',
  type: 'smoothstep',
  style: { stroke: color, strokeWidth: 1.5, strokeDasharray: '5 5', opacity: 0.7 },
  markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
})

const buildGraph = (lang: Lang): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // ── Спайн: шаги ─────────────────────────────────────────────────────────────
  FLOW_STEPS.forEach((step, i) => {
    nodes.push({ id: step.id, type: 'step', position: { x: i * H_GAP, y: ROW_Y }, data: { step, lang } })

    // ── Ответвления: снизу вверх (нулевой слот — ближайший к спайну) ───────────
    let slot = 0
    let prevId = step.id
    let prevHandleSource = 'up' // хэндл-источник на узле-шаге

    const stepX = i * H_GAP
    const color = ZONE_COLOR[step.zone]

    if (step.samples) {
      const id = `${step.id}__code`
      nodes.push({
        id,
        type: 'code',
        position: { x: stepX + (NODE_W - CODE_W) / 2, y: -(BRANCH_BASE + slot * BRANCH_STEP) },
        data: { samples: step.samples, lang },
      })
      edges.push({ ...dashedEdge(`${prevId}--${id}`, prevId, id, color), sourceHandle: prevHandleSource })
      prevId = id
      prevHandleSource = 'up'
      slot += 1
    }

    if (step.concept) {
      const id = `${step.id}__theory`
      nodes.push({
        id,
        type: 'theory',
        position: { x: stepX + (NODE_W - THEORY_W) / 2, y: -(BRANCH_BASE + slot * BRANCH_STEP) },
        data: { concept: step.concept, lang },
      })
      edges.push({ ...dashedEdge(`${prevId}--${id}`, prevId, id, color), sourceHandle: prevHandleSource })
    }
  })

  // ── Спайн-рёбра (поток данных) ────────────────────────────────────────────────
  FLOW_STEPS.slice(0, -1).forEach((step, i) => {
    const next = FLOW_STEPS[i + 1]
    const label = EDGE_DATA[step.id] ? loc(EDGE_DATA[step.id], lang) : undefined
    edges.push({
      id: `${step.id}__${next.id}`,
      source: step.id,
      target: next.id,
      type: 'smoothstep',
      animated: Boolean(label),
      label,
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 6,
      labelBgStyle: { fill: 'hsl(0 0% 12%)', fillOpacity: 0.95 },
      labelStyle: { fill: ZONE_COLOR[step.zone], fontSize: 12, fontWeight: 700 },
      style: { stroke: ZONE_COLOR[step.zone], strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: ZONE_COLOR[step.zone], width: 18, height: 18 },
    })
  })

  // ── Преамбула FOUNDATION: «что вообще такое гидрация» ──────────────────────────
  nodes.push({
    id: 'foundation',
    type: 'theory',
    position: { x: -(THEORY_W + 220), y: -200 },
    data: { concept: FOUNDATION, lang, intro: true },
  })
  edges.push({
    id: 'foundation__fetch',
    source: 'foundation',
    target: 'fetch',
    sourceHandle: 'out',
    targetHandle: undefined,
    type: 'smoothstep',
    style: { stroke: ZONE_COLOR.server, strokeWidth: 1.5, strokeDasharray: '5 5', opacity: 0.7 },
    markerEnd: { type: MarkerType.ArrowClosed, color: ZONE_COLOR.server, width: 14, height: 14 },
  })

  return { nodes, edges }
}

/** Вариант «Полотно»: бесконечный node-холст (React Flow) с pan/zoom. */
export const FlowView = ({ lang }: { lang: Lang }) => {
  const { nodes, edges } = useMemo(() => buildGraph(lang), [lang])

  return (
    <div className={style.flowRoot}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.1}
        maxZoom={2}
        snapToGrid
        snapGrid={[20, 20]}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.5} color="hsl(50 9% 30%)" />
        <Controls className={style.controls} showInteractive={false} />
      </ReactFlow>

      <div className={style.legend}>
        <span className={style.legendItem}>
          <span className={style.legendDot} style={{ background: ZONE_COLOR.server }} /> {loc(TXT.legendServer, lang)}
        </span>
        <span className={style.legendItem}>
          <span className={style.legendDot} style={{ background: ZONE_COLOR.transfer }} /> {loc(TXT.legendTransfer, lang)}
        </span>
        <span className={style.legendItem}>
          <span className={style.legendDot} style={{ background: ZONE_COLOR.client }} /> {loc(TXT.legendClient, lang)}
        </span>
        <span className={style.legendSep} />
        <span className={style.legendItem}>
          <span className={style.legendDash} /> {lang === 'ru' ? 'теория / код' : 'theory / code'}
        </span>
      </div>

      <span className={style.flowHint}>{loc(TXT.flowHint, lang)}</span>
    </div>
  )
}
