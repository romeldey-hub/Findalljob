import { callClaude } from './claude'

export type MessageType = 'initial_outreach' | 'follow_up' | 'thank_you' | 'networking'

const FOLLOWUP_SYSTEM_PROMPT = `You are a professional career coach writing concise, personalized outreach messages.
Keep messages under 150 words. Sound human, not templated. Never use phrases like "I hope this email finds you well".`

export async function generateFollowUpMessage(params: {
  type: MessageType
  candidateName: string
  jobTitle: string
  company: string
  resumeSummary: string
  jobDescription: string
  recruiterName?: string
  daysSinceApplication?: number
}): Promise<string> {
  const typeInstructions: Record<MessageType, string> = {
    initial_outreach: 'a cold outreach message to the hiring manager before applying',
    follow_up: `a follow-up message ${params.daysSinceApplication ?? 7} days after submitting the application`,
    thank_you: 'a thank-you note after an interview',
    networking: 'a networking message to someone at the company',
  }

  const prompt = `Write ${typeInstructions[params.type]}.

Candidate: ${params.candidateName}
Role: ${params.jobTitle} at ${params.company}
${params.recruiterName ? `Recipient: ${params.recruiterName}` : ''}

Candidate background (brief):
${params.resumeSummary.slice(0, 400)}

Job description (brief):
${params.jobDescription.slice(0, 400)}

Write the message body only (no subject line). Use first person. Keep it under 150 words.
Reference one specific thing about the role or company to show genuine interest.`

  return callClaude(prompt, FOLLOWUP_SYSTEM_PROMPT, 512)
}
