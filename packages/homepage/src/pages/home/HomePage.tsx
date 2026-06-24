import { useNavigate } from 'react-router-dom'
import { Button } from '@shared/components/ui/button/Button'
import { useDocumentation } from '@shared/hooks/useDocumentation'

import { FEATURES } from './data/features'
import { PILLARS } from './data/pillars'

import style from './HomePage.module.css'

export const HomePage = () => {
  const { t } = useDocumentation()
  const navigate = useNavigate()

  const handleGetStarted = () => {
    navigate('/docs#architecture')
  }

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className={style.homepage}>
      <section className={style.hero}>
        <div className={style['hero-content']}>
          <h1 className={style.title}>Synapse</h1>
          <p className={style.subtitle}>{t('homepage.hero.subtitle')}</p>
          <div className={style['button-group']}>
            <Button onClick={handleGetStarted} type={'primary'} aria-label="Перейти к документации">
              {t('homepage.hero.getStarted')}
            </Button>
            <Button onClick={() => scrollTo('pillars')} type={'secondary'} aria-label="Три блока библиотеки">
              {t('homepage.hero.threeBlocks')}
            </Button>
          </div>
        </div>
      </section>

      <section id="pillars" className={style.section}>
        <h2 className={style['section-title']}>{t('homepage.pillars.title')}</h2>
        <p className={style['section-subtitle']}>{t('homepage.pillars.subtitle')}</p>
        <div className={style['pillars-grid']}>
          {PILLARS.map((pillar) => (
            <article key={pillar.key} className={style['pillar-card']}>
              <h3 className={style['pillar-name']}>{t(`${pillar.key}.name`)}</h3>
              <p className={style['pillar-when']}>{t(`${pillar.key}.when`)}</p>
              <p className={style['pillar-tagline']}>{t(`${pillar.key}.tagline`)}</p>
              <ul className={style['pillar-points']}>
                {Array.from({ length: pillar.points }).map((_, i) => (
                  <li key={i}>{t(`${pillar.key}.point${i + 1}`)}</li>
                ))}
              </ul>
              <code className={style['pillar-import']}>{pillar.importPath}</code>
              <Button onClick={() => navigate(`/docs#${pillar.docHash}`)} type={'secondary'} className={style['pillar-cta']}>
                {t('homepage.pillars.more')}
              </Button>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className={style.section}>
        <h2 className={style['section-title']}>{t('homepage.features.title')}</h2>
        <div className={style['features-grid']}>
          {FEATURES.map((feature) => (
            <div key={feature.key} className={style['feature-card']}>
              <h3>{t(`${feature.key}.title`)}</h3>
              <p>{t(`${feature.key}.description`)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
