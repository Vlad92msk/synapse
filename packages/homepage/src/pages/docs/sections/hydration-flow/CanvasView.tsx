import { CodeBlock } from '@shared/components/ui/code-block'

import { CodeSample, ConceptInsert, DataPanel, FLOW_STEPS, FOUNDATION, Lang, Zone, ZONE_META } from './steps'
import { loc, TXT } from './text'

import style from './CanvasView.module.css'

const ZONE_ORDER: Zone[] = ['server', 'transfer', 'client']

const DataPanelView = ({ panel, lang }: { panel: DataPanel; lang: Lang }) => (
  <div className={style.dataPanel}>
    <span className={style.dataLabel}>{loc(panel.label, lang)}</span>
    <CodeBlock language={panel.lang}>{panel.code}</CodeBlock>
  </div>
)

const ConceptView = ({ concept, lang, intro }: { concept: ConceptInsert; lang: Lang; intro?: boolean }) => (
  <aside className={`${style.concept} ${intro ? style.conceptIntro : ''}`}>
    <span className={style.conceptKind}>{intro ? (lang === 'ru' ? 'основа' : 'foundation') : lang === 'ru' ? 'теория' : 'theory'}</span>
    <h4 className={style.conceptTitle}>{loc(concept.title, lang)}</h4>
    {loc(concept.body, lang)
      .split('\n\n')
      .map((para, i) => (
        <p key={i} className={style.conceptText}>
          {para}
        </p>
      ))}
  </aside>
)

const SamplesView = ({ samples, lang }: { samples: CodeSample[]; lang: Lang }) => (
  <div className={style.samples}>
    {samples.map((s, i) => (
      <div key={i} className={style.sample}>
        <span className={`${style.sampleTag} ${s.kind === 'app' ? style.kindApp : style.kindLib}`}>
          {s.kind === 'app' ? (lang === 'ru' ? 'приложение' : 'app') : lang === 'ru' ? 'библиотека' : 'library'} · {loc(s.label, lang)}
        </span>
        <CodeBlock language={s.lang}>{s.code}</CodeBlock>
      </div>
    ))}
  </div>
)

/**
 * Вариант «Полотно»: один скроллящийся storyboard сверху вниз (в духе Anthropic-доков).
 * Зоны идут секциями (сервер → граница → клиент), шаги нанизаны на непрерывный «спайн»,
 * код-вызовы и трансформация данных — прямо в потоке, без боковой панели.
 */
export const CanvasView = ({ lang }: { lang: Lang }) => {
  const grouped = ZONE_ORDER.map((zone) => ({ zone, steps: FLOW_STEPS.filter((s) => s.zone === zone) }))

  return (
    <div className={style.scroller}>
      <div className={style.canvas}>
        <p className={style.scrollHint}>{loc(TXT.scrollHint, lang)}</p>

        <ConceptView concept={FOUNDATION} lang={lang} intro />

        {grouped.map(({ zone, steps }) => (
          <section key={zone} className={`${style.zone} ${style[`zone_${zone}`]}`}>
            <header className={style.zoneHead}>
              <span className={style.zoneTag}>{loc(ZONE_META[zone].title, lang)}</span>
              <p className={style.zoneSub}>{loc(ZONE_META[zone].sub, lang)}</p>
            </header>

            {steps.map((s) => (
              <article key={s.id} className={style.station}>
                <div className={style.spine}>
                  <span className={style.num}>{s.num}</span>
                </div>

                <div className={style.content}>
                  <h3 className={style.stTitle}>{loc(s.call, lang)}</h3>

                  <div className={style.callRow}>
                    <code className={style.stCall}>{s.fn}</code>
                    <span className={style.stFile}>{s.file}</span>
                  </div>

                  <p className={style.stRole}>{loc(s.role, lang)}</p>

                  <div className={style.prose}>
                    <p className={style.proseText}>{loc(s.what, lang)}</p>
                    <p className={`${style.proseText} ${style.proseWhy}`}>
                      <span className={style.whyTag}>{loc(TXT.why, lang)}</span>
                      {loc(s.why, lang)}
                    </p>
                  </div>

                  {(s.before || s.after) && (
                    <div className={style.transform}>
                      {s.before && <DataPanelView panel={s.before} lang={lang} />}
                      {s.before && s.after && <span className={style.transformArrow}>→</span>}
                      {s.after && <DataPanelView panel={s.after} lang={lang} />}
                    </div>
                  )}

                  {s.concept && <ConceptView concept={s.concept} lang={lang} />}
                  {s.samples && <SamplesView samples={s.samples} lang={lang} />}
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
