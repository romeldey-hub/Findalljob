import type { Metadata } from 'next'
import { SeoPage, SeoSection, FeatureGrid, CompareTable } from '@/components/seo/SeoPage'

export const metadata: Metadata = {
  title: 'AI Resume Job Matching — Find Jobs That Match Your Resume | FindAllJob',
  description: 'Upload your resume and instantly see jobs ranked by how well they match your skills, experience, and location. No more blindly applying to jobs you are underqualified for.',
  alternates: { canonical: 'https://www.findalljob.com/resume-job-matching' },
  openGraph: {
    title: 'AI Resume Job Matching | FindAllJob',
    description: 'Find jobs ranked by your actual resume fit score. Upload once, get matched instantly.',
    url: 'https://www.findalljob.com/resume-job-matching',
    siteName: 'FindAllJob',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Resume Job Matching | FindAllJob',
    description: 'Find jobs ranked by your actual resume fit score.',
  },
}

const features = [
  { title: 'Fit Score for Every Job', body: 'Each job gets a percentage match score based on how well your resume matches the role — so you apply where you have the best chance.' },
  { title: 'Skills Gap Analysis', body: 'See which skills you have and which you are missing for each job, so you can decide whether to apply or upskill.' },
  { title: 'Location-Aware Matching', body: 'Jobs are filtered by your preferred location — whether remote, hybrid, or office-based.' },
  { title: 'Seniority Matching', body: 'AI matches your experience level to the seniority of the role, so you are not matched to roles you are over or under-qualified for.' },
  { title: 'Daily Fresh Matches', body: 'New job matches are fetched and ranked for you every day based on your current resume.' },
  { title: 'One Resume, Many Jobs', body: 'Upload your resume once. AI handles the matching across hundreds of live job postings continuously.' },
]

const compareRows = [
  { label: '', without: 'Manually searching job boards every day', with: 'AI-ranked matches delivered to your dashboard' },
  { label: '', without: 'Applying to jobs you are not qualified for', with: 'Applying only where your match score is high' },
  { label: '', without: 'No idea why you keep getting rejected', with: 'Skills gap visible for every job before you apply' },
  { label: '', without: 'Missing relevant jobs buried in search results', with: 'Relevant jobs ranked at the top by AI fit score' },
]

const faqs = [
  { q: 'How does AI resume job matching work?', a: 'FindAllJob parses your resume to extract skills, experience, education, and seniority. It then compares your profile against live job postings and calculates a fit score for each — ranking jobs from best match to weakest.' },
  { q: 'What data is used to calculate the match score?', a: 'The AI considers your skills, years of experience, job titles, industry, education level, and location preferences — comparing them against the job description requirements.' },
  { q: 'How many job matches do I see per day?', a: 'Free users see up to 15 AI-ranked matches per day. Pro users see more with expanded job pool reranking using AI credits.' },
  { q: 'Can I improve my match score?', a: 'Yes. Using the AI Resume Optimizer to tailor your resume for a specific job will increase your match score for that role by aligning your resume content with the job description.' },
  { q: 'What types of jobs are available?', a: 'FindAllJob aggregates jobs from multiple sources. Jobs span technology, marketing, finance, operations, design, and more — across India and international remote roles.' },
]

const relatedLinks = [
  { label: 'AI Resume Optimizer', href: '/ai-resume-optimizer' },
  { label: 'Tailor Resume to Job Description', href: '/tailor-resume-to-job-description' },
  { label: 'Jobs for Software Engineers', href: '/jobs-for-software-engineers' },
  { label: 'Jobs for Product Managers', href: '/jobs-for-product-managers' },
  { label: 'Job Search India', href: '/job-search-india' },
]

export default function ResumeJobMatchingPage() {
  return (
    <SeoPage
      headline="Find Jobs That Actually Match Your Resume"
      subheadline="Upload your resume once. FindAllJob AI ranks every job by how well it matches your skills, experience, and location — so you spend time applying to the right jobs, not all of them."
      ctaLabel="Upload Resume & Find Matching Jobs"
      faqs={faqs}
      relatedLinks={relatedLinks}
    >
      <SeoSection title="Stop Applying Blindly">
        <p className="text-slate-400 text-[15px] leading-relaxed mb-6">
          Most job seekers apply to dozens of jobs with zero visibility into whether they are actually a good fit. The result is a low response rate, wasted time, and growing frustration. FindAllJob flips this by showing you your match score for every job before you apply.
        </p>
        <CompareTable rows={compareRows} />
      </SeoSection>

      <SeoSection title="How Resume Job Matching Works">
        <FeatureGrid items={features} />
      </SeoSection>

      <SeoSection title="Step-by-Step">
        <ol className="space-y-4 text-[15px] text-slate-400">
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">1.</span><span><strong className="text-white">Upload your resume</strong> — AI parses your experience, skills, education, and seniority in seconds.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">2.</span><span><strong className="text-white">Browse ranked matches</strong> — See jobs sorted by your AI fit score, with skills gap visible for each.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">3.</span><span><strong className="text-white">Optimize before applying</strong> — Use AI to tailor your resume for high-match jobs before you submit.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">4.</span><span><strong className="text-white">Apply smarter</strong> — Focus your energy on roles where you have the highest chance of a response.</span></li>
        </ol>
      </SeoSection>
    </SeoPage>
  )
}
