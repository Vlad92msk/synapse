import { CSSProperties, PropsWithChildren } from 'react'
import { clsx } from 'clsx'

import style from './Button.module.css'

interface ButtonProps {
  className?: string
  onClick?: VoidFunction
  style?: CSSProperties
  type?: 'primary' | 'secondary'
}

export const Button = (props: PropsWithChildren<ButtonProps>) => {
  const { className, type, ...rest } = props

  return <button className={clsx(style.Button, className)} {...rest} />
}
