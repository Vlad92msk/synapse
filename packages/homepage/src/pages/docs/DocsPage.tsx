import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useDocumentation } from '@shared/hooks'
import { Head } from 'vite-react-ssg'

import { DocsContent, DocsSidebar, sectionsList } from './components'
import { SECTION_LIST } from './components/docs-sidebar/data/list'

import style from './DocsPage.module.css'

const SITE = 'https://synapse-homepage.web.app'

const DEFAULT_SECTION = 'architecture'

export const DocsPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { section: sectionParam } = useParams()
  const { t } = useDocumentation()

  // Функция для получения полного ключа из короткого
  const getFullKeyFromShort = (shortKey: string): string => {
    for (const section of SECTION_LIST) {
      const item = section.items.find((item) => item.key === shortKey)
      if (item) {
        return `${section.titleKey}.${item.key}`
      }
    }
    return ''
  }

  // Проверяем, существует ли секция
  const isValidSection = (shortKey: string): boolean => {
    return SECTION_LIST.some((section) => section.items.some((item) => item.key === shortKey))
  }

  // Источник правды — path-параметр /docs/<section>. Так секция известна серверу
  // на этапе пререндера, и в статический HTML попадает именно нужный раздел.
  const activeSection = sectionParam && isValidSection(sectionParam) ? sectionParam : DEFAULT_SECTION

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Проверяем размер экрана
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768
      setIsMobile(mobile)
      setIsSidebarOpen(!mobile)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Совместимость со старыми ссылками /docs#<section> и канонизация /docs → /docs/<section>.
  useEffect(() => {
    if (location.hash) {
      const hashSection = location.hash.substring(1)
      if (isValidSection(hashSection)) {
        navigate(`/docs/${hashSection}`, { replace: true })
        return
      }
    }
    if (!sectionParam) {
      navigate(`/docs/${DEFAULT_SECTION}`, { replace: true })
    }
  }, [location.hash, sectionParam, navigate])

  // Навигацию делает сам <Link> в сайдбаре; здесь только закрываем мобильный сайдбар.
  const handleSectionChange = () => {
    if (isMobile) {
      setIsSidebarOpen(false)
    }
  }

  const handleOverlayClick = () => {
    if (isMobile) {
      setIsSidebarOpen(false)
    }
  }

  // Получаем полный ключ для передачи в DocsContent
  const fullKey = getFullKeyFromShort(activeSection)
  const currentSection = sectionsList[fullKey]

  const sectionTitle = fullKey ? t(fullKey) : 'Documentation'

  return (
    <>
      <Head>
        {/* Per-section title + canonical попадают в статический HTML пререндера. */}
        <title>{`${sectionTitle} · Synapse Storage`}</title>
        <link rel="canonical" href={`${SITE}/docs/${activeSection}`} />
      </Head>
      <div className={style.docs}>
        <button className={`${style.sidebarToggle} ${isSidebarOpen ? style.hidden : ''}`} onClick={() => setIsSidebarOpen(true)}>
          <span className={style.hamburger}>
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>

        {isMobile && isSidebarOpen && <div className={style.overlay} onClick={handleOverlayClick} />}

        <DocsSidebar activeSection={activeSection} onSectionChange={handleSectionChange} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} isMobile={isMobile} />

        <DocsContent section={currentSection} sectionKey={fullKey} isSidebarOpen={isSidebarOpen} isMobile={isMobile} />
      </div>
    </>
  )
}
