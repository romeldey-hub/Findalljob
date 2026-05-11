import type { Metadata } from 'next'
import { SeoPage, SeoSection, FeatureGrid, CompareTable } from '@/components/seo/SeoPage'

export const metadata: Metadata = {
  title: 'Tailor Resume to Job Description — AI Resume Customization | FindAllJob',
  description: 'Automatically customize your resume to match any job description using AI. Highlight the right skills, add missing keywords, and increase your chances of getting shortlisted.',
  alternates: { canonical: 'https://www.findalljob.com/tailor-resume-to-job-description' },
  openGraph: {
    title: 'Tailor Resume to Job Description | FindAllJob',
    description: 'AI customizes your resume for each job description. Get more interview calls.',
    url: 'https://www.findalljob.com/tailor-resume-to-job-description',
    siteName: 'FindAllJob',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tailor Resume to Job Description | FindAllJob',
    description: 'Automatically customize your resume to match any job description using AI.',
  },
}

const features = [
  { title: 'Keyword Injection', body: 'AI adds the exact keywords from the job description into your resume — in the right places, with the right context.' },
  { title: 'Skills Reordering', body: 'The most relevant skills for the target role are surfaced first, so the recruiter sees them immediately.' },
  { title: 'Experience Reframing', body: 'Your past experience bullets are rewritten to emphasize aspects most relevant to the new role.' },
  { title: 'Summary Rewrite', body: 'Your professional summary is rewritten to match the tone, seniority, and focus of the target job.' },
  { title: 'Role-Specific Language', body: 'Industry jargon and role-specific vocabulary from the job description is naturally incorporated into your resume.' },
  { title: 'Before / After Preview', body: 'See exactly what changed between your original and optimized resume before saving.' },
]

const compareRows = [
  { label: '', without: 'One resume, sent to 50 different jobs', with: 'A unique resume version tailored for each role' },
  { label: '', without: 'Missing job-specific keywords, rejected by ATS', with: 'All critical keywords naturally included' },
  { label: '', without: '2–3 hours manually rewriting per application', with: 'AI tailors in under 30 seconds' },
  { label: '', without: 'Generic summary that fits no job perfectly', with: 'Summary rewritten to match the specific role' },
]

const faqs = [
  { q: 'How is tailoring a resume different from optimizing it?', a: 'They refer to the same process. Tailoring means customizing your resume content to match a specific job description — adding relevant keywords, reframing experience bullets, and adjusting your summary. FindAllJob AI does this automatically.' },
  { q: 'Will the tailored resume still sound like me?', a: 'Yes. AI rewrites your existing experience and skills — it does not fabricate new ones. The output is your authentic background expressed in language that matches the target role.' },
  { q: 'Can I tailor my resume to multiple jobs?', a: 'Yes. Each job optimization creates a separate version of your resume. Free users get 1 preview per day. Pro users can tailor their resume for multiple jobs per month using AI credits.' },
  { q: 'What if the job description is very long?', a: 'FindAllJob AI reads the full job description and identifies the most important requirements to focus on. Long or complex JDs are handled automatically.' },
  { q: 'Does the format change when I tailor my resume?', a: 'No. Only the content changes — keywords, bullet points, and summary. The layout and format of your resume remains the same.' },
]

const relatedLinks = [
  { label: 'AI Resume Optimizer', href: '/ai-resume-optimizer' },
  { label: 'ATS Resume Checker', href: '/ats-resume-checker' },
  { label: 'Resume Job Matching', href: '/resume-job-matching' },
  { label: 'Career Advice', href: '/career-advice' },
]

export default function TailorResumePage() {
  return (
    <SeoPage
      headline="Tailor Your Resume to Any Job Description with AI"
      subheadline="Stop submitting the same resume everywhere. FindAllJob AI reads the job description and rewrites your resume to match it — in seconds, not hours."
      ctaLabel="Tailor My Resume Now"
      faqs={faqs}
      relatedLinks={relatedLinks}
    >
      <SeoSection title="Why Tailoring Your Resume Matters">
        <p className="text-slate-400 text-[15px] leading-relaxed mb-6">
          A tailored resume consistently outperforms a generic one. Recruiters spend an average of 6–7 seconds on the first scan of a resume. If your most relevant skills and experience are not immediately visible — customized to the role they are hiring for — they move on. AI-powered tailoring ensures the right content is always at the top.
        </p>
        <CompareTable rows={compareRows} />
      </SeoSection>

      <SeoSection title="What AI Tailoring Changes in Your Resume">
        <FeatureGrid items={features} />
      </SeoSection>

      <SeoSection title="How to Tailor Your Resume for a Job">
        <ol className="space-y-4 text-[15px] text-slate-400">
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">1.</span><span><strong className="text-white">Upload your resume</strong> — Your experience, skills, and summary are parsed and stored.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">2.</span><span><strong className="text-white">Pick a job from your matches</strong> — Or add a job manually with its title, company, and description.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">3.</span><span><strong className="text-white">Click Fix Resume for This Job</strong> — AI reads the full job description and tailors your resume to it.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">4.</span><span><strong className="text-white">Review, edit, and save</strong> — Edit any AI suggestion before saving. Download as PDF when ready.</span></li>
        </ol>
      </SeoSection>
    </SeoPage>
  )
}
