import type { Metadata } from 'next'
import { SeoPage, SeoSection, FeatureGrid } from '@/components/seo/SeoPage'

export const metadata: Metadata = {
  title: 'Jobs for Product Managers — AI Job Matching for PMs | FindAllJob',
  description: 'Find product manager jobs matched to your resume. AI ranks PM roles by your skills, experience, and location. Get your resume optimized for PM job descriptions instantly.',
  alternates: { canonical: 'https://findalljob.com/jobs-for-product-managers' },
  openGraph: {
    title: 'Jobs for Product Managers | FindAllJob',
    description: 'AI job matching for product managers. Find PM roles ranked by your resume fit score.',
    url: 'https://findalljob.com/jobs-for-product-managers',
    siteName: 'FindAllJob',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Jobs for Product Managers | FindAllJob',
    description: 'Find PM jobs matched to your resume. AI ranks roles by your fit score.',
  },
}

const pmSkills = [
  { title: 'Product Strategy', body: 'Roadmapping, vision definition, OKRs, go-to-market strategy, and competitive analysis.' },
  { title: 'User Research', body: 'Customer interviews, user testing, persona development, and qualitative + quantitative research.' },
  { title: 'Data & Analytics', body: 'SQL basics, A/B testing, funnel analysis, metrics definition, and data-driven decision making.' },
  { title: 'Cross-Functional Collaboration', body: 'Stakeholder management, working with engineering, design, marketing, and sales teams.' },
  { title: 'Agile / Scrum', body: 'Sprint planning, backlog grooming, JIRA, story writing, and delivery management.' },
  { title: 'Technical Literacy', body: 'Understanding APIs, system design basics, and being able to work closely with engineering teams.' },
]

const pmRoles = [
  { title: 'Associate Product Manager (APM)', body: 'Entry-level PM roles. Often at larger companies or startups with APM programs. Requires strong analytical skills and product intuition.' },
  { title: 'Product Manager', body: 'Mid-level role owning one or more product areas. Requires 2–5 years of experience and demonstrated product impact.' },
  { title: 'Senior Product Manager', body: 'Leads complex product areas with cross-functional ownership. 5+ years experience, strong strategic and leadership skills.' },
  { title: 'Principal / Staff PM', body: 'IC leadership track. Drives company-wide product strategy and mentors other PMs. Often at Series B+ companies.' },
  { title: 'Group Product Manager (GPM)', body: 'Manages a team of PMs. Combines individual product ownership with people management responsibilities.' },
  { title: 'VP / Director of Product', body: 'Senior leadership role overseeing entire product organization. Strategy, team building, and executive reporting.' },
]

const faqs = [
  { q: 'What skills should a product manager highlight on their resume?', a: 'Key PM resume skills include: product roadmapping, user research, data analysis, A/B testing, stakeholder management, agile/scrum, go-to-market experience, metrics ownership (DAU, retention, conversion), and cross-functional collaboration. AI resume optimization surfaces these in the right context for each job description.' },
  { q: 'How do I get my first product manager job?', a: 'Common paths include: transitioning from engineering, design, or business analysis; completing a PM fellowship or APM program; building side projects and writing about them; or getting an MBA with PM internships. Upload your current resume to FindAllJob to see which PM roles you already match.' },
  { q: 'What do PM interviews typically include?', a: 'PM interviews typically cover: product design (design a product for X), estimation questions (how many X in India?), strategy (how would you improve product Y?), behavioral (tell me about a product you launched), and technical (explain how feature X works). AI mock interviews on FindAllJob practice all of these.' },
  { q: 'Is product management a good career in India?', a: 'Yes. PM is one of the fastest-growing and best-compensated roles in the Indian tech industry. Bangalore, Mumbai, and Hyderabad have particularly strong PM job markets, with both startup and enterprise opportunities.' },
  { q: 'How does FindAllJob help product managers find jobs?', a: 'FindAllJob AI reads your PM resume, extracts your product experience and skills, and ranks job matches by fit score. For each job, you can see which PM skills match and which are missing — and optimize your resume for the role with one click.' },
]

const relatedLinks = [
  { label: 'Jobs for Software Engineers', href: '/jobs-for-software-engineers' },
  { label: 'AI Mock Interview', href: '/ai-mock-interview' },
  { label: 'AI Resume Optimizer', href: '/ai-resume-optimizer' },
  { label: 'Job Search India', href: '/job-search-india' },
  { label: 'Career Advice', href: '/career-advice' },
]

export default function JobsForProductManagersPage() {
  return (
    <SeoPage
      headline="Find Product Manager Jobs Matched to Your Resume"
      subheadline="FindAllJob AI reads your PM resume and ranks product manager job opportunities by your fit score — across startups, scale-ups, and enterprise companies in India and remote."
      ctaLabel="Find PM Jobs for My Resume"
      faqs={faqs}
      relatedLinks={relatedLinks}
    >
      <SeoSection title="Key Skills for Product Manager Jobs">
        <p className="text-slate-400 text-[15px] leading-relaxed mb-6">
          Product management job descriptions vary significantly by company stage, industry, and seniority. AI matching helps you find the PM roles where your specific skills — whether strategy, data, or technical — are the strongest match.
        </p>
        <FeatureGrid items={pmSkills} />
      </SeoSection>

      <SeoSection title="PM Roles and What They Require">
        <FeatureGrid items={pmRoles} />
      </SeoSection>

      <SeoSection title="How to Land a PM Job with FindAllJob">
        <ol className="space-y-4 text-[15px] text-slate-400">
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">1.</span><span><strong className="text-white">Upload your PM resume</strong> — AI extracts your product experience, metrics owned, and tools used.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">2.</span><span><strong className="text-white">View ranked PM job matches</strong> — See PM roles ranked by your fit score with skills gap analysis.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">3.</span><span><strong className="text-white">Optimize your resume for each role</strong> — AI tailors your resume for the specific PM job description.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">4.</span><span><strong className="text-white">Practice PM interview questions</strong> — Use AI mock interviews to practice product design, estimation, and behavioral questions.</span></li>
        </ol>
      </SeoSection>
    </SeoPage>
  )
}
