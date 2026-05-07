import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { callClaudeJSON }    from '@/lib/ai/claude'
import type { ParsedResume } from '@/types'

export interface QuickFix {
  area:    string   // 2–4 word label: "OEM Relationship Visibility"
  reason:  string   // one sentence: why this matters for this role
  rewrite: string   // ready-to-paste suggestion (1–2 sentences)
}

const SYSTEM = `You are a strategic recruiter consultant who gives direct, actionable resume advice.
Your job: identify the fewest high-impact changes that would most increase a candidate's shortlist probability for a specific role.
Be specific. Be brief. Never give generic advice.`

function reconstructText(p: ParsedResume): string {
  const lines: string[] = []
  if (p.summary) lines.push(p.summary)
  for (const e of (p.experience ?? []).slice(0, 4)) {
    lines.push(`${e.title ?? ''} at ${e.company ?? ''}`)
    for (const b of (e.bullets ?? []).slice(0, 3)) lines.push(`  • ${b}`)
  }
  if ((p.skills ?? []).length) lines.push(`Skills: ${p.skills!.slice(0, 20).join(', ')}`)
  return lines.join('\n')
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { jobId } = body
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

  const [resumeResult, jobResult] = await Promise.all([
    supabase
      .from('resumes')
      .select('raw_text, parsed_data')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single(),
    supabase
      .from('jobs')
      .select('title, company, description')
      .eq('id', jobId)
      .single(),
  ])

  if (resumeResult.error || !resumeResult.data) {
    return NextResponse.json({ error: 'No active resume found' }, { status: 404 })
  }
  if (jobResult.error || !jobResult.data) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  let resumeText = resumeResult.data.raw_text ?? ''
  if (resumeText.length < 50) {
    const parsed = resumeResult.data.parsed_data as ParsedResume | null
    resumeText = parsed ? reconstructText(parsed) : ''
  }
  if (!resumeText) {
    return NextResponse.json({ error: 'Resume has no readable content.' }, { status: 400 })
  }

  const { title, company, description } = jobResult.data

  const prompt = `RESUME:
${resumeText.slice(0, 3000)}

JOB POSTING: ${title} at ${company}
${(description ?? '').slice(0, 1500)}

Identify exactly 3–5 targeted improvements that would most increase this candidate's shortlist chances for THIS role.
Prioritise: missing high-signal keywords, missing domain emphasis, weak achievement phrasing, missing measurable outcomes.
Ignore minor polishing and generic tips. Every suggestion must be specific to this job.

Return a JSON array:
[
  {
    "area": "2–4 word label",
    "reason": "One sentence — why this gap matters for this specific role.",
    "rewrite": "Ready-to-paste text (1–2 sentences max, realistic and believable)."
  }
]

Return 3–5 items only.`

  try {
    const fixes = await callClaudeJSON<QuickFix[]>(prompt, SYSTEM, 1200)
    const valid  = (Array.isArray(fixes) ? fixes : [])
      .filter(f => f.area && f.reason && f.rewrite)
      .slice(0, 5)
    return NextResponse.json({ fixes: valid })
  } catch (err) {
    const msg    = err instanceof Error ? err.message : String(err)
    const isLoad = /overload|rate.?limit|529|429|too many/i.test(msg)
    console.error('[quick-fixes] Claude failed:', msg)
    return NextResponse.json(
      { error: isLoad
          ? 'Anthropic API is temporarily overloaded. Please wait a few seconds and try again.'
          : 'Could not generate suggestions. Please try again.' },
      { status: isLoad ? 503 : 500 }
    )
  }
}
