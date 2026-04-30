import { callClaudeJSON } from './claude'

export interface ResumeImprovement {
  section: 'summary' | 'experience' | 'skills' | 'education'
  type: 'keyword_added' | 'bullet_strengthened' | 'quantified' | 'fluff_removed'
  note: string
}

export interface ScoreImprovements {
  keyword_increase: number              // 0–20: more JD keywords now present
  skill_match_increase: number          // 0–20: skill section better aligned
  experience_alignment_increase: number // 0–20: bullets reframed for this role
  missing_skills_reduction: number      // 0–20: critical gaps closed
}

export interface OptimizedResumeData {
  name: string
  email: string
  phone: string
  location: string
  linkedin: string
  summary: string
  experience: Array<{
    title: string
    company: string
    location: string
    start_date: string
    end_date: string
    bullets: string[]
  }>
  skills: string[]
  education: Array<{
    school: string
    degree: string
    field: string
    graduation_year: string
  }>
  certifications: string[]

  // ── ATS metadata ──────────────────────────────────────────────────────────────
  ats_score: number
  original_score?: number
  section_scores: {
    summary: number
    skills: number
    experience: number
  }
  matched_keywords: string[]
  missing_keywords: string[]
  improvements: ResumeImprovement[]
  score_improvements: ScoreImprovements
  score_improvement_reason: string  // e.g. "Improved keyword match, added relevant skills"
}

/**
 * Weighted improvement formula — replaces the hardcoded +5.
 * Each dimension is scored 0–20 by Claude; weights sum to 1.0.
 * Result is always clamped to [originalScore, 100].
 */
export function calculateImprovedScore(
  originalScore: number,
  improvements: ScoreImprovements
): number {
  const weighted =
    (improvements.keyword_increase            * 0.3) +
    (improvements.skill_match_increase        * 0.3) +
    (improvements.experience_alignment_increase * 0.2) +
    (improvements.missing_skills_reduction    * 0.2)
  return Math.min(100, Math.max(originalScore, Math.round(originalScore + weighted)))
}

const SYSTEM = `You are an expert resume writer and ATS specialist.
Rewrite resumes as structured JSON only. Be truthful — never fabricate roles, companies, or achievements.
Return ONLY valid JSON — no markdown, no code fences, no explanation.`

export async function optimizeResume(
  resumeText: string,
  jobTitle: string,
  jobDescription: string,
  company: string,
  originalScore = 0
): Promise<OptimizedResumeData> {
  const prompt = `Rewrite this resume to target the specific job and return structured JSON.

JOB: ${jobTitle} at ${company}

JOB DESCRIPTION (first 4000 chars):
${jobDescription.slice(0, 4000)}

CANDIDATE'S CURRENT RESUME:
${resumeText.slice(0, 8000)}

${originalScore > 0 ? `The candidate's current ATS match score for this job is: ${originalScore}/100.\n` : ''}
Resume rewriting rules:
1. Tailor the professional summary specifically for this role and company
2. Rewrite and strengthen bullet points — quantify vague achievements
3. Inject relevant ATS keywords from the job description naturally (no stuffing)
4. Reorder skills so the most relevant ones come first
5. NEVER invent new companies, roles, dates, or achievements
6. Keep ALL real experience — do not omit any jobs
7. Bullets should start with strong action verbs

ATS scoring rules:
- ats_score: your honest 0–100 ATS fitness score for the REWRITTEN resume against this JD (be realistic: 85+ = excellent, 60–84 = good, below 60 = significant gaps)
- section_scores: score each section independently (summary 0–100, skills 0–100, experience 0–100)
- matched_keywords: important keywords from the JD that now appear in the rewritten resume (max 12)
- missing_keywords: important JD keywords still absent after rewriting — things the candidate genuinely lacks (max 8)
- improvements: list every meaningful change you made, max 8 items
- score_improvements: assess improvement achieved on each of these four dimensions using a 0–20 scale where 0 = no improvement and 20 = maximum possible improvement:
  - keyword_increase: how many more key JD terms now appear in the resume
  - skill_match_increase: how much better the skills section aligns with job requirements
  - experience_alignment_increase: how much better experience bullets are framed for this specific role
  - missing_skills_reduction: how many critical skill gaps were addressed through skills/summary additions
- score_improvement_reason: one concise sentence (max 80 chars) summarising the main improvement, e.g. "Improved keyword match and reframed experience bullets"

Return EXACTLY this JSON structure:
{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "+XX XXXXXXXXXX",
  "location": "City, Country",
  "linkedin": "linkedin.com/in/username or empty string",
  "summary": "2-3 sentence tailored summary for this specific role",
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "location": "City, Country",
      "start_date": "Mon YYYY",
      "end_date": "Mon YYYY or Present",
      "bullets": [
        "Led development of X resulting in Y% improvement",
        "Built Z using [tech] serving N users"
      ]
    }
  ],
  "skills": ["Skill1", "Skill2", "Skill3"],
  "education": [
    {
      "school": "University Name",
      "degree": "B.Tech",
      "field": "Computer Science",
      "graduation_year": "2020"
    }
  ],
  "certifications": ["Certification Name"],
  "ats_score": 78,
  "section_scores": {
    "summary": 85,
    "skills": 80,
    "experience": 72
  },
  "matched_keywords": ["keyword1", "keyword2"],
  "missing_keywords": ["keyword3", "keyword4"],
  "improvements": [
    { "section": "summary", "type": "keyword_added", "note": "Added 'cloud-native' and 'microservices' to summary" },
    { "section": "experience", "type": "bullet_strengthened", "note": "Reframed 3 bullets at TechCorp with quantified outcomes" },
    { "section": "skills", "type": "keyword_added", "note": "Moved React and Node.js to top to match JD priority" }
  ],
  "score_improvements": {
    "keyword_increase": 12,
    "skill_match_increase": 10,
    "experience_alignment_increase": 8,
    "missing_skills_reduction": 6
  },
  "score_improvement_reason": "Improved keyword match and reframed experience bullets"
}`

  return callClaudeJSON<OptimizedResumeData>(prompt, SYSTEM, 8000)
}
