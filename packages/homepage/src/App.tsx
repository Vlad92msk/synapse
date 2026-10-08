import { useEffect } from 'react'
import { Outlet, type RouteObject } from 'react-router-dom'
import { Header } from '@shared/components/layout/header'
import { Head } from 'vite-react-ssg'

import './i18n/config'

import { DocsPage, HomePage, VideoPage } from './pages'

import style from './App.module.css'

const SITE = 'https://synapse-homepage.web.app'
const OG_TITLE = 'Synapse Storage - Framework-Agnostic State Management Toolkit'
const OG_DESCRIPTION =
  'Powerful TypeScript state management toolkit with API client, storage adapters, and reactive capabilities. Framework-agnostic solution for React, Vue, Angular, and vanilla JS.'

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
      <Head>
        {/* OG по умолчанию; страница может переопределить свои (react-helmet: побеждает вложенный) */}
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:title" content={OG_TITLE} />
        <meta property="og:description" content={OG_DESCRIPTION} />
        <meta property="og:image" content={`${SITE}/og.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="600" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content="Synapse — State Manager, Business Logic Layer, API Client" />
        <meta property="og:url" content={`${SITE}/`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={OG_TITLE} />
        <meta name="twitter:description" content={OG_DESCRIPTION} />
        <meta name="twitter:image" content={`${SITE}/og.png`} />
        <meta name="twitter:image:alt" content="Synapse — State Manager, Business Logic Layer, API Client" />
      </Head>
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
      // Видеообзор: своя страница (а не модалка) — у ссылки свои OG-теги для превью в мессенджерах
      { path: 'video', element: <VideoPage /> },
    ],
  },
]
