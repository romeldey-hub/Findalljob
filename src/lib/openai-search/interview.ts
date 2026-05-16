import { z } from 'zod'
import { zodTextFormat } from 'openai/helpers/zod'
import type { ParsedResume } from '@/types'
import { openAIResponsesCreate, openAIResponsesParse } from '@/lib/ai/openai'

const INTERVIEW_MODEL =
  process.env.OPENAI_INTERVIEW_MODEL ??
  process.env.OPENAI_SEARCH_MODEL ??
  'gpt-5.2'

const FeedbackSchema = z.object({
  scores: z.object({
    clarity: z.number().int().min(0).max(10),
    relevance: z.number().int().min(0).max(10),
    depth: z.number().int().min(0).max(10),
    confidence: z.number().int().min(0).max(10),
  }).strict(),
  strengths: z.array(z.string()).max(5),
  gaps: z.array(z.string()).max(5),
  redFlags: z.array(z.string()).max(5),
  improvedAnswer: z.string(),
}).strict()

export type OpenAIV2InterviewFeedback = z.infer<typeof FeedbackSchema>

export function candidateContextFromResume(parsed: ParsedResume | null) {
  if (!parsed) return 'No resume provided.'
  return [
    parsed.name ? `Name: ${parsed.name}` : null,
    parsed.location ? `Location: ${parsed.location}` : null,
    parsed.summary ? `Summary: ${parsed.summary.slice(0, 500)}` : null,
    parsed.skills?.length ? `Skills: ${parsed.skills.slice(0, 18).join(', ')}` : null,
    parsed.experience?.length
      ? `Experience: ${parsed.experience.map((exp) => `${exp.title} at ${exp.company}: ${(exp.bullets ?? []).slice(0, 3).join(' ')}`).join('\n')}`
      : null,
  ].filter(Boolean).join('\n')
}

export async function generateOpenAIV2InterviewQuestion({
  questionNumber,
  previousQuestions = [],
  jobTitle,
  company,
  jobDescription,
  candidateContext,
  v2Context,
  usage,
}: {
  questionNumber: number
  previousQuestions?: string[]
  jobTitle: string
  company: string
  jobDescription: string
  candidateContext: string
  v2Context: string
  usage?: {
    userId?: string
    userEmail?: string | null
    isFreeUser?: boolean
    creditsCharged?: number
    creditFeatureKey?: string
    jobId?: string | null
    companyName?: string | null
  }
}) {
  const response = await openAIResponsesCreate<{ output_text: string }>({
    model: INTERVIEW_MODEL,
    instructions: [
      'You are a professional interviewer and interview coach.',
      'Generate one clear, specific interview question tailored to the candidate resume and this OpenAI Search V2 job.',
      'Do not invent candidate experience. If there are gaps, ask a question that lets the candidate explain transferable experience honestly.',
      'Return only the question text.',
    ].join(' '),
    input: [
      `Question number: ${questionNumber}`,
      previousQuestions.length ? `Previous questions:\n${previousQuestions.join('\n')}` : '',
      `Job: ${jobTitle} at ${company}`,
      `Job description:\n${jobDescription.slice(0, 1400)}`,
      `V2 match context:\n${v2Context}`,
      `Candidate resume context:\n${candidateContext}`,
      questionNumber === 1
        ? 'For Q1, use a tailored "Tell me about yourself" style question.'
        : 'Avoid repeating previous questions.',
    ].filter(Boolean).join('\n\n'),
  }, {
    feature: questionNumber === 1 ? 'openai_interview_start' : 'openai_interview_next',
    userId: usage?.userId,
    userEmail: usage?.userEmail,
    isFreeUser: usage?.isFreeUser,
    creditsCharged: usage?.creditsCharged,
    creditFeatureKey: usage?.creditFeatureKey,
    jobId: usage?.jobId ?? null,
    companyName: usage?.companyName ?? company,
  })

  return response.output_text.trim()
}

export async function evaluateOpenAIV2InterviewAnswer({
  question,
  answer,
  jobTitle,
  company,
  jobDescription,
  candidateContext,
  v2Context,
  usage,
}: {
  question: string
  answer: string
  jobTitle: string
  company: string
  jobDescription: string
  candidateContext: string
  v2Context: string
  usage?: {
    userId?: string
    userEmail?: string | null
    isFreeUser?: boolean
    creditsCharged?: number
    creditFeatureKey?: string
    jobId?: string | null
    companyName?: string | null
  }
}) {
  const response = await openAIResponsesParse<{ output_parsed?: OpenAIV2InterviewFeedback }>({
    model: INTERVIEW_MODEL,
    instructions: [
      'You are a senior hiring manager and interview coach.',
      'Evaluate the answer honestly against the V2 job and candidate resume.',
      'Do not pretend the candidate has experience they did not mention.',
      'Frame gaps as preparation areas, not claimed experience.',
    ].join(' '),
    input: [
      `Job: ${jobTitle} at ${company}`,
      `Job description:\n${jobDescription.slice(0, 1200)}`,
      `V2 match context:\n${v2Context}`,
      `Candidate resume context:\n${candidateContext}`,
      `Question:\n${question}`,
      `Answer:\n${answer}`,
      'Return feedback matching the structured schema. improvedAnswer should be a truthful, stronger answer using only the candidate-provided answer and resume context.',
    ].join('\n\n'),
    text: { format: zodTextFormat(FeedbackSchema, 'openai_v2_interview_feedback') },
  }, {
    feature: 'openai_interview_evaluate',
    userId: usage?.userId,
    userEmail: usage?.userEmail,
    isFreeUser: usage?.isFreeUser,
    creditsCharged: usage?.creditsCharged,
    creditFeatureKey: usage?.creditFeatureKey,
    jobId: usage?.jobId ?? null,
    companyName: usage?.companyName ?? company,
  })

  if (!response.output_parsed) throw new Error('OpenAI did not return valid interview feedback')
  return response.output_parsed
}
