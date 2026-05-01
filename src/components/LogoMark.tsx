'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

interface LogoMarkProps {
  href?: string
  iconOnly?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function LogoMark({ href = '/matches', iconOnly = false, size = 'md', className }: LogoMarkProps) {
  const isSmall = size === 'sm'
  const px = isSmall ? 32 : 36

  const content = (
    <div className={cn('flex items-center', isSmall ? 'gap-2' : 'gap-2.5', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-icon.png"
        alt="FindAllJob"
        width={px}
        height={px}
        className="flex-shrink-0"
      />

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
