export interface Pillar {
  // Базовый i18n-ключ: <key>.name / .when / .tagline / .point1..N
  key: string
  importPath: string
  // Хэш раздела документации, куда ведёт «Подробнее»
  docHash: string
  // Кол-во буллетов (homepage.pillars.<id>.point1..N)
  points: number
}

// Три независимых блока библиотеки. Каждый — отдельный subpath-экспорт,
// который можно подключать сам по себе.
export const PILLARS: Pillar[] = [
  {
    key: 'homepage.pillars.state',
    importPath: "import { MemoryStorage } from 'synapse-storage/core'",
    docHash: 'memory',
    points: 4,
  },
  {
    key: 'homepage.pillars.bll',
    importPath: "import { createSynapse } from 'synapse-storage/utils'",
    docHash: 'architecture',
    points: 4,
  },
  {
    key: 'homepage.pillars.api',
    importPath: "import { ApiClient } from 'synapse-storage/api'",
    docHash: 'api-client',
    points: 4,
  },
]
