import { useState } from 'react'
// Простое решение - используем @ts-ignore для обхода проблем с типами
// @ts-ignore
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter'
// @ts-ignore
import bash from 'react-syntax-highlighter/dist/esm/languages/hljs/bash'
// @ts-ignore
import css from 'react-syntax-highlighter/dist/esm/languages/hljs/css'
// @ts-ignore
import javascript from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript'
// @ts-ignore
import json from 'react-syntax-highlighter/dist/esm/languages/hljs/json'
// @ts-ignore
import typescript from 'react-syntax-highlighter/dist/esm/languages/hljs/typescript'
// @ts-ignore
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs'

import style from './CodeBlock.module.css'

// Регистрируем языки
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('jsx', javascript)
SyntaxHighlighter.registerLanguage('tsx', typescript)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('shell', bash)

export interface CodeBlockProps {
  children: string
  language?: string
  filename?: string
  showLineNumbers?: boolean
  className?: string
  maxHeight?: string
}

export const CodeBlock = (props: CodeBlockProps) => {
  const { children, language = 'typescript', filename, showLineNumbers = true, className = '', maxHeight } = props

  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  // Улучшенная функция копирования с fallback
  const handleCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(children)
      } else {
        // Fallback для старых браузеров
        const textArea = document.createElement('textarea')
        textArea.value = children
        textArea.style.position = 'absolute'
        textArea.style.left = '-999999px'
        document.body.prepend(textArea)
        textArea.select()
        document.execCommand('copy')
        textArea.remove()
      }

      setCopied(true)
      setCopyError(false)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
      setCopyError(true)
      setTimeout(() => setCopyError(false), 2000)
    }
  }

  // Определяем иконку файла по языку
  const getFileIcon = (lang: string) => {
    switch (lang) {
      case 'typescript':
      case 'tsx':
        return '🔷'
      case 'javascript':
      case 'jsx':
        return '🟨'
      case 'css':
        return '🎨'
      case 'json':
        return '📋'
      case 'bash':
      case 'shell':
        return '⚡'
      default:
        return '📄'
    }
  }

  // Кастомная темная тема
  const customDarkTheme = {
    ...atomOneDark,
    hljs: {
      ...atomOneDark.hljs,
      background: 'transparent',
      color: '#abb2bf',
      fontSize: '14px',
      fontFamily: "'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace",
    },
  }

  return (
    <div className={`${style.codeBlock} ${className}`}>
      {/* Заголовок */}
      <div className={style.header}>
        <div className={style.info}>
          {filename && (
            <span className={style.filename}>
              {getFileIcon(language)} {filename}
            </span>
          )}
          <span className={style.language}>{language}</span>
        </div>
        <button
          className={`${style.copyButton} ${copied ? style.copied : ''} ${copyError ? style.error : ''}`}
          onClick={handleCopy}
          title={copied ? 'Скопировано!' : copyError ? 'Ошибка копирования' : 'Копировать код'}
          aria-label="Копировать код"
        >
          {copied ? <span className={style.copiedIcon}>✓</span> : copyError ? <span className={style.errorIcon}>✗</span> : <span className={style.copyIcon}>📋</span>}
        </button>
      </div>

      {/* Код */}
      <div className={style.codeContent} style={{ maxHeight }}>
        {/* @ts-ignore */}
        <SyntaxHighlighter
          language={language}
          style={customDarkTheme}
          showLineNumbers={showLineNumbers}
          customStyle={{
            background: 'transparent',
            padding: 0,
            margin: 0,
            fontSize: '14px',
            lineHeight: '1.5',
          }}
          lineNumberStyle={{
            color: '#666',
            fontSize: '12px',
            minWidth: '2em',
            paddingRight: '1em',
            userSelect: 'none',
          }}
          wrapLines={false}
          wrapLongLines={false}
        >
          {children}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}
