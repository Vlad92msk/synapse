import { ReactNode, useEffect, useState } from 'react'

interface RouterProps {
  children: ReactNode
}

interface RouteProps {
  path: string
  component: React.ComponentType
  exact?: boolean
}

// Симуляция React Router (в реальном проекте используйте react-router-dom)
export const Router: React.FC<RouterProps> = ({ children }) => <>{children}</>

export const Route: React.FC<RouteProps> = ({ path, component: Component, exact }) => {
  const [currentPath, setCurrentPath] = useState<string>(window.location.hash || '#/')

  useEffect(() => {
    const handleHashChange = () => setCurrentPath(window.location.hash || '#/')
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const isMatch = exact ? currentPath === path : currentPath.startsWith(path)
  return isMatch ? <Component /> : null
}

// Утилита для навигации
export const navigate = (path: string): void => {
  window.location.hash = path
}
