import { Paragraph as ParagraphType } from '../../../../src/types/docs'
import { FormattedSegment } from './formatted-segment'
import { createFormattedSegments } from './utils/create-formatted-segments'

export interface ParagraphProps {
  data: ParagraphType
}

export const Paragraph = (props: ParagraphProps) => {
  const { data } = props
  const { text, formatting } = data

  if (!formatting || Object.values(formatting).every((arr) => (arr as any[]).length === 0)) {
    // Нет форматирования - простой текст
    return <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
  }

  // Создаем массив сегментов для рендеринга
  const segments = createFormattedSegments(text, formatting)

  return (
    <p style={{ whiteSpace: 'pre-wrap' }}>
      {segments.map((segment, index) => (
        <FormattedSegment key={index} segment={segment} />
      ))}
    </p>
  )
}
