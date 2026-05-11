import type { Metadata } from 'next'
import { RoleJobPage, RoleJobSchema } from '@/components/seo/RoleJobPage'
import type { RoleJobConfig } from '@/components/seo/RoleJobPage'

export const metadata: Metadata = {
  title: 'UI UX Designer Jobs | Match Your Portfolio & Skills | FindAllJob',
  description: 'Find better-fit UI/UX Designer jobs matched to your design skills, tools, and portfolio experience. Resume-based AI matching for product designers, UX researchers, and UI specialists.',
  alternates: { canonical: 'https://findalljob.com/jobs-for-ui-ux-designers' },
  openGraph: {
    title: 'UI UX Designer Jobs | FindAllJob',
    description: 'Find UI/UX Designer jobs that match your design skills, tools, and portfolio experience.',
    url: 'https://findalljob.com/jobs-for-ui-ux-designers',
    siteName: 'FindAllJob',
  },
  twitter: { card: 'summary_large_image', title: 'UI UX Designer Jobs | FindAllJob', description: 'Find UI/UX Designer jobs matched to your design skills and portfolio.' },
}

const cfg: RoleJobConfig = {
  role: 'UI/UX Designer',
  roleLower: 'UI/UX designer',
  subheadline: 'Find UI/UX Designer jobs that match your specific design skills, tools, and portfolio — whether you specialize in product design, UX research, or interaction design.',
  intro: 'UI/UX Design has evolved from a peripheral function into a core product discipline. Companies investing in design-led products actively seek designers who can research user needs, design intuitive interfaces, and collaborate closely with engineering and product teams to ship experiences that drive retention and growth.',
  whyCompetitive: 'Design hiring is highly portfolio-driven, and job descriptions can be ambiguous — "UI/UX Designer" can mean anything from visual designer to full product designer to UX researcher. Resume-based matching combined with a strong portfolio link ensures you apply to roles that genuinely match your design approach and specialization.',
  skills: [
    { title: 'Figma', body: 'Industry-standard design and prototyping tool. Proficiency includes components, auto layout, variants, interactive prototypes, and developer handoff.' },
    { title: 'User Research', body: 'User interviews, usability testing, surveys, and synthesizing research into actionable insights that inform design decisions.' },
    { title: 'Interaction Design', body: 'Designing flows, micro-interactions, transitions, and error states. Understanding how users move through a product, not just how individual screens look.' },
    { title: 'Design Systems', body: 'Building and maintaining component libraries, design tokens, and documentation that ensure visual consistency at scale.' },
    { title: 'Information Architecture', body: 'Structuring content, navigation, and user flows so that the right information is easy to find at every stage of the user journey.' },
    { title: 'Cross-Functional Collaboration', body: 'Working with product managers to define requirements and with engineers to ensure designs are feasible and implemented accurately.' },
  ],
  howItHelps: [
    { title: 'Design Specialization Matching', body: 'UI-heavy roles, UX research roles, and product design roles have different requirements. AI matching identifies your specialization from your resume and finds roles that match it.' },
    { title: 'Tool Recognition', body: 'FindAllJob recognizes design tools (Figma, Sketch, Adobe XD, Maze, Hotjar, Miro) from your resume and matches you to roles requiring your specific toolkit.' },
    { title: 'Company Stage Fit', body: 'Design roles at early-stage startups (own the full design process) differ significantly from enterprise design roles (specialist, system-focused). AI matching considers company context.' },
    { title: 'Resume Optimization for Design Roles', body: 'Design resumes need to balance showing process, outcomes, and tools. AI optimization ensures your resume highlights the right mix for each specific job description.' },
  ],
  resumeTips: [
    { title: 'Lead With Portfolio, Then Resume', body: 'Every design resume should include a prominent link to your portfolio. Your portfolio does the heavy lifting — your resume provides context and keywords. Make the portfolio link impossible to miss.' },
    { title: 'Show Process and Outcomes, Not Just Screens', body: 'Recruiters want to see how you think, not just what you shipped. Describe your research approach, key design decisions, how you handled feedback, and the measurable outcome (e.g., "reduced drop-off at checkout by 23% after UX redesign").' },
    { title: 'Tailor Your Portfolio Case Studies for Each Role', body: 'If applying to a fintech company, lead with your most relevant fintech or data-heavy design case study. AI resume optimization ensures your resume language matches the role — ensure your portfolio presentation does too.' },
  ],
  interviewTips: [
    { title: 'Prepare to Walk Through Your Portfolio', body: 'Most design interviews start with a portfolio walkthrough. Practice telling each case study as a story: problem → research → design process → iterations → final design → outcome. Keep it to 5–7 minutes per case study.' },
    { title: 'Expect a Design Challenge', body: 'Many design interviews include a take-home or live design challenge: "Redesign our onboarding flow" or "Design a feature for X user need." Practice scoping ambiguous design problems, asking clarifying questions, and presenting structured design thinking.' },
    { title: 'Prepare for Cross-Functional Scenario Questions', body: '"How do you handle pushback from engineers on a design decision?" and "How do you prioritize between competing user needs?" are common. Prepare examples from your experience that demonstrate collaboration and pragmatic design decision-making.' },
  ],
  faqs: [
    { q: 'What is the difference between UI and UX design?', a: 'UX (User Experience) design focuses on how a product works — user research, information architecture, user flows, and solving usability problems. UI (User Interface) design focuses on how a product looks — visual design, typography, color, and component design. Most modern "UI/UX" roles require both, but candidates often have a stronger specialization in one.' },
    { q: 'Do I need a design degree to get a UI/UX job?', a: 'No. A strong portfolio demonstrating your design process and outcomes is more important than a formal design degree. Many successful designers come from computer science, psychology, fine arts, or are entirely self-taught. Bootcamps and courses can accelerate the transition.' },
    { q: 'What is the salary for UI/UX Designers in India?', a: 'Junior UI/UX designers earn ₹4–8 LPA in India. Mid-level product designers earn ₹12–22 LPA. Senior product designers and design leads at product companies earn ₹25–50 LPA or more.' },
    { q: 'What tools should a UI/UX designer know in 2025?', a: 'Figma is now the industry standard for design and prototyping. For user research: Maze, UserTesting, or Lookback. For collaboration: Miro or FigJam. For analytics: Hotjar, Mixpanel, or GA4. Having Figma as your primary tool plus at least one research tool is sufficient for most roles.' },
    { q: 'How does FindAllJob help UI/UX designers find jobs?', a: 'FindAllJob AI reads your design resume, extracts your tools, specialization (UX research, product design, UI), industry experience, and seniority — then matches you to design roles where your specific background is the right fit.' },
  ],
  relatedLinks: [
    { label: 'Jobs for Product Managers',        href: '/jobs-for-product-managers' },
    { label: 'Jobs for Full Stack Developers',   href: '/jobs-for-full-stack-developers' },
  ],
}

export default function Page() {
  return (
    <>
      <RoleJobSchema role="UI/UX Designer" slug="jobs-for-ui-ux-designers" faqs={cfg.faqs} />
      <RoleJobPage cfg={cfg} />
    </>
  )
}
