import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import {
  OPENAI_V2_OPTIMIZED_RESUMES_BUCKET,
  type OpenAIV2OptimizedResumePayload,
} from '@/lib/openai-search/optimized-storage'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  try {
    const { data: files, error } = await admin.storage
      .from(OPENAI_V2_OPTIMIZED_RESUMES_BUCKET)
      .list(user.id, { limit: 100, sortBy: { column: 'updated_at', order: 'desc' } })

    if (error || !files?.length) return NextResponse.json({ resumes: [] })

    const resumes = await Promise.all(
      files
        .filter((file) => file.name.endsWith('.json'))
        .map(async (file) => {
          const { data, error: downloadError } = await admin.storage
            .from(OPENAI_V2_OPTIMIZED_RESUMES_BUCKET)
            .download(`${user.id}/${file.name}`)

          if (downloadError || !data) return null
          const payload = JSON.parse(await data.text()) as OpenAIV2OptimizedResumePayload
          if (payload.userId !== user.id) return null
          return {
            resultId: payload.resultId,
            searchRunId: payload.searchRunId,
            optimizedData: payload.optimizedData,
            job: payload.job,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt,
          }
        }),
    )

    return NextResponse.json({ resumes: resumes.filter(Boolean) })
  } catch {
    return NextResponse.json({ resumes: [] })
  }
}
