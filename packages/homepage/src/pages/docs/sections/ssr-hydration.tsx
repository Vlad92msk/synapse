import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DocPage } from './doc-page'

import style from './ssr-hydration.module.css'

// Ленивый чанк: React Flow и весь интерактив грузятся только при открытии гайда.
const HydrationGuide = lazy(() => import('./hydration-flow').then((m) => ({ default: m.HydrationGuide })))

export const SsrHydrationPage = () => {
  const { i18n } = useTranslation()
  const ru = i18n.language === 'ru'
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className={style.infoCta} onClick={() => setOpen(true)}>
        <span className={style.infoIcon} aria-hidden="true">
          i
        </span>
        <span className={style.infoTexts}>
          <span className={style.infoTitle}>{ru ? 'Интерактивный разбор: как это работает' : 'Interactive walkthrough: how it works'}</span>
          <span className={style.infoSub}>
            {ru
              ? 'Пошаговая схема движения и трансформации данных сервер → клиент на примере покемонов.'
              : 'A step-by-step map of how data moves and transforms server → client, on the Pokémon example.'}
          </span>
        </span>
        <span className={style.infoArrow} aria-hidden="true">
          →
        </span>
      </button>

      <DocPage docKey="ssr-hydration" />

      {open && (
        <Suspense fallback={null}>
          <HydrationGuide onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
