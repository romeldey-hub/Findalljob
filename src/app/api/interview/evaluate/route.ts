import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callClaudeJSON } from '@/lib/ai/claude'

export const maxDuration = 30

interface EvaluationResult {
  scores: { clarity: number; relevance: number; depth: number; confidence: number }
  strengths: string[]
  gaps: string[]
  redFlags: string[]
  improvedAnswer: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { question, answer, jobTitle, company } = await req.json()
  if (!question || !answer) {
    return NextResponse.json({ error: 'question and answer are required' }, { status: 400 })
  }
  if (answer.trim().length < 5) {
    return NextResponse.json({ error: 'Answer is too short to evaluate' }, { status: 400 })
  }

  const result = await callClaudeJSON<EvaluationResult>(
    `Evaluate this interview answer for the ${jobTitle} position at ${company}.

QUESTION: ${question}

CANDIDATE'S ANSWER: ${answer.slice(0, 2000)}

Return a JSON object with EXACTLY this shape:
{
  "scores": {
    "clarity": <integer 1-10>,
    "relevance": <integer 1-10>,
    "depth": <integer 1-10>,
    "confidence": <integer 1-10>
  },
  "strengths": ["strength 1", "strength 2"],
  "gaps": ["improvement area 1", "improvement area 2"],
  "redFlags": [],
  "improvedAnswer": "A polished, interview-ready version of their answer that would strongly impress the interviewer."
}

Scoring guide:
- clarity: how clearly structured and easy to follow
- relevance: how directly it addresses the question and role
- depth: level of specific detail, examples, and insight
- confidence: assertiveness and professional tone

Keep strengths/gaps to 2-3 bullet points each. Only populate redFlags if there is something genuinely problematic. The improvedAnswer should be 3-5 sentences, natural and authentic.`,
    'You are a senior hiring manager and interview coach. Be honest, specific, and constructive.',
    800,
  )

  return NextResponse.json(result)
}
