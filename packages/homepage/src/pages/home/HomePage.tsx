import { CSSProperties, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDocumentation } from '@shared/hooks/useDocumentation'

import { FEATURES } from './data/features'
import { PILLARS } from './data/pillars'

import style from './HomePage.module.css'

const GITHUB_URL = 'https://github.com/Vlad92msk/synapse'
const NPM_URL = 'https://www.npmjs.com/package/synapse-storage'

/* ─── Иконки (inline SVG из дизайна) ─────────────────────────────────────── */

const ArrowRight = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M5 12h13M12 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Check = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4">
    <path d="M5 12.5l4 4 10-10.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const GithubIcon = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.7.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17 4.7 18 5 18 5c.6 1.6.2 2.8.1 3.1.7.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 23.5 12C23.5 5.7 18.3.5 12 .5z" />
  </svg>
)

const Logo = ({ size = 26 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} fill="none" style={{ flex: 'none' }}>
    <path d="M16 16 L7 8 M16 16 L25 9 M16 16 L21 25" stroke="var(--text-muted)" strokeWidth="1.5" />
    <circle cx="16" cy="16" r="4.6" fill="var(--accent-orange)" />
    <circle cx="7" cy="8" r="2.4" fill="var(--text-secondary)" />
    <circle cx="25" cy="9" r="2.4" fill="var(--text-secondary)" />
    <circle cx="21" cy="25" r="2.4" fill="var(--text-secondary)" />
  </svg>
)

