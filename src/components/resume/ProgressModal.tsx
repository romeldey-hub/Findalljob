'use client'

import { Loader2, Sparkles, Check, X, RefreshCw } from 'lucide-react'

export const STEPS_JOB     = ['Analyzing Job',    'Optimizing Resume',  'Generating Output']
export const STEPS_GENERAL = ['Analyzing Resume', 'Improving Content',  'Generating Output']

export function ProgressModal({
  step,
  error,
  onRetry,
  onClose,
  steps = STEPS_JOB,
  subtitle = 'AI is tailoring your resume to this role',
}: {
  step: number
  error: string | null
  onRetry: () => void
  onClose: () => void
  steps?: string[]
  subtitle?: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-2xl p-6">

        {error ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <X className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Optimization Failed</p>
                <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">Something went wrong</p>
              </div>
            </div>
            <p className="text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 leading-relaxed">
              {error}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
              >
                Close
              </button>
              <button
                onClick={onRetry}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-bold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />Retry
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[#EFF6FF] dark:bg-[#1E3A5F] flex items-center justify-center flex-shrink-0 relative">
                <Loader2 className="w-5 h-5 text-[#2563EB] animate-spin" />
                <Sparkles className="w-3 h-3 text-amber-400 absolute -top-1 -right-1" />
              </div>
              <div>
                <p className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">{steps[step - 1]}…</p>
                <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">{subtitle}</p>
              </div>
            </div>
            <div className="flex items-center">
              {steps.map((label, i) => {
                const n = i + 1
                const done   = step > n
                const active = step === n
                return (
                  <div key={n} className="flex items-center flex-1 min-w-0">
                    <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                      <div className={[
                        'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all',
                        done   ? 'bg-green-500 text-white'
                        : active ? 'bg-[#2563EB] text-white ring-4 ring-blue-100 dark:ring-blue-900/40'
                        : 'bg-[#F1F5F9] dark:bg-[#334155] text-gray-400 dark:text-slate-500',
                      ].join(' ')}>
                        {done ? <Check className="w-3.5 h-3.5" /> : n}
                      </div>
                      <span className={[
                        'text-[11px] font-medium whitespace-nowrap',
                        done   ? 'text-green-600 dark:text-green-400'
                        : active ? 'text-[#0F172A] dark:text-[#F1F5F9]'
                        : 'text-gray-400 dark:text-slate-500',
                      ].join(' ')}>{label}</span>
                    </div>
                    {i < steps.length - 1 && (
                      <div className={`flex-1 h-px mx-3 mb-4 transition-colors ${done ? 'bg-green-300 dark:bg-green-700' : 'bg-[#E5E7EB] dark:bg-[#334155]'}`} />
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-[12px] text-center text-gray-400 dark:text-slate-500 mt-5">
              This takes about 20–30 seconds…
            </p>
          </>
        )}
      </div>
    </div>
  )
}
