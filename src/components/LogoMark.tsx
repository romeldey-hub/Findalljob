'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

// Briefcase + magnifier + check — inline SVG for sharpness at all sizes
function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Briefcase body */}
      <rect x="1.5" y="7" width="13" height="9" rx="1.8" fill="white" fillOpacity="0.88" />
      {/* Briefcase handle */}
      <path
        d="M5.5 7V5.2C5.5 4.54 6.04 4 6.7 4H9.3C9.96 4 10.5 4.54 10.5 5.2V7"
        stroke="white"
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />
      {/* Briefcase center divider */}
      <line x1="1.5" y1="11" x2="14.5" y2="11" stroke="white" strokeOpacity="0.2" strokeWidth="0.8" />

      {/* Magnifier circle — overlaps briefcase bottom-right */}
      <circle cx="17" cy="17" r="5.5" fill="white" fillOpacity="0.96" />
      {/* Checkmark inside magnifier */}
      <path
        d="M14.6 17L16.3 18.8L19.5 15"
        stroke="#1D4ED8"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface LogoMarkProps {
  href?: string
  iconOnly?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function LogoMark({ href = '/matches', iconOnly = false, size = 'md', className }: LogoMarkProps) {
  const isSmall = size === 'sm'

  const content = (
    <div className={cn('flex items-center', isSmall ? 'gap-2' : 'gap-2.5', className)}>
      {/* Icon inside circle */}
      <div
        className={cn(
          'rounded-full flex-shrink-0 flex items-center justify-center shadow-sm',
          'bg-gradient-to-br from-blue-500 to-blue-700',
          isSmall ? 'w-8 h-8' : 'w-9 h-9',
        )}
      >
        <LogoIcon className={isSmall ? 'w-[17px] h-[17px]' : 'w-[19px] h-[19px]'} />
      </div>

      {/* Wordmark */}
      {!iconOnly && (
        <span
          className={cn(
            'font-bold tracking-tight leading-none select-none',
            isSmall ? 'text-[15px]' : 'text-[17px]',
          )}
        >
          <span className="text-[#1a2742] dark:text-white">FindAll</span>
          <span className="text-blue-600 dark:text-blue-400">Job</span>
        </span>
      )}
    </div>
  )

  return href ? <Link href={href}>{content}</Link> : content
}
