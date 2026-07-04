import { ViteReactSSG } from 'vite-react-ssg'

import '@shared/styles/index.scss'

import { routes } from './App'
import reportWebVitals from './reportWebVitals'

import './index.css'

// vite-react-ssg: на билде рендерит каждый роут из `routes` в статический HTML
// (SSG), а в браузере — гидрирует. Тот же URL читаем и ботами (готовый HTML),
// и людьми (полноценный SPA после гидрации).
export const createRoot = ViteReactSSG({ routes }, ({ isClient }) => {
  // web-vitals работают только в браузере — на сервере пропускаем.
  if (isClient) reportWebVitals()
})
