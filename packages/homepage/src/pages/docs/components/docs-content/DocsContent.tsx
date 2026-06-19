import { ReactNode, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
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

  const contentRef = useRef<HTMLDivElement>(null)
  console.log('contentRef', contentRef)
  useEffect(() => {
    console.log('contentRef', contentRef)
    contentRef.current?.scrollTo({
      behavior: 'smooth',
      top: 0,
    })
  }, [sectionKey])

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
                <button onClick={() => navigate('/docs#description')} className={style.placeholderButton}>
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
