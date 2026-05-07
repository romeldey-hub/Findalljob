'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export function ReadMoreText({
  text,
  lines = 5,
}: {
  text: string
  lines?: number
}) {
  const [expanded, setExpanded] = useState(false)

  const sentences = text.split(/(?<=[.!?])\s+/)
  const preview   = sentences.slice(0, lines).join(' ')
  const hasMore   = sentences.length > lines

  return (
    <div>
      <p className="text-[14px] text-gray-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
        {expanded ? text : preview}
        {!expanded && hasMore && '…'}
      </p>
      {hasMore && (
        <button
          onClick={() => setExpanded((p) => !p)}
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[#2563EB] hover:text-blue-700 transition-colors"
        >
          {expanded ? (
            <><ChevronUp className="w-3.5 h-3.5" />Show less</>
          ) : (
            <><ChevronDown className="w-3.5 h-3.5" />Read more</>
          )}
        </button>
      )}
    </div>
  )
}
