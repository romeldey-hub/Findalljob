import { callClaude, callClaudeJSON, getClient } from './claude'
import type { ParsedResume } from '@/types'

// ── System prompt ─────────────────────────────────────────────────────────────

const PARSE_SYSTEM_PROMPT = `You are an expert resume parser specialising in complete, lossless data extraction.

CRITICAL RULES:
1. Extract EVERY section present in the resume — do not filter, skip, or prioritise
2. Never drop "less important" sections (Languages, Personal Details, Declaration, Hobbies, etc.)
3. If a section exists in the resume, it MUST appear in the output
4. Return complete JSON only — no markdown, no code fences, no explanation`

// ── Schema prompt ─────────────────────────────────────────────────────────────

const PARSE_SCHEMA_PROMPT = `Extract ALL information from this resume and return as JSON with EXACTLY this structure.

PART A — Structured fields (used by job matching and profile sync):
{
  "name": "Full name",
  "email": "Email address",
  "phone": "Phone number",
  "location": "City, State/Country",
  "summary": "Professional summary or objective (derive one if not explicitly written)",
  "skills": ["skill1", "skill2"],
  "experience": [
    {
      "company": "Company name",
      "title": "Job title",
      "start_date": "Month Year or Year",
      "end_date": "Month Year, Year, or null if current",
      "bullets": ["achievement or responsibility"]
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
  "certifications": ["cert1", "cert2"]
}

PART B — Complete section map (lossless — captures EVERY section including non-standard ones):
"sections": [
  { "title": "Professional Summary", "content": "full text content of this section" },
  { "title": "Work Experience", "content": "full text of all experience entries" },
  { "title": "Skills", "content": "all skills as listed" },
  { "title": "Education", "content": "all education entries" },
  { "title": "Certifications", "content": "all certifications" },
  { "title": "Languages", "content": "e.g. English - Native, Hindi - Fluent" },
  { "title": "Personal Details", "content": "DOB, nationality, marital status, etc." },
  { "title": "Declaration", "content": "exact declaration text" }
]

MANDATORY: Every section heading found in the resume MUST appear as an entry in "sections[]".
Do NOT omit Languages, Personal Details, Declaration, Hobbies, Projects, or any other section.
Preserve section content verbatim — do not summarise or truncate.

Return BOTH Part A and Part B merged into a single JSON object.`

// ── Validation ────────────────────────────────────────────────────────────────

interface ParseValidation {
  valid: boolean
  missingSections: string[]
  coveragePercent: number
}

function validateParsed(rawText: string, parsed: ParsedResume): ParseValidation {
  const rawLower = rawText.toLowerCase()
  const missingSections: string[] = []

  // Known section patterns to check
  const SECTION_CHECKS: [RegExp, string][] = [
    [/\blanguages?\b/i,       'Languages'],
    [/\bpersonal\s+details?\b|\bpersonal\s+info/i, 'Personal Details'],
    [/\bdeclaration\b/i,       'Declaration'],
    [/\bhobbies?\b|\binterests?\b/i, 'Hobbies / Interests'],
    [/\bprojects?\b/i,         'Projects'],
    [/\bpublications?\b/i,     'Publications'],
    [/\bvolunteer\b/i,         'Volunteer Experience'],
    [/\bawards?\b|\bachievements?\b/i, 'Awards'],
    [/\breferences?\b/i,       'References'],
  ]

  for (const [pattern, label] of SECTION_CHECKS) {
    if (pattern.test(rawLower)) {
      // Check if it's captured in sections[]
      const inSections = (parsed.sections ?? []).some(s =>
        s.title.toLowerCase().includes(label.toLowerCase().split(' ')[0]) ||
        label.toLowerCase().includes(s.title.toLowerCase().split(' ')[0])
      )
      // Also check if content appears anywhere in the parsed JSON
      const parsedStr = JSON.stringify(parsed).toLowerCase()
      const firstWord = label.toLowerCase().split(' ')[0]
      if (!inSections && !parsedStr.includes(firstWord)) {
        missingSections.push(label)
      }
    }
  }

  // Rough coverage: check that key content tokens from raw appear in parsed JSON
  const parsedStr = JSON.stringify(parsed).toLowerCase()
  const rawWords  = rawLower.split(/\s+/).filter(w => w.length > 4)
  const sampleSize = Math.min(rawWords.length, 50)
  const sample = rawWords.sort(() => 0.5 - Math.random()).slice(0, sampleSize)
  const matched = sample.filter(w => parsedStr.includes(w)).length
  const coveragePercent = sampleSize > 0 ? Math.round((matched / sampleSize) * 100) : 100

  return {
    valid: missingSections.length === 0 && coveragePercent >= 60,
    missingSections,
    coveragePercent,
  }
}

// ── Core parse functions ──────────────────────────────────────────────────────

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
  const result = await callClaudeJSON<ParsedResume>(prompt, PARSE_SYSTEM_PROMPT, 4096)

  // Validation: if critical sections detected in raw text are missing, log warning
  const { valid, missingSections, coveragePercent } = validateParsed(rawText, result)
  if (!valid) {
    console.warn('[parser] validation warning — missing sections:', missingSections, 'coverage:', coveragePercent + '%')
    // On low coverage, retry once with explicit instruction
    if (coveragePercent < 60 || missingSections.length > 2) {
      const retryPrompt = `${PARSE_SCHEMA_PROMPT}

CRITICAL — previous parse missed these sections: ${missingSections.join(', ')}.
You MUST include ALL of them in the "sections" array.

RESUME TEXT:\n${rawText}`
      return callClaudeJSON<ParsedResume>(retryPrompt, PARSE_SYSTEM_PROMPT, 4096)
    }
  }

  return result
}

export async function parseResumeFromPDF(pdfBuffer: Buffer): Promise<ParsedResume> {
  const fullSystem = `${PARSE_SYSTEM_PROMPT}\n\nIMPORTANT: Respond with valid JSON only. No markdown, no code fences, no explanation — just the raw JSON object.`

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
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
  const result  = JSON.parse(cleaned) as ParsedResume

  // Log any missing sections (non-fatal for PDF path — raw text not available for comparison)
  if (!result.sections?.length) {
    console.warn('[parser/pdf] sections[] is empty — all resume sections may not be captured')
  } else {
    console.log('[parser/pdf] captured sections:', result.sections.map(s => s.title).join(', '))
  }

  return result
}
