import { JSX } from 'react'
import { ContentBlock } from '@models/docs'

import { CodeBlock } from '../../components/ui/code-block'
import { TableComponent } from '../../components/ui/table'
import { Blockquote } from './blockquote'
import { Diagram } from './diagram'
import { List } from './list'
import { Paragraph } from './paragraph'

interface BlockProps {
  block: ContentBlock
}

export const Block = (props: BlockProps) => {
  const { block } = props
  console.log('block', block)
  switch (block.type) {
    case 'paragraph':
      return <Paragraph data={block.data} />
    case 'code':
      return <CodeBlock children={block.data.code} language={block.data.language} filename={block.data.filename} showLineNumbers={false} />
    case 'table':
      return <TableComponent data={block.data} />
    case 'blockquote':
      return <Blockquote data={block.data} />
    case 'heading': {
      const HeadingTag = `h${block.data.level}` as keyof JSX.IntrinsicElements
      return <HeadingTag id={block.data.id}>{block.data.text}</HeadingTag>
    }
    case 'list':
      return <List data={block.data} />
    case 'taskList':
      return (
        <ul style={{ listStyle: 'none', paddingLeft: '0' }}>
          {block.data.map((item: any, index: number) => (
            <li key={index} style={{ marginBottom: '0.5rem' }}>
              <input type="checkbox" checked={item.checked} disabled style={{ marginRight: '0.5rem' }} />
              <span
                style={{
                  textDecoration: item.checked ? 'line-through' : 'none',
                  color: item.checked ? '#888' : 'inherit',
                }}
              >
                {item.content}
              </span>
            </li>
          ))}
        </ul>
      )
    case 'divider':
      return <hr />
    case 'diagram':
      return <Diagram code={block.data.code} title={block.data.title} />
    case 'break':
      return <br />
    case 'html':
      return <div dangerouslySetInnerHTML={{ __html: block.data.content }} />
    default:
      return null
  }
}
