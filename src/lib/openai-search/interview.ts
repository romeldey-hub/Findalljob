import OpenAI from 'openai'
import { z } from 'zod'
import { zodTextFormat } from 'openai/helpers/zod'
import type { ParsedResume } from '@/types'

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

function openaiClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured')
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

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
}: {
  questionNumber: number
  previousQuestions?: string[]
  jobTitle: string
  company: string
  jobDescription: string
  candidateContext: string
  v2Context: string
}) {
  const response = await openaiClient().responses.create({
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
}: {
  question: string
  answer: string
  jobTitle: string
  company: string
  jobDescription: string
  candidateContext: string
  v2Context: string
}) {
  const response = await openaiClient().responses.parse({
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
  })

  if (!response.output_parsed) throw new Error('OpenAI did not return valid interview feedback')
  return response.output_parsed
}
