import type { Metadata } from 'next'
import { SeoPage, SeoSection, FeatureGrid } from '@/components/seo/SeoPage'

export const metadata: Metadata = {
  title: 'Jobs for Software Engineers — AI Job Matching for Developers | FindAllJob',
  description: 'Find software engineering jobs matched to your tech stack and experience. AI ranks SWE roles by your resume fit score. Optimize your resume for each job description instantly.',
  alternates: { canonical: 'https://findalljob.com/jobs-for-software-engineers' },
  openGraph: {
    title: 'Jobs for Software Engineers | FindAllJob',
    description: 'AI job matching for software engineers. Find SWE roles ranked by your resume fit score.',
    url: 'https://findalljob.com/jobs-for-software-engineers',
    siteName: 'FindAllJob',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Jobs for Software Engineers | FindAllJob',
    description: 'Find SWE jobs matched to your tech stack. AI ranks roles by your fit score.',
  },
}

const techStacks = [
  { title: 'Frontend', body: 'React, Next.js, Vue, Angular, TypeScript, CSS/Tailwind, performance optimization, and accessibility.' },
  { title: 'Backend', body: 'Node.js, Python, Java, Go, .NET, REST/GraphQL APIs, microservices, and database design.' },
  { title: 'Full Stack', body: 'End-to-end development skills across frontend, backend, and database layers. Most in-demand across startups.' },
  { title: 'DevOps / Cloud', body: 'AWS, GCP, Azure, Kubernetes, Docker, CI/CD pipelines, infrastructure as code, and SRE practices.' },
  { title: 'Data Engineering', body: 'Python, SQL, Spark, Kafka, Airflow, data pipelines, warehousing, and ETL systems.' },
  { title: 'Mobile (iOS / Android)', body: 'Swift, Kotlin, React Native, Flutter. Native and cross-platform mobile development roles.' },
]

const sweRoles = [
  { title: 'Software Engineer (SDE-1)', body: 'Entry-level engineering. 0–2 years experience. Strong DSA fundamentals, CS basics, and one primary tech stack.' },
  { title: 'Software Engineer (SDE-2)', body: 'Mid-level. 2–5 years. Owns features end-to-end, good system design understanding, and some mentoring.' },
  { title: 'Senior Software Engineer (SDE-3)', body: '5+ years. Leads technical decisions, designs systems, reviews architecture, and mentors junior engineers.' },
  { title: 'Staff / Principal Engineer', body: 'IC leadership. Cross-team technical influence, architecture ownership, and strategic engineering decisions.' },
  { title: 'Engineering Manager', body: 'People management + technical leadership. Manages a team of 4–8 engineers, delivery, and career development.' },
  { title: 'Founding Engineer / CTO', body: 'Early-stage startup roles requiring broad technical ownership, hiring, and product-engineering alignment.' },
]

const faqs = [
  { q: 'How does FindAllJob match software engineering jobs to my resume?', a: 'FindAllJob AI extracts your tech stack, years of experience, seniority level, and industry from your resume. It then ranks job postings by how closely the JD requirements match your specific skills — surfacing the roles where you have the highest chance of moving forward.' },
  { q: 'What keywords should a software engineer include on their resume?', a: 'Include your primary programming languages, frameworks, cloud platforms, databases, tools (Git, JIRA, Docker), system design experience, and any measurable impact (e.g., "reduced API latency by 40%"). AI resume optimization automatically injects missing keywords from specific job descriptions.' },
  { q: 'How do I prepare for a software engineering interview?', a: 'Preparation typically covers: DSA (data structures and algorithms), system design, behavioral questions (STAR method), and role-specific technical questions. FindAllJob AI mock interviews generate role-specific questions based on your resume and the target company.' },
  { q: 'Is the job market good for software engineers in India?', a: 'India has one of the world\'s largest pools of software engineering talent and opportunity. Bangalore alone has tens of thousands of SWE openings at any time. AI-powered job matching helps you cut through the noise and apply only to the roles where your specific skills are a strong match.' },
  { q: 'Can freshers (new graduates) use FindAllJob?', a: 'Yes. FindAllJob works for all experience levels. New graduates can upload their resume, projects, and internship experience and get matched to entry-level and SDE-1 roles accordingly.' },
]

const relatedLinks = [
  { label: 'Jobs for Product Managers', href: '/jobs-for-product-managers' },
  { label: 'AI Mock Interview', href: '/ai-mock-interview' },
  { label: 'AI Resume Optimizer', href: '/ai-resume-optimizer' },
  { label: 'ATS Resume Checker', href: '/ats-resume-checker' },
  { label: 'Job Search India', href: '/job-search-india' },
]

export default function JobsForSoftwareEngineersPage() {
  return (
    <SeoPage
      headline="Find Software Engineering Jobs Matched to Your Tech Stack"
      subheadline="FindAllJob AI reads your engineering resume and ranks SWE job opportunities by your fit score — matching your language, framework, seniority, and location to the right roles."
      ctaLabel="Find SWE Jobs for My Resume"
      faqs={faqs}
      relatedLinks={relatedLinks}
    >
      <SeoSection title="Tech Stacks and Engineering Specializations">
        <p className="text-slate-400 text-[15px] leading-relaxed mb-6">
          Software engineering job descriptions are highly specific about required tech stacks. A job requiring Go and Kubernetes is a bad match for a React developer, and vice versa. FindAllJob AI matches your specific stack to the right roles — not just any engineering jobs.
        </p>
        <FeatureGrid items={techStacks} />
      </SeoSection>

      <SeoSection title="Engineering Roles and What They Require">
        <FeatureGrid items={sweRoles} />
      </SeoSection>

      <SeoSection title="How to Find the Right SWE Job with FindAllJob">
        <ol className="space-y-4 text-[15px] text-slate-400">
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">1.</span><span><strong className="text-white">Upload your engineering resume</strong> — AI extracts your tech stack, experience level, and key accomplishments.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">2.</span><span><strong className="text-white">View stack-matched job results</strong> — See SWE roles ranked by how closely they match your specific languages and tools.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">3.</span><span><strong className="text-white">Optimize for each role</strong> — AI tailors your resume for the job description, adding missing keywords and reframing your experience.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">4.</span><span><strong className="text-white">Practice technical and behavioral questions</strong> — Use AI mock interviews to prepare role-specific interview questions before the real thing.</span></li>
        </ol>
      </SeoSection>
    </SeoPage>
  )
}
