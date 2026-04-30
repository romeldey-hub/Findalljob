import Anthropic from '@anthropic-ai/sdk'
import { callClaude, callClaudeJSON } from './claude'
import type { ParsedResume } from '@/types'

const PARSE_SYSTEM_PROMPT = `You are an expert resume parser. Extract structured data from resumes accurately.
Always return complete JSON even if some fields are missing — use empty strings or empty arrays for missing data.`

const PARSE_SCHEMA_PROMPT = `Extract the following information from this resume and return as JSON:

{
  "name": "Full name",
  "email": "Email address",
  "phone": "Phone number",
  "location": "City, State/Country",
  "summary": "Professional summary or objective (or derive one from the resume)",
  "skills": ["skill1", "skill2", ...],
  "experience": [
    {
      "company": "Company name",
      "title": "Job title",
      "start_date": "Month Year or Year",
      "end_date": "Month Year, Year, or null if current",
      "bullets": ["achievement or responsibility", ...]
    }
  ],
  "education": [
    {
      "school": "Institution name",
      "degree": "Degree type (BS, MS, MBA, etc.)",
      "field": "Field of study",
      "graduation_year": "Year or expected year"
    }
  ],
  "certifications": ["cert1", "cert2", ...]
}`

/**
 * Generate a short professional headline from parsed resume data.
 * Format: Role | Core skills | Domain  (max ~15 words)
 * Returns empty string on failure so callers can skip saving gracefully.
 */
export async function generateHeadline(resume: ParsedResume): Promise<string> {
  const title   = resume.experience?.[0]?.title ?? ''
  const company = resume.experience?.[0]?.company ?? ''
  const skills  = (resume.skills ?? []).slice(0, 8).join(', ')
  const summary = (resume.summary ?? '').slice(0, 300)

  const prompt = `You are a professional resume writer. Generate a single-line professional headline for this candidate.

Candidate info:
- Current/Latest role: ${title}${company ? ` at ${company}` : ''}
- Key skills: ${skills}
- Summary excerpt: ${summary}

Rules:
- Max 15 words
- Format: Role | Core skills | Domain
- Use pipe characters (|) as separators
- No full sentences, no verbs, no punctuation clutter
- Example: "Senior Pre-Sales Leader | Solution Architecture | Enterprise & Govt Sales"

Return ONLY the headline text. No quotes, no explanation.`

  try {
    const raw = await callClaude(prompt, undefined, 100)
    return raw.trim().replace(/^["']|["']$/g, '')
  } catch {
    return ''
  }
}

export async function parseResume(rawText: string): Promise<ParsedResume> {
  const prompt = `${PARSE_SCHEMA_PROMPT}\n\nRESUME TEXT:\n${rawText}`
  return callClaudeJSON<ParsedResume>(prompt, PARSE_SYSTEM_PROMPT, 2048)
}

export async function parseResumeFromPDF(pdfBuffer: Buffer): Promise<ParsedResume> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const fullSystem = `${PARSE_SYSTEM_PROMPT}\n\nIMPORTANT: Respond with valid JSON only. No markdown, no code fences, no explanation — just the raw JSON object.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: fullSystem,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: pdfBuffer.toString('base64'),
          },
        },
        { type: 'text', text: PARSE_SCHEMA_PROMPT },
      ],
    }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

  const cleaned = content.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  return JSON.parse(cleaned) as ParsedResume
}
