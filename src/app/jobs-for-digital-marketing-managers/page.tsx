import type { Metadata } from 'next'
import { RoleJobPage, RoleJobSchema } from '@/components/seo/RoleJobPage'
import type { RoleJobConfig } from '@/components/seo/RoleJobPage'

export const metadata: Metadata = {
  title: 'Digital Marketing Manager Jobs | Resume-Matched Roles | FindAllJob',
  description: 'Find better-fit Digital Marketing Manager jobs matched to your channels, tools, and experience. AI resume matching for performance marketing, SEO, content, and growth roles.',
  alternates: { canonical: 'https://www.findalljob.com/jobs-for-digital-marketing-managers' },
  openGraph: {
    title: 'Digital Marketing Manager Jobs | FindAllJob',
    description: 'Find Digital Marketing Manager jobs matched to your channels, tools, and experience.',
    url: 'https://www.findalljob.com/jobs-for-digital-marketing-managers',
    siteName: 'FindAllJob',
  },
  twitter: { card: 'summary_large_image', title: 'Digital Marketing Manager Jobs | FindAllJob', description: 'Find Digital Marketing Manager roles matched to your specific skills and channels.' },
}

const cfg: RoleJobConfig = {
  role: 'Digital Marketing Manager',
  roleLower: 'digital marketing manager',
  subheadline: 'Find Digital Marketing Manager roles matched to your specific channels — performance, SEO, content, growth, or brand — and the tools and metrics you actually work with.',
  intro: 'Digital Marketing Managers plan, execute, and optimize marketing campaigns across digital channels to drive growth, customer acquisition, and revenue. The role spans a wide spectrum — from hands-on performance marketers managing paid ads to strategic brand marketers overseeing content and SEO — making precise job matching important.',
  whyCompetitive: 'Digital marketing is a broad field and job descriptions vary significantly across company stages and channels. A performance marketer at a D2C brand and a content marketing manager at a SaaS company both hold "digital marketing manager" roles but need very different skills. Resume-based matching surfaces the roles that match your actual marketing specialization.',
  skills: [
    { title: 'Performance Marketing', body: 'Google Ads, Meta Ads, LinkedIn Ads. Campaign setup, optimization, A/B testing creatives, audience segmentation, and ROAS-driven budget management.' },
    { title: 'SEO', body: 'Technical SEO, keyword research, on-page optimization, link building, and using tools like Ahrefs, SEMrush, or Google Search Console to drive organic growth.' },
    { title: 'Analytics & Reporting', body: 'Google Analytics 4, Mixpanel, or Amplitude. Building dashboards, analysing funnel performance, and attributing revenue to marketing channels.' },
    { title: 'Content Marketing', body: 'Content strategy, editorial calendar management, blog/SEO content, email campaigns, and measuring content impact on pipeline and organic traffic.' },
    { title: 'Marketing Automation', body: 'HubSpot, Marketo, Klaviyo, or Customer.io. Setting up lifecycle campaigns, lead nurturing, and automating customer communication at scale.' },
    { title: 'Growth & Experimentation', body: 'Running structured growth experiments across acquisition, activation, and retention. Hypothesis-driven testing with statistical significance awareness.' },
  ],
  howItHelps: [
    { title: 'Channel Specialization Matching', body: 'FindAllJob AI identifies your marketing specialization — performance, SEO, content, growth, or brand — from your resume and matches you to roles that require your specific channels.' },
    { title: 'Tool Recognition', body: 'Marketing tools like HubSpot, Klaviyo, Google Ads, Ahrefs, Salesforce Marketing Cloud, and Mixpanel are recognized from your resume and factored into matching.' },
    { title: 'Startup vs Enterprise Fit', body: 'Marketing roles at early-stage startups require hands-on generalist skills; enterprise roles need specialist depth and stakeholder management. AI matching considers company stage context.' },
    { title: 'Resume Optimization for Marketing Roles', body: 'Marketing JDs use specific channel, tool, and metric language. AI optimization ensures your resume uses the exact terminology and KPIs each role requires.' },
  ],
  resumeTips: [
    { title: 'Lead With Marketing Metrics, Not Activities', body: '"Ran Google Ads campaigns" is generic. "Managed ₹30L/month Google Ads budget; improved CAC by 35% and achieved 4.2x ROAS over 6 months" tells the hiring manager exactly what to expect from you.' },
    { title: 'Specify Your Channels and Tools', body: 'List every relevant marketing tool and channel: Google Ads, Meta Ads, LinkedIn Ads, Klaviyo, HubSpot, Ahrefs, GA4. Many marketing JDs require specific platform experience, and listing them improves your ATS match score.' },
    { title: 'Tailor for B2B vs B2C', body: 'B2B and B2C marketing are fundamentally different disciplines with different metrics (pipeline vs ROAS, MQL vs conversion rate). AI resume optimization ensures your resume emphasizes the right framing for each job description.' },
  ],
  interviewTips: [
    { title: 'Prepare a Campaign Deep Dive', body: 'Be ready to walk through a campaign you owned end-to-end: objective → strategy → execution → results → learnings. Interviewers want to see structured marketing thinking, not just channel familiarity.' },
    { title: 'Know Your Numbers Cold', body: 'Marketing interviews frequently test metric fluency: CAC, LTV, ROAS, CTR, CVR, MQL-to-SQL ratio. Know your past numbers precisely — vague answers signal weak analytical ownership.' },
    { title: 'Prepare a Growth Challenge Response', body: '"Our organic traffic plateaued — how would you approach this?" is a common marketing interview question. Practice structured diagnostic thinking: audit → hypothesis → prioritize tests → measure → iterate.' },
  ],
  faqs: [
    { q: 'What skills are most important for a digital marketing manager in 2025?', a: 'Data literacy and analytics (GA4, Mixpanel), performance marketing (Google/Meta Ads), SEO fundamentals, and marketing automation are the most consistently required skills. AI-assisted content and campaign optimization is increasingly valued across roles.' },
    { q: 'What certifications are useful for digital marketers?', a: 'Google Ads certification, Google Analytics certification, HubSpot certifications, and Meta Blueprint are widely recognized. For SEO roles, demonstrated traffic growth results often matter more than certifications.' },
    { q: 'What is the salary for Digital Marketing Managers in India?', a: 'Entry-level digital marketers earn ₹4–8 LPA. Mid-level managers with 3–5 years and proven channel expertise earn ₹12–22 LPA. Senior digital marketing managers and growth leaders earn ₹25–45 LPA at product-led companies.' },
    { q: 'Is digital marketing a good career in India?', a: 'Yes. India\'s rapidly growing digital economy — especially in e-commerce, fintech, edtech, and D2C — has created strong demand for skilled digital marketers. The field rewards performance and results, making it one of the more meritocratic career paths.' },
    { q: 'How does FindAllJob match me with digital marketing jobs?', a: 'FindAllJob AI reads your marketing resume, extracts your channel specialization, tools, industry experience, and role level — then matches you to digital marketing roles where your specific background is the right fit.' },
  ],
  relatedLinks: [
    { label: 'Jobs for Sales Managers',     href: '/jobs-for-sales-managers' },
    { label: 'Jobs for Business Analysts',  href: '/jobs-for-business-analysts' },
    { label: 'Jobs for Product Managers',   href: '/jobs-for-product-managers' },
  ],
}

export default function Page() {
  return (
    <>
      <RoleJobSchema role="Digital Marketing Manager" slug="jobs-for-digital-marketing-managers" faqs={cfg.faqs} />
      <RoleJobPage cfg={cfg} />
    </>
  )
}
