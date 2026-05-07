'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { ResumePreviewModal } from './ResumePreviewModal'
import type { ParsedResume } from '@/types'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'

function toOptimized(pd: ParsedResume): OptimizedResumeData {
  return {
    name:     pd.name     ?? '',
    email:    pd.email    ?? '',
    phone:    pd.phone    ?? '',
    location: pd.location ?? '',
    linkedin: pd.linkedin ?? '',
    summary:  pd.summary  ?? '',
    experience: (pd.experience ?? []).map(e => ({
      title:      e.title,
      company:    e.company,
      location:   '',
      start_date: e.start_date,
      end_date:   e.end_date ?? '',
      bullets:    e.bullets ?? [],
    })),
    skills:         pd.skills         ?? [],
    education:      pd.education      ?? [],
    certifications: pd.certifications ?? [],
    additionalSections: (pd.sections ?? []).map(s => ({ title: s.title, content: s.content })),
    ats_score:               0,
    original_score:          undefined,
    section_scores:          { summary: 0, skills: 0, experience: 0 },
    matched_keywords:        [],
    missing_keywords:        [],
    improvements:            [],
    score_improvements:      { keyword_increase: 0, skill_match_increase: 0, experience_alignment_increase: 0, missing_skills_reduction: 0 },
    score_improvement_reason: '',
  }
}

function toParsed(opt: OptimizedResumeData, original: ParsedResume): ParsedResume {
  return {
    ...original,
    name:     opt.name,
    email:    opt.email,
    phone:    opt.phone,
    location: opt.location,
    linkedin: opt.linkedin || undefined,
    summary:  opt.summary,
    experience: opt.experience.map(e => ({
      title:      e.title,
      company:    e.company,
      start_date: e.start_date,
      end_date:   e.end_date || null,
      bullets:    e.bullets,
    })),
    skills:         opt.skills,
    education:      opt.education,
    certifications: opt.certifications,
  }
}

export function ResumeEditorButton({
  parsedData,
  avatarUrl,
}: {
  parsedData: ParsedResume
  avatarUrl?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function handleSaveEdits(edited: OptimizedResumeData) {
    setSaving(true)
    try {
      const updated = toParsed(edited, parsedData)
      const res = await fetch('/api/resume', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsed_data: updated }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error((data.error as string) ?? 'Failed to save changes')
        return
      }
      setOpen(false)
      toast.success('Resume updated successfully')
      router.refresh()
    } catch {
      toast.error('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Edit resume"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/90 dark:bg-[#1E293B]/90 backdrop-blur-sm border border-[#E5E7EB] dark:border-[#334155] text-[12px] font-medium text-gray-500 dark:text-slate-400 hover:text-[#2563EB] dark:hover:text-blue-400 hover:border-[#2563EB]/40 hover:bg-blue-50 dark:hover:bg-blue-900/20 shadow-sm transition-all"
      >
        <Pencil className="w-3 h-3" />
        Edit
      </button>

      {open && (
        <ResumePreviewModal
          data={toOptimized(parsedData)}
          onClose={() => setOpen(false)}
          avatarUrl={avatarUrl}
          onSaveEdits={handleSaveEdits}
          isSaving={saving}
          heading="My Resume"
          previewSubtitle="Edit your resume content — changes are saved to your profile."
          startInEditMode
        />
      )}
    </>
  )
}
