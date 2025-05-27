import { defineConfig } from 'tsup'

export default defineConfig({
  // =================== ВХОДНЫЕ ФАЙЛЫ ===================
  entry: {
    index: 'src/index.ts',
    core: 'src/core/index.ts',
    reactive: 'src/reactive/index.ts',
    api: 'src/api/index.ts',
    react: 'src/react/index.ts',
    utils: 'src/utils/index.ts'
  },
  // entry: ['src/index.ts'], // Альтернатива - массив файлов
  // entry: 'src/index.ts',   // Или один файл

  // =================== ФОРМАТЫ ВЫВОДА ===================
  format: ['cjs', 'esm'],
  // format: ['esm'],           // Только ES modules (современно)
  // format: ['cjs'],           // Только CommonJS (совместимость)
  // format: ['iife'],          // Для браузера без модулей
  // format: ['umd'],           // Универсальный формат

  // =================== TYPESCRIPT ===================
  dts: true,                   // ✅ Генерировать .d.ts файлы
  // dts: false,               // Без типов
  // dts: { only: true },      // Только типы, без JS
  // dts: { resolve: true },   // Резолвить импорты в типах

  // =================== ОПТИМИЗАЦИЯ РАЗМЕРА ===================
  splitting: true,             // ✅ Выносит общий код в chunks
  sourcemap: false,            // ✅ Убираем source maps
  // sourcemap: true,          // Source maps в отдельных файлах
  // sourcemap: 'inline',      // Встроенные source maps
  clean: true,                 // ✅ Очищать dist/ перед сборкой
  minify: true,                // ✅ Минификация
  // minify: 'terser',         // Использовать terser (лучше сжатие)
  treeshake: true,             // ✅ Убираем неиспользуемый код

  // =================== ЗАВИСИМОСТИ ===================
  external: ['rxjs', 'react', 'react-dom'], // ✅ Внешние зависимости
  // noExternal: ['lodash'],   // Принудительно включить в бандл
  bundle: true,                // ✅ Бандлим все импорты
  // bundle: false,            // Не бандлить, только компилировать

  // =================== СОВМЕСТИМОСТЬ ===================
  target: 'es2022',            // ✅ Целевая версия JS
  // target: 'es2023',         // Самая современная
  // target: 'es2020',         // Больше совместимости
  // target: 'node18',         // Для Node.js 18+
  // target: ['chrome90', 'firefox88'], // Конкретные браузеры

  platform: 'neutral',         // ✅ Универсальная платформа
  // platform: 'browser',      // Только для браузера
  // platform: 'node',         // Только для Node.js

  // =================== ДИРЕКТОРИИ ===================
  // outDir: 'dist',           // Папка вывода (по умолчанию)
  // outExtension: { '.js': '.mjs' }, // Изменить расширения

  // =================== ПРОДВИНУТЫЕ НАСТРОЙКИ ===================

  // Настройки esbuild (основной сборщик)
  esbuildOptions: (options) => {
    options.mangleProps = /^_/              // Сжимаем приватные свойства (_prop)
    options.drop = ['console', 'debugger']  // Убираем console.log и debugger
    // options.charset = 'utf8'             // Кодировка
    // options.legalComments = 'none'       // Убрать комментарии
    // options.keepNames = true             // Сохранить имена функций
  },

  // Настройки Rollup (для продакшена)
  // rollupOptions: {
    // input: { ... },                      // Дополнительные входные файлы
    // output: { ... },                     // Настройки вывода
    // plugins: [...],                      // Дополнительные плагины
    // external: [...],                     // Внешние модули для Rollup
  // },

  // =================== ЭКСПЕРИМЕНТАЛЬНЫЕ ===================

  // experimentalDts: {           // Экспериментальная генерация типов
  //   resolve: true,
  //   only: false
  // },

  // keepNames: true,             // Сохранять имена функций/классов
  // inject: ['./polyfill.js'],   // Инжектить код во все файлы
  // banner: { js: '/* My lib */' }, // Добавить комментарий в начало
  // footer: { js: '/* End */' },    // Добавить в конец

  // =================== ОТЛАДКА ===================

  // silent: true,                // Без логов
  // onSuccess: 'echo "Build complete!"', // Команда после успешной сборки
  // watch: true,                 // Режим наблюдения
  // ignoreWatch: ['dist/**'],    // Игнорировать при watch

  // =================== УСЛОВНЫЕ СБОРКИ ===================

  // env: {                       // Переменные окружения
  //   NODE_ENV: 'production'
  // },

  // define: {                    // Замены в коде
  //   __VERSION__: '"1.0.0"',
  //   __DEV__: 'false'
  // },

  // =================== ПЛАГИНЫ ===================

  // plugins: [                   // Кастомные плагины
  //   {
  //     name: 'my-plugin',
  //     buildStart() {
  //       console.log('Build started')
  //     }
  //   }
  // ],

  // =================== LEGACY НАСТРОЙКИ ===================

  // globalName: 'MyLib',         // Имя для IIFE/UMD форматов
  // replaceNodeEnv: true,        // Заменить process.env.NODE_ENV
  // cjsInterop: true,            // Совместимость CommonJS/ES
  // legacyOutput: true,          // Старый формат вывода

  // =================== СПЕЦИФИЧЕСКИЕ ФОРМАТЫ ===================

  // Для IIFE/UMD форматов:
  // globalName: 'SynapseStorage',
  // format: ['iife'],
  // outExtension: { '.js': '.min.js' },

  // Для библиотек React:
  // jsx: 'react-jsx',            // JSX трансформация
  // jsxFactory: 'React.createElement',
  // jsxFragment: 'React.Fragment',

  // =================== ПРОИЗВОДИТЕЛЬНОСТЬ ===================

  // skipNodeModulesBundle: true, // Не бандлить node_modules
  // tsconfig: './tsconfig.build.json', // Кастомный tsconfig
  // loader: {                    // Кастомные загрузчики
  //   '.txt': 'text',
  //   '.sql': 'text'
  // },

  // =================== МЕТА-ИНФОРМАЦИЯ ===================

  // metafile: true,              // Генерировать мета-файл для анализа
  // publicDir: 'public',         // Копировать публичные файлы
  // assetsDir: 'assets',         // Папка для ассетов
})
