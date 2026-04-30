import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import type { ApplicationStatus } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('applications')
    .select(`
      id, status, applied_at, notes, follow_up_messages, created_at, updated_at,
      job:jobs (id, title, company, location, url, salary)
    `)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ applications: data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jobId, status = 'saved' } = await request.json()
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

  const row: Record<string, unknown> = { user_id: user.id, job_id: jobId, status }
  if (status === 'applied') row.applied_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('applications')
    .upsert(row, { onConflict: 'user_id,job_id' })
    .select('id, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch job title for the notification body
  const { data: job } = await supabase.from('jobs').select('title, company').eq('id', jobId).single()
  if (job) {
    const isApplied = status === 'applied'
    await createNotification({
      userId: user.id,
      type: 'application',
      title: isApplied
        ? `Application submitted — ${job.title} at ${job.company}`
        : `${job.title} at ${job.company} saved to tracker`,
      body: isApplied ? 'Good luck! Track your progress in the Tracker.' : 'You can manage this application from the Tracker.',
      ctaLabel: 'View Application',
      ctaHref: '/tracker',
    })
  }

  return NextResponse.json({ application: data })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status, notes, follow_up_messages } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (status) {
    updates.status = status as ApplicationStatus
    if (status === 'applied') updates.applied_at = new Date().toISOString()
  }
  if (notes !== undefined) updates.notes = notes
  if (follow_up_messages !== undefined) updates.follow_up_messages = follow_up_messages

  const { data, error } = await supabase
    .from('applications')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ application: data })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase
    .from('applications')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
