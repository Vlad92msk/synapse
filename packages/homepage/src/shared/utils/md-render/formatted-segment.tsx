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
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          padding: '3px 6px',
          borderRadius: '4px',
          fontFamily: "'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace",
          fontSize: '0.9em',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          color: '#ffd6cc',
        }}
      >
        {segment.text}
      </code>
    )
  }

  if (segment.link) {
    element = (
      <a
        href={segment.link.url}
        title={segment.link.title}
        style={{ color: '#0080ff', textDecoration: 'none' }}
        target={segment.link.url.startsWith('http') ? '_blank' : undefined}
        rel={segment.link.url.startsWith('http') ? 'noopener noreferrer' : undefined}
      >
        {element}
      </a>
    )
  }

  if (segment.strikethrough) {
    element = <del>{element}</del>
  }

  return element
}
