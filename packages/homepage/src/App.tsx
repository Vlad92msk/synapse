import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Header } from '@shared/components/layout/header'

import './i18n/config'

import { DocsPage, HomePage } from './pages'

import style from './App.module.css'

const App = () => {
  useEffect(() => {
    // Восстанавливаем сохраненный язык
    const savedLocale = localStorage.getItem('preferred-locale')
    if (savedLocale && (savedLocale === 'ru' || savedLocale === 'en')) {
      import('./i18n/config').then(({ default: i18n }) => {
        i18n.changeLanguage(savedLocale)
      })
    }
  }, [])

  return (
    <BrowserRouter>
      <Header />
      <div className={style.app}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/docs/:section" element={<DocsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
