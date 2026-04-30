import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function DELETE() {
  const supabase = await createClient()
  const admin    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── 1. Fetch active resume ─────────────────────────────────────────────────
  const { data: resume, error: fetchErr } = await supabase
    .from('resumes')
    .select('id, file_url')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fetchErr) {
    console.error('[resume/delete] fetch error:', fetchErr.message)
    return NextResponse.json({ error: 'Failed to fetch resume' }, { status: 500 })
  }
  if (!resume) {
    return NextResponse.json({ error: 'No active resume found' }, { status: 404 })
  }

  console.log(`[resume/delete] user=${user.id} resume_id=${resume.id}`)

  // ── 2. Delete file from storage (best-effort) ─────────────────────────────
  if (resume.file_url) {
    try {
      // Public URL format: .../storage/v1/object/public/resumes/{path}
      const storagePath = resume.file_url.split('/storage/v1/object/public/resumes/')[1]?.split('?')[0]
      if (storagePath) {
        const { error: storageErr } = await admin.storage.from('resumes').remove([storagePath])
        if (storageErr) console.warn('[resume/delete] storage remove warning:', storageErr.message)
        else console.log('[resume/delete] storage file removed:', storagePath)
      }
    } catch (err) {
      console.warn('[resume/delete] storage delete failed (non-fatal):', err)
    }
  }

  // ── 3. Delete all job_matches for this user ────────────────────────────────
  const { error: matchErr } = await admin
    .from('job_matches')
    .delete()
    .eq('user_id', user.id)
  if (matchErr) console.error('[resume/delete] job_matches delete error:', matchErr.message)
  else console.log('[resume/delete] cleared job_matches for user', user.id)

  // ── 4. Delete the resume row ───────────────────────────────────────────────
  const { error: dbErr } = await admin
    .from('resumes')
    .delete()
    .eq('id', resume.id)

  if (dbErr) {
    console.error('[resume/delete] resumes row delete error:', dbErr.message)
    return NextResponse.json({ error: 'Failed to delete resume record' }, { status: 500 })
  }

  console.log('[resume/delete] done — resume_id:', resume.id)
  return NextResponse.json({ success: true })
}
