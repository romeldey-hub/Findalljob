import Link from 'next/link'
import { ShieldOff } from 'lucide-react'
import { LogoMark } from '@/components/LogoMark'

export default function BannedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] dark:bg-[#0B1120] p-4">
      <div className="w-full max-w-[400px]">
        <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm px-8 py-10 space-y-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <LogoMark href="/" size="sm" />
            <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
              <ShieldOff className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <h1 className="text-[22px] font-black text-[#0F172A] dark:text-[#F1F5F9] leading-tight">
                Account suspended
              </h1>
              <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-2 leading-relaxed">
                Your account has been suspended due to a violation of our Terms of Service.
                If you believe this is a mistake, please contact us.
              </p>
            </div>
          </div>

          <a
            href="mailto:support@findalljob.com"
            className="block w-full py-2.5 px-4 rounded-xl border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#263549] text-[13px] font-semibold text-[#0F172A] dark:text-[#F1F5F9] hover:bg-[#F8FAFC] dark:hover:bg-[#2E3D56] transition-colors text-center"
          >
            Contact support
          </a>

          <p className="text-center text-[12px] text-gray-400 dark:text-slate-500">
            <Link href="/" className="hover:underline">← Back to home</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
