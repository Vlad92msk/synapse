import { Button } from '@shared/components/ui/button/Button'
import { useDocumentation } from '@shared/hooks'

import { SECTION_LIST } from './data/list'

import style from './DocsSidebar.module.css'

interface DocsSidebarProps {
  activeSection: string
  onSectionChange: (section: string) => void
  isOpen: boolean
  onClose: VoidFunction
  isMobile: boolean
}

export const DocsSidebar = (props: DocsSidebarProps) => {
  const { activeSection, onSectionChange, isOpen, onClose, isMobile } = props
  const { t } = useDocumentation()

  return (
    <div className={`${style.sidebar} ${isOpen ? style.open : style.closed}`}>
      <div className={style.header}>
        {isMobile && (
          <button className={style.closeButton} onClick={onClose} title="Закрыть навигацию" aria-label="Закрыть навигацию">
            <span className={style.closeIcon}>×</span>
          </button>
        )}
      </div>

      <div className={style.nav}>
        {SECTION_LIST.map((section) => (
          <div key={section.titleKey} className={style.section}>
            <h3 className={style.sectionTitle}>{t(section.titleKey)}</h3>
            <ul className={style.sectionList}>
              {section.items.map((item) => {
                const fullKey = `${section.titleKey}.${item.key}`
                const isActive = activeSection === item.key

                return (
                  <li key={item.key} className={style.sectionItem}>
                    <Button onClick={() => onSectionChange(item.key)} className={`${style.navButton} ${isActive ? style.active : ''}`} aria-current={isActive ? 'page' : undefined}>
                      {t(fullKey)}
                    </Button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
