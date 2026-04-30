import { createClient, createAdminClient } from '@/lib/supabase/server'
import { ResumeUploadZone } from '@/components/resume/ResumeUploadZone'
import { VisualResumeCard } from '@/components/resume/VisualResumeCard'
import { InsightsPanel } from '@/components/resume/InsightsPanel'
import { Loader2, FileText, Sparkles } from 'lucide-react'
import type { ParsedResume, Resume } from '@/types'
import { resolveAvatar } from '@/lib/avatar'

export default async function ResumePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()

  const [{ data: resume }, { data: avatarRow }] = await Promise.all([
    supabase
      .from('resumes')
      .select('*')
      .eq('user_id', user!.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('profiles')
      .select('avatar_url')
      .eq('user_id', user!.id)
      .single(),
  ])

  const hasResume = Boolean(resume)
  const isParsed  = resume && Object.keys(resume.parsed_data ?? {}).length > 0
  const avatarUrl = resolveAvatar(avatarRow, user)

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-black text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-2 leading-tight">
            My Resume
            <Sparkles className="w-4 h-4 text-amber-400" />
          </h1>
          <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-0.5">
            Upload your resume — AI parses it and matches you to jobs instantly.
          </p>
        </div>
      </div>

      {/* ── Upload section ──────────────────────────────────────── */}
      <ResumeUploadZone
        hasExistingResume={hasResume}
        resumeInfo={resume ? {
          file_url:   resume.file_url,
          created_at: resume.created_at,
          version:    resume.version,
        } : null}
      />

      {/* ── Parsing in progress ─────────────────────────────────── */}
      {hasResume && !isParsed && (
        <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#F8FAFC] dark:bg-[#263549] flex items-center justify-center flex-shrink-0">
            <Loader2 className="w-5 h-5 text-[#2563EB] animate-spin" />
          </div>
          <div>
            <p className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Parsing your resume with AI…</p>
            <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              This takes about 30 seconds. Refresh the page to see your profile once done.
            </p>
          </div>
        </div>
      )}

      {/* ── Profile + Insights ──────────────────────────────────── */}
      {hasResume && isParsed && (
        <div className="flex flex-col xl:flex-row gap-5 items-start">

          {/* Profile card — grows to fill */}
          <div className="flex-1 min-w-0">
            <VisualResumeCard
              resume={resume as Resume}
              parsedData={resume.parsed_data as ParsedResume}
              avatarUrl={avatarUrl}
            />
          </div>

          {/* Insights panel — fixed width on xl+ */}
          <div className="w-full xl:w-[300px] xl:flex-shrink-0">
            <InsightsPanel parsedData={resume.parsed_data as ParsedResume} avatarUrl={avatarUrl} />
          </div>

        </div>
      )}

      {/* ── Empty state (no resume) ─────────────────────────────── */}
      {!hasResume && (
        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-[#1E293B] rounded-2xl border border-dashed border-[#E5E7EB] dark:border-[#334155] text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F8FAFC] dark:bg-[#263549] flex items-center justify-center mb-4">
            <FileText className="w-6 h-6 text-gray-300 dark:text-slate-600" />
          </div>
          <p className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9]">No resume uploaded yet</p>
          <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-1">
            Upload your resume above to get AI-matched job listings.
          </p>
        </div>
      )}

    </div>
  )
}
