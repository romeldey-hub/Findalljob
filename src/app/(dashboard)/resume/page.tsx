import { createClient, createAdminClient } from '@/lib/supabase/server'
import { ResumeUploadZone } from '@/components/resume/ResumeUploadZone'
import { VisualResumeCard } from '@/components/resume/VisualResumeCard'
import { InsightsPanel } from '@/components/resume/InsightsPanel'
import { ReanalyzeButton } from '@/components/resume/ReanalyzeButton'
import { CreateResumeWithAI } from '@/components/resume/CreateResumeWithAI'
import { FileText, Sparkles, RefreshCw } from 'lucide-react'
import type { ParsedResume, Resume } from '@/types'
import { resolveAvatar } from '@/lib/avatar'
import { isAdminUser, isProUser } from '@/lib/admin'
import { resolveProUntil } from '@/lib/billing'
import { FREE_LIMITS } from '@/lib/limits'

export default async function ResumePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()

  const [{ data: resume }, { data: profileRow }] = await Promise.all([
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
      .select('avatar_url, role, subscription_status, pro_until, resume_upload_count, ai_reanalyze_count')
      .eq('user_id', user!.id)
      .single(),
  ])

  const effectiveProUntil = await resolveProUntil(
    admin, user!.id, profileRow?.subscription_status, profileRow?.pro_until
  )
  const isPro = isProUser(user!.email, profileRow?.role, profileRow?.subscription_status, effectiveProUntil)
  const uploadCount    = profileRow?.resume_upload_count ?? 0
  const reanalyzeCount = profileRow?.ai_reanalyze_count  ?? 0
  const avatarRow = { avatar_url: profileRow?.avatar_url }

  const hasResume = Boolean(resume)
  // Only consider parsed when AI has produced structured data.
  // An upload-only record stores { sections: [...] } with no structured fields — that is NOT parsed.
  // We check name OR skills OR experience — any of these confirms the AI parser ran successfully.
  const pd = resume?.parsed_data
  const isParsed = Boolean(
    pd?.name ||
    (Array.isArray(pd?.skills)      && pd.skills.length      > 0) ||
    (Array.isArray(pd?.experience)  && pd.experience.length  > 0)
  )
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
        isPro={isPro}
        uploadCount={uploadCount}
        uploadLimit={FREE_LIMITS.resumeUploads}
        userId={user!.id}
      />

      {/* ── Resume uploaded but not yet AI-parsed ───────────────── */}
      {hasResume && !isParsed && (
        <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-6 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center flex-shrink-0 mt-0.5">
            <RefreshCw className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Resume received — analysis didn't complete</p>
            <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
              Your file is saved but AI parsing didn't finish. Click below to retry analysis without re-uploading.
            </p>
            <ReanalyzeButton
              isPro={isPro}
              reanalyzeCount={reanalyzeCount}
              reanalyzeLimit={FREE_LIMITS.aiReanalyze}
            />
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
            Upload your resume above, or let AI build one for you in 2 minutes.
          </p>
          <CreateResumeWithAI avatarUrl={avatarUrl} />
        </div>
      )}

    </div>
  )
}
