import type { Metadata } from 'next'
import { SeoPage, SeoSection, FeatureGrid } from '@/components/seo/SeoPage'

export const metadata: Metadata = {
  title: 'About FindAllJob — AI-Powered Job Search Platform',
  description: 'FindAllJob is an AI-powered job search platform that helps job seekers apply smarter — with resume optimization, job matching, mock interviews, and public profiles.',
  alternates: { canonical: 'https://www.findalljob.com/about' },
  openGraph: {
    type: 'website',
    title: 'About FindAllJob',
    description: 'AI-powered job search — resume optimization, smart matching, mock interviews, and public profiles.',
    url: 'https://www.findalljob.com/about',
    siteName: 'FindAllJob',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About FindAllJob',
    description: 'AI-powered job search — resume optimization, smart matching, mock interviews, and public profiles.',
  },
}

const tools = [
  { title: 'AI Resume Optimizer', body: 'Tailor your resume to a specific job description in seconds. AI rewrites your bullets to match what the employer is looking for.' },
  { title: 'Smart Job Matching', body: 'Upload your resume once. Get a ranked list of jobs that actually match your skills, experience, and location.' },
  { title: 'ATS Resume Checker', body: 'See your ATS compatibility score before you apply. Know exactly what keywords are missing and why ATS systems reject resumes.' },
  { title: 'AI Mock Interviews', body: 'Practice interview questions tailored to your resume and target role. Get instant AI feedback on each answer.' },
  { title: 'AI Resume Builder', body: 'Build a clean, professional resume online with AI-assisted content suggestions and bullet writing.' },
  { title: 'Public Profile', body: 'Create a public resume profile at findalljob.com/yourname that recruiters can discover on Google.' },
]

const values = [
  { title: 'Applicant-first', body: 'Every feature is built for the job seeker, not the recruiter. We help you present your best self to the right employers.' },
  { title: 'AI that explains itself', body: 'We do not just give you a score — we show you exactly what to fix and why. Actionable guidance, not black-box results.' },
  { title: 'Affordable access', body: 'AI-powered job search tools were previously only available to those who could afford career coaches. We are changing that.' },
]

const faqs = [
  { q: 'Who is FindAllJob for?', a: 'FindAllJob is for anyone actively searching for a job — recent graduates, professionals switching roles or industries, and experienced candidates looking to land more interviews faster.' },
  { q: 'How does FindAllJob make money?', a: 'FindAllJob is free to start. We generate revenue through Pro Lite and Pro Plus subscriptions, which unlock more AI credits and advanced AI features.' },
  { q: 'Is my resume data private?', a: 'Yes. Your resume data is stored securely and used only to generate your job matches and AI outputs. It is never shared with employers or third parties without your explicit action.' },
  { q: 'Which countries does FindAllJob support?', a: 'FindAllJob is available globally. Job search features currently focus on India and international markets. Pricing is automatically shown in INR for Indian users and USD for all others.' },
  { q: 'How do I contact support?', a: 'Email us at support@findalljob.com. We respond to all inquiries as quickly as possible.' },
]

const relatedLinks = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'AI Resume Optimizer', href: '/ai-resume-optimizer' },
  { label: 'ATS Resume Checker', href: '/ats-resume-checker' },
  { label: 'AI Mock Interview', href: '/ai-mock-interview' },
]

export default function AboutPage() {
  return (
    <SeoPage
      headline="We help job seekers apply smarter with AI"
      subheadline="FindAllJob is an AI-powered job search platform. Upload your resume, find better-fit jobs, optimize your application, and practice interviews — all in one place."
      ctaLabel="Get Started Free"
      faqs={faqs}
      relatedLinks={relatedLinks}
    >
      <SeoSection title="What FindAllJob Does">
        <p className="text-slate-400 text-[15px] leading-relaxed mb-6">
          Most job seekers send the same generic resume to every job and wonder why they do not hear back. FindAllJob changes that by giving every applicant access to the same AI tools that were previously only available through expensive career coaches.
        </p>
        <FeatureGrid items={tools} />
      </SeoSection>

      <SeoSection title="Our Mission">
        <p className="text-slate-400 text-[15px] leading-relaxed mb-6">
          Job searching is one of the most stressful and time-consuming activities a person can go through. We believe AI can make it faster, smarter, and more equitable — not by replacing the human, but by making every applicant better prepared.
        </p>
        <FeatureGrid items={values} />
      </SeoSection>

      <SeoSection title="Built by Bestine">
        <p className="text-slate-400 text-[15px] leading-relaxed">
          FindAllJob is developed and maintained by <a href="https://www.bestin-e.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline underline-offset-2">Bestine</a>, a software product studio focused on building AI-first tools that solve real-world problems. We build products that prioritise usefulness, simplicity, and accessibility.
        </p>
      </SeoSection>
    </SeoPage>
  )
}
