import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateFollowUpMessage, type MessageType } from '@/lib/ai/followup'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { applicationId, type = 'follow_up', recruiterName } = await request.json()
  if (!applicationId) return NextResponse.json({ error: 'applicationId required' }, { status: 400 })

  const { data: application, error } = await supabase
    .from('applications')
    .select(`
      follow_up_messages,
      job:jobs (title, company, description)
    `)
    .eq('id', applicationId)
    .eq('user_id', user.id)
    .single()

  if (error || !application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, summary')
    .eq('user_id', user.id)
    .single()

  const job = (Array.isArray(application.job) ? application.job[0] : application.job) as { title: string; company: string; description: string }

  const message = await generateFollowUpMessage({
    type: type as MessageType,
    candidateName: profile?.full_name ?? 'the candidate',
    jobTitle: job.title,
    company: job.company,
    resumeSummary: profile?.summary ?? '',
    jobDescription: job.description,
    recruiterName,
  })

  // Save message to application record
  const existing = (application.follow_up_messages ?? []) as Array<{
    type: string; content: string; generated_at: string
  }>
  const updated = [
    ...existing,
    { type, content: message, generated_at: new Date().toISOString() },
  ]

  await supabase
    .from('applications')
    .update({ follow_up_messages: updated })
    .eq('id', applicationId)
    .eq('user_id', user.id)

  return NextResponse.json({ message })
}
