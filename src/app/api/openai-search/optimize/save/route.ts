import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import {
  saveOpenAIV2OptimizedResume,
  type OpenAIV2OptimizedResumePayload,
} from '@/lib/openai-search/optimized-storage'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'

export const runtime = 'nodejs'

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => (typeof item === 'string' ? item : String(item))).filter(Boolean)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { resultId, optimizedData } = await request.json() as {
    resultId?: string
    optimizedData?: OptimizedResumeData
  }

  if (!resultId) return NextResponse.json({ error: 'resultId required' }, { status: 400 })
  if (!optimizedData) return NextResponse.json({ error: 'optimizedData is required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: job, error } = await admin
    .from('openai_search_results')
    .select('id, search_run_id, title, company, location, description, apply_url, final_score, match_reasons, missing_skills, resume_fix_suggestions')
    .eq('id', resultId)
    .eq('user_id', user.id)
    .single()

  if (error || !job) return NextResponse.json({ error: 'OpenAI V2 job not found' }, { status: 404 })

  const now = new Date().toISOString()
  const payload: OpenAIV2OptimizedResumePayload = {
    resultId,
    userId: user.id,
    searchRunId: job.search_run_id,
    optimizedData,
    job: {
      title: job.title ?? '',
      company: job.company ?? '',
      location: job.location ?? '',
      description: job.description ?? '',
      applyUrl: job.apply_url ?? '',
      finalScore: job.final_score ?? 0,
      whyThisMatches: toStringList(job.match_reasons),
      missingSkills: toStringList(job.missing_skills),
      resumeFixSuggestions: toStringList(job.resume_fix_suggestions),
    },
    createdAt: now,
    updatedAt: now,
  }

  try {
    await saveOpenAIV2OptimizedResume(admin, payload)
    return NextResponse.json({ id: resultId, createdAt: now })
  } catch (saveError) {
    const message = saveError instanceof Error ? saveError.message : 'Failed to save optimized V2 resume'
    console.error('[openai-search/optimize/save]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
