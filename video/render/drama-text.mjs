// Текст для диктора под модели Drama (Fish Audio Drama 3): английские термины — по-английски отдельными словами
// (useApiQuery → use API Query), так модель читает их правильно. Исключения — pronounce.drama.json.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const over = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'pronounce.drama.json'), 'utf8'))
// термин → как его писать: исключение из словаря или camelCase по словам
const spell = (w) => {
  if (over[w] != null) return over[w]
  if (!/[a-z][A-Z]|[A-Z]{2}[a-z]/.test(w)) return w
  return w.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(' ').map((x) => (/^api$/i.test(x) ? 'API' : /^db$/i.test(x) ? 'DB' : x)).join(' ')
}
export const dramaSpeech = (t) => t.replace(/[A-Za-z][A-Za-z0-9_.$/-]*[A-Za-z0-9]|[A-Za-z]/g, spell).replace(/[«»„“]/g, '"')
  .replace(/(^|[.!?]\s+)([a-z])/g, (m, a, c) => a + c.toUpperCase()) // термин в начале предложения — с заглавной
