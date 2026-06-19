import { ListItem } from '@models/docs'

export function groupConsecutiveItems(items: ListItem[]) {
  const groups: Array<{ type: 'ordered' | 'unordered'; items: ListItem[] }> = []
  let currentGroup: { type: 'ordered' | 'unordered'; items: ListItem[] } | null = null

  items.forEach((item) => {
    if (!currentGroup || currentGroup.type !== item.type) {
      currentGroup = { type: item.type, items: [item] }
      groups.push(currentGroup)
    } else {
      currentGroup.items.push(item)
    }
  })

  return groups
}
