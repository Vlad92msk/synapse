import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { Locale } from '@models/docs'

import { searchDocs, type SearchResult } from './searchIndex'

import style from './DocsSearch.module.css'

// Подсветка вхождений запроса в произвольной строке (для заголовка результата).
function highlight(text: string, query: string) {
  const q = query.trim()
  if (!q) return text

  const parts: Array<string | { mark: string }> = []
  const lower = text.toLowerCase()
  const lowerQ = q.toLowerCase()
  let from = 0
  let idx = lower.indexOf(lowerQ)

  while (idx >= 0) {
    if (idx > from) parts.push(text.slice(from, idx))
    parts.push({ mark: text.slice(idx, idx + q.length) })
    from = idx + q.length
    idx = lower.indexOf(lowerQ, from)
  }
  if (from < text.length) parts.push(text.slice(from))

  return parts.map((part, i) =>
    typeof part === 'string' ? (
      <Fragment key={i}>{part}</Fragment>
    ) : (
      <mark key={i} className={style.mark}>
        {part.mark}
      </mark>
    ),
  )
}

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
)

const SearchModal = ({ onClose }: { onClose: () => void }) => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const locale = i18n.language as Locale

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const results = useMemo(() => searchDocs(query, locale), [query, locale])

  // Автофокус на инпут при открытии.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Сброс активного элемента при смене выдачи.
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // Держим активный результат в зоне видимости.
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const active = list.children[activeIndex] as HTMLElement | undefined
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const goTo = (result: SearchResult) => {
    onClose()
    // Раздел известен серверу через path-параметр, под-секция — через state
    // (не hash: чтобы не конфликтовать с канонизацией /docs#<section> в DocsPage).
    navigate(`/docs/${result.shortKey}`, { state: { docsAnchor: result.sectionId } })
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const result = results[activeIndex]
      if (result) goTo(result)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  const showEmpty = query.trim().length >= 2 && results.length === 0

  return createPortal(
    <div className={style.overlay} onMouseDown={onClose} role="presentation">
      <div className={style.panel} role="dialog" aria-modal="true" aria-label={t('search.placeholder')} onMouseDown={(e) => e.stopPropagation()}>
        <div className={style.inputRow}>
          <span className={style.inputIcon}>
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            className={style.input}
            type="text"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="docs-search-results"
            aria-autocomplete="list"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className={style.escHint}>esc</kbd>
        </div>

        {results.length > 0 && (
          <ul className={style.results} id="docs-search-results" role="listbox" ref={listRef}>
            {results.map((result, index) => (
              <li
                key={`${result.docKey}#${result.sectionId}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`${style.result} ${index === activeIndex ? style.resultActive : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  goTo(result)
                }}
              >
                <div className={style.resultHead}>
                  <span className={style.resultTitle}>{highlight(result.sectionTitle, query)}</span>
                  <span className={style.resultDoc}>{result.docTitle}</span>
                </div>
                {result.snippet && (
                  <div className={style.resultSnippet}>
                    {result.snippet.before}
                    <mark className={style.mark}>{result.snippet.match}</mark>
                    {result.snippet.after}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {showEmpty && <div className={style.empty}>{t('search.noResults')}</div>}

        <div className={style.footer}>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {t('search.hint.navigate')}
          </span>
          <span>
            <kbd>↵</kbd> {t('search.hint.open')}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export const DocsSearch = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  // Глобальный хоткей Cmd/Ctrl+K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Блокируем прокрутку страницы под модалкой.
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [open])

  return (
    <>
      <button type="button" className={style.trigger} onClick={() => setOpen(true)} aria-label={t('search.placeholder')}>
        <span className={style.triggerIcon}>
          <SearchIcon />
        </span>
        <span className={style.triggerText}>{t('search.placeholder')}</span>
        <kbd className={style.triggerKbd}>⌘K</kbd>
      </button>

      {open && <SearchModal onClose={() => setOpen(false)} />}
    </>
  )
}
