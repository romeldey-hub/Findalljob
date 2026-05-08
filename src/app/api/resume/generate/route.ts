import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { generatePremiumJSON } from '@/lib/ai/client'
import { isProUser } from '@/lib/admin'
import { resolveProUntil } from '@/lib/billing'
import { checkCredits, deductCredits, insufficientCreditsResponse } from '@/lib/credits'
import type { ParsedResume } from '@/types'

interface QAAnswers {
  target_role?: string
  fresher_or_experienced?: string
  education?: string
  work_experience?: string
  skills?: string
  certifications?: string
  preferred_location?: string
  contact?: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // ── Plan resolution ────────────────────────────────────────────────────────
  const { data: profileRow } = await admin
    .from('profiles')
    .select('role, subscription_status, pro_until, plan_tier')
    .eq('user_id', user.id)
    .single()

  const effectiveProUntil = await resolveProUntil(
    admin, user.id, profileRow?.subscription_status, profileRow?.pro_until,
  )
  const isPro    = isProUser(user.email, profileRow?.role, profileRow?.subscription_status, effectiveProUntil)
  const planTier = (profileRow?.plan_tier as string | null) ?? (isPro ? 'pro' : 'free')

  // ── Credit check (2 credits: full AI resume generation) ───────────────────
  const { allowed: creditAllowed, balance: creditBalance, cost: creditCost } =
    await checkCredits(user.id, 'resumeGenerate', isPro, admin, planTier)

  if (!creditAllowed) {
    console.warn(`[resume/generate] insufficient credits | user=${user.id} | remaining=${creditBalance.remainingCredits}`)
    return NextResponse.json(
      insufficientCreditsResponse('resumeGenerate', creditBalance.remainingCredits),
      { status: 402 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const answers: QAAnswers = body.answers ?? {}

  const prompt = `You are a professional resume writer. Create a polished, structured resume based on the following user-provided information.

TARGET JOB ROLE: ${answers.target_role || 'Not specified'}
EXPERIENCE LEVEL: ${answers.fresher_or_experienced || 'Not specified'}
EDUCATION: ${answers.education || 'Not specified'}
WORK EXPERIENCE / INTERNSHIPS / PROJECTS: ${answers.work_experience || 'Not specified'}
SKILLS & TOOLS: ${answers.skills || 'Not specified'}
CERTIFICATIONS / ACHIEVEMENTS: ${answers.certifications || 'Not specified'}
PREFERRED LOCATION: ${answers.preferred_location || 'Not specified'}
CONTACT DETAILS: ${answers.contact || 'Not specified'}

Instructions:
- Extract name, email, phone from contact details
- Use preferred_location as the location field
- Write a compelling 2-3 sentence professional summary tailored to their target role
- Parse skills into an array (split by commas, semicolons, or new lines)
- Convert work experience text into structured entries with strong action-verb bullets
- Parse education into structured entries
- If experience level is "Fresher" and no work experience was given, create 0 experience entries
- For projects, treat them as experience entries with the project name as company and a relevant title
- Use realistic date formats like "Jan 2022" or "2020"
- Make bullets start with strong action verbs and be achievement-oriented
- If a field was skipped or not provided, use empty string or empty array

Return a JSON object matching this exact structure:
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "location": "string",
  "linkedin": "string",
  "summary": "string",
  "skills": ["string"],
  "experience": [
    {
      "title": "string",
      "company": "string",
      "start_date": "string",
      "end_date": "string or null",
      "bullets": ["string"]
    }
  ],
  "education": [
    {
      "school": "string",
      "degree": "string",
      "field": "string",
      "graduation_year": "string"
    }
  ],
  "certifications": ["string"]
}`

  try {
    const parsed = await generatePremiumJSON<ParsedResume>(prompt, {
      task:      'resume_generate',
      system:    'You are a professional resume writer. Return only valid JSON matching the requested structure.',
      maxTokens: 2048,
      userId:    user.id,
      isFreeUser: !isPro,
    })

    const afterCredits = await deductCredits(user.id, 'resumeGenerate', admin)

    return NextResponse.json({
      parsed_data:      parsed,
      creditCost,
      creditsRemaining: afterCredits?.remainingCredits ?? creditBalance.remainingCredits - creditCost,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to generate resume'
    console.error('[resume/generate]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
