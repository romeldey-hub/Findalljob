import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { inngest } from '@/inngest/client'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx']
const ACCEPTED_MIME: Record<string, string> = {
  '.pdf':  'application/pdf',
  '.doc':  'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' }, { status: 500 })
    }

    const supabase = await createClient()
    const admin = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: 'Only PDF, DOC, and DOCX files are supported' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Extract text based on file type (lazy require keeps Turbopack happy at build time)
    let rawText = ''
    try {
      if (ext === '.pdf') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
        const parsed = await pdfParse(buffer)
        rawText = parsed.text.trim()
      } else {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mammoth = require('mammoth') as { extractRawText(opts: { buffer: Buffer }): Promise<{ value: string }> }
        const result = await mammoth.extractRawText({ buffer })
        rawText = result.value.trim()
      }
    } catch (parseErr) {
      console.warn('[resume/upload] text extraction failed (non-fatal):', parseErr)
      rawText = ''
    }

    // Ensure the resumes bucket exists
    const { data: buckets, error: bucketsError } = await admin.storage.listBuckets()
    if (bucketsError) {
      console.error('[resume/upload] listBuckets error:', bucketsError.message)
      return NextResponse.json({ error: 'Storage unavailable', detail: bucketsError.message }, { status: 500 })
    }
    if (!buckets?.find((b) => b.name === 'resumes')) {
      const { error: createBucketError } = await admin.storage.createBucket('resumes', { public: true })
      if (createBucketError) {
        console.error('[resume/upload] createBucket error:', createBucketError.message)
        return NextResponse.json({ error: 'Failed to create storage bucket', detail: createBucketError.message }, { status: 500 })
      }
    }

    // Upload to Supabase Storage using service role (bypasses RLS)
    const contentType = ACCEPTED_MIME[ext] ?? 'application/octet-stream'
    const filePath = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const { error: uploadError } = await admin.storage
      .from('resumes')
      .upload(filePath, buffer, { contentType, upsert: false })

    if (uploadError) {
      console.error('[resume/upload] storage upload error:', uploadError.message)
      return NextResponse.json({ error: 'Failed to upload file', detail: uploadError.message }, { status: 500 })
    }

    const { data: { publicUrl } } = admin.storage.from('resumes').getPublicUrl(filePath)

    // Hash the raw file bytes for dedup detection
    const resumeHash = createHash('sha256').update(buffer).digest('hex')

    // Deactivate all previous active resumes for this user
    await supabase.from('resumes').update({ is_active: false }).eq('user_id', user.id)

    // Derive next version from the highest existing version (correct even after deletions)
    const { data: latestVersionRow } = await supabase
      .from('resumes')
      .select('version')
      .eq('user_id', user.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = (latestVersionRow?.version ?? 0) + 1

    // Save resume record
    const { data: resume, error: dbError } = await supabase
      .from('resumes')
      .insert({
        user_id:     user.id,
        file_url:    publicUrl,
        raw_text:    rawText,
        parsed_data: {},
        version:     nextVersion,
        is_active:   true,
        resume_hash: resumeHash,
      })
      .select()
      .single()

    if (dbError) {
      console.error('[resume/upload] db insert error:', dbError.message, dbError.details)
      return NextResponse.json({ error: 'Failed to save resume record', detail: dbError.message }, { status: 500 })
    }

    // Trigger async Claude parsing (non-fatal — Inngest may not be configured in local dev)
    try {
      await inngest.send({
        name: 'resume/uploaded',
        data: { resumeId: resume.id, userId: user.id },
      })
    } catch (err) {
      console.error('[resume/upload] inngest.send failed (Inngest not configured?):', err)
    }

    return NextResponse.json({
      resumeId: resume.id,
      hasText: true,
      parsing: true,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[resume/upload] unhandled error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
