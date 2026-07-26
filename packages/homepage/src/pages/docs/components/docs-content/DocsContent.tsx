import { ReactNode, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDocumentation } from '@shared/hooks/useDocumentation'

import style from './DocsContent.module.css'

interface DocsContentProps {
  sectionKey: string
  section: ReactNode
  isSidebarOpen: boolean
  isMobile: boolean
}

export const DocsContent = (props: DocsContentProps) => {
  const { sectionKey, section, isSidebarOpen, isMobile } = props
  const { t } = useDocumentation()
  const navigate = useNavigate()
  const location = useLocation()

  const contentRef = useRef<HTMLDivElement>(null)
  // Переход из поиска кладёт целевую под-секцию в location.state.docsAnchor —
  // скроллим к ней; иначе (обычная смена раздела) — к началу страницы.
  const docsAnchor = (location.state as { docsAnchor?: string } | null)?.docsAnchor
  useEffect(() => {
    const container = contentRef.current
    if (!container) return

    if (docsAnchor) {
      const target = container.querySelector(`#${CSS.escape(docsAnchor)}`)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }

    container.scrollTo({ behavior: 'smooth', top: 0 })
  }, [sectionKey, docsAnchor, location.key])

  return (
    <div className={`${style.docsContent} ${isSidebarOpen && !isMobile ? style.withSidebar : style.fullWidth}`}>
      <div className={style.container} ref={contentRef}>
        <nav className={style.breadcrumb}>
          <span className={style.breadcrumbLink}>{t('nav.docs')}</span>
          <span className={style.breadcrumbSeparator} aria-hidden="true">
            /
          </span>
          <span className={style.breadcrumbCurrent} aria-current="page">
            {t(sectionKey)}
          </span>
        </nav>

        <main className={style.content}>
          {section || (
            <div className={style.placeholder}>
              <div className={style.placeholderIcon} aria-hidden="true">
                📝
              </div>
              <h2>{t('docs.placeholder.title')}</h2>
              <p>{t('docs.placeholder.description')}</p>
              <div className={style.placeholderActions}>
                <button onClick={() => navigate('/docs/architecture')} className={style.placeholderButton}>
                  {t('docs.placeholder.backToStart')}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
