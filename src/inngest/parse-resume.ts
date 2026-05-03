import { inngest } from './client'
import { parseResumeFromPDF, generateHeadline } from '@/lib/ai/parser'
import { generateEmbedding, resumeToEmbeddingText } from '@/lib/ai/embeddings'
import { createAdminClient } from '@/lib/supabase/server'

type StepRun = { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> }
type ParseResumeEvent = { data: { resumeId: string; userId: string } }

function buildFallbackSections(text: string): Array<{ title: string; content: string }> {
  const lines = text.split('\n')
  const HEADING = /^([A-Z][A-Za-z\s&\/]{2,40})$/
  const sections: Array<{ title: string; content: string }> = []
  let currentTitle = ''
  let currentLines: string[] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const isHeading = (HEADING.test(line) || /^[A-Z\s]{4,30}$/.test(line)) &&
                      !line.endsWith('.') && !line.endsWith(',') && line.split(' ').length <= 5
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
        let result = await parseResumeFromPDF(pdfBuffer)

        // Fetch raw_text for fallback
        const supabase = createAdminClient()
        const { data: resumeRow } = await supabase
          .from('resumes')
          .select('raw_text')
          .eq('id', resumeId)
          .single()
        const rawText = resumeRow?.raw_text ?? ''

        if ((!result.sections || result.sections.length === 0) && rawText.length > 50) {
          const fallback = buildFallbackSections(rawText)
          if (fallback.length > 0) {
            result = { ...result, sections: fallback }
            console.warn('[parse-resume] sections[] empty — regex fallback:', fallback.length, 'sections')
          }
        }

        return result
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
