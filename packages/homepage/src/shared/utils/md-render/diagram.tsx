import { useCallback, useEffect, useRef, useState } from 'react'
import type { MermaidConfig } from 'mermaid'

import styles from './diagram.module.css'

// Ленивая загрузка Mermaid - экономим ~800KB!
const loadMermaid = async () => {
  const mermaidModule = await import('mermaid')
  return mermaidModule.default
}

export interface DiagramProps {
  code: string
  title?: string
  config?: Partial<MermaidConfig>
  className?: string
  theme?: 'default' | 'dark' | 'neutral'
  onError?: (error: Error) => void
}

// Скелетон для загрузки
const DiagramSkeleton = () => (
  <div className={styles.skeleton}>
    <div className={styles.skeletonContent}>
      <div className={styles.skeletonBox} />
      <div className={styles.skeletonLine} />
      <div className={styles.skeletonBox} />
    </div>
  </div>
)

export const Diagram = (props: DiagramProps) => {
  const { code, title, config, className = '', theme = 'default', onError } = props

  const elementRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [mermaid, setMermaid] = useState<any>(null)

  // Загружаем Mermaid один раз
  useEffect(() => {
    loadMermaid()
      .then((mermaidInstance) => {
        setMermaid(mermaidInstance)
        setIsLoading(false)
      })
      .catch((err) => {
        setError('Failed to load Mermaid library')
        setIsLoading(false)
        onError?.(err)
      })
  }, [onError])

  // Конфигурация по умолчанию
  const defaultConfig: Partial<MermaidConfig> = {
    startOnLoad: false,
    theme,
    securityLevel: 'loose',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    ...config,
  }

  // Рендеринг диаграммы
  const renderDiagram = useCallback(async () => {
    if (!mermaid || !elementRef.current || !code.trim()) return

    try {
      setError(null)

      // Инициализируем с конфигом
      mermaid.initialize(defaultConfig)

      // Уникальный ID для диаграммы
      const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      // Валидируем синтаксис
      const isValid = await mermaid.parse(code)
      if (!isValid) {
        throw new Error('Invalid Mermaid syntax')
      }

      // Рендерим диаграмму
      const { svg } = await mermaid.render(id, code)

      if (elementRef.current) {
        elementRef.current.innerHTML = svg

        // Добавляем обработчики для интерактивности
        const svgElement = elementRef.current.querySelector('svg')
        if (svgElement) {
          svgElement.style.maxWidth = '100%'
          svgElement.style.height = 'auto'
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to render diagram'
      setError(errorMessage)
      onError?.(err instanceof Error ? err : new Error(errorMessage))
      console.error('Mermaid rendering error:', err)
    }
  }, [mermaid, code, defaultConfig, onError])

  // Рендерим диаграмму при изменении кода
  useEffect(() => {
    if (mermaid && !isLoading) {
      renderDiagram()
    }
  }, [mermaid, code, isLoading, renderDiagram])

  // Retry функция
  const handleRetry = () => {
    setError(null)
    renderDiagram()
  }

  // Копирование SVG
  const handleCopySvg = async () => {
    if (!elementRef.current) return

    const svgElement = elementRef.current.querySelector('svg')
    if (!svgElement) return

    try {
      const svgString = new XMLSerializer().serializeToString(svgElement)
      await navigator.clipboard.writeText(svgString)
    } catch (err) {
      console.error('Failed to copy SVG:', err)
    }
  }

  if (isLoading) {
    return (
      <div className={`${styles.container} ${className}`}>
        {title && <h4 className={styles.title}>{title}</h4>}
        <DiagramSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${styles.container} ${styles.error} ${className}`}>
        {title && <h4 className={styles.title}>{title}</h4>}
        <div className={styles.errorContainer}>
          <div className={styles.errorIcon}>⚠️</div>
          <div className={styles.errorMessage}>
            <strong>Diagram Rendering Error</strong>
            <p>{error}</p>
          </div>
          <button className={styles.retryButton} onClick={handleRetry} aria-label="Retry rendering diagram">
            🔄 Retry
          </button>
        </div>

        <details className={styles.errorDetails}>
          <summary>Show diagram code</summary>
          <pre className={styles.errorCode}>{code}</pre>
        </details>
      </div>
    )
  }

  return (
    <div className={`${styles.container} ${className}`}>
      {title && (
        <div className={styles.header}>
          <h4 className={styles.title}>{title}</h4>
          <div className={styles.actions}>
            <button className={styles.actionButton} onClick={handleCopySvg} title="Copy SVG" aria-label="Copy diagram as SVG">
              📋
            </button>
          </div>
        </div>
      )}

      <div className={styles.diagramContainer}>
        <div ref={elementRef} className={styles.diagramContent} role="img" aria-label={title || 'Mermaid diagram'} />
      </div>
    </div>
  )
}
