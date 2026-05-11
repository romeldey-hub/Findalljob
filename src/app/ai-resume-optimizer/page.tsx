import type { Metadata } from 'next'
import { SeoPage, SeoSection, FeatureGrid, CompareTable } from '@/components/seo/SeoPage'

export const metadata: Metadata = {
  title: 'AI Resume Optimizer — Tailor Your Resume for Every Job | FindAllJob',
  description: 'Automatically optimize your resume for any job description using AI. Improve your ATS score, highlight the right keywords, and get more interview calls.',
  alternates: { canonical: 'https://www.findalljob.com/ai-resume-optimizer' },
  openGraph: {
    title: 'AI Resume Optimizer — Tailor Your Resume for Every Job | FindAllJob',
    description: 'Automatically optimize your resume for any job description using AI. Improve your ATS score and get more interview calls.',
    url: 'https://www.findalljob.com/ai-resume-optimizer',
    siteName: 'FindAllJob',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Resume Optimizer | FindAllJob',
    description: 'Tailor your resume for every job with AI. Improve ATS score and get more interview calls.',
  },
}

const features = [
  { title: 'Job-Specific Tailoring', body: 'AI rewrites and restructures your resume to match the exact keywords and requirements of each job posting.' },
  { title: 'ATS Score Improvement', body: 'See your resume score before and after optimization so you know exactly how much better your chances are.' },
  { title: 'Bullet Point Enhancement', body: 'AI rewrites your experience bullets to be stronger, more quantified, and more relevant to the role.' },
  { title: 'Keyword Gap Detection', body: 'Identifies missing keywords from the job description that ATS systems use to filter candidates.' },
  { title: 'Format Preservation', body: 'Your resume structure stays intact — only the content is optimized, not the format.' },
  { title: 'One-Click Optimization', body: 'No manual editing required. Select a job, click optimize, review and save.' },
]

const compareRows = [
  { label: '', without: 'Same resume sent to every job', with: 'Tailored resume for each specific role' },
  { label: '', without: 'Guessing which keywords matter', with: 'AI identifies exact ATS keywords to include' },
  { label: '', without: 'Low ATS score, resume gets filtered out', with: 'Higher ATS score, resume reaches human reviewers' },
  { label: '', without: 'Hours spent manually rewriting', with: 'Optimized in seconds with one click' },
]

const faqs = [
  { q: 'What is an AI resume optimizer?', a: 'An AI resume optimizer analyzes a job description and automatically rewrites your resume to match the specific keywords, skills, and requirements that the employer and their ATS (Applicant Tracking System) are looking for.' },
  { q: 'Does resume optimization actually work?', a: 'Yes. Most companies use ATS software to filter resumes before a human ever sees them. A resume optimized for the specific job description passes ATS filters at a much higher rate, increasing your chances of getting an interview.' },
  { q: 'Will my resume sound generic after optimization?', a: 'No. FindAllJob AI tailors your existing experience and bullets to match the role — it does not fabricate experience. Your authentic background is presented in the most relevant way for each job.' },
  { q: 'How many jobs can I optimize for?', a: 'Free users get 1 optimization preview per day. Pro Lite and Pro Plus users get 40–120 AI credits per month, each job optimization using 2 credits.' },
  { q: 'Is my resume data safe?', a: 'Yes. Your resume is stored securely and never shared with third parties. It is only used to generate your optimized versions.' },
]

const relatedLinks = [
  { label: 'ATS Resume Checker', href: '/ats-resume-checker' },
  { label: 'Tailor Resume to Job Description', href: '/tailor-resume-to-job-description' },
  { label: 'Resume Job Matching', href: '/resume-job-matching' },
  { label: 'AI Mock Interview', href: '/ai-mock-interview' },
]

export default function AiResumeOptimizerPage() {
  return (
    <SeoPage
      headline="Optimize Your Resume for Every Job with AI"
      subheadline="Stop sending the same resume everywhere. FindAllJob AI tailors your resume to each job description in seconds — improving your ATS score and getting you more interview calls."
      ctaLabel="Improve My Resume with AI"
      faqs={faqs}
      relatedLinks={relatedLinks}
    >
      <SeoSection title="Why Generic Resumes Get Rejected">
        <p className="text-slate-400 text-[15px] leading-relaxed mb-6">
          Over 75% of resumes are rejected by ATS software before a recruiter ever reads them. The reason is simple: your resume does not contain the exact keywords and phrases the job description uses. Manually tailoring your resume for every job takes hours. FindAllJob does it in seconds.
        </p>
        <CompareTable rows={compareRows} />
      </SeoSection>

      <SeoSection title="What FindAllJob AI Resume Optimizer Does">
        <FeatureGrid items={features} />
      </SeoSection>

      <SeoSection title="How It Works">
        <ol className="space-y-4 text-[15px] text-slate-400">
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">1.</span><span><strong className="text-white">Upload your resume</strong> — PDF or paste your text. AI parses your skills, experience, and education instantly.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">2.</span><span><strong className="text-white">Find a matching job</strong> — Browse AI-ranked job matches based on your resume, or add a job manually.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">3.</span><span><strong className="text-white">Click Optimize</strong> — AI rewrites your resume for that specific role in seconds.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">4.</span><span><strong className="text-white">Review, edit, and save</strong> — Preview the optimized version, make any manual edits, and download as PDF.</span></li>
        </ol>
      </SeoSection>
    </SeoPage>
  )
}
