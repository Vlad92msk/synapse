import { useEffect } from 'react'
import { Outlet, type RouteObject } from 'react-router-dom'
import { Header } from '@shared/components/layout/header'

import './i18n/config'

import { DocsPage, HomePage } from './pages'

import style from './App.module.css'

// Корневой layout: общий Header + слот для страницы.
// Раньше это был App с BrowserRouter; при переходе на vite-react-ssg роутинг
// описывается массивом routes (data-router), а сам роутер создаётся в index.tsx.
const Layout = () => {
  useEffect(() => {
    // Восстанавливаем сохранённый язык (только в браузере — эффекты на сервере не бегут).
    const savedLocale = localStorage.getItem('preferred-locale')
    if (savedLocale && (savedLocale === 'ru' || savedLocale === 'en')) {
      import('./i18n/config').then(({ default: i18n }) => {
        i18n.changeLanguage(savedLocale)
      })
    }
  }, [])

  return (
    <>
      <Header />
      <div className={style.app}>
        <Outlet />
      </div>
    </>
  )
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'docs', element: <DocsPage /> },
      // Каждый раздел доки — свой путь /docs/<key>, чтобы пререндериться
      // в отдельный статический HTML, читаемый ботами/агентами без JS.
      { path: 'docs/:section', element: <DocsPage /> },
    ],
  },
]
