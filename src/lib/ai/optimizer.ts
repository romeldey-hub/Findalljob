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
  /**
   * Every non-standard section from the original resume (Languages, Personal Details,
   * Hobbies, Declaration, etc.) output here — never merged into other fields.
   */
  additionalSections?: Array<{ title: string; content: string }>

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
  score_improvement_reason: string
}

/**
 * Weighted improvement formula.
 * Each dimension is scored 0–20 by Claude; weights sum to 1.0.
 * Result is always clamped to [originalScore, 100].
 */
export function calculateImprovedScore(
  originalScore: number,
  improvements: ScoreImprovements
): number {
  const weighted =
    (improvements.keyword_increase              * 0.3) +
    (improvements.skill_match_increase          * 0.3) +
    (improvements.experience_alignment_increase * 0.2) +
    (improvements.missing_skills_reduction      * 0.2)
  return Math.min(100, Math.max(originalScore, Math.round(originalScore + weighted)))
}

// ── Structure Preservation Engine ────────────────────────────────────────────

interface StructureMap {
  /** Ordered list of section names detected in the original, e.g. ["Summary", "Experience", "Skills"] */
  sections: string[]
  companies: string[]           // exact company names found in original
  languages: string[]           // e.g. ["English", "Hindi - Fluent"]
  certificationList: string[]   // individual cert names
  hasLanguages: boolean
  hasPersonalDetails: boolean
  hasCertifications: boolean
  hasEducation: boolean
  experienceCount: number
  skillCount: number
}

/** STEP 1 — Detect every section present in the original resume text */
function extractStructure(text: string): StructureMap {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Known section header patterns (case-insensitive)
  const SECTION_PATTERNS: [RegExp, string][] = [
    [/^(professional\s+)?summary|profile|objective|about\s+me/i,        'Professional Summary'],
    [/^(work\s+)?(experience|employment|history)/i,                       'Work Experience'],
    [/^(key\s+)?(skills?|competencies|expertise|technologies|tech stack)/i, 'Skills'],
    [/^education|academic|qualification/i,                                'Education'],
    [/^certifi(cation|cate)s?|credentials?|licenses?/i,                  'Certifications'],
    [/^languages?(\s+skills?)?/i,                                         'Languages'],
    [/^personal\s*(details?|info(rmation)?)|hobbies|interests|activities/i, 'Personal Details'],
    [/^awards?|achievements?|honors?/i,                                   'Awards & Achievements'],
    [/^projects?/i,                                                       'Projects'],
    [/^publications?/i,                                                   'Publications'],
    [/^volunteer|community/i,                                             'Volunteer Experience'],
    [/^references?/i,                                                     'References'],
  ]

  const detectedSections: string[] = []
  const seenSections = new Set<string>()

  for (const line of lines) {
    // A section header is a short line (≤ 60 chars) with no period at end
    if (line.length > 60 || line.endsWith('.')) continue
    for (const [pattern, label] of SECTION_PATTERNS) {
      if (pattern.test(line) && !seenSections.has(label)) {
        detectedSections.push(label)
        seenSections.add(label)
        break
      }
    }
  }

  // Fallback: if no sections detected, add at least Summary + Experience + Skills
  if (detectedSections.length === 0) {
    detectedSections.push('Professional Summary', 'Work Experience', 'Skills')
  }

  // Extract company names: look for lines near date patterns
  const companies: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const hasDate = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b.*\d{4}/i.test(line) ||
                   /\d{4}\s*[-–]\s*(\d{4}|present)/i.test(line)
    if (hasDate) {
      // Company name is often on this line or the line immediately before/after
      const candidates = [lines[i - 1], line, lines[i + 1]].filter(Boolean)
      for (const c of candidates) {
        const clean = c.replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b.*$/i, '')
                       .replace(/\d{4}.*/g, '').replace(/[|•·,]/g, '').trim()
        if (clean.length > 1 && clean.length < 60 && !companies.includes(clean)) {
          companies.push(clean)
        }
      }
    }
  }

  // Extract languages from a Languages section
  const languages: string[] = []
  let inLanguages = false
  for (const line of lines) {
    if (/^languages?(\s+skills?)?$/i.test(line)) { inLanguages = true; continue }
    if (inLanguages) {
      // Stop at next section header
      if (detectedSections.some(s => line.toLowerCase().startsWith(s.toLowerCase().slice(0, 5)))) {
        inLanguages = false; break
      }
      const parts = line.split(/[,|•·\n]/)
      for (const p of parts) {
        const lang = p.trim()
        if (lang.length > 1 && lang.length < 40) languages.push(lang)
      }
    }
  }

  // Extract certifications
  const certificationList: string[] = []
  let inCerts = false
  for (const line of lines) {
    if (/^certifi(cation|cate)s?|credentials?/i.test(line)) { inCerts = true; continue }
    if (inCerts) {
      if (detectedSections.some(s => line.toLowerCase().startsWith(s.toLowerCase().slice(0, 5)))) {
        inCerts = false; break
      }
      const clean = line.replace(/^[•·\-*]\s*/, '').trim()
      if (clean.length > 2) certificationList.push(clean)
    }
  }

  // Count skills
  const skillsMatch = text.match(/skills?[:\s]*\n?([\s\S]{0,600})/i)
  const skillCount = skillsMatch
    ? skillsMatch[1].split(/[,\n•·|]/).filter(s => s.trim().length > 1).length
    : 0

  // Count experience entries via date lines
  const expLines = lines.filter(l =>
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b.*\d{4}/i.test(l) ||
    /\d{4}\s*[-–]\s*(\d{4}|present)/i.test(l)
  )
  const experienceCount = Math.max(expLines.length, 1)

  return {
    sections:          detectedSections,
    companies:         [...new Set(companies)].slice(0, 20),
    languages,
    certificationList: certificationList.slice(0, 20),
    hasLanguages:      seenSections.has('Languages'),
    hasPersonalDetails: seenSections.has('Personal Details'),
    hasCertifications: seenSections.has('Certifications'),
    hasEducation:      seenSections.has('Education'),
    experienceCount,
    skillCount,
  }
}

