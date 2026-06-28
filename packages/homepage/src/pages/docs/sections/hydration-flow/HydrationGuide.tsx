import { useEffect, useState } from 'react'

import { CanvasView } from './CanvasView'
import { FlowView } from './FlowView'
import { Loc } from './steps'
import { loc, TXT, useGuideLang } from './text'

import style from './HydrationGuide.module.css'

type Variant = 'flow' | 'scroll'

const VARIANTS: { id: Variant; label: Loc }[] = [
  { id: 'flow', label: TXT.variantFlow },
  { id: 'scroll', label: TXT.variantScroll },
]

interface HydrationGuideProps {
  onClose: () => void
  /** Стартовый вариант отображения. */
  initialVariant?: Variant
}

export const HydrationGuide = ({ onClose, initialVariant = 'flow' }: HydrationGuideProps) => {
  const lang = useGuideLang()
  const [variant, setVariant] = useState<Variant>(initialVariant)

  // Esc закрывает + блокировка скролла фона (общая для обоих вариантов).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className={style.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label={loc(TXT.title, lang)}>
      <div className={style.modal} onClick={(e) => e.stopPropagation()}>
        <header className={style.header}>
          <div className={style.headTexts}>
            <h2 className={style.title}>{loc(TXT.title, lang)}</h2>
            <p className={style.subtitle}>{loc(TXT.subtitle, lang)}</p>
          </div>

          <div className={style.segmented} role="tablist">
            {VARIANTS.map(({ id, label }) => (
              <button key={id} className={`${style.segBtn} ${variant === id ? style.segActive : ''}`} onClick={() => setVariant(id)} role="tab" aria-selected={variant === id}>
                {loc(label, lang)}
              </button>
            ))}
          </div>
        </header>

        <div className={style.content}>
          {variant === 'flow' && <FlowView lang={lang} />}
          {variant === 'scroll' && <CanvasView lang={lang} />}
        </div>
      </div>
    </div>
  )
}
