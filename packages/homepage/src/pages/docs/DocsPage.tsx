import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { DocsContent, DocsSidebar, sectionsList } from './components'
import { SECTION_LIST } from './components/docs-sidebar/data/list'

import style from './DocsPage.module.css'

export const DocsPage = () => {
  const navigate = useNavigate()
  const location = useLocation()

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

  // Получаем секцию из URL или хэша
  const getInitialSection = (): string => {
    // Сначала проверяем хэш
    if (location.hash) {
      const hashSection = location.hash.substring(1)
      if (isValidSection(hashSection)) {
        return hashSection
      }
    }

    // По умолчанию возвращаем первый элемент
    return 'memory'
  }

  const [activeSection, setActiveSection] = useState(getInitialSection())
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

  useEffect(() => {
    const newSection = getInitialSection()
    setActiveSection(newSection)
  }, [location.hash])

  // Устанавливаем роут по умолчанию при первой загрузке
  useEffect(() => {
    if (location.pathname === '/docs' && !location.hash) {
      navigate('/docs#memory', { replace: true })
    }
  }, [location.pathname, location.hash, navigate])

  // Обработка изменения секции
  const handleSectionChange = (section: string) => {
    setActiveSection(section)
    // Обновляем URL с хэшем
    navigate(`/docs#${section}`, { replace: true })

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

  return (
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
  )
}
