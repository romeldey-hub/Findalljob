import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ParsedResume } from '@/types'

function generateRawText(pd: ParsedResume): string {
  const lines: string[] = []

  if (pd.name)     lines.push(pd.name)
  if (pd.email)    lines.push(pd.email)
  if (pd.phone)    lines.push(pd.phone)
  if (pd.location) lines.push(pd.location)
  if (pd.linkedin) lines.push(pd.linkedin)

  if (pd.summary) {
    lines.push('\nSUMMARY')
    lines.push(pd.summary)
  }

  if (pd.skills?.length) {
    lines.push('\nSKILLS')
    lines.push(pd.skills.join(', '))
  }

  if (pd.experience?.length) {
    lines.push('\nEXPERIENCE')
    for (const exp of pd.experience) {
      lines.push(`${exp.title} at ${exp.company} (${exp.start_date} – ${exp.end_date ?? 'Present'})`)
      for (const bullet of exp.bullets ?? []) {
        lines.push('• ' + bullet)
      }
    }
  }

  if (pd.education?.length) {
    lines.push('\nEDUCATION')
    for (const edu of pd.education) {
      lines.push(`${[edu.degree, edu.field].filter(Boolean).join(' in ')} — ${edu.school} (${edu.graduation_year})`)
    }
  }

  if (pd.certifications?.length) {
    lines.push('\nCERTIFICATIONS')
    lines.push(pd.certifications.join('\n'))
  }

  return lines.join('\n')
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed_data = body.parsed_data as ParsedResume | undefined
  if (!parsed_data) return NextResponse.json({ error: 'parsed_data required' }, { status: 400 })

  const raw_text = generateRawText(parsed_data)

  // Deactivate any existing active resume
  await supabase
    .from('resumes')
    .update({ is_active: false })
    .eq('user_id', user.id)
    .eq('is_active', true)

  const { data, error } = await supabase
    .from('resumes')
    .insert({
      user_id:     user.id,
      file_url:    '',   // no file — column is NOT NULL so use empty string
      raw_text,
      parsed_data,
      version:     1,
      is_active:   true,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[resume/create]', error.message)
    return NextResponse.json({ error: 'Failed to create resume' }, { status: 500 })
  }

  return NextResponse.json({ success: true, resume_id: data.id })
}
