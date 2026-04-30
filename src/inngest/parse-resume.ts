import { inngest } from './client'
import { parseResumeFromPDF, generateHeadline } from '@/lib/ai/parser'
import { generateEmbedding, resumeToEmbeddingText } from '@/lib/ai/embeddings'
import { createAdminClient } from '@/lib/supabase/server'

type StepRun = { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> }
type ParseResumeEvent = { data: { resumeId: string; userId: string } }

export const parseResumeJob = inngest.createFunction(
  {
    id: 'parse-resume',
    name: 'Parse Resume',
    retries: 2,
    triggers: [{ event: 'resume/uploaded' }],
  },
  async (ctx: { event: ParseResumeEvent; step: StepRun }) => {
    const { event, step } = ctx
    const { resumeId, userId } = event.data

    const pdfBuffer = await step.run('fetch-pdf', async () => {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('resumes')
        .select('file_url')
        .eq('id', resumeId)
        .single()
      if (error) throw new Error(`Failed to fetch resume record: ${error.message}`)

      const response = await fetch(data.file_url)
      if (!response.ok) throw new Error(`Failed to download PDF: ${response.statusText}`)

      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)
    })

    const parsedData = await step.run('claude-parse', async () => {
      try {
        return await parseResumeFromPDF(pdfBuffer)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // Persist error so the UI stops polling and shows the user what happened
        const supabase = createAdminClient()
        await supabase.from('resumes').update({ parsed_data: { _error: msg } }).eq('id', resumeId)
        throw err // re-throw so Inngest can retry
      }
    })

    const embeddingLength = await step.run('generate-and-save', async () => {
      const embText = resumeToEmbeddingText(parsedData)
      const embedding = await generateEmbedding(embText)

      const supabase = createAdminClient()
      await supabase.from('resumes').update({ parsed_data: parsedData }).eq('id', resumeId)
      await supabase
        .from('profiles')
        .update({
          full_name: parsedData.name || undefined,
          phone: parsedData.phone || undefined,
          location: parsedData.location || undefined,
          summary: parsedData.summary || undefined,
          skills: parsedData.skills || [],
        })
        .eq('user_id', userId)

      return embedding.length
    })

    // Generate headline only when the profile has none yet
    await step.run('generate-headline', async () => {
      const supabase = createAdminClient()
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('headline')
        .eq('user_id', userId)
        .single()

      if (profileRow?.headline) return // already set — never overwrite

      const headline = await generateHeadline(parsedData)
      if (!headline) return // AI failed — skip silently

      await supabase
        .from('profiles')
        .update({ headline })
        .eq('user_id', userId)
    })

    return { success: true, resumeId, embeddingLength }
  }
)
