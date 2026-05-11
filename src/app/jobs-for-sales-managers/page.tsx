import type { Metadata } from 'next'
import { RoleJobPage, RoleJobSchema } from '@/components/seo/RoleJobPage'
import type { RoleJobConfig } from '@/components/seo/RoleJobPage'

export const metadata: Metadata = {
  title: 'Sales Manager Jobs | Find Better-Fit Sales Roles | FindAllJob',
  description: 'Find better-fit Sales Manager jobs matched to your industry, deal type, and experience. AI resume matching for B2B SaaS, enterprise, inside sales, and field sales management roles.',
  alternates: { canonical: 'https://findalljob.com/jobs-for-sales-managers' },
  openGraph: {
    title: 'Sales Manager Jobs | FindAllJob',
    description: 'Find Sales Manager jobs matched to your industry, deal type, and experience level.',
    url: 'https://findalljob.com/jobs-for-sales-managers',
    siteName: 'FindAllJob',
  },
  twitter: { card: 'summary_large_image', title: 'Sales Manager Jobs | FindAllJob', description: 'Find Sales Manager jobs matched to your industry and deal experience.' },
}

const cfg: RoleJobConfig = {
  role: 'Sales Manager',
  roleLower: 'sales manager',
  subheadline: 'Find Sales Manager roles matched to your specific industry, deal complexity, and team leadership experience — B2B SaaS, enterprise, field sales, or inside sales.',
  intro: 'Sales Managers lead revenue-generating teams and are responsible for hitting targets, coaching sales reps, building pipeline, and driving consistent growth. They sit at the core of every business\'s go-to-market motion, making sales leadership one of the most valued and well-compensated roles across industries.',
  whyCompetitive: 'Sales Manager roles vary dramatically by deal type (transactional vs enterprise), industry (SaaS vs manufacturing vs BFSI), and motion (inside vs field vs channel). A sales manager who has built a B2B SaaS inside sales team is not the same as one who manages enterprise account executives. Resume-based matching finds the right fit for your specific experience.',
  skills: [
    { title: 'Revenue Ownership', body: 'Owning and delivering against quarterly/annual revenue targets. Pipeline management, forecasting accuracy, and deal progression discipline.' },
    { title: 'Team Leadership & Coaching', body: 'Recruiting, onboarding, and developing sales reps. Running 1:1s, call reviews, and structured coaching programs that improve individual and team performance.' },
    { title: 'CRM Mastery', body: 'Salesforce, HubSpot, or Zoho CRM. Accurate pipeline management, activity tracking, deal stage discipline, and sales reporting.' },
    { title: 'Sales Process & Methodology', body: 'MEDDIC, SPIN, Challenger, or consultative selling. Implementing structured sales processes that are repeatable and scalable across a team.' },
    { title: 'Enterprise & Mid-Market Sales', body: 'Multi-stakeholder deals, negotiation, procurement navigation, and managing long sales cycles of 3–12+ months in complex B2B environments.' },
    { title: 'Cross-Functional Collaboration', body: 'Working with marketing (pipeline generation), product (customer feedback), and customer success (expansion and retention) to drive full revenue lifecycle performance.' },
  ],
  howItHelps: [
    { title: 'Industry & Deal Type Matching', body: 'B2B SaaS, fintech, BFSI, manufacturing, and healthcare sales all require different expertise. FindAllJob matches your specific industry sales experience to relevant roles.' },
    { title: 'IC vs Manager vs Director Level Fit', body: 'Carrying a quota as an AE vs leading a team of 5 vs managing a regional sales org are very different levels. AI matching aligns your actual leadership scope to the right role level.' },
    { title: 'Inside Sales vs Field Sales', body: 'Inside sales (high velocity, shorter cycles) and field/enterprise sales (relationship-based, longer cycles) require different skills. AI matching identifies your motion and finds the right roles.' },
    { title: 'Resume Optimization for Sales Roles', body: 'Sales JDs use specific metric language (ARR, ACV, quota, pipeline coverage, win rate). AI optimization ensures your resume features your relevant numbers and terminology prominently.' },
  ],
  resumeTips: [
    { title: 'Lead With Revenue Numbers', body: 'Sales hiring managers look at numbers first. Lead with your quota, attainment, and team size: "Led a team of 8 BDRs and 5 AEs; achieved 118% of ₹12Cr ARR annual target two years running." Concrete numbers are the currency of sales resumes.' },
    { title: 'Show What Changed Under Your Leadership', body: 'Before/after metrics tell a powerful story: "Inherited a team hitting 72% quota; rebuilt sales process, added structured coaching cadence, and improved team attainment to 105% within 9 months."' },
    { title: 'Specify Your Deal Type and ACV', body: '"B2B sales" is too generic. Specify: deal type (SMB, mid-market, enterprise), average contract value (ACV), sales cycle length, and the number of accounts or team members you managed. This directly improves your ATS match for relevant roles.' },
  ],
  interviewTips: [
    { title: 'Prepare Your Revenue Story', body: 'Know your exact quota history, attainment percentages, and ranking against peers for the last 3–5 years. Sales interviews are highly metrics-driven — vague answers about "strong performance" are not competitive.' },
    { title: 'Prepare a Team Turnaround or Build Story', body: '"Tell me about a time you improved your team\'s performance" is a standard sales manager interview question. Prepare a structured story: situation → what was broken → what you changed → result. Make it specific and quantified.' },
    { title: 'Know Your Sales Methodology Deeply', body: 'Be ready to explain the sales methodology you use (MEDDIC, Challenger, SPIN) and how you have implemented it with a team — not just that you are familiar with it. Hiring managers probe for depth and practical application.' },
  ],
  faqs: [
    { q: 'What makes a great sales manager?', a: 'The best sales managers combine consistent personal sales performance history with strong coaching ability, process discipline, and the ability to recruit and develop talent. They are data-driven about pipeline and forecast accuracy, and create accountability structures that improve team performance over time.' },
    { q: 'What is the salary for Sales Managers in India?', a: 'Sales manager compensation is heavily variable. Base salaries range from ₹12–25 LPA for mid-level managers, with OTE (on-target earnings) often 40–60% above base for quota-carrying roles. B2B SaaS sales managers at Series B+ companies frequently earn ₹30–60 LPA OTE.' },
    { q: 'What is the difference between a Sales Manager and a Business Development Manager?', a: 'Sales Managers typically lead an existing sales team and own revenue targets for a defined territory or segment. Business Development Managers often focus on new channel partnerships, strategic deals, or market expansion — sometimes with a team, sometimes as an individual contributor. Check the JD carefully as companies use these titles differently.' },
    { q: 'Is a Sales Manager role good for career growth?', a: 'Yes. Strong sales leaders are consistently among the highest-paid professionals in most industries. From Sales Manager, the typical progression is to Senior Sales Manager → Regional Head → VP Sales → CRO. Sales leadership experience also opens paths into general management and startup founding.' },
    { q: 'How does FindAllJob help sales managers find the right roles?', a: 'FindAllJob AI reads your sales resume, extracts your specific industry, deal type, team size, revenue track record, and sales motion — then matches you to sales manager roles where your specific background and numbers are the right fit.' },
  ],
  relatedLinks: [
    { label: 'Jobs for Digital Marketing Managers', href: '/jobs-for-digital-marketing-managers' },
    { label: 'Jobs for Business Analysts',          href: '/jobs-for-business-analysts' },
    { label: 'Jobs for Product Managers',           href: '/jobs-for-product-managers' },
  ],
}

export default function Page() {
  return (
    <>
      <RoleJobSchema role="Sales Manager" slug="jobs-for-sales-managers" faqs={cfg.faqs} />
      <RoleJobPage cfg={cfg} />
    </>
  )
}
