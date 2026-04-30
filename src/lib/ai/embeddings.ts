import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000), // stay within token limit
    dimensions: EMBEDDING_DIMENSIONS,
  })
  return response.data[0].embedding
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts.map((t) => t.slice(0, 8000)),
    dimensions: EMBEDDING_DIMENSIONS,
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
