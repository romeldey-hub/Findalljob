import type { Metadata } from 'next'
import { SeoPage, SeoSection, FeatureGrid } from '@/components/seo/SeoPage'

export const metadata: Metadata = {
  title: 'ATS Resume Checker — Check If Your Resume Passes ATS | FindAllJob',
  description: 'Check your resume ATS compatibility score instantly. See which keywords are missing, what recruiters look for, and how to fix your resume to pass Applicant Tracking Systems.',
  alternates: { canonical: 'https://www.findalljob.com/ats-resume-checker' },
  openGraph: {
    title: 'ATS Resume Checker | FindAllJob',
    description: 'Check your resume ATS score and fix it before applying. Free to start.',
    url: 'https://www.findalljob.com/ats-resume-checker',
    siteName: 'FindAllJob',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ATS Resume Checker | FindAllJob',
    description: 'Check your resume ATS compatibility score instantly.',
  },
}

const features = [
  { title: 'ATS Compatibility Score', body: 'Get an overall ATS score for your resume based on structure, keywords, formatting, and completeness.' },
  { title: 'Skills Match Analysis', body: 'See how well your listed skills match what employers in your target role are searching for.' },
  { title: 'Experience Quality Check', body: 'AI evaluates whether your experience bullets are quantified, action-oriented, and relevant.' },
  { title: 'Content Completeness', body: 'Checks for required sections — summary, skills, experience, education — that ATS systems expect to find.' },
  { title: 'Job-Specific ATS Check', body: 'Run a job-specific check against an actual job description to see your tailored match score.' },
  { title: 'Instant Improvement Suggestions', body: 'Get specific, actionable suggestions to improve your ATS score after each check.' },
]

const atsFactors = [
  { title: 'Keyword Matching', body: 'ATS systems search for exact keywords from the job description. Missing keywords = automatic rejection.' },
  { title: 'File Format', body: 'PDFs and DOCX are generally safe. Scanned images, tables, and columns confuse many ATS parsers.' },
  { title: 'Section Headings', body: 'Standard headings like "Experience", "Education", and "Skills" are required. Creative headings get ignored.' },
  { title: 'Contact Information', body: 'Name, email, phone, and location must be in plain text — not in headers, footers, or images.' },
  { title: 'Dates Format', body: 'Employment dates must be in a consistent, recognisable format (e.g., Jan 2022 – Mar 2024).' },
  { title: 'No Tables or Graphics', body: 'ATS parsers strip out tables, columns, and images. All content must be in plain, linear text.' },
]

const faqs = [
  { q: 'What is an ATS resume checker?', a: 'An ATS (Applicant Tracking System) resume checker analyzes your resume to see whether it will be successfully parsed and ranked by the automated software that most employers use to screen job applications.' },
  { q: 'Why do so many resumes fail ATS?', a: 'Common reasons include: wrong file format, missing keywords, creative formatting with tables or graphics, unusual section headings, and missing contact information in plain text. Most of these issues are invisible to job seekers.' },
  { q: 'Is my ATS score the same for every job?', a: 'No. Your base resume score reflects general quality. But your ATS score changes per job depending on how well your resume keywords match the specific job description. That is why job-specific optimization matters.' },
  { q: 'How do I improve my ATS score?', a: 'Upload your resume to FindAllJob. View your ATS score and the improvement suggestions. Use the AI Resume Optimizer to tailor your resume for specific jobs — this is the fastest way to raise your job-specific ATS score.' },
  { q: 'Does FindAllJob store my resume data?', a: 'Yes, securely. Your resume data is stored in your account and used only to generate matches and optimizations for you. It is never shared with employers or third parties without your action.' },
]

const relatedLinks = [
  { label: 'AI Resume Optimizer', href: '/ai-resume-optimizer' },
  { label: 'Tailor Resume to Job Description', href: '/tailor-resume-to-job-description' },
  { label: 'Resume Job Matching', href: '/resume-job-matching' },
  { label: 'Public Resume Profile', href: '/public-resume-profile' },
]

export default function AtsResumeCheckerPage() {
  return (
    <SeoPage
      headline="Check If Your Resume Passes ATS — and Fix It"
      subheadline="75% of resumes are rejected by ATS software before a human ever reads them. FindAllJob checks your resume ATS score, identifies what is missing, and helps you fix it — job by job."
      ctaLabel="Check My Resume ATS Score"
      faqs={faqs}
      relatedLinks={relatedLinks}
    >
      <SeoSection title="What ATS Systems Check For">
        <p className="text-slate-400 text-[15px] leading-relaxed mb-6">
          Applicant Tracking Systems are used by over 90% of Fortune 500 companies and most mid-to-large employers. They automatically screen, parse, and rank resumes before any recruiter sees them. If your resume fails ATS parsing, it is rejected regardless of your actual qualifications.
        </p>
        <FeatureGrid items={atsFactors} />
      </SeoSection>

      <SeoSection title="What FindAllJob ATS Checker Does">
        <FeatureGrid items={features} />
      </SeoSection>

      <SeoSection title="How to Get Your ATS Score">
        <ol className="space-y-4 text-[15px] text-slate-400">
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">1.</span><span><strong className="text-white">Upload your resume</strong> — AI parses it and generates your base ATS compatibility score instantly.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">2.</span><span><strong className="text-white">View score breakdown</strong> — See scores for skills match, experience quality, content completeness, and ATS compatibility.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">3.</span><span><strong className="text-white">Select a job</strong> — Get a job-specific ATS score showing how your resume matches that role's requirements.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">4.</span><span><strong className="text-white">Optimize and improve</strong> — Use AI to rewrite your resume for the job and watch your ATS score improve.</span></li>
        </ol>
      </SeoSection>
    </SeoPage>
  )
}
