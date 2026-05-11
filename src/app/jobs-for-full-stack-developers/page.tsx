import type { Metadata } from 'next'
import { RoleJobPage, RoleJobSchema } from '@/components/seo/RoleJobPage'
import type { RoleJobConfig } from '@/components/seo/RoleJobPage'

export const metadata: Metadata = {
  title: 'Full Stack Developer Jobs | Resume-Matched Roles | FindAllJob',
  description: 'Find better-fit Full Stack Developer jobs using resume-based AI matching. Get matched by your specific tech stack — React, Node, Python, AWS — and improve your resume for each role.',
  alternates: { canonical: 'https://www.findalljob.com/jobs-for-full-stack-developers' },
  openGraph: {
    type: 'website',
    title: 'Full Stack Developer Jobs | FindAllJob',
    description: 'Discover better-fit Full Stack Developer jobs using resume-based AI matching.',
    url: 'https://www.findalljob.com/jobs-for-full-stack-developers',
    siteName: 'FindAllJob',
  },
  twitter: { card: 'summary_large_image', title: 'Full Stack Developer Jobs | FindAllJob', description: 'Find Full Stack Developer jobs matched to your specific tech stack.' },
}

const cfg: RoleJobConfig = {
  role: 'Full Stack Developer',
  roleLower: 'full stack developer',
  subheadline: 'Discover Full Stack Developer jobs matched to your specific frontend, backend, and infrastructure stack — without applying blindly to every engineering role available.',
  intro: 'Full Stack Developers are among the most versatile and consistently in-demand engineers across the technology industry. Startups in particular prefer full stack engineers who can own features end-to-end — from database schema to user interface — reducing the need for multiple specialist hires.',
  whyCompetitive: 'The term "full stack" covers an enormous range of actual skills. A React + Node.js developer and a Django + Vue.js developer are both "full stack" but are often not interchangeable. Resume-based matching finds you the roles where your specific stack is required — not just any full stack role.',
  skills: [
    { title: 'Frontend Frameworks', body: 'React, Next.js, Vue.js, or Angular. TypeScript proficiency, component architecture, state management, and performance optimization.' },
    { title: 'Backend Development', body: 'Node.js/Express, Python/Django/FastAPI, Java/Spring, or Go. REST and GraphQL API design, authentication, and server-side logic.' },
    { title: 'Databases', body: 'PostgreSQL, MySQL, MongoDB, or Redis. Schema design, query optimization, indexing, and ORM usage (Prisma, SQLAlchemy, Hibernate).' },
    { title: 'Cloud & DevOps Basics', body: 'AWS, GCP, or Azure fundamentals. Docker, basic CI/CD, environment management, and deploying to production.' },
    { title: 'Testing', body: 'Unit and integration testing. Jest, Vitest, Pytest, or JUnit. Some roles require E2E testing experience with Playwright or Cypress.' },
    { title: 'System Design Fundamentals', body: 'API design, caching strategies, database choice, scalability basics, and understanding of distributed systems concepts.' },
  ],
  howItHelps: [
    { title: 'Stack-Specific Matching', body: 'FindAllJob AI extracts your exact frontend and backend stack from your resume and matches you to roles that require those specific technologies — not generic engineering roles.' },
    { title: 'Startup vs Enterprise Fit', body: 'Full stack roles at startups and enterprises have different expectations. AI matching considers the company stage and role scope to find your best fit.' },
    { title: 'Resume Optimization by Stack', body: 'A Next.js role and a Django role need different keyword emphasis. AI optimizes your resume for the specific stack and requirements of each job before you apply.' },
    { title: 'Interview Prep for Full Stack Rounds', body: 'AI mock interviews generate frontend, backend, system design, and behavioral questions appropriate for the specific full stack role you are targeting.' },
  ],
  resumeTips: [
    { title: 'Separate Frontend and Backend Skills Clearly', body: 'List your frontend and backend skills in distinct sections or clearly labeled groups. Recruiters scanning for "React" or "Node.js" should find it immediately, not hidden in a long undifferentiated skills list.' },
    { title: 'Show End-to-End Ownership', body: '"Built the authentication system" is stronger than "worked on auth." Show that you owned features from design to deployment — this is what full stack is valued for.' },
    { title: 'Include Your Architecture Decisions', body: 'Mention technology choices you made and why: "Chose PostgreSQL over MongoDB for ACID compliance in a financial application." This demonstrates engineering judgement, not just execution.' },
  ],
  interviewTips: [
    { title: 'Prepare Both Frontend and Backend Questions', body: 'Full stack interviews may split rounds between frontend (React rendering, state management, performance) and backend (API design, database queries, caching). Know your weaker side and prepare it specifically.' },
    { title: 'Expect a Take-Home or Live Coding Task', body: 'Many full stack interviews include a small project or feature build — often a simple CRUD app with authentication. Practice building a basic full stack feature (React + API + DB) in under 2 hours.' },
    { title: 'Prepare System Design for Your Seniority', body: 'Senior full stack roles include a system design round. Junior roles usually skip it. Know which applies to your level and prepare accordingly — focus on "design a feature" rather than "design Twitter" for mid-level roles.' },
  ],
  faqs: [
    { q: 'What does a full stack developer do?', a: 'A full stack developer builds both the frontend (user interface) and backend (server, database, API) of a web application. They can work across the entire product — from what users see to how data is stored and processed.' },
    { q: 'Is full stack development a good career in India?', a: 'Yes. Full stack development is one of the most in-demand engineering roles in India, particularly at startups and mid-size product companies. Salary ranges from ₹8 LPA for freshers to ₹30–50+ LPA for senior engineers with strong product ownership.' },
    { q: 'Which tech stack should I learn for full stack development?', a: 'React + Node.js + PostgreSQL is the most commonly required combination in Indian startups. Python (Django/FastAPI) + React is also widely used. Next.js has grown significantly for full stack roles. Learn the stack that aligns with the companies and roles you want to target.' },
    { q: 'How do I stand out as a full stack developer?', a: 'Show end-to-end ownership — products or features you built from idea to production. Demonstrate strong code quality (GitHub portfolio), deployment experience, and the ability to make technology decisions, not just implement them.' },
    { q: 'How does FindAllJob match me with full stack developer jobs?', a: 'FindAllJob AI extracts your specific stack from your resume (frontend framework, backend language, database, cloud tools) and matches you to full stack roles where your exact technologies are required — filtering out roles that are technically a mismatch.' },
  ],
  relatedLinks: [
    { label: 'Jobs for Software Engineers', href: '/jobs-for-software-engineers' },
    { label: 'Jobs for DevOps Engineers',   href: '/jobs-for-devops-engineers' },
    { label: 'Jobs for Cloud Engineers',    href: '/jobs-for-cloud-engineers' },
  ],
}

export default function Page() {
  return (
    <>
      <RoleJobSchema role="Full Stack Developer" slug="jobs-for-full-stack-developers" faqs={cfg.faqs} />
      <RoleJobPage cfg={cfg} />
    </>
  )
}
