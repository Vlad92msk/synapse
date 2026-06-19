import { useTranslation } from 'react-i18next'

import styles from './LanguageSwitcher.module.css'

export const LanguageSwitcher = () => {
  const { i18n } = useTranslation()

  const switchLanguage = (locale: 'ru' | 'en') => {
    i18n.changeLanguage(locale)
    localStorage.setItem('preferred-locale', locale)
  }

  return (
    <div className={styles.switcher}>
      <button onClick={() => switchLanguage('ru')} className={`${styles.button} ${i18n.language === 'ru' ? styles.active : styles.inactive}`}>
        ru
      </button>
      <button onClick={() => switchLanguage('en')} className={`${styles.button} ${i18n.language === 'en' ? styles.active : styles.inactive}`}>
        en
      </button>
    </div>
  )
}
