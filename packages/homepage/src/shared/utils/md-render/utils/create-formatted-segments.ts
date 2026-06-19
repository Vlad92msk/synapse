// Функция для создания сегментов с форматированием
export const createFormattedSegments = (text: string, formatting: any) => {
  if (!formatting || Object.values(formatting).every((arr) => (arr as any[]).length === 0)) {
    return [{ text }]
  }

  // Создаем массив всех границ форматирования
  const boundaries: Array<{ pos: number; type: 'start' | 'end'; format: any }> = []

  Object.entries(formatting).forEach(([type, formats]) => {
    ;(formats as any[]).forEach((format) => {
      boundaries.push({ pos: format.start, type: 'start', format: { ...format, formatType: type } })
      boundaries.push({ pos: format.end, type: 'end', format: { ...format, formatType: type } })
    })
  })

  // Сортируем границы по позиции
  boundaries.sort((a, b) => {
    if (a.pos !== b.pos) return a.pos - b.pos
    // При одинаковой позиции, сначала обрабатываем 'end', потом 'start'
    return a.type === 'end' ? -1 : 1
  })

  const segments = []
  let currentPos = 0
  const activeFormats = new Set()

  boundaries.forEach((boundary) => {
    // Добавляем текст до текущей границы
    if (boundary.pos > currentPos) {
      const segmentText = text.slice(currentPos, boundary.pos)
      const segment: any = { text: segmentText }

      // Применяем все активные форматы
      activeFormats.forEach((format: any) => {
        if (format.formatType === 'bold') segment.bold = true
        if (format.formatType === 'italic') segment.italic = true
        if (format.formatType === 'code') segment.code = true
        if (format.formatType === 'links') segment.link = { url: format.url, title: format.title }
      })

      segments.push(segment)
    }

    // Обновляем активные форматы
    if (boundary.type === 'start') {
      activeFormats.add(boundary.format)
    } else {
      activeFormats.delete(boundary.format)
    }

    currentPos = boundary.pos
  })

  // Добавляем оставшийся текст
  if (currentPos < text.length) {
    const segmentText = text.slice(currentPos)
    const segment: any = { text: segmentText }

    activeFormats.forEach((format: any) => {
      if (format.formatType === 'bold') segment.bold = true
      if (format.formatType === 'italic') segment.italic = true
      if (format.formatType === 'code') segment.code = true
      if (format.formatType === 'links') segment.link = { url: format.url, title: format.title }
    })

    segments.push(segment)
  }

  return segments.filter((segment) => segment.text.length > 0)
}
