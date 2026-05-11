import type { Metadata } from 'next'
import { RoleJobPage, RoleJobSchema } from '@/components/seo/RoleJobPage'
import type { RoleJobConfig } from '@/components/seo/RoleJobPage'

export const metadata: Metadata = {
  title: 'Business Analyst Jobs | Find Better-Fit BA Roles | FindAllJob',
  description: 'Find better-fit Business Analyst jobs matched to your domain, tools, and experience. AI resume matching for IT, product, functional, and data-focused BA roles across industries.',
  alternates: { canonical: 'https://www.findalljob.com/jobs-for-business-analysts' },
  openGraph: {
    title: 'Business Analyst Jobs | FindAllJob',
    description: 'Find better-fit Business Analyst jobs matched to your domain and experience.',
    url: 'https://www.findalljob.com/jobs-for-business-analysts',
    siteName: 'FindAllJob',
  },
  twitter: { card: 'summary_large_image', title: 'Business Analyst Jobs | FindAllJob', description: 'Find Business Analyst jobs matched to your domain and tools.' },
}

const cfg: RoleJobConfig = {
  role: 'Business Analyst',
  roleLower: 'business analyst',
  subheadline: 'Find Business Analyst jobs matched to your domain expertise, tools, and industry — whether you specialize in IT, product, functional analysis, or data-driven business intelligence.',
  intro: 'Business Analysts bridge the gap between business stakeholders and technology teams. They gather requirements, analyze processes, define solutions, and ensure that technology projects deliver real business value. BA roles exist across virtually every industry — from IT consulting and fintech to healthcare, e-commerce, and enterprise software.',
  whyCompetitive: 'Business analyst job descriptions vary enormously across industries and company types. An IT BA at a consulting firm has different skills than a product BA at a startup, and neither is the same as a data-focused BA or a process improvement analyst. Resume matching ensures you apply to roles that actually match your domain and experience.',
  skills: [
    { title: 'Requirements Gathering', body: 'Stakeholder interviews, workshops, user story writing, use case development, and translating business needs into clear, actionable requirements.' },
    { title: 'Process Analysis & Modelling', body: 'Business process mapping, AS-IS/TO-BE analysis, BPMN, and identifying inefficiencies and improvement opportunities.' },
    { title: 'Data Analysis', body: 'SQL, Excel, Power BI, or Tableau for analysing data to support decisions, identify trends, and validate solutions against business metrics.' },
    { title: 'Documentation', body: 'BRD, FRD, user stories, acceptance criteria, and process documentation. Clear, structured writing that both technical and non-technical stakeholders can use.' },
    { title: 'Agile & Scrum', body: 'Working in agile teams as a product owner or BA proxy — writing user stories, grooming backlogs, facilitating sprint ceremonies, and managing stakeholder expectations.' },
    { title: 'Stakeholder Management', body: 'Managing competing priorities across business, tech, and leadership stakeholders. Communication, negotiation, and alignment across complex organizations.' },
  ],
  howItHelps: [
    { title: 'Domain Matching', body: 'BA roles in fintech, healthcare, IT consulting, and e-commerce require different domain knowledge. FindAllJob matches your industry experience to the relevant BA roles.' },
    { title: 'Role Type Differentiation', body: 'IT BA, product BA, data BA, and functional BA are distinct. AI matching identifies your actual role type from your resume and surfaces the right opportunities.' },
    { title: 'Tool Recognition', body: 'JIRA, Confluence, Visio, Power BI, Salesforce, SAP, and other tools in your resume are recognized and matched to roles requiring your specific toolset.' },
    { title: 'Resume Optimization for BA Roles', body: 'BA JDs emphasize requirements, stakeholders, and business impact. AI optimization ensures these keywords and contexts are prominently featured in your resume for each role.' },
  ],
  resumeTips: [
    { title: 'Show Business Impact, Not Just Process', body: 'Do not just describe what you analysed — show what changed as a result. "Mapped existing procurement process; redesigned workflow reduced approval cycle from 14 days to 3 days, saving ₹20L annually in delayed costs."' },
    { title: 'Highlight Your Domain Expertise', body: 'BAs with domain depth command higher salaries. If you have fintech, healthcare, or enterprise ERP expertise, make it prominent — not buried in a summary sentence.' },
    { title: 'Quantify Stakeholder Complexity', body: '"Managed stakeholders" is vague. "Led requirements workshops with 15+ stakeholders across product, legal, finance, and engineering to define ₹5Cr digital transformation scope" demonstrates real coordination scale.' },
  ],
  interviewTips: [
    { title: 'Prepare a Requirements Scenario', body: '"Walk me through how you would gather requirements for a new feature" is a standard BA interview question. Prepare a structured answer: identify stakeholders → conduct workshops/interviews → document requirements → validate with sign-off.' },
    { title: 'Practice Case Studies from Your Domain', body: 'Prepare 2–3 detailed case studies where your analysis led to measurable business impact. Cover: problem identification, analysis approach, stakeholder navigation, recommendation, and outcome.' },
    { title: 'Know Agile Inside Out', body: 'Most modern BA roles work in agile environments. Be ready for questions on user story writing, acceptance criteria, backlog prioritization, and how a BA fits within a scrum team.' },
  ],
  faqs: [
    { q: 'What is the difference between a business analyst and a product manager?', a: 'Business analysts typically focus on requirements gathering, process analysis, and ensuring technology solutions meet business needs — often in project contexts. Product managers focus on product vision, strategy, and roadmap — taking full ownership of what gets built and why. The roles overlap in agile environments, and many companies use the titles interchangeably.' },
    { q: 'What certifications are useful for business analysts?', a: 'CBAP (Certified Business Analysis Professional) by IIBA is the most recognized. ECBA and CCBA are stepping-stone certifications for less experienced analysts. For agile environments, CSPO (Certified Scrum Product Owner) or PMI-ACP are valuable. Domain-specific certifications (e.g., SAP, Salesforce) add significant value for relevant roles.' },
    { q: 'What is the salary for Business Analysts in India?', a: 'Entry-level BAs earn ₹5–9 LPA. Mid-level with 3–5 years earn ₹12–22 LPA. Senior BAs with domain expertise and 7+ years earn ₹25–45 LPA, particularly in IT consulting, BFSI, and enterprise transformation projects.' },
    { q: 'Is business analysis a good career for non-technical professionals?', a: 'Yes. Business analysis is one of the most accessible tech-adjacent careers for professionals with business, domain, or functional expertise. Strong communication, structured thinking, and domain knowledge often matter more than technical skills for many BA roles.' },
    { q: 'How does FindAllJob help business analysts find relevant jobs?', a: 'FindAllJob AI reads your BA resume, extracts your domain expertise, tools, methodology experience, and industry background — then matches you to BA roles where your specific combination of skills is the right fit.' },
  ],
  relatedLinks: [
    { label: 'Jobs for Data Analysts',      href: '/jobs-for-data-analysts' },
    { label: 'Jobs for Product Managers',   href: '/jobs-for-product-managers' },
  ],
}

export default function Page() {
  return (
    <>
      <RoleJobSchema role="Business Analyst" slug="jobs-for-business-analysts" faqs={cfg.faqs} />
      <RoleJobPage cfg={cfg} />
    </>
  )
}
