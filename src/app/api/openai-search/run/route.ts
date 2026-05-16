import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isProUser } from '@/lib/admin'
import { resolveProUntil } from '@/lib/billing'
import { checkCredits, deductCredits, insufficientCreditsResponse } from '@/lib/credits'
import { runOpenAIJobSearch } from '@/lib/openai-search/engine'
import { acquireAiIdempotencyLock, completeAiIdempotencyLock } from '@/lib/ai/idempotency'

export const runtime = 'nodejs'

const inFlightOpenAISearches = new Set<string>()

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    searchMode?: 'country' | 'international_remote'
    countryCode?: string | null
    countryName?: string | null
    testResumeId?: string | null
    includeCurrentCompany?: boolean
  } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const admin = createAdminClient()
  const lockKey = [
    user.id,
    body.testResumeId ?? 'active',
    body.searchMode ?? 'default',
    body.countryCode ?? 'default',
    body.countryName ?? 'default',
    body.includeCurrentCompany === true ? 'include-current' : 'exclude-current',
  ].join(':')

  if (inFlightOpenAISearches.has(lockKey)) {
    return NextResponse.json(
      { error: 'An OpenAI V2 search is already running. Please wait for it to finish.', code: 'SEARCH_ALREADY_RUNNING' },
      { status: 409 }
    )
  }
  inFlightOpenAISearches.add(lockKey)
  let idemKey: string | null = null

  try {
    const { data: profileRow } = await admin
      .from('profiles')
      .select('role, subscription_status, pro_until, plan_tier')
      .eq('user_id', user.id)
      .maybeSingle()

    const effectiveProUntil = await resolveProUntil(
      admin,
      user.id,
      profileRow?.subscription_status,
      profileRow?.pro_until
    )
    const isPro = isProUser(user.email, profileRow?.role, profileRow?.subscription_status, effectiveProUntil)
    const planTier = (profileRow?.plan_tier as string | null) ?? (isPro ? 'pro' : 'free')
    const { allowed, balance, cost } = await checkCredits(user.id, 'jobRerank', isPro, admin, planTier)

    if (!allowed) {
      return NextResponse.json(
        insufficientCreditsResponse('jobRerank', balance.remainingCredits),
        { status: 402 }
      )
    }

    const idem = await acquireAiIdempotencyLock(admin, {
      userId: user.id,
      feature: 'openai_search_run',
      keyParts: [
        body.testResumeId ?? 'active',
        body.searchMode ?? 'default',
        body.countryCode ?? 'default',
        body.countryName ?? 'default',
        body.includeCurrentCompany === true ? 'include-current' : 'exclude-current',
      ],
      ttlSeconds: 900,
    })
    idemKey = idem.key
    if (!idem.acquired) {
      return NextResponse.json(
        { error: 'An OpenAI V2 search is already running for this resume and location. Please wait for it to finish.', code: 'SEARCH_ALREADY_RUNNING' },
        { status: 409 },
      )
    }

    const result = await runOpenAIJobSearch(admin, user, {
      searchMode: body.searchMode,
      countryCode: body.countryCode ?? null,
      countryName: body.countryName ?? null,
      testResumeId: body.testResumeId ?? null,
      includeCurrentCompany: body.includeCurrentCompany === true,
      usage: {
        userId: user.id,
        userEmail: user.email ?? null,
        isFreeUser: !isPro,
        creditsCharged: cost,
        creditFeatureKey: 'jobRerank',
      },
    })

    let creditsRemaining = balance.remainingCredits
    let creditsUsed = 0

    if (result.savedCount > 0) {
      const afterCredits = await deductCredits(user.id, 'jobRerank', admin)
      creditsRemaining = afterCredits?.remainingCredits ?? Math.max(0, balance.remainingCredits - cost)
      creditsUsed = cost
    }

    if (idemKey) void completeAiIdempotencyLock(admin, idemKey, 'success', { runId: result.runId, savedCount: result.savedCount })

    return NextResponse.json({
      ok: true,
      ...result,
      creditCost: cost,
      creditsUsed,
      creditsRemaining,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenAI search failed'
    console.error('[api/openai-search/run]', message)
    if (idemKey) void completeAiIdempotencyLock(admin, idemKey, 'failed', { error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    inFlightOpenAISearches.delete(lockKey)
  }
}
