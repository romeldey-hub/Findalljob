import type { Metadata } from 'next'
import { SeoPage, SeoSection, FeatureGrid } from '@/components/seo/SeoPage'

export const metadata: Metadata = {
  title: 'AI Job Search India — Find Jobs in India Matched to Your Resume | FindAllJob',
  description: 'Find the best job opportunities in India matched to your resume using AI. Roles across Bangalore, Mumbai, Delhi, Hyderabad, Pune, and remote. Upload your resume and get ranked matches instantly.',
  alternates: { canonical: 'https://www.findalljob.com/job-search-india' },
  openGraph: {
    type: 'website',
    title: 'AI Job Search India | FindAllJob',
    description: 'Find jobs in India matched to your resume. AI-ranked matches across all major cities.',
    url: 'https://www.findalljob.com/job-search-india',
    siteName: 'FindAllJob',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Job Search India | FindAllJob',
    description: 'Find jobs in India matched to your resume. Bangalore, Mumbai, Delhi, remote and more.',
  },
}

const features = [
  { title: 'Resume-First Matching', body: 'Upload your resume and get AI-ranked job matches instantly — no manual keyword searching required.' },
  { title: 'India-Specific Job Pool', body: 'Jobs aggregated from multiple sources across Bangalore, Mumbai, Delhi, Hyderabad, Pune, Chennai, and remote roles.' },
  { title: 'Local Pricing', body: 'Pro plans available at ₹299/month and ₹599/month — priced for the Indian job market.' },
  { title: 'Seniority Filtering', body: 'AI matches your experience level to the right seniority — junior, mid, senior, lead, or manager roles.' },
  { title: 'Remote & Hybrid Aware', body: 'Filter for remote-first, hybrid, or in-office roles. Many India-based companies now offer remote or hybrid options.' },
  { title: 'Skills Gap Visibility', body: 'See which skills you have and which you need for each job before applying — so you target the right opportunities.' },
]

const cities = [
  { title: 'Bangalore', body: 'India\'s tech hub. Strong demand for software engineers, product managers, data scientists, and startup roles.' },
  { title: 'Mumbai', body: 'Finance, media, consulting, and enterprise tech. Strong market for senior professionals and business roles.' },
  { title: 'Delhi / NCR', body: 'Government tech, consulting, e-commerce, and enterprise. Large talent market across Gurgaon and Noida.' },
  { title: 'Hyderabad', body: 'Second-largest tech hub. Major IT companies, pharma, and a growing startup ecosystem.' },
  { title: 'Pune', body: 'IT services, automotive tech, manufacturing tech, and a strong engineering talent base.' },
  { title: 'Remote (Pan-India)', body: 'Growing number of India-based and global companies hiring remote workers across all experience levels.' },
]

const faqs = [
  { q: 'How is FindAllJob different from Naukri or LinkedIn for Indian job seekers?', a: 'FindAllJob is resume-first and AI-powered. Instead of you searching for jobs, AI reads your resume and ranks jobs by how well they match your profile. You see fit scores for every job — not just a list of postings.' },
  { q: 'Are job listings in India updated regularly?', a: 'Yes. FindAllJob continuously fetches and updates job listings from multiple sources, so your matches reflect current openings across India.' },
  { q: 'Can I find remote jobs in India on FindAllJob?', a: 'Yes. Remote and hybrid jobs are included in your matches. You can filter for work location preference in your profile settings.' },
  { q: 'Is FindAllJob available in Indian languages?', a: 'Currently in English only. Most professional job listings in India are in English, so this covers the majority of relevant opportunities.' },
  { q: 'What is the pricing for Indian users?', a: 'Free plan is available at no cost. Pro Lite is ₹299/month and Pro Plus is ₹599/month — pricing automatically adjusted for users in India.' },
  { q: 'What industries are covered for Indian job seekers?', a: 'Technology, software engineering, product management, data science, marketing, finance, consulting, operations, design, and more. Coverage is strongest for technology and business roles.' },
]

const relatedLinks = [
  { label: 'Resume Job Matching', href: '/resume-job-matching' },
  { label: 'Jobs for Software Engineers', href: '/jobs-for-software-engineers' },
  { label: 'Jobs for Product Managers', href: '/jobs-for-product-managers' },
  { label: 'AI Resume Optimizer', href: '/ai-resume-optimizer' },
  { label: 'Career Advice', href: '/career-advice' },
]

export default function JobSearchIndiaPage() {
  return (
    <SeoPage
      headline="Find the Right Job in India — AI Matches Jobs to Your Resume"
      subheadline="Upload your resume and get AI-ranked job matches across Bangalore, Mumbai, Delhi, Hyderabad, Pune, and remote roles in India. No manual searching required."
      ctaLabel="Upload Resume & Find Matching Jobs"
      faqs={faqs}
      relatedLinks={relatedLinks}
    >
      <SeoSection title="AI-Powered Job Search for India">
        <p className="text-slate-400 text-[15px] leading-relaxed mb-6">
          India is one of the world's largest and most competitive job markets. With millions of applications submitted each month across platforms, standing out requires more than just applying — it requires applying to the right jobs with a tailored resume. FindAllJob uses AI to match your resume to relevant opportunities and helps you optimize your application for each one.
        </p>
        <FeatureGrid items={features} />
      </SeoSection>

      <SeoSection title="Major Job Markets in India">
        <FeatureGrid items={cities} />
      </SeoSection>

      <SeoSection title="How to Start Your AI Job Search in India">
        <ol className="space-y-4 text-[15px] text-slate-400">
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">1.</span><span><strong className="text-white">Create a free account</strong> — Sign up in seconds, no credit card required.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">2.</span><span><strong className="text-white">Upload your resume</strong> — AI parses your skills, experience, and preferences instantly.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">3.</span><span><strong className="text-white">View your AI-ranked matches</strong> — See jobs ranked by fit score, with skills gap analysis for each role.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">4.</span><span><strong className="text-white">Optimize and apply</strong> — Tailor your resume for top matches before applying to maximize your response rate.</span></li>
        </ol>
      </SeoSection>
    </SeoPage>
  )
}
