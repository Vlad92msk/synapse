import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDocumentation } from '@shared/hooks'
import { Block } from '@shared/utils/md-render/block'
import { DocSection } from '@models/docs'

import { ExampleLinks } from './example-links'
import style from './pokemon-advanced.module.css'

const DOC_KEY = 'pokemon-advanced' as const

// Нумерованные шаги рецепта (1–8) показываем как табы, чтобы не скроллить.
// Вводные секции (рецепт, структура, поток данных) и хвост (протокол, карта)
// остаются обычными секциями выше/ниже табов.
const TAB_SECTION_IDS: ReadonlyArray<string> = [
  '1-types-and-state-shape-pokemontypests',
  '2-apiclient-mappers-pokemonapits',
  '3-external-settings-pokemonsettingsts',
  '4-selectors-pokemonselectorsts',
  '5-dispatcher-pokemondispatcherts',
  '6-effects-pokemoneffectsts',
  '7-assembly-pokemonsynapsets',
  '8-react-pokemonadvancedexampletsx-pokemondemotsx',
]

// "4. Selectors — pokemon.selectors.ts" → { num: '4', label: 'Selectors' }
const parseTitle = (title: string) => {
  const numMatch = title.match(/^\s*(\d+)\.\s*/)
  const rest = title.replace(/^\s*\d+\.\s*/, '')
  const [labelPart] = rest.split(/\s[—–]\s/)
  return { num: numMatch?.[1] ?? '', label: labelPart.trim() }
}

const renderSection = (section: DocSection, withHeading = true) => (
  <div key={section.id}>
    {withHeading && <h1>{section.title}</h1>}
    {section.content.map((block, index) => (
      <Block key={`${section.id}-${index}`} block={block} />
    ))}
  </div>
)

const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points={dir === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
  </svg>
)

export const PokemonAdvancedPage = () => {
  const { getDoc } = useDocumentation()
  const doc = getDoc(DOC_KEY)

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const tablistRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [overflow, setOverflow] = useState({ left: false, right: false })

  const { intro, tabs, tail } = useMemo(() => {
    const sections = doc?.sections ?? []
    const firstTab = sections.findIndex((s) => TAB_SECTION_IDS.includes(s.id))
    const lastTab = sections.map((s) => TAB_SECTION_IDS.includes(s.id)).lastIndexOf(true)

    if (firstTab === -1) {
      return { intro: sections, tabs: [] as DocSection[], tail: [] as DocSection[] }
    }

    return {
      intro: sections.slice(0, firstTab),
      tabs: sections.slice(firstTab, lastTab + 1).filter((s) => TAB_SECTION_IDS.includes(s.id)),
      tail: sections.slice(lastTab + 1),
    }
  }, [doc])

  // Пересчитываем, есть ли скрытые табы слева/справа (для кнопок прокрутки)
  const updateOverflow = useCallback(() => {
    const el = tablistRef.current
    if (!el) return
    setOverflow({
      left: el.scrollLeft > 1,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    })
  }, [])

  useEffect(() => {
    const el = tablistRef.current
    if (!el) return
    updateOverflow()
    const observer = new ResizeObserver(updateOverflow)
    observer.observe(el)
    return () => observer.disconnect()
  }, [updateOverflow, tabs.length])

  if (!doc) return null

  const activeSection = tabs[active]

  const scrollByDir = (dir: 1 | -1) => {
    tablistRef.current?.scrollBy({ left: dir * tablistRef.current.clientWidth * 0.7, behavior: 'smooth' })
  }

  const focusTab = (index: number) => {
    setActive(index)
    const el = tabRefs.current[index]
    el?.focus()
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }

  // Стрелками влево/вправо переключаемся между табами (паттерн WAI-ARIA tabs)
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const dir = e.key === 'ArrowRight' ? 1 : -1
    focusTab((active + dir + tabs.length) % tabs.length)
  }

  return (
    <>
      <ExampleLinks docKey={DOC_KEY} />

      {intro.map((section) => renderSection(section))}

      {tabs.length > 0 && (
        <div className={style.tabs}>
          <div className={style.tabbar}>
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              className={`${style.scrollBtn} ${style.scrollLeft} ${overflow.left ? style.scrollVisible : ''}`}
              onClick={() => scrollByDir(-1)}
            >
              <Chevron dir="left" />
            </button>

            <div ref={tablistRef} className={style.tablist} role="tablist" aria-label={doc.title} onScroll={updateOverflow}>
              {tabs.map((section, index) => {
                const { num, label } = parseTitle(section.title)
                const selected = index === active
                return (
                  <button
                    key={section.id}
                    ref={(el) => {
                      tabRefs.current[index] = el
                    }}
                    type="button"
                    role="tab"
                    id={`pa-tab-${section.id}`}
                    aria-selected={selected}
                    aria-controls={`pa-panel-${section.id}`}
                    tabIndex={selected ? 0 : -1}
                    className={`${style.tab} ${selected ? style.tabActive : ''}`}
                    onClick={() => setActive(index)}
                    onKeyDown={onTabKeyDown}
                  >
                    {num && <span className={style.num}>{num}</span>}
                    {label}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              className={`${style.scrollBtn} ${style.scrollRight} ${overflow.right ? style.scrollVisible : ''}`}
              onClick={() => scrollByDir(1)}
            >
              <Chevron dir="right" />
            </button>
          </div>

          {activeSection && (
            <div
              key={activeSection.id}
              className={style.panel}
              role="tabpanel"
              id={`pa-panel-${activeSection.id}`}
              aria-labelledby={`pa-tab-${activeSection.id}`}
              tabIndex={0}
            >
              {renderSection(activeSection, false)}
            </div>
          )}
        </div>
      )}

      {tail.map((section) => renderSection(section))}
    </>
  )
}
