'use client'

import { Check, Circle } from 'lucide-react'

export type ActivityStep = {
  label: string
  description?: string
  status: 'pending' | 'active' | 'done' | 'error'
  previewItems?: Array<{
    title: string
    subtitle?: string
    source?: string
  }>
}

type ProgressiveActivityProps = {
  title?: string
  steps: ActivityStep[]
}

export function ProgressiveActivity({ title = 'Working', steps }: ProgressiveActivityProps) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#1E293B] shadow-sm p-5">
      <div className="mb-4">
        <p className="text-[13px] font-bold text-[#0F172A] dark:text-[#F1F5F9]">{title}</p>
      </div>

      <div className="space-y-0">
        {steps.map((step, index) => {
          const isActive = step.status === 'active'
          const isDone = step.status === 'done'
          const isError = step.status === 'error'

          return (
            <div key={`${step.label}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
              {index < steps.length - 1 && (
                <div className="absolute left-[9px] top-6 bottom-0 w-px bg-[#E5E7EB] dark:bg-[#334155]" />
              )}

              <div className="relative z-10 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white dark:bg-[#1E293B]">
                {isActive ? (
                  <span className="relative flex h-4 w-4">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-30" />
                    <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-orange-500 border-t-orange-200 animate-spin" />
                  </span>
                ) : isDone ? (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#F1F5F9] dark:bg-[#263549] text-gray-500 dark:text-slate-400">
                    <Check className="h-3 w-3" />
                  </span>
                ) : isError ? (
                  <span className="h-3 w-3 rounded-full bg-red-500" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-gray-300 dark:text-slate-600" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className={`text-[13px] leading-5 ${
                  isActive
                    ? 'font-bold text-[#0F172A] dark:text-[#F1F5F9]'
                    : isError
                    ? 'font-semibold text-red-600 dark:text-red-400'
                    : 'font-medium text-gray-500 dark:text-slate-400'
                }`}>
                  {step.label}
                </p>

                {step.description && (
                  <p className="mt-0.5 text-[12px] leading-5 text-gray-400 dark:text-slate-500">
                    {step.description}
                  </p>
                )}

                {step.previewItems && step.previewItems.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {step.previewItems.slice(0, 3).map((item) => (
                      <div
                        key={`${item.title}-${item.subtitle ?? ''}-${item.source ?? ''}`}
                        className="rounded-xl border border-[#E5E7EB] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#263549] px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                              {item.title}
                            </p>
                            {item.subtitle && (
                              <p className="mt-0.5 truncate text-[11px] text-gray-400 dark:text-slate-500">
                                {item.subtitle}
                              </p>
                            )}
                          </div>
                          {item.source && (
                            <span className="shrink-0 rounded-md bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] px-2 py-0.5 text-[10px] font-semibold text-gray-400 dark:text-slate-500">
                              {item.source}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
