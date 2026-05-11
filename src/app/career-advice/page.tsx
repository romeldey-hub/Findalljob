import type { Metadata } from 'next'
import { SeoPage, SeoSection, FeatureGrid } from '@/components/seo/SeoPage'

export const metadata: Metadata = {
  title: 'Career Advice — Job Search Tips and Resume Guidance | FindAllJob',
  description: 'Practical career advice for job seekers. Resume writing tips, interview preparation guidance, how to get more interview calls, and how to use AI to accelerate your job search.',
  alternates: { canonical: 'https://findalljob.com/career-advice' },
  openGraph: {
    title: 'Career Advice | FindAllJob',
    description: 'Practical resume tips, interview preparation, and AI-powered job search guidance.',
    url: 'https://findalljob.com/career-advice',
    siteName: 'FindAllJob',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Career Advice | FindAllJob',
    description: 'Practical career advice — resume tips, interview preparation, and job search guidance.',
  },
}

const resumeTips = [
  { title: 'Quantify Your Impact', body: 'Replace vague bullets with numbers. "Improved performance" → "Reduced page load time by 40%, increasing user retention by 12%."' },
  { title: 'Tailor for Every Job', body: 'A generic resume gets generic results. Customize your resume for each role — AI can do this in seconds for you.' },
  { title: 'Lead with Achievements, Not Duties', body: 'Recruiters know what a software engineer does. Show what you achieved in that role, not just what the job required.' },
  { title: 'Keep It to One or Two Pages', body: 'Unless you have 15+ years of experience, a two-page resume is sufficient. Every line should earn its place.' },
  { title: 'Use a Clean, ATS-Safe Format', body: 'No tables, columns, graphics, or creative fonts. ATS systems parse plain, structured text. Formatting that looks great on screen may break ATS parsing.' },
  { title: 'Put the Most Relevant Experience First', body: 'Reorder your bullet points and skills to put the most relevant items for each target job at the top of each section.' },
]

const interviewTips = [
  { title: 'Research the Company Deeply', body: 'Know their product, competitors, recent news, and the team you are joining. Specific knowledge signals genuine interest.' },
  { title: 'Practice the STAR Method', body: 'Structure behavioral answers as: Situation → Task → Action → Result. Clear, concise, outcome-focused answers impress every interviewer.' },
  { title: 'Prepare Your "Tell Me About Yourself"', body: 'This is the first question in almost every interview. Prepare a 90-second answer that covers your background, why you are here, and what you bring.' },
  { title: 'Ask Smart Questions', body: 'Prepare 3–4 genuine questions about the role, team, and company. "What does success look like in the first 90 days?" is always a strong one.' },
  { title: 'Mock Interview Before the Real One', body: 'Practice your answers out loud — not in your head. AI mock interviews generate role-specific questions and give immediate feedback on each answer.' },
  { title: 'Follow Up After the Interview', body: 'Send a brief thank-you email within 24 hours. Reiterate your interest and mention one specific thing from the conversation.' },
]

const jobSearchTips = [
  { title: 'Apply Where You Are a Strong Match', body: 'Applying to every available job wastes time. Focus on roles where your skills and experience are a 70%+ fit. Higher match = higher response rate.' },
  { title: 'Optimize Your Resume Before Each Application', body: 'AI can tailor your resume for a specific job in seconds. This single step consistently increases interview callback rates.' },
  { title: 'Build a Public Online Presence', body: 'A public resume profile that recruiters can find is passive job searching. Recruiters actively search for candidates — make yourself discoverable.' },
  { title: 'Network Alongside Applying', body: 'Referrals dramatically increase your chance of getting an interview. Connect with employees at target companies before applying.' },
  { title: 'Track Your Applications', body: 'Know where you have applied, what the status is, and what follow-up is needed. Letting applications go cold is a missed opportunity.' },
  { title: 'Learn What Is Failing', body: 'If you are getting no callbacks: fix your resume and ATS score. If you are failing interviews: practice more. Diagnose the specific failure point.' },
]

const faqs = [
  { q: 'How long does a job search typically take?', a: 'For most professionals, a focused job search takes 2–4 months. Senior roles can take longer. Using AI to optimize your resume and target the right jobs can compress this timeline significantly.' },
  { q: 'How many jobs should I apply to per week?', a: 'Quality beats quantity. 5–10 highly targeted, optimized applications per week outperforms 50 generic submissions. Tailor your resume for each application.' },
  { q: 'Why am I not getting any callbacks?', a: 'The most common reasons are: (1) resume not passing ATS, (2) applying to roles where you are not a strong match, (3) resume is generic and not tailored to the job, (4) missing key keywords. An ATS score check and resume optimization addresses all of these.' },
  { q: 'Should I apply if I do not meet all the requirements?', a: 'Apply if you meet 70–80% of the requirements. Job descriptions are often a wish list, not a strict checklist. If your overall profile is strong, apply and tailor your resume for the role.' },
  { q: 'How important is a cover letter in India?', a: 'For most tech and startup roles in India, cover letters are optional and rarely read at the screening stage. Focus your energy on a strong, tailored resume first.' },
]

const relatedLinks = [
  { label: 'AI Resume Optimizer', href: '/ai-resume-optimizer' },
  { label: 'ATS Resume Checker', href: '/ats-resume-checker' },
  { label: 'AI Mock Interview', href: '/ai-mock-interview' },
  { label: 'Resume Job Matching', href: '/resume-job-matching' },
  { label: 'Public Resume Profile', href: '/public-resume-profile' },
]

export default function CareerAdvicePage() {
  return (
    <SeoPage
      headline="Career Advice That Actually Helps You Get Hired"
      subheadline="Practical guidance on writing better resumes, preparing for interviews, and running a smarter job search — with AI tools that do the heavy lifting for you."
      ctaLabel="Start Applying Smarter"
      faqs={faqs}
      relatedLinks={relatedLinks}
    >
      <SeoSection title="Resume Writing Tips">
        <FeatureGrid items={resumeTips} />
      </SeoSection>

      <SeoSection title="Interview Preparation Tips">
        <FeatureGrid items={interviewTips} />
      </SeoSection>

      <SeoSection title="Job Search Strategy Tips">
        <FeatureGrid items={jobSearchTips} />
      </SeoSection>
    </SeoPage>
  )
}
