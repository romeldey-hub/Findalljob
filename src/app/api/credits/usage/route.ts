import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CreditFeature } from '@/lib/credits'

// User-facing display labels for each credit feature key
const FEATURE_LABELS: Partial<Record<CreditFeature, string>> = {
  jobRerank:        'Job matching & ranking',
  jobOptimize:      'Resume tailor for job',
  interviewSession: 'Mock interview session',
  interviewEval:    'Interview feedback',
  quickFix:         'Resume quick-fix',
  aiAssist:         'AI bullet assist',
  jobManual:        'Manual job add',
  jobExpand:        'Expand job pool',
  resumeGenerate:   'AI resume builder',
}

export interface FeatureUsageRow {
  label:   string
  count:   number
  credits: number
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('ai_feature_usage')
    .select('feature, count, credits')
    .eq('user_id', user.id)
    .order('credits', { ascending: false })

  if (error) {
    console.error('[credits/usage] query failed:', error.message)
    return NextResponse.json({ usage: [] })
  }

  const usage: FeatureUsageRow[] = (data ?? [])
    .filter(row => (row.count as number) > 0)
    .map(row => ({
      label:   FEATURE_LABELS[row.feature as CreditFeature] ?? row.feature,
      count:   row.count as number,
      credits: Number(row.credits),
    }))

  return NextResponse.json({ usage })
}
