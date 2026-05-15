import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import {
  OPENAI_V2_INTERVIEW_PREP_BUCKET,
  type OpenAIV2InterviewPrepPayload,
} from '@/lib/openai-search/interview-storage'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  try {
    const { data: files, error } = await admin.storage
      .from(OPENAI_V2_INTERVIEW_PREP_BUCKET)
      .list(user.id, { limit: 100, sortBy: { column: 'updated_at', order: 'desc' } })

    if (error || !files?.length) return NextResponse.json({ preps: [] })

    const preps = await Promise.all(
      files
        .filter((file) => file.name.endsWith('.json'))
        .map(async (file) => {
          const { data, error: downloadError } = await admin.storage
            .from(OPENAI_V2_INTERVIEW_PREP_BUCKET)
            .download(`${user.id}/${file.name}`)

          if (downloadError || !data) return null
          const payload = JSON.parse(await data.text()) as OpenAIV2InterviewPrepPayload
          if (payload.userId !== user.id) return null
          return {
            resultId: payload.resultId,
            searchRunId: payload.searchRunId,
            question: payload.question,
            job: payload.job,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt,
          }
        }),
    )

    return NextResponse.json({ preps: preps.filter(Boolean) })
  } catch {
    return NextResponse.json({ preps: [] })
  }
}
