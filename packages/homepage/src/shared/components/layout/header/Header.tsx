import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDocumentation } from '@shared/hooks/useDocumentation'

import logo from '../../../../../public/logo.webp'
import { Button } from '../../ui/button/Button'
import { LanguageSwitcher } from '../language-switcher/LanguageSwitcher'

import style from './Header.module.css'

export const Header = () => {
  const { t } = useDocumentation()
  const navigate = useNavigate()
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false)

  const toggleMenu = (isOpen: boolean) => {
    setIsMenuOpen(isOpen)

    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
  }

  // Обработка навигации
  const handleNavClick = (path: string) => {
    if (path === '/') {
      navigate('/')
    } else if (path === '/docs') {
      navigate('/docs')
    } else {
      navigate(path)
    }
    toggleMenu(false)
  }

  // Закрытие меню при изменении размера экрана
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 800) {
        toggleMenu(false)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Очистка overflow при размонтировании компонента
  useEffect(() => {
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Проверка активности пути
  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/'
    }
    if (path === '/docs') {
      return location.pathname.startsWith('/docs')
    }
    return false
  }

  return (
    <header className={style.header}>
      {isMenuOpen && <div className={style.overlay} onClick={() => toggleMenu(false)} />}
      <nav className={style.nav}>
        <Button onClick={() => handleNavClick('/')} className={style.logo}>
          <img src={logo} alt="Synapse" width={40} />
          Synapse Storage
        </Button>

        <button className={`${style.burgerButton} ${isMenuOpen ? style.burgerActive : ''}`} onClick={() => toggleMenu(!isMenuOpen)} aria-label="Toggle navigation menu">
          <span></span>
          <span></span>
          <span></span>
        </button>

        <ul className={`${style.navLinks} ${isMenuOpen ? style.navLinksOpen : ''}`}>
          <li>
            <Button
              onClick={() => handleNavClick('/')}
              className={isActive('/') ? style.active : ''}
              style={{
                background: 'none',
                color: isActive('/') ? '#00d4ff' : '#ffffff',
                backgroundColor: isActive('/') ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
              }}
            >
              {t('nav.home')}
            </Button>
          </li>
          <li>
            <Button
              onClick={() => handleNavClick('/docs')}
              className={isActive('/docs') ? style.active : ''}
              style={{
                background: 'none',
                color: isActive('/docs') ? '#00d4ff' : '#ffffff',
                textDecoration: 'none',
                fontWeight: 500,
                backgroundColor: isActive('/docs') ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
              }}
            >
              {t('nav.docs')}
            </Button>
          </li>
          <li>
            <a href="https://github.com/Vlad92msk/synapse" target="_blank" rel="noopener noreferrer" className={style.githubLink}>
              GitHub
            </a>
          </li>
        </ul>
        <LanguageSwitcher />
      </nav>
    </header>
  )
}
