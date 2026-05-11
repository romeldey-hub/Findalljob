import type { Metadata } from 'next'
import { RoleJobPage, RoleJobSchema } from '@/components/seo/RoleJobPage'
import type { RoleJobConfig } from '@/components/seo/RoleJobPage'

export const metadata: Metadata = {
  title: 'Data Analyst Jobs | Match Your Resume with Better-Fit Roles | FindAllJob',
  description: 'Find better-fit Data Analyst jobs by matching your resume with relevant roles. Improve your resume, prepare for interviews, and apply smarter with FindAllJob.',
  alternates: { canonical: 'https://www.findalljob.com/jobs-for-data-analysts' },
  openGraph: {
    title: 'Data Analyst Jobs | FindAllJob',
    description: 'Find better-fit Data Analyst jobs by matching your resume with relevant roles.',
    url: 'https://www.findalljob.com/jobs-for-data-analysts',
    siteName: 'FindAllJob',
  },
  twitter: { card: 'summary_large_image', title: 'Data Analyst Jobs | FindAllJob', description: 'Match your resume with relevant Data Analyst roles.' },
}

const cfg: RoleJobConfig = {
  role: 'Data Analyst',
  roleLower: 'data analyst',
  subheadline: 'Upload your resume and get AI-ranked Data Analyst job matches based on your SQL, Python, and analytics skills — so you apply where you are genuinely competitive.',
  intro: 'Data Analyst roles are among the most in-demand positions across industries — from fintech and e-commerce to healthcare and SaaS. Every company that generates data needs someone to make sense of it, creating a wide and growing job market for analysts at all experience levels.',
  whyCompetitive: 'Competition is high because data skills are increasingly common. Standing out requires a resume that clearly demonstrates your analytical impact — not just listing tools, but showing how your analysis drove decisions, improved processes, or increased revenue. AI-powered resume matching helps you find the roles where your specific skills are the strongest fit.',
  skills: [
    { title: 'SQL', body: 'Proficiency in writing complex queries, joins, window functions, and aggregations. Required in nearly every data analyst job description.' },
    { title: 'Python or R', body: 'Data manipulation with pandas/numpy, statistical analysis, and scripting for automation and reporting pipelines.' },
    { title: 'Data Visualization', body: 'Tableau, Power BI, Looker, or Metabase. Turning raw data into clear, decision-ready dashboards for stakeholders.' },
    { title: 'Excel / Google Sheets', body: 'Advanced spreadsheet skills including pivot tables, VLOOKUP, and data modelling — still widely used alongside BI tools.' },
    { title: 'Business Acumen', body: 'Translating business questions into analytical frameworks and communicating findings to non-technical audiences.' },
    { title: 'Statistical Analysis', body: 'A/B testing, hypothesis testing, regression, and cohort analysis to support data-driven decision making.' },
  ],
  howItHelps: [
    { title: 'Skill-Based Matching', body: 'AI extracts your SQL, Python, visualization, and analytics tools from your resume and ranks jobs where your exact skill set is required — not just any analyst role.' },
    { title: 'Experience Level Alignment', body: 'FindAllJob matches your years of experience and seniority to the right level — junior analyst, mid-level, senior, or lead — so you are not applying above or below your range.' },
    { title: 'Resume Optimization for Each Role', body: 'Each data analyst job description uses different terminology. AI tailors your resume to match the specific keywords and requirements of each posting before you apply.' },
    { title: 'Interview Practice for Analyst Roles', body: 'AI mock interviews generate SQL, case study, and behavioral questions relevant to the specific analyst role and company you are targeting.' },
  ],
  resumeTips: [
    { title: 'Quantify Every Insight', body: 'Instead of "built dashboards," write "built a sales dashboard tracking ₹50Cr pipeline, used weekly by 12 sales managers to prioritize outreach." Numbers make analyst impact concrete.' },
    { title: 'List Tools With Context', body: 'Do not just list "SQL, Python, Tableau." Show where you used them: "Used Python + Pandas to automate weekly reporting, saving 6 hours of manual work per week."' },
    { title: 'Tailor for Domain', body: 'Fintech analyst roles require different emphasis than e-commerce or healthcare. Use AI resume optimization to reframe your experience for each domain\'s specific language and requirements.' },
  ],
  interviewTips: [
    { title: 'Prepare for SQL Coding Rounds', body: 'Most data analyst interviews include a live SQL test. Practice writing joins, subqueries, window functions (RANK, LAG, LEAD), and GROUP BY aggregations under time pressure.' },
    { title: 'Practice Explaining Your Analysis', body: 'Interviewers often ask you to walk through a past analysis project. Prepare 2–3 strong examples with clear problem → approach → finding → business impact structure.' },
    { title: 'Expect a Case Study', body: 'Many analyst interviews include a business case (e.g., "our conversion rate dropped 15% last week — how would you investigate?"). Practice structured diagnostic thinking: define metric, segment, hypothesize, validate.' },
  ],
  faqs: [
    { q: 'What qualifications do I need for a data analyst job?', a: 'Most data analyst roles require proficiency in SQL, at least one visualization tool (Tableau, Power BI, or Looker), and basic statistical knowledge. A degree in mathematics, statistics, computer science, or economics is common but not always required — a strong portfolio and demonstrated analytical skills can substitute.' },
    { q: 'How do I get a data analyst job with no experience?', a: 'Build a portfolio of analysis projects using public datasets (Kaggle, government data). Learn SQL and Python basics through free courses. Apply to junior/associate analyst roles or business analyst roles where the data component is one part of the job. FindAllJob shows you which roles match your current skill set so you apply where you have a real chance.' },
    { q: 'What is the salary range for data analysts in India?', a: 'Entry-level data analyst roles in India typically range from ₹4–8 LPA. Mid-level analysts with 3–5 years of experience earn ₹10–18 LPA. Senior analysts and those with specialist domain knowledge (fintech, SaaS) can earn ₹20–35 LPA or more.' },
    { q: 'How is a data analyst different from a data scientist?', a: 'Data analysts primarily focus on querying, cleaning, and visualizing existing data to answer business questions. Data scientists build predictive models and use machine learning to generate new insights. The roles overlap but data science typically requires stronger programming and statistical modelling skills.' },
    { q: 'How does FindAllJob help data analysts find jobs?', a: 'FindAllJob AI reads your data analyst resume, extracts your specific tools, techniques, and domain experience, then ranks job matches by fit score. You see which roles are the strongest match before applying — and can optimize your resume for each role with one click.' },
  ],
  relatedLinks: [
    { label: 'Jobs for Data Scientists',   href: '/jobs-for-data-scientists' },
    { label: 'Jobs for Business Analysts', href: '/jobs-for-business-analysts' },
    { label: 'Jobs for AI Engineers',      href: '/jobs-for-ai-engineers' },
  ],
}

export default function Page() {
  return (
    <>
      <RoleJobSchema role="Data Analyst" slug="jobs-for-data-analysts" faqs={cfg.faqs} />
      <RoleJobPage cfg={cfg} />
    </>
  )
}
