import { UserX } from 'lucide-react'

export default function ProfileNotFound() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A] flex flex-col">
      <nav className="bg-white dark:bg-[#0F172A] border-b border-[#E5E7EB] dark:border-[#1E293B] px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <a href="/" className="text-[15px] font-black text-[#0F172A] dark:text-white tracking-tight">
            Find<span className="text-[#2563EB]">All</span>Job
          </a>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] flex items-center justify-center mx-auto mb-4">
            <UserX className="w-6 h-6 text-gray-400" />
          </div>
          <h1 className="text-[20px] font-bold text-[#0F172A] dark:text-[#F1F5F9] mb-2">
            Profile not found
          </h1>
          <p className="text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed">
            This profile doesn&apos;t exist or may have been removed.
          </p>
          <a
            href="/"
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
          >
            Go to FindAllJob
          </a>
        </div>
      </div>
    </div>
  )
}
