import { openAIEmbeddingsCreate } from './openai'

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536

export async function generateEmbedding(text: string, userId?: string, userEmail?: string | null): Promise<number[]> {
  const response = await openAIEmbeddingsCreate<{ data: Array<{ embedding: number[] }> }>({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000), // stay within token limit
    dimensions: EMBEDDING_DIMENSIONS,
  }, {
    feature: 'embedding_generate',
    userId,
    userEmail,
  })
  return response.data[0].embedding
}

export async function generateEmbeddingsBatch(texts: string[], userId?: string, userEmail?: string | null): Promise<number[][]> {
  const response = await openAIEmbeddingsCreate<{ data: Array<{ embedding: number[] }> }>({
    model: EMBEDDING_MODEL,
    input: texts.map((t) => t.slice(0, 8000)),
    dimensions: EMBEDDING_DIMENSIONS,
  }, {
    feature: 'embedding_batch_generate',
    userId,
    userEmail,
    metadata: { item_count: texts.length },
  })
  return response.data.map((d) => d.embedding)
}

export function resumeToEmbeddingText(parsedResume: {
  summary?: string
  skills?: string[]
  experience?: Array<{ title?: string; company?: string; bullets?: string[] }>
}): string {
  const parts: string[] = []

  if (parsedResume.summary) parts.push(parsedResume.summary)
  if (parsedResume.skills?.length) {
    parts.push(`Skills: ${parsedResume.skills.join(', ')}`)
  }
  if (parsedResume.experience?.length) {
    for (const exp of parsedResume.experience.slice(0, 3)) {
      if (exp.title) parts.push(`${exp.title} at ${exp.company ?? ''}`)
      if (exp.bullets?.length) parts.push(exp.bullets.slice(0, 3).join(' '))
    }
  }

  return parts.join('\n')
}
