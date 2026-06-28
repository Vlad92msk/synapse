import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDocumentation } from '@shared/hooks/useDocumentation'

import { LanguageSwitcher } from '../language-switcher/LanguageSwitcher'

import style from './Header.module.css'

const GITHUB_URL = 'https://github.com/Vlad92msk/synapse'

const LogoMark = () => (
  <svg viewBox="0 0 32 32" width="26" height="26" fill="none" style={{ flex: 'none' }}>
    <path d="M16 16 L7 8 M16 16 L25 9 M16 16 L21 25" stroke="var(--text-muted)" strokeWidth="1.5" />
    <circle cx="16" cy="16" r="4.6" fill="var(--accent-orange)" />
    <circle cx="7" cy="8" r="2.4" fill="var(--text-secondary)" />
    <circle cx="25" cy="9" r="2.4" fill="var(--text-secondary)" />
    <circle cx="21" cy="25" r="2.4" fill="var(--text-secondary)" />
  </svg>
)

export const Header = () => {
  const { t } = useDocumentation()
  const navigate = useNavigate()
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false)

  const toggleMenu = (isOpen: boolean) => {
    setIsMenuOpen(isOpen)
    document.body.style.overflow = isOpen ? 'hidden' : ''
  }

  const handleNavClick = (path: string) => {
    navigate(path)
    toggleMenu(false)
  }

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 800) toggleMenu(false)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    if (path === '/docs') return location.pathname.startsWith('/docs')
    return false
  }

  return (
    <header className={style.header}>
      {isMenuOpen && <div className={style.overlay} onClick={() => toggleMenu(false)} />}
      <div className={style.inner}>
        <div className={style.brand} onClick={() => handleNavClick('/')}>
          <LogoMark />
          <span className={style.brandName}>Synapse</span>
          <span className={style.version}>v{__APP_VERSION__}</span>
        </div>

        <div className={`${style.langWrap} ${style.langWrapDesktop}`}>
          <LanguageSwitcher />
        </div>

        <button className={`${style.burgerButton} ${isMenuOpen ? style.burgerActive : ''}`} onClick={() => toggleMenu(!isMenuOpen)} aria-label="Toggle navigation menu">
          <span></span>
          <span></span>
          <span></span>
        </button>

        <nav className={`${style.nav} ${isMenuOpen ? style.navOpen : ''}`}>
          <span className={`${style.navLink} ${isActive('/') ? style.navLinkActive : ''}`} onClick={() => handleNavClick('/')}>
            {t('nav.home')}
          </span>
          <span className={`${style.navLink} ${isActive('/docs') ? style.navLinkActive : ''}`} onClick={() => handleNavClick('/docs')}>
            {t('nav.docs')}
          </span>

          <a className={style.githubLink} href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.7.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17 4.7 18 5 18 5c.6 1.6.2 2.8.1 3.1.7.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 23.5 12C23.5 5.7 18.3.5 12 .5z" />
            </svg>
            GitHub
          </a>

          <span className={style.cta} onClick={() => handleNavClick('/docs#install')}>
            {t('nav.getStarted')}
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 12h13M12 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>

          <div className={`${style.langWrap} ${style.langWrapMobile}`}>
            <LanguageSwitcher />
          </div>

        </nav>
      </div>
    </header>
  )
}