/** STEP 2 — Build the locked structure instruction injected into every prompt */
function buildStructureLock(map: StructureMap): string {
  const STANDARD_SECTIONS = new Set([
    'Professional Summary', 'Work Experience', 'Skills', 'Education', 'Certifications',
  ])

  const lines: string[] = [
    '━━━ SECTION IDENTITY LOCK — EVERY SECTION MUST REMAIN INDEPENDENT ━━━',
    'The original resume contains these sections IN THIS ORDER.',
    'Every single one MUST appear in your output — no exceptions, no merging, no renaming.',
    '',
  ]

  map.sections.forEach((section, i) => {
    let mapping = ''
    switch (section) {
      case 'Professional Summary':
        mapping = '→ output field: "summary" (3–4 sentences, enhanced)'
        break
      case 'Work Experience':
        mapping = `→ output field: "experience" (ALL ${map.experienceCount} role(s) required)`
        break
      case 'Skills':
        mapping = `→ output field: "skills" (${map.skillCount} or more skills required)`
        break
      case 'Education':
        mapping = '→ output field: "education" (all entries required)'
        break
      case 'Certifications':
        mapping = `→ output field: "certifications" (all ${map.certificationList.length || 'original'} entries required)`
        break
      case 'Languages':
        mapping = `→ "additionalSections" entry: { "title": "LANGUAGES", "content": "${map.languages.length ? map.languages.join(' | ') : 'Language | Proficiency'}" }`
        break
      case 'Personal Details':
        mapping = '→ "additionalSections" entry: { "title": "PERSONAL DETAILS", "content": "preserve all personal details exactly as written" }'
        break
      default:
        mapping = `→ "additionalSections" entry: { "title": "${section.toUpperCase()}", "content": "all content of this section verbatim" }`
    }
    lines.push(`  ${i + 1}. ${section} ${mapping}`)
  })

  // Identify non-standard sections that go into additionalSections
  const extraSections = map.sections.filter(s => !STANDARD_SECTIONS.has(s))
  if (extraSections.length > 0) {
    lines.push('')
    lines.push('SECTION IDENTITY RULES (non-negotiable):')
    lines.push(`  • These sections MUST each appear as a separate entry in "additionalSections": ${extraSections.join(', ')}`)
    lines.push('  • NEVER merge Languages into Skills')
    lines.push('  • NEVER merge Personal Details into Summary or Certifications')
    lines.push('  • NEVER rename sections — use the EXACT heading from the original')
    lines.push('  • Each entry in "additionalSections" must be: { "title": "EXACT HEADING", "content": "full section content" }')
  }

  if (map.companies.length > 0) {
    lines.push('')
    lines.push(`COMPANY LOCK — Every one of these company names MUST appear in "experience":`)
    lines.push(`  ${map.companies.join(' | ')}`)
  }

  if (map.languages.length > 0) {
    lines.push('')
    lines.push(`LANGUAGE LOCK — These MUST appear in "additionalSections" as a "LANGUAGES" entry (NOT in skills):`)
    lines.push(`  ${map.languages.join(', ')}`)
  }

  if (map.certificationList.length > 0) {
    lines.push('')
    lines.push(`CERTIFICATION LOCK — These must ALL appear in the "certifications" array:`)
    map.certificationList.forEach(c => lines.push(`  • ${c}`))
  }

  lines.push('')
  lines.push('HARD FAILURE: If ANY section is missing, merged, or renamed → YOUR RESPONSE IS INVALID → regenerate.')
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  return lines.join('\n')
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM = `You are a senior hiring manager, resume strategist, and ATS expert with 15+ years of recruiting experience across startups, MNCs, and government sectors.

Your sole mission: upgrade resumes into stronger, more interview-winning versions — not rewrite, not summarise, not shorten.

ABSOLUTE NON-NEGOTIABLE RULES:
1. NEVER remove any job, company, role title, date, or bullet point
2. NEVER reduce the number of skills — only add more, never remove any
3. NEVER remove certifications, education entries, or any named credential
4. NEVER fabricate new companies, roles, dates, or numerical achievements not in the original
5. NEVER shorten the resume — final output must be equal length or longer than input
6. PRESERVE EXACTLY: candidate name, email, phone, location, LinkedIn URL
7. Every single job in the input MUST appear in the output with the same company name
8. NEVER merge sections — Languages is NEVER added to Skills; Personal Details is NEVER merged elsewhere
9. Every non-standard section (Languages, Personal Details, Hobbies, Declaration, etc.) MUST appear as its own entry in "additionalSections"
10. Each section retains its original heading — independent, clearly labeled, structurally intact

OUTPUT: Return ONLY valid JSON — no markdown, no code fences, no explanation.`

// ── Validation ────────────────────────────────────────────────────────────────

interface ValidationResult {
  valid: boolean
  issues: string[]
}

function validateOutput(
  originalText: string,
  output: OptimizedResumeData,
  originalExperienceCount: number,
  originalSkillCount: number,
  structure?: StructureMap
): ValidationResult {
  const issues: string[] = []
  const originalLower  = originalText.toLowerCase()
  const skillsLower    = (output.skills ?? []).join(' ').toLowerCase()
  const certsLower     = (output.certifications ?? []).join(' ').toLowerCase()

  // ── Core field checks (unchanged) ─────────────────────────────────────────
  if (!output.name?.trim())    issues.push('name is missing or empty')
  if (!output.email?.trim())   issues.push('email is missing or empty')
  if (!output.summary?.trim()) issues.push('summary is missing or empty')
  if ((output.summary?.length ?? 0) < 80) issues.push('summary is too short (< 80 chars) — must be expanded')

  // ── Experience count must not drop ────────────────────────────────────────
  const outExpCount = output.experience?.length ?? 0
  if (outExpCount < originalExperienceCount) {
    issues.push(`experience count dropped: original had ${originalExperienceCount} roles, output has ${outExpCount} — all jobs must be preserved`)
  }

  // ── Every output company must exist in original text ───────────────────────
  for (const exp of output.experience ?? []) {
    const company = exp.company?.trim()
    if (!company) { issues.push('an experience entry has an empty company name'); continue }
    if (!originalLower.includes(company.toLowerCase())) {
      issues.push(`company "${exp.company}" does not appear in the original resume — do not fabricate companies`)
    }
    if (!exp.title?.trim()) issues.push(`experience entry at "${exp.company}" has no job title`)
    if (!exp.bullets?.length) issues.push(`experience entry at "${exp.company}" has no bullet points — every role needs at least one bullet`)
  }

  // ── Skills count must not drop significantly ───────────────────────────────
  const outSkillCount = output.skills?.length ?? 0
  if (outSkillCount < originalSkillCount - 2) {
    issues.push(`skills dropped from ${originalSkillCount} to ${outSkillCount} — original skills must be preserved and expanded`)
  }

  // ── Education must be present if detected ─────────────────────────────────
  if (!output.education?.length && (structure?.hasEducation ?? originalLower.includes('education'))) {
    issues.push('education section is empty — preserve all education entries')
  }

  // ── Structure Preservation Engine checks (additive) ───────────────────────
  if (structure) {
    const additionalLower = (output.additionalSections ?? []).map(s => ({
      title:   s.title.toLowerCase(),
      content: s.content.toLowerCase(),
    }))

    // STEP 4: company lock — every company in structure map must appear in output experience
    for (const company of structure.companies) {
      const found = (output.experience ?? []).some(
        exp => exp.company?.toLowerCase().includes(company.toLowerCase()) ||
               company.toLowerCase().includes(exp.company?.toLowerCase() ?? '')
      )
      if (!found) {
        issues.push(`company "${company}" from original resume is missing in output experience — all roles must be preserved`)
      }
    }

    // Language identity lock — Languages section must exist in additionalSections, NOT merged into skills
    if (structure.hasLanguages) {
      const hasLanguagesSection = additionalLower.some(s =>
        s.title.includes('language') || s.title.includes('lang')
      )
      if (!hasLanguagesSection) {
        issues.push('Languages section is missing from "additionalSections" — create a dedicated LANGUAGES entry (do NOT merge into skills)')
      } else {
        // Verify each language appears in the section
        for (const lang of structure.languages) {
          const langCore = lang.split(/[-–(]/)[0].trim().toLowerCase()
          if (langCore.length > 1) {
            const inSection = additionalLower.some(s =>
              s.title.includes('language') && s.content.includes(langCore)
            )
            if (!inSection) {
              issues.push(`language "${lang}" must appear in the LANGUAGES section of additionalSections`)
            }
          }
        }
      }
    }

    // Personal Details identity lock — must stay in additionalSections
    if (structure.hasPersonalDetails) {
      const hasPersonalSection = additionalLower.some(s =>
        s.title.includes('personal') || s.title.includes('detail')
      )
      if (!hasPersonalSection) {
        issues.push('Personal Details section is missing from "additionalSections" — create a dedicated PERSONAL DETAILS entry (do NOT merge into summary or certifications)')
      }
    }

    // Section identity lock — all non-standard sections must appear in additionalSections
    const STANDARD_OUTPUT_SECTIONS = new Set(['Professional Summary', 'Work Experience', 'Skills', 'Education', 'Certifications'])
    for (const section of structure.sections) {
      if (STANDARD_OUTPUT_SECTIONS.has(section)) continue
      const sectionCore = section.toLowerCase().split(/[\s/]/)[0]
      const found = additionalLower.some(s => s.title.includes(sectionCore) || sectionCore.includes(s.title.split(' ')[0]))
      if (!found) {
        issues.push(`section "${section}" from original resume is missing from "additionalSections" — every non-standard section must be preserved as its own entry`)
      }
    }

    // Certification lock — each detected cert must appear in certifications array
    for (const cert of structure.certificationList) {
      const certCore = cert.split(/[\s(]/)[0].toLowerCase()
      if (certCore.length > 2 && !certsLower.includes(certCore)) {
        issues.push(`certification "${cert}" from original resume is missing from certifications array`)
      }
    }

    // Certifications section was present but output array is empty
    if (structure.hasCertifications && !(output.certifications?.length)) {
      issues.push('certifications section detected in original but output certifications array is empty — preserve all certifications')
    }
  }

  return { valid: issues.length === 0, issues }
}

function countExperiences(resumeText: string): number {
  // Heuristic: count lines that look like job title + company patterns
  const lines = resumeText.split('\n')
  let count = 0
  for (const line of lines) {
    const l = line.trim()
    if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b.*\d{4}/i.test(l)) count++
  }
  return Math.max(count, 1)
}

function countSkills(resumeText: string): number {
  const skillsMatch = resumeText.match(/skills[:\s]*\n?([\s\S]{0,500})/i)
  if (!skillsMatch) return 0
  return skillsMatch[1].split(/[,\n•·|]/).filter(s => s.trim().length > 1).length
}

// ── Retry wrapper ─────────────────────────────────────────────────────────────

async function optimizeWithValidation(
  buildPrompt: (structureLock: string, retryContext?: string) => string,
  originalText: string,
  originalExperienceCount: number,
  originalSkillCount: number,
  maxRetries = 1
): Promise<OptimizedResumeData> {
  // STEP 1 & 2: extract structure ONCE before any AI calls
  const structure     = extractStructure(originalText)
  const structureLock = buildStructureLock(structure)

  let lastIssues: string[] = []

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const retryContext = lastIssues.length > 0
      ? `\n\nPREVIOUS ATTEMPT FAILED VALIDATION. FIX THESE ISSUES BEFORE RETURNING:\n${lastIssues.map(i => `- ${i}`).join('\n')}\n`
      : undefined

    // Same buildPrompt function is always called — no fallback or simplification
    const result = await callClaudeJSON<OptimizedResumeData>(buildPrompt(structureLock, retryContext), SYSTEM, 8000)
    const { valid, issues } = validateOutput(originalText, result, originalExperienceCount, originalSkillCount, structure)

    if (valid) return result

    lastIssues = issues
    console.warn(`[optimizer] attempt ${attempt + 1} failed validation:`, issues)
  }

  // Final attempt: still the SAME optimization prompt — never a fallback
  const finalResult = await callClaudeJSON<OptimizedResumeData>(buildPrompt(
    structureLock,
    `\n\nFINAL ATTEMPT — CRITICAL: Fix ALL of these issues:\n${lastIssues.map(i => `- ${i}`).join('\n')}\n`
  ), SYSTEM, 8000)
  return finalResult
}

// ── JSON schema template ──────────────────────────────────────────────────────

const JSON_SCHEMA = `{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "+XX XXXXXXXXXX",
  "location": "City, Country",
  "linkedin": "linkedin.com/in/username or empty string",
  "summary": "3-4 sentence senior-level professional summary with keywords",
  "experience": [
    {
      "title": "Job Title",
      "company": "EXACT Company Name from original",
      "location": "City, Country",
      "start_date": "Mon YYYY",
      "end_date": "Mon YYYY or Present",
      "bullets": [
        "Strong action-verb bullet with specific outcome and business context",
        "Quantified or impact-driven achievement preserving all original specifics"
      ]
    }
  ],
  "skills": ["Skill1", "Skill2"],
  "education": [{ "school": "University", "degree": "B.Tech", "field": "CS", "graduation_year": "2020" }],
  "certifications": ["Certification Name"],
  "additionalSections": [
    { "title": "LANGUAGES", "content": "English | Native  Hindi | Fluent  Bengali | Conversational" },
    { "title": "PERSONAL DETAILS", "content": "Date of Birth: 12 Jan 1990 | Nationality: Indian | Marital Status: Single" }
  ],
  "ats_score": 78,
  "original_score": 0,
  "section_scores": { "summary": 85, "skills": 80, "experience": 72 },
  "matched_keywords": ["keyword1", "keyword2"],
  "missing_keywords": ["keyword3"],
  "improvements": [
    { "section": "summary", "type": "keyword_added", "note": "Strengthened with seniority and domain keywords" },
    { "section": "experience", "type": "bullet_strengthened", "note": "Upgraded bullets with impact framing across all roles" }
  ],
  "score_improvements": { "keyword_increase": 8, "skill_match_increase": 10, "experience_alignment_increase": 12, "missing_skills_reduction": 5 },
  "score_improvement_reason": "Strengthened bullets, expanded skills, improved professional tone"
}`

// ── General optimization ──────────────────────────────────────────────────────

export async function optimizeResumeGeneral(resumeText: string): Promise<OptimizedResumeData> {
  const originalExpCount   = countExperiences(resumeText)
  const originalSkillCount = countSkills(resumeText)

  function buildPrompt(structureLock: string, retryContext?: string): string {
    return `You are acting as a senior hiring manager and resume strategist reviewing this candidate's resume. Your goal is to UPGRADE it — make it stronger, sharper, and more interview-winning — without losing a single piece of information.

${retryContext ?? ''}
${structureLock}

━━━ CANDIDATE'S RESUME ━━━
${resumeText.slice(0, 9000)}
━━━━━━━━━━━━━━━━━━━━━━━━━

━━━ YOUR ENHANCEMENT MANDATE ━━━

STEP 1 — PRESERVE EVERYTHING (MANDATORY):
• Keep ALL companies, job titles, dates, and locations exactly as written
• Keep ALL bullet points — every single one must appear in enhanced form
• Keep ALL skills — expand the list, never shrink it
• Keep ALL certifications, education, and contact details
• Keep ALL tools, technologies, platforms, and product names mentioned

STEP 2 — PROFESSIONAL SUMMARY:
• Expand to 3–4 sentences
• Open with a strong seniority statement + total years of experience
• Add 3–5 high-value ATS keywords relevant to the candidate's domain
• Make it sound authoritative, specific, and senior

STEP 3 — EXPERIENCE BULLETS (most important):
For EVERY bullet in EVERY role:
• Keep the original fact intact
• Add context: what was the scope, team size, business impact, or outcome
• Convert task descriptions into achievement statements
• Start with a strong action verb (Led, Built, Spearheaded, Delivered, Scaled, Architected, Optimized, Drove, Implemented, Launched)
• If no metric exists, add scope (e.g., "across 3 product lines", "for enterprise clients", "serving 50k+ users")
• NEVER fabricate specific numbers (%, revenue, headcount) that aren't in the original

BULLET UPGRADE EXAMPLES:
❌ "Managed OEM partnerships" → ✅ "Led strategic OEM partnerships with enterprise hardware vendors, driving government and B2B deal conversions and expanding indirect channel revenue"
❌ "Developed marketing content" → ✅ "Created and published performance-driven content across digital channels, maintaining consistent brand voice and improving audience engagement"
❌ "Supported sales team" → ✅ "Partnered with sales leadership to deliver technical demonstrations, RFP responses, and solution proposals that accelerated deal closures"

STEP 4 — SKILLS SECTION:
• Organize into logical groups (e.g., Technical Skills | Tools & Platforms | Soft Skills | Domain Expertise)
• Add 5–10 relevant industry keywords not already listed but clearly applicable based on their experience
• Keep every original skill — do not remove any

STEP 5 — ATS OPTIMIZATION:
• Inject high-value keywords naturally into the summary and bullets
• Ensure the resume reads well for both ATS scanners and human recruiters

━━━ SCORING ━━━
• ats_score: 0–100 honest general ATS readiness score for the UPGRADED resume
• section_scores: independent scores for summary, skills, experience
• matched_keywords: important field-relevant keywords now present (max 12)
• missing_keywords: valuable keywords still absent (max 8)
• improvements: list every meaningful upgrade made (max 10 items)
• score_improvements: 0–20 scale for each dimension
• score_improvement_reason: one sentence max 80 chars

Return EXACTLY this JSON structure:
${JSON_SCHEMA}`
  }

  return optimizeWithValidation(buildPrompt, resumeText, originalExpCount, originalSkillCount)
}

// ── Job-specific optimization ─────────────────────────────────────────────────

export async function optimizeResume(
  resumeText: string,
  jobTitle: string,
  jobDescription: string,
  company: string,
  originalScore = 0
): Promise<OptimizedResumeData> {
  const originalExpCount   = countExperiences(resumeText)
  const originalSkillCount = countSkills(resumeText)

  function buildPrompt(structureLock: string, retryContext?: string): string {
    return `You are acting as a senior hiring manager and ATS specialist tailoring this candidate's resume for a specific job. Your goal is to UPGRADE it for maximum relevance to this role — without losing a single piece of information.

${retryContext ?? ''}
${structureLock}

━━━ TARGET ROLE ━━━
Job Title: ${jobTitle}
Company: ${company}
${originalScore > 0 ? `Current ATS Match Score: ${originalScore}/100\n` : ''}
━━━ JOB DESCRIPTION (first 4000 chars) ━━━
${jobDescription.slice(0, 4000)}

━━━ CANDIDATE'S RESUME ━━━
${resumeText.slice(0, 8000)}
━━━━━━━━━━━━━━━━━━━━━━━━━

━━━ YOUR ENHANCEMENT MANDATE ━━━

STEP 1 — PRESERVE EVERYTHING (MANDATORY):
• Keep ALL companies, job titles, dates, and locations exactly as written
• Keep ALL bullet points — every single one must appear in enhanced form
• Keep ALL skills — expand the list, never shrink it
• Keep ALL certifications, education, and contact details
• Keep ALL tools, technologies, platforms, and product names mentioned

STEP 2 — JOB-TARGETED PROFESSIONAL SUMMARY:
• Rewrite to directly address the target role and company
• Mirror 3–5 key phrases directly from the job description
• Position the candidate as the ideal fit for THIS specific role
• 3–4 sentences, senior and confident in tone

STEP 3 — EXPERIENCE BULLETS (most important):
For EVERY bullet in EVERY role:
• Keep the original fact intact — enhance the language and add business impact
• Reframe bullets to emphasise skills and outcomes the JD values most
• Inject relevant JD keywords naturally where they fit the candidate's real experience
• Start with a strong action verb (Led, Built, Spearheaded, Delivered, Scaled, Architected, Optimized, Drove, Implemented, Launched)
• If no metric exists, add scope or context relevant to the target role
• NEVER fabricate specific numbers (%, revenue, headcount) not in the original

BULLET UPGRADE EXAMPLES:
❌ "Managed client accounts" → ✅ "Managed a portfolio of enterprise client accounts, serving as the primary point of contact for escalations, renewals, and solution expansion discussions"
❌ "Built reports in Excel" → ✅ "Built analytical dashboards and automated reporting pipelines in Excel, enabling data-driven decisions for cross-functional stakeholders"
❌ "Worked on GTM strategy" → ✅ "Contributed to go-to-market strategy development including competitive positioning, channel enablement, and sales collateral aligned with enterprise buyer journeys"

STEP 4 — SKILLS SECTION:
• Move skills most relevant to the JD to the top
• Add skills mentioned in the JD that the candidate demonstrably has (inferred from experience)
• Keep every original skill — do not remove any
• Aim for 15–25 total skills

STEP 5 — ATS KEYWORD OPTIMIZATION:
• Inject the JD's most important keywords into summary and bullets naturally
• Ensure keyword density is high enough to pass ATS without feeling stuffed

━━━ SCORING ━━━
• ats_score: 0–100 honest ATS fitness score for the UPGRADED resume against this JD
• original_score: ${originalScore}
• section_scores: independent scores for summary, skills, experience
• matched_keywords: important JD keywords now in the resume (max 12)
• missing_keywords: important JD keywords still absent — genuine gaps only (max 8)
• improvements: list every meaningful upgrade (max 10 items)
• score_improvements: 0–20 scale for each dimension
• score_improvement_reason: one sentence max 80 chars

Return EXACTLY this JSON structure:
${JSON_SCHEMA}`
  }

  const result = await optimizeWithValidation(buildPrompt, resumeText, originalExpCount, originalSkillCount)

  // Apply score calculation
  if (originalScore > 0 && result.score_improvements) {
    result.ats_score    = calculateImprovedScore(originalScore, result.score_improvements)
    result.original_score = originalScore
  } else if (originalScore > 0 && result.ats_score < originalScore) {
    result.ats_score    = originalScore
    result.original_score = originalScore
  }

  return result
}
