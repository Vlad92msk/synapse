import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-plugin-prettier'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import importPlugin from 'eslint-plugin-import'
import prettierConfig from 'eslint-config-prettier'
import './global.js';


export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json'
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'prettier': prettier,
      'simple-import-sort': simpleImportSort,
      'import': importPlugin
    },
    rules: {
      'prettier/prettier': 'error',
      'max-len': ['error', { code: 180 }],
      'semi': ['error', 'never'],
      'quotes': ['error', 'single', { avoidEscape: true }],
      'no-param-reassign': ['error', { props: false }],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error'],
      'no-plusplus': 'off',
      'import/extensions': 'off',
      'no-use-before-define': 'off',
      'import/prefer-default-export': 'off',
      '@typescript-eslint/no-use-before-define': ['error'],
      'simple-import-sort/imports': ['error', {
        groups: [
          // Абсолютные импорты
          ['^[^.]'],
          // Относительные импорты
          ['^\\.'],
          // Стили
          ['^.+\\.css$']
        ]
      }],
      'simple-import-sort/exports': 'error',
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'import/no-duplicates': 'error',
      'object-curly-spacing': ['error', 'always'],
      'no-underscore-dangle': 'off',
      '@typescript-eslint/no-shadow': ['error'],
      'camelcase': 'off',
      'no-extra-boolean-cast': 'off',
      'no-shadow': 'off',
      'no-nested-ternary': 'off',
      '@typescript-eslint/explicit-module-boundary-types': ['warn'],
      '@typescript-eslint/explicit-function-return-type': ['off']
    }
  },
  prettierConfig
]
