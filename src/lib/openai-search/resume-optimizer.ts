import OpenAI from 'openai'
import { z } from 'zod'
import { zodTextFormat } from 'openai/helpers/zod'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'

const OPENAI_OPTIMIZER_MODEL =
  process.env.OPENAI_RESUME_OPTIMIZER_MODEL ??
  process.env.OPENAI_SEARCH_MODEL ??
  'gpt-5.2'

const ResumeImprovementSchema = z.object({
  section: z.enum(['summary', 'experience', 'skills', 'education']),
  type: z.enum(['keyword_added', 'bullet_strengthened', 'quantified', 'fluff_removed']),
  note: z.string(),
}).strict()

const ScoreImprovementsSchema = z.object({
  keyword_increase: z.number().int().min(0).max(20),
  skill_match_increase: z.number().int().min(0).max(20),
  experience_alignment_increase: z.number().int().min(0).max(20),
  missing_skills_reduction: z.number().int().min(0).max(20),
}).strict()

const OptimizedResumeSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  linkedin: z.string(),
  summary: z.string(),
  experience: z.array(z.object({
    title: z.string(),
    company: z.string(),
    location: z.string(),
    start_date: z.string(),
    end_date: z.string(),
    bullets: z.array(z.string()),
  }).strict()),
  skills: z.array(z.string()),
  education: z.array(z.object({
    school: z.string(),
    degree: z.string(),
    field: z.string(),
    graduation_year: z.string(),
  }).strict()),
  certifications: z.array(z.string()),
  sectionNotes: z.object({
    experience: z.string().nullable(),
    education: z.string().nullable(),
    certifications: z.string().nullable(),
    skills: z.string().nullable(),
  }).strict().nullable(),
  additionalSections: z.array(z.object({
    title: z.string(),
    content: z.string(),
    type: z.enum(['text', 'bullets', 'keyvalue']).nullable(),
    items: z.array(z.string()).nullable(),
    pairs: z.array(z.object({
      key: z.string(),
      value: z.string(),
    }).strict()).nullable(),
  }).strict()).nullable(),
  ats_score: z.number().int().min(0).max(100),
  original_score: z.number().int().min(0).max(100).nullable(),
  section_scores: z.object({
    summary: z.number().int().min(0).max(100),
    skills: z.number().int().min(0).max(100),
    experience: z.number().int().min(0).max(100),
  }).strict(),
  matched_keywords: z.array(z.string()).max(12),
  missing_keywords: z.array(z.string()).max(8),
  improvements: z.array(ResumeImprovementSchema).max(10),
  score_improvements: ScoreImprovementsSchema,
  score_improvement_reason: z.string(),
}).strict()

type OpenAIV2OptimizedResumeOutput = z.infer<typeof OptimizedResumeSchema>

function normalizeOptimizedResume(data: OpenAIV2OptimizedResumeOutput): OptimizedResumeData {
  return {
    ...data,
    original_score: data.original_score ?? undefined,
    sectionNotes: data.sectionNotes
      ? {
          ...(data.sectionNotes.experience ? { experience: data.sectionNotes.experience } : {}),
          ...(data.sectionNotes.education ? { education: data.sectionNotes.education } : {}),
          ...(data.sectionNotes.certifications ? { certifications: data.sectionNotes.certifications } : {}),
          ...(data.sectionNotes.skills ? { skills: data.sectionNotes.skills } : {}),
        }
      : undefined,
    additionalSections: data.additionalSections?.map((section) => ({
      title: section.title,
      content: section.content,
      ...(section.type ? { type: section.type } : {}),
      ...(section.items ? { items: section.items } : {}),
      ...(section.pairs ? { pairs: section.pairs } : {}),
    })) ?? undefined,
  }
}

function openaiClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export async function optimizeResumeWithOpenAIForV2({
  resumeText,
  jobTitle,
  jobDescription,
  company,
  originalScore,
  userId,
  isFreeUser,
}: {
  resumeText: string
  jobTitle: string
  jobDescription: string
  company: string
  originalScore: number
  userId?: string
  isFreeUser?: boolean
}): Promise<OptimizedResumeData> {
  const response = await openaiClient().responses.parse({
    model: OPENAI_OPTIMIZER_MODEL,
    instructions: [
      'You are an expert resume strategist and ATS specialist.',
      'Optimize this resume for the specific OpenAI Search V2 job using strict structured output.',
      'Use the provided V2 resume fix suggestions as direct optimization instructions, but only when truthful and supported by the resume.',
      'Never invent employers, titles, dates, tools, metrics, achievements, certifications, education, or experience.',
      'Preserve the candidate identity and real work history. Strengthen wording, ordering, keywords, and transferable alignment only.',
      'Keep the resume ATS-friendly and concise.',
      isFreeUser ? 'This may be shown as a free preview, so keep the result polished and complete.' : '',
    ].filter(Boolean).join(' '),
    input: [
      'TARGET ROLE',
      `Job Title: ${jobTitle}`,
      `Company: ${company}`,
      originalScore > 0 ? `Current V2 match score: ${originalScore}/100` : '',
      '',
      'JOB DESCRIPTION AND V2 OPTIMIZATION INSTRUCTIONS',
      jobDescription.slice(0, 5000),
      '',
      'CANDIDATE RESUME',
      resumeText.slice(0, 10000),
      '',
      'Return a complete optimized resume object. Keep all existing experience entries and only enhance truthful content. matched_keywords should reflect important job keywords that now appear in the optimized resume. missing_keywords should list genuine remaining gaps only.',
      userId ? `User ID for trace context: ${userId}` : '',
    ].filter(Boolean).join('\n'),
    text: { format: zodTextFormat(OptimizedResumeSchema, 'openai_v2_optimized_resume') },
  })

  if (!response.output_parsed) {
    throw new Error('OpenAI did not return a valid optimized resume')
  }

  return normalizeOptimizedResume(response.output_parsed)
}
