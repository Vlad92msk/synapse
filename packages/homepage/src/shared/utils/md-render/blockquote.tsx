import { Blockquote as BlockquoteType } from '../../../../src/types/docs'
import { Block } from './block'

import style from './blockquote.module.css'

export interface BlockquoteProps {
  data: BlockquoteType
}

export const Blockquote = (props: BlockquoteProps) => {
  const { data } = props

  const getBlockquoteClasses = () => {
    const baseClass = style['markdown-blockquote'] || style.markdownBlockquote
    const typeClass = data.type ? style[`blockquote-${data.type}`] || style[`blockquote${data.type.charAt(0).toUpperCase() + data.type.slice(1)}`] : ''

    // Возвращаем объединенные классы, фильтруя пустые
    return [baseClass, typeClass].filter(Boolean).join(' ')
  }

  return (
    <blockquote className={getBlockquoteClasses()}>
      {data.content.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </blockquote>
  )
}
