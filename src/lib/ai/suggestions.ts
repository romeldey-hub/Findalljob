import { callClaudeJSON } from './claude'
import type { ParsedResume } from '@/types'

interface SuggestionInput {
  title: string
  matched_skills: string[]
  missing_skills: string[]
}

interface SuggestionResult {
  improvements: string[]
}

const SUGGESTIONS_SYSTEM_PROMPT = `You are an expert career coach who gives specific, actionable resume improvement advice. Be concrete — reference actual skills and role patterns from the data provided.`

export async function generateCvSuggestions(
  resume: ParsedResume,
  topJobs: SuggestionInput[]
): Promise<string[]> {
  // Tally missing skills by frequency across all matched jobs
  const freq: Record<string, number> = {}
  for (const job of topJobs) {
    for (const skill of job.missing_skills) {
      freq[skill] = (freq[skill] ?? 0) + 1
    }
  }
  const topMissing = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([skill]) => skill)

  const prompt = `Given this candidate's resume and the skills they are most often missing across ${topJobs.length} matched jobs, provide 6 specific, actionable resume improvements.

CANDIDATE:
- Current skills: ${resume.skills.slice(0, 20).join(', ')}
- Recent roles: ${resume.experience.slice(0, 2).map((e) => `${e.title} at ${e.company}`).join('; ')}
- Education: ${resume.education?.[0] ? `${resume.education[0].degree} in ${resume.education[0].field} from ${resume.education[0].school}` : 'Not specified'}

SKILLS MISSING ACROSS MATCHED JOBS (most frequent first): ${topMissing.join(', ')}

TOP JOB TITLES MATCHED: ${topJobs.slice(0, 5).map((j) => j.title).join(', ')}

Return JSON:
{
  "improvements": [
    "Specific actionable suggestion 1",
    "Specific actionable suggestion 2",
    "Specific actionable suggestion 3",
    "Specific actionable suggestion 4",
    "Specific actionable suggestion 5",
    "Specific actionable suggestion 6"
  ]
}

Each suggestion must be 1-2 sentences, concrete (mention specific skills/tools/patterns), and immediately actionable.`

  try {
    const result = await callClaudeJSON<SuggestionResult>(prompt, SUGGESTIONS_SYSTEM_PROMPT, 1024)
    return result.improvements ?? []
  } catch {
    return []
  }
}
