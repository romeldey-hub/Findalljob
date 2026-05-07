import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/ai/claude'

const PROMPTS: Record<string, (text: string, context?: string) => string> = {
  improve: (text) =>
    `Rewrite this resume text to be more impactful, professional, and ATS-friendly. Keep roughly the same length. Return only the improved text with no explanation or quotes:\n\n${text}`,

  shorten: (text) =>
    `Make this resume text more concise while preserving all key information. Aim for 20–30% shorter. Return only the shortened text with no explanation or quotes:\n\n${text}`,

  strengthen: (text) =>
    `Rewrite this resume text using stronger action verbs and adding quantified results where possible (use realistic estimates if needed). Return only the improved text with no explanation or quotes:\n\n${text}`,

  add_bullet: (_text, context) =>
    `Write one new strong bullet point for a resume that fits with these existing bullets. Use an action verb, be specific, and keep it to one sentence. Return only the bullet text with no dash, bullet symbol, or explanation:\n\nExisting bullets:\n${context || _text}`,
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { action, text, context } = body as { action: string; text: string; context?: string }

  if (!action || !text) return NextResponse.json({ error: 'action and text required' }, { status: 400 })

  const promptFn = PROMPTS[action]
  if (!promptFn) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  try {
    const result = await callClaude(promptFn(text, context), undefined, 512)
    return NextResponse.json({ result: result.trim() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI assist failed'
    console.error('[resume/ai-assist]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
