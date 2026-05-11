import type { Metadata } from 'next'
import { SeoPage, SeoSection, FeatureGrid, CompareTable } from '@/components/seo/SeoPage'

export const metadata: Metadata = {
  title: 'AI Mock Interview Practice — Prepare for Interviews with AI Feedback | FindAllJob',
  description: 'Practice real interview questions for your target role and resume. Get instant AI feedback on every answer. Build confidence before the actual interview.',
  alternates: { canonical: 'https://www.findalljob.com/ai-mock-interview' },
  openGraph: {
    type: 'website',
    title: 'AI Mock Interview Practice | FindAllJob',
    description: 'Practice interview questions tailored to your resume and role. Get instant AI feedback.',
    url: 'https://www.findalljob.com/ai-mock-interview',
    siteName: 'FindAllJob',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Mock Interview Practice | FindAllJob',
    description: 'Prepare for interviews with AI-powered practice sessions and instant feedback.',
  },
}

const features = [
  { title: 'Resume-Based Questions', body: 'Interview questions are generated from your actual resume — so you practice defending your real experience, not generic answers.' },
  { title: 'Role-Specific Questions', body: 'Questions are tailored to the specific job role and company you are interviewing for, including technical and behavioral prompts.' },
  { title: 'Instant AI Feedback', body: 'After each answer, AI evaluates your response for clarity, relevance, structure, and completeness — with specific suggestions to improve.' },
  { title: 'Behavioral & Technical Rounds', body: 'Practice both behavioral (STAR method) and technical questions depending on the role — software, product, marketing, and more.' },
  { title: 'Build Answer Confidence', body: 'Repeat sessions until your answers are crisp, confident, and well-structured. The more you practice, the better your real interview performance.' },
  { title: 'No Scheduling Required', body: 'Practice at any time — 11 PM before a morning interview, on a Sunday, during your commute. AI is always available.' },
]

const compareRows = [
  { label: '', without: 'Guessing what questions will be asked', with: 'Questions tailored to your resume and target role' },
  { label: '', without: 'Rambling, unstructured answers in real interviews', with: 'Structured, practiced answers with AI coaching' },
  { label: '', without: 'No feedback until after the interview (rejection email)', with: 'Instant feedback on every answer during practice' },
  { label: '', without: 'Paying ₹2000–5000/hr for a human mock interviewer', with: 'Unlimited practice sessions in the app' },
]

const faqs = [
  { q: 'How are interview questions generated?', a: 'FindAllJob AI reads your uploaded resume and the target job description (if provided) and generates questions that a real interviewer would ask — covering your experience, skills, career gaps, and role-specific knowledge.' },
  { q: 'What types of interview questions are included?', a: 'Behavioral questions (tell me about yourself, handle conflict, leadership), technical questions (relevant to your role), and situational questions (what would you do if…). The mix depends on your role and experience.' },
  { q: 'How does the AI feedback work?', a: 'You type or record your answer. AI evaluates it on multiple dimensions: relevance to the question, structure (STAR method for behavioral), depth of detail, confidence signals, and specific improvement suggestions.' },
  { q: 'How many mock interview sessions can I do?', a: 'Free users get limited sessions using their 5 one-time AI credits (1 session = 2 credits). Pro Lite users get 40 credits per month, Pro Plus users get 120 credits per month — enough for many full practice sessions.' },
  { q: 'Does this replace human interview coaching?', a: 'For most candidates, AI mock interviews provide enough structured practice to significantly improve real interview performance. For senior leadership roles, combining AI practice with human coaching gives the best results.' },
]

const relatedLinks = [
  { label: 'AI Resume Optimizer', href: '/ai-resume-optimizer' },
  { label: 'Resume Job Matching', href: '/resume-job-matching' },
  { label: 'Career Advice', href: '/career-advice' },
  { label: 'Jobs for Software Engineers', href: '/jobs-for-software-engineers' },
  { label: 'Jobs for Product Managers', href: '/jobs-for-product-managers' },
]

export default function AiMockInterviewPage() {
  return (
    <SeoPage
      headline="Practice Interviews with AI — Get Feedback Before the Real One"
      subheadline="FindAllJob generates real interview questions based on your resume and target role. Practice your answers, get instant AI feedback, and walk into every interview prepared."
      ctaLabel="Practice Interview with AI"
      faqs={faqs}
      relatedLinks={relatedLinks}
    >
      <SeoSection title="Why Most Candidates Fail Interviews">
        <p className="text-slate-400 text-[15px] leading-relaxed mb-6">
          Getting to the interview stage is hard. Failing it because of poor preparation is avoidable. Most candidates go into interviews without having practiced their answers out loud, without knowing which questions to expect, and without any feedback mechanism. AI mock interviews fix all three.
        </p>
        <CompareTable rows={compareRows} />
      </SeoSection>

      <SeoSection title="What You Get with AI Mock Interviews">
        <FeatureGrid items={features} />
      </SeoSection>

      <SeoSection title="How to Start a Mock Interview Session">
        <ol className="space-y-4 text-[15px] text-slate-400">
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">1.</span><span><strong className="text-white">Upload your resume</strong> — AI extracts your experience and sets the context for your interview session.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">2.</span><span><strong className="text-white">Select your target role</strong> — Choose the job you are preparing to interview for.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">3.</span><span><strong className="text-white">Start the session</strong> — AI asks you questions one by one, just like a real interviewer.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">4.</span><span><strong className="text-white">Get feedback per answer</strong> — After each response, AI tells you what was strong, what was weak, and how to improve.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">5.</span><span><strong className="text-white">Repeat until confident</strong> — Run as many sessions as you need until your answers feel natural and strong.</span></li>
        </ol>
      </SeoSection>
    </SeoPage>
  )
}
