import { useNavigate } from 'react-router-dom'
import { Button } from '@shared/components/ui/button/Button'
import { useDocumentation } from '@shared/hooks/useDocumentation'

import { FEATURES } from './data/features'

import style from './HomePage.module.css'

export const HomePage = () => {
  const { t } = useDocumentation()
  const navigate = useNavigate()

  const handleGetStarted = () => {
    // Переходим на документацию с секцией по умолчанию
    navigate('/docs#description')
  }

  const handleLearnMore = () => {
    document.getElementById('features')?.scrollIntoView({
      behavior: 'smooth',
    })
  }

  return (
    <div className={style.homepage}>
      <section className={style.hero}>
        <div className={style['hero-content']}>
          <h1 className={style.title}>Synapse Storage</h1>
          <p className={style.subtitle}>{t('homepage.hero.subtitle')}</p>
          <div className={style['button-group']}>
            <Button onClick={handleGetStarted} type={'primary'} aria-label="Перейти к документации">
              {t('homepage.hero.getStarted')}
            </Button>
            <Button onClick={handleLearnMore} type={'secondary'} aria-label="Узнать больше о возможностях">
              {t('homepage.hero.learnMore')}
            </Button>
          </div>
        </div>
      </section>

      <section id="features" className={style.section}>
        <h2 className={style['section-title']}>{t('homepage.features.title')}</h2>
        <div className={style['features-grid']}>
          {FEATURES.map((feature) => (
            <div key={feature.key} className={style['feature-card']}>
              <span className={style['feature-icon']} aria-hidden="true">
                {feature.icon}
              </span>
              <h3>{t(`${feature.key}.title`)}</h3>
              <p>{t(`${feature.key}.description`)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