// Иконки трёх блоков (pillars), по ключу i18n
const PILLAR_ICONS: Record<string, ReactNode> = {
  'homepage.pillars.state': (
    <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.5">
      <ellipse cx="12" cy="5" rx="7.5" ry="3" />
      <path d="M4.5 5v6.5c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V5" />
      <path d="M4.5 11.5V18c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6.5" />
    </svg>
  ),
  'homepage.pillars.bll': (
    <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3z" strokeLinejoin="round" />
      <path d="M3 12.5l9 4.5 9-4.5" strokeLinejoin="round" />
      <path d="M3 17l9 4.5 9-4.5" strokeLinejoin="round" />
    </svg>
  ),
  'homepage.pillars.api': (
    <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 4H7a2 2 0 0 0-2 2v3.5a2 2 0 0 1-2 2 2 2 0 0 1 2 2V17a2 2 0 0 0 2 2h1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 4h1a2 2 0 0 1 2 2v3.5a2 2 0 0 0 2 2 2 2 0 0 0-2 2V17a2 2 0 0 1-2 2h-1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

// Иконки сквозных особенностей (features), по ключу i18n
const FEATURE_ICONS: Record<string, ReactNode> = {
  'homepage.features.frameworkAgnostic': (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2.5 4 7v10l8 4.5 8-4.5V7l-8-4.5z" strokeLinejoin="round" />
      <path d="M4 7l8 4.5L20 7M12 11.5V21.5" strokeLinejoin="round" />
    </svg>
  ),
  'homepage.features.typescript': (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 6l-5 6 5 6M16 6l5 6-5 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  'homepage.features.storageChoice': (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M7 4 3 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 8h13" strokeLinecap="round" />
      <path d="M17 20l4-4-4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 16H8" strokeLinecap="round" />
    </svg>
  ),
  'homepage.features.middlewares': (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 6h8M4 12h2M4 18h10" strokeLinecap="round" />
      <path d="M20 6h-2M20 12h-8M20 18h-2" strokeLinecap="round" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="16" cy="18" r="2" />
    </svg>
  ),
  'homepage.features.broadcast': (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="2" />
      <path d="M7.5 7.5a6.5 6.5 0 0 0 0 9M16.5 7.5a6.5 6.5 0 0 1 0 9M4.5 4.5a10.5 10.5 0 0 0 0 15M19.5 4.5a10.5 10.5 0 0 1 0 15" strokeLinecap="round" />
    </svg>
  ),
  'homepage.features.ssr': (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01" strokeLinecap="round" />
    </svg>
  ),
}

/* ─── Раскладка «веера» карточек ──────────────────────────────────────────── */

interface FanItem {
  rest: string
  z: number
  marginLeft: number
  highlight?: boolean
}

const PILLARS_FAN: FanItem[] = [
  { rest: 'rotate(-7deg) translateY(6px)', z: 3, marginLeft: 0 },
  { rest: 'rotate(0deg) translateY(-12px) scale(1.03)', z: 9, marginLeft: -56, highlight: true },
  { rest: 'rotate(7deg) translateY(6px)', z: 3, marginLeft: -56 },
]

const FEATURES_FAN: FanItem[] = [
  { rest: 'rotate(-12deg) translateY(-2px)', z: 2, marginLeft: 0 },
  { rest: 'rotate(-7deg) translateY(9px)', z: 4, marginLeft: -66 },
  { rest: 'rotate(-1.5deg) translateY(-10px) scale(1.04)', z: 9, marginLeft: -66, highlight: true },
  { rest: 'rotate(3.5deg) translateY(10px)', z: 5, marginLeft: -66 },
  { rest: 'rotate(8deg) translateY(6px)', z: 3, marginLeft: -66 },
  { rest: 'rotate(12.5deg) translateY(-2px)', z: 1, marginLeft: -66 },
]

// Кастомные CSS-переменные веера для inline-стиля
const fanStyle = (fan: FanItem): CSSProperties =>
  ({
    '--rest': fan.rest,
    transform: 'var(--rest)',
    zIndex: fan.z,
    marginLeft: fan.marginLeft,
  }) as CSSProperties

const ARCHITECTURE_TAGS: Record<'layer1' | 'layer2', string[]> = {
  layer1: ['MemoryStorage', 'LocalStorage', 'IndexedDBStorage', 'IStorage', 'Selectors'],
  layer2: ['Dispatcher', 'Effects', 'createSynapse', 'React-хуки'],
}

export const HomePage = () => {
  const { t } = useDocumentation()
  const navigate = useNavigate()

  const goDocs = (hash: string) => navigate(`/docs#${hash}`)

  return (
    <div className={style.homepage}>
      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <section className={style.hero}>
        <div className={style.heroOrb} aria-hidden="true" />
        <div className={style.container}>
          <div className={style.heroInner}>
            <div className={style.badge}>
              <span className={style.badgeDot} />
              {t('homepage.hero.badge')}
            </div>
            <h1 className={style.heroTitle}>
              {t('homepage.hero.heading')}
              <br />
              <span className={style.heroTitleMuted}>{t('homepage.hero.headingAccent')}</span>
            </h1>
            <p className={style.heroSubtitle}>{t('homepage.hero.subtitle')}</p>
            <div className={style.heroActions}>
              <button type="button" className={style.btnPrimary} onClick={() => goDocs('architecture')}>
                {t('homepage.hero.readDocs')}
                <ArrowRight />
              </button>
              <a className={style.btnGhost} href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                <GithubIcon size={17} />
                GitHub
              </a>
            </div>
            <div className={style.heroTags}>
              <span className={style.tag}>{t('homepage.hero.tag1')}</span>
              <span className={style.tag}>{t('homepage.hero.tag2')}</span>
              <span className={style.tag}>{t('homepage.hero.tag3')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Три блока (pillars) ──────────────────────────────────────────── */}
      <section className={style.section}>
        <div className={style.container}>
          <div className={style.eyebrow}>{t('homepage.pillars.eyebrow')}</div>
          <h2 className={style.sectionTitle}>{t('homepage.pillars.heading')}</h2>
        </div>
        <div className={style.fanScroll}>
          <div className={style.fanRow}>
            {PILLARS.map((pillar, i) => {
              const fan = PILLARS_FAN[i % PILLARS_FAN.length]
              return (
                <article key={pillar.key} className={`${style.fanCard} ${style.pillarCard} ${fan.highlight ? style.fanHighlight : ''}`} style={fanStyle(fan)}>
                  <div className={style.cardIcon}>{PILLAR_ICONS[pillar.key]}</div>
                  <div className={style.cardWhen}>{t(`${pillar.key}.when`)}</div>
                  <h3 className={style.cardTitle}>{t(`${pillar.key}.name`)}</h3>
                  <p className={style.cardText}>{t(`${pillar.key}.tagline`)}</p>
                  <ul className={style.cardList}>
                    {Array.from({ length: pillar.points }).map((_, p) => (
                      <li key={p}>
                        <span className={style.checkIcon}>
                          <Check />
                        </span>
                        {t(`${pillar.key}.point${p + 1}`)}
                      </li>
                    ))}
                  </ul>
                  <div className={style.cardFooter}>
                    <code className={style.cardImport}>{pillar.importPath.replace(/^import .*from '/, '').replace(/'$/, '')}</code>
                    <button type="button" className={style.cardLink} onClick={() => goDocs(pillar.docHash)}>
                      {t('homepage.pillars.section')}
                      <ArrowRight />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─── Почему Synapse (features) ────────────────────────────────────── */}
      <section className={style.section}>
        <div className={style.container}>
          <div className={style.eyebrow}>{t('homepage.features.eyebrow')}</div>
          <h2 className={style.sectionTitle}>{t('homepage.features.heading')}</h2>
        </div>
        <div className={style.fanScroll}>
          <div className={style.fanRow}>
            {FEATURES.map((feature, i) => {
              const fan = FEATURES_FAN[i % FEATURES_FAN.length]
              return (
                <div key={feature.key} className={`${style.fanCard} ${style.featureCard} ${fan.highlight ? style.fanHighlight : ''}`} style={fanStyle(fan)}>
                  <div className={style.featureIcon}>{FEATURE_ICONS[feature.key]}</div>
                  <h4 className={style.featureTitle}>{t(`${feature.key}.title`)}</h4>
                  <p className={style.featureText}>{t(`${feature.key}.description`)}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─── Архитектура ──────────────────────────────────────────────────── */}
      <section className={style.containerSection}>
        <div className={style.archPanel}>
          <div className={style.eyebrow}>{t('homepage.architecture.eyebrow')}</div>
          <h2 className={style.panelTitle}>{t('homepage.architecture.heading')}</h2>
          <p className={style.panelText}>{t('homepage.architecture.intro')}</p>
          <div className={style.archGrid}>
            {(['layer1', 'layer2'] as const).map((layer) => (
              <div key={layer} className={style.archCard}>
                <div className={style.archHead}>
                  <span className={style.archBadge}>{t(`homepage.architecture.${layer}`)}</span>
                  <span className={style.archName}>{t(`homepage.architecture.${layer}Name`)}</span>
                </div>
                <p className={style.archDesc}>{t(`homepage.architecture.${layer}Desc`)}</p>
                <div className={style.archTags}>
                  {ARCHITECTURE_TAGS[layer].map((tag) => (
                    <span key={tag} className={style.archTag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className={style.archMore}>
            <button type="button" className={style.linkArrow} onClick={() => goDocs('architecture')}>
              {t('homepage.architecture.more')}
              <ArrowRight />
            </button>
          </div>
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────────────────── */}
      <section className={style.containerSection}>
        <div className={style.ctaPanel}>
          <div className={style.ctaOrb} aria-hidden="true" />
          <div className={style.ctaInner}>
            <h2 className={style.ctaTitle}>{t('homepage.cta.heading')}</h2>
            <p className={style.ctaText}>{t('homepage.cta.text')}</p>
            <div className={style.ctaActions}>
              <button type="button" className={style.btnPrimary} onClick={() => goDocs('install')}>
                {t('homepage.cta.install')}
                <ArrowRight />
              </button>
              <a className={style.btnGhost} href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────────────────────── */}
      <footer className={style.footer}>
        <div className={style.footerInner}>
          <Logo size={22} />
          <span className={style.footerBrand}>Synapse</span>
          <div className={style.footerLinks}>
            <button type="button" className={style.footerLink} onClick={() => goDocs('architecture')}>
              {t('nav.docs')}
            </button>
            <a className={style.footerLink} href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a className={style.footerLink} href={NPM_URL} target="_blank" rel="noopener noreferrer">
              npm
            </a>
          </div>
          <span className={style.footerCopy}>MIT © 2026 synapse-storage</span>
        </div>
      </footer>
    </div>
  )
}
