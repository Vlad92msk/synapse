import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Logo } from '@shared/components/ui/logo/Logo'
import { useDocumentation } from '@shared/hooks/useDocumentation'

import { LanguageSwitcher } from '../language-switcher/LanguageSwitcher'

import style from './Header.module.css'

const GITHUB_URL = 'https://github.com/Vlad92msk/synapse'

export const Header = () => {
  const { t } = useDocumentation()
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false)

  const toggleMenu = (isOpen: boolean) => {
    setIsMenuOpen(isOpen)
    if (typeof document !== 'undefined') document.body.style.overflow = isOpen ? 'hidden' : ''
  }

  const closeMenu = () => toggleMenu(false)

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
    <header className={`${style.header} ${isMenuOpen ? style.headerMenuOpen : ''}`}>
      {isMenuOpen && <div className={style.overlay} onClick={() => toggleMenu(false)} />}
      <div className={style.inner}>
        <Link to="/" className={style.brand} onClick={closeMenu}>
          <Logo size={26} />
          <span className={style.brandName}>Synapse</span>
          <span className={style.version}>v{__APP_VERSION__}</span>
        </Link>

        <div className={`${style.langWrap} ${style.langWrapDesktop}`}>
          <LanguageSwitcher />
        </div>

        <button className={`${style.burgerButton} ${isMenuOpen ? style.burgerActive : ''}`} onClick={() => toggleMenu(!isMenuOpen)} aria-label="Toggle navigation menu">
          <span></span>
          <span></span>
          <span></span>
        </button>

        <nav className={`${style.nav} ${isMenuOpen ? style.navOpen : ''}`}>
          <Link to="/" className={`${style.navLink} ${isActive('/') ? style.navLinkActive : ''}`} onClick={closeMenu}>
            {t('nav.home')}
          </Link>
          <Link to="/docs" className={`${style.navLink} ${isActive('/docs') ? style.navLinkActive : ''}`} onClick={closeMenu}>
            {t('nav.docs')}
          </Link>

          <a className={style.githubLink} href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.7.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17 4.7 18 5 18 5c.6 1.6.2 2.8.1 3.1.7.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 23.5 12C23.5 5.7 18.3.5 12 .5z" />
            </svg>
            GitHub
          </a>

          <Link to="/docs/install" className={style.cta} onClick={closeMenu}>
            {t('nav.getStarted')}
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 12h13M12 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>

          <div className={`${style.langWrap} ${style.langWrapMobile}`}>
            <LanguageSwitcher />
          </div>
        </nav>
      </div>
    </header>
  )
}
