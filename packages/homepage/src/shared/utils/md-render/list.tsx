import { ContentBlock, ListItem } from '@models/docs'

import { Block } from './block'
import { groupConsecutiveItems } from './utils/group-consecutive-Items'

export interface ListProps {
  data: ListItem[]
}

export const List = (props: ListProps) => {
  const { data } = props

  const renderListItemContent = (content: ContentBlock[] | string) => {
    // Если контент - строка (для task lists или простых элементов)
    if (typeof content === 'string') {
      return <span dangerouslySetInnerHTML={{ __html: content }} />
    }

    // Если контент - массив блоков (с форматированием)
    return (
      <>
        {content.map((block, index) => (
          <Block key={index} block={block} />
        ))}
      </>
    )
  }

  const renderList = (items: ListItem[], level: number = 0) => {
    // Группируем элементы по типу для правильного рендеринга
    const groupedItems = groupConsecutiveItems(items)

    return (
      <div style={{ margin: level === 0 ? '1rem 0' : '0.5rem 0' }}>
        {groupedItems.map((group, groupIndex) => {
          const ListTag = group.type === 'ordered' ? 'ol' : 'ul'

          return (
            <ListTag key={groupIndex} style={{ paddingLeft: '2rem' }}>
              {group.items.map((item, index) => {
                // Проверяем, является ли это task item
                if (typeof item.checked === 'boolean') {
                  return (
                    <li
                      key={index}
                      style={{
                        marginBottom: '0.5rem',
                        listStyle: 'none',
                      }}
                    >
                      <input type="checkbox" checked={item.checked} disabled style={{ marginRight: '0.5rem' }} />
                      <span
                        style={{
                          textDecoration: item.checked ? 'line-through' : 'none',
                          color: item.checked ? '#888' : 'inherit',
                        }}
                      >
                        {renderListItemContent(item.content)}
                      </span>
                    </li>
                  )
                }

                // Обычный элемент списка
                return (
                  <li key={index} style={{ marginBottom: '0.5rem' }}>
                    {renderListItemContent(item.content)}
                    {item.children && renderList(item.children, level + 1)}
                  </li>
                )
              })}
            </ListTag>
          )
        })}
      </div>
    )
  }

  return renderList(data)
}
