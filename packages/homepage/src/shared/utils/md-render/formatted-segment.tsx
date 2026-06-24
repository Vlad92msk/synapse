interface FormattedSegmentProps {
  segment: any
}

// Компонент для рендеринга форматированного сегмента
export const FormattedSegment = (props: FormattedSegmentProps) => {
  const { segment } = props

  let element = <span>{segment.text}</span>

  // Применяем форматирование слоями
  if (segment.bold) {
    element = <strong>{element}</strong>
  }

  if (segment.italic) {
    element = <em>{element}</em>
  }

  if (segment.code) {
    element = (
      <code
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
          padding: '1px 5px',
          borderRadius: '4px',
          fontFamily: "'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace",
          fontSize: '0.88em',
          color: '#ffd6cc',
        }}
      >
        {segment.text}
      </code>
    )
  }

  if (segment.link) {
    const url: string = segment.link.url || ''
    const isExternal = /^https?:\/\//.test(url)
    const isAnchor = url.startsWith('#')

    // Внутренние относительные ссылки (./foo.md и т.п.) на сайте ведут в никуда —
    // не делаем их кликабельными, чтобы не редиректить на несуществующую страницу.
    if (isExternal || isAnchor) {
      element = (
        <a href={url} title={segment.link.title} style={{ color: '#0080ff', textDecoration: 'none' }} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noopener noreferrer' : undefined}>
          {element}
        </a>
      )
    }
  }

  if (segment.strikethrough) {
    element = <del>{element}</del>
  }

  return element
}
