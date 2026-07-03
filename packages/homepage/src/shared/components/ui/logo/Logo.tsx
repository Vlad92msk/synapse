import { useId } from 'react'

import style from './Logo.module.css'

interface LogoProps {
  size?: number | string
  className?: string
  /** Subtle floating animation of the nodes/links. Off by default. */
  animated?: boolean
}

/**
 * Synapse brand mark, rendered inline so its parts can be animated/styled.
 * Kept in sync with /public/logo2.svg (favicon + social previews).
 */
export const Logo = ({ size = 26, className, animated = false }: LogoProps) => {
  const uid = useId()
  const grad = `logoGrad-${uid}`
  const cut = `logoCut-${uid}`

  const rootClass = [style.logo, animated ? style.animated : '', className].filter(Boolean).join(' ')

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} fill="none" role="img" aria-label="Synapse" className={rootClass} style={{ flex: 'none' }}>
      <defs>
        <linearGradient id={grad} x1="30" y1="30" x2="160" y2="170" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF9B3E" />
          <stop offset="1" stopColor="#E85D19" />
        </linearGradient>
        <mask id={cut}>
          <rect width="200" height="200" fill="white" />
          <line x1="60" y1="100" x2="140" y2="45" stroke="black" strokeWidth="10" />
          <line x1="60" y1="100" x2="140" y2="155" stroke="black" strokeWidth="10" />
        </mask>
      </defs>

      <g mask={`url(#${cut})`}>
        <circle className={style.node1} cx="60" cy="100" r="26" stroke={`url(#${grad})`} strokeWidth="14" fill="none" />
        <circle className={style.node2} cx="140" cy="45" r="14" stroke={`url(#${grad})`} strokeWidth="8" fill="none" />
        <circle className={style.node3} cx="140" cy="155" r="14" stroke={`url(#${grad})`} strokeWidth="8" fill="none" />
      </g>

      <line className={style.link1} x1="92.1" y1="77.9" x2="120.2" y2="58.6" stroke={`url(#${grad})`} strokeWidth="6" strokeLinecap="round" />
      <line className={style.link2} x1="92.1" y1="122.1" x2="120.2" y2="141.4" stroke={`url(#${grad})`} strokeWidth="6" strokeLinecap="round" />
    </svg>
  )
}
