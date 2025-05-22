// Просто условный объект с конфигурацией, которую можно использовать в эффектах

// Тип для глобальной конфигурации
export interface AppConfig {
  apiBaseUrl: string
  apiKey: string
  requestTimeoutMs: number
  features: {
    enableNotifications: boolean
    enableCache: boolean
  }
  themeSettings: {
    primaryColor: string
    secondaryColor: string
  }
}

export const appConfig: AppConfig = {
  apiBaseUrl: 'https://pokeapi.co/api/v2',
  apiKey: 'your-api-key-here',
  requestTimeoutMs: 5000,
  features: {
    enableNotifications: true,
    enableCache: true,
  },
  themeSettings: {
    primaryColor: '#FF0000', // Pokemon Red!
    secondaryColor: '#FFFFFF',
  },
}
