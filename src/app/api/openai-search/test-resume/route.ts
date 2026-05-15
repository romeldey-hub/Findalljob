import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const BUCKET = 'openai-v2-test-resumes'
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx']
const ACCEPTED_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

type TestResumePayload = {
  id: string
  user_id: string
  file_name: string
  file_type: string
  file_size: number
  raw_text: string
  parsed_data: {
    sections?: Array<{ title: string; content: string }>
  }
  resume_hash: string
  uploaded_at: string
}

function detectSectionsFromText(text: string): Array<{ title: string; content: string }> {
  if (!text || text.length < 50) return []

  const lines = text.split('\n')
  const headingPattern = /^([A-Z][A-Za-z\s&/]{2,40})$/
  const sections: Array<{ title: string; content: string }> = []
  let currentTitle = ''
  let currentLines: string[] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    const isHeading = (headingPattern.test(line) || /^[A-Z\s]{4,30}$/.test(line)) &&
      !line.endsWith('.') &&
      !line.endsWith(',') &&
      line.split(' ').length <= 5

    if (isHeading) {
      if (currentTitle && currentLines.length > 0) {
        sections.push({ title: currentTitle, content: currentLines.join('\n').trim() })
      }
      currentTitle = line
      currentLines = []
    } else if (currentTitle) {
      currentLines.push(line)
    }
  }

  if (currentTitle && currentLines.length > 0) {
    sections.push({ title: currentTitle, content: currentLines.join('\n').trim() })
  }

  return sections
}

function extractLegacyDocText(buffer: Buffer): string {
  const chunks: string[] = []
  let current = ''

  for (const byte of buffer) {
    if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
      current += String.fromCharCode(byte)
    } else {
      if (current.trim().length >= 4) chunks.push(current)
      current = ''
    }
  }
  if (current.trim().length >= 4) chunks.push(current)

  let text = chunks.join('\n')
    .replace(/\r/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const metadataStart = text.search(/\n(?:\[Content_Types\]\.xml|_rels\/\.rels|Root Entry|WordDocument)\b/)
  if (metadataStart > 0) text = text.slice(0, metadataStart).trim()

  return text
    .split('\n')
    .filter((line) => line.trim() !== 'bjbj')
    .join('\n')
    .trim()
}

async function extractText(ext: string, buffer: Buffer) {
  if (ext === '.pdf') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require('pdf-parse') as {
      PDFParse: new (opts: { data: Buffer }) => { getText(): Promise<{ text: string }> }
    }
    const parser = new PDFParse({ data: buffer })
    const parsed = await parser.getText()
    return parsed.text.trim()
  }

  if (ext === '.docx') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth') as { extractRawText(opts: { buffer: Buffer }): Promise<{ value: string }> }
    const result = await mammoth.extractRawText({ buffer })
    return result.value.trim()
  }

  return extractLegacyDocText(buffer)
}

async function ensureBucket() {
  const admin = createAdminClient()
  const { data: buckets, error } = await admin.storage.listBuckets()
  if (error) throw new Error(error.message)
  if (buckets?.some((bucket) => bucket.name === BUCKET)) return admin

  const { error: createError } = await admin.storage.createBucket(BUCKET, { public: false })
  if (createError) throw new Error(createError.message)
  return admin
}

function publicShape(payload: TestResumePayload) {
  return {
    id: payload.id,
    fileName: payload.file_name,
    fileType: payload.file_type,
    fileSize: payload.file_size,
    rawTextLength: payload.raw_text.length,
    uploadedAt: payload.uploaded_at,
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.storage.from(BUCKET).download(`${user.id}/latest.json`)
    if (error || !data) return NextResponse.json({ testResume: null })

    const payload = JSON.parse(await data.text()) as TestResumePayload
    if (payload.user_id !== user.id) return NextResponse.json({ testResume: null })

    return NextResponse.json({ testResume: publicShape(payload) })
  } catch {
    return NextResponse.json({ testResume: null })
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
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

    const buffer = Buffer.from(await file.arrayBuffer())
    let rawText = ''
    try {
      rawText = await extractText(ext, buffer)
    } catch (error) {
      console.warn('[openai-search/test-resume] text extraction failed:', error)
    }

    if (rawText.length < 50) {
      return NextResponse.json({
        error: 'Could not extract enough text from this resume. Try a text-based PDF or DOCX.',
      }, { status: 400 })
    }

    const resumeHash = createHash('sha256').update(`${user.id}:${file.name}:${rawText}`).digest('hex')
    const payload: TestResumePayload = {
      id: resumeHash,
      user_id: user.id,
      file_name: file.name,
      file_type: ACCEPTED_MIME[ext] ?? file.type ?? 'application/octet-stream',
      file_size: file.size,
      raw_text: rawText,
      parsed_data: { sections: detectSectionsFromText(rawText) },
      resume_hash: resumeHash,
      uploaded_at: new Date().toISOString(),
    }

    const admin = await ensureBucket()
    const bytes = Buffer.from(JSON.stringify(payload))
    for (const path of [`${user.id}/${resumeHash}.json`, `${user.id}/latest.json`]) {
      const { error } = await admin.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: 'application/json', upsert: true })
      if (error) throw new Error(error.message)
    }

    return NextResponse.json({ ok: true, testResume: publicShape(payload) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload V2 test resume'
    console.error('[api/openai-search/test-resume]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
