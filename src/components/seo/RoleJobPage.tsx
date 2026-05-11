import { SeoPage, SeoSection, FeatureGrid, type FaqItem, type RelatedLink } from '@/components/seo/SeoPage'

export interface RoleJobConfig {
  /** e.g. "Data Analyst" */
  role: string
  /** e.g. "data analyst" — used in body copy */
  roleLower: string
  /** One sentence on why the market is competitive */
  whyCompetitive: string
  /** Skills grid — 6 items */
  skills: { title: string; body: string }[]
  /** How FindAllJob helps — 3–4 items */
  howItHelps: { title: string; body: string }[]
  /** Resume improvement tips — 3 items */
  resumeTips: { title: string; body: string }[]
  /** Interview tips — 3 items */
  interviewTips: { title: string; body: string }[]
  faqs: FaqItem[]
  relatedLinks: RelatedLink[]
  /** Short intro paragraph shown under hero */
  intro: string
  /** Page subheadline shown in hero */
  subheadline: string
}

const BASE_RELATED: RelatedLink[] = [
  { label: 'Resume Job Matching',              href: '/resume-job-matching' },
  { label: 'AI Resume Optimizer',              href: '/ai-resume-optimizer' },
  { label: 'ATS Resume Checker',              href: '/ats-resume-checker' },
  { label: 'AI Mock Interview',               href: '/ai-mock-interview' },
  { label: 'Tailor Resume to Job Description', href: '/tailor-resume-to-job-description' },
  { label: 'Job Search India',                href: '/job-search-india' },
]

export function RoleJobPage({ cfg }: { cfg: RoleJobConfig }) {
  // Deduplicate related links — role-specific ones first, then base links not already present
  const roleHrefs = new Set(cfg.relatedLinks.map(r => r.href))
  const merged: RelatedLink[] = [
    ...cfg.relatedLinks,
    ...BASE_RELATED.filter(r => !roleHrefs.has(r.href)),
  ].slice(0, 8)

  return (
    <SeoPage
      headline={`Find Better-Fit ${cfg.role} Jobs with Your Resume`}
      subheadline={cfg.subheadline}
      ctaLabel="Upload Resume & Find Matching Jobs"
      faqs={cfg.faqs}
      relatedLinks={merged}
    >
      {/* Intro */}
      <SeoSection title={`${cfg.role} Job Search — What You Need to Know`}>
        <p className="text-slate-400 text-[15px] leading-relaxed mb-4">{cfg.intro}</p>
        <p className="text-slate-400 text-[15px] leading-relaxed">{cfg.whyCompetitive}</p>
      </SeoSection>

      {/* Skills */}
      <SeoSection title={`Common Skills Employers Look for in ${cfg.role}s`}>
        <FeatureGrid items={cfg.skills} />
      </SeoSection>

      {/* How FindAllJob helps */}
      <SeoSection title={`How FindAllJob Matches Your Resume with ${cfg.role} Jobs`}>
        <FeatureGrid items={cfg.howItHelps} />
      </SeoSection>

      {/* Resume tips */}
      <SeoSection title={`How to Improve Your Resume for ${cfg.role} Roles`}>
        <div className="space-y-4">
          {cfg.resumeTips.map(({ title, body }) => (
            <div key={title} className="flex gap-4">
              <span className="font-black text-blue-400 flex-shrink-0 text-[18px] leading-tight mt-0.5">→</span>
              <div>
                <p className="font-bold text-[14px] text-white mb-1">{title}</p>
                <p className="text-[13px] text-slate-400 leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </SeoSection>

      {/* Interview tips */}
      <SeoSection title={`Interview Preparation Tips for ${cfg.role} Roles`}>
        <div className="space-y-4">
          {cfg.interviewTips.map(({ title, body }) => (
            <div key={title} className="flex gap-4">
              <span className="font-black text-blue-400 flex-shrink-0 text-[18px] leading-tight mt-0.5">→</span>
              <div>
                <p className="font-bold text-[14px] text-white mb-1">{title}</p>
                <p className="text-[13px] text-slate-400 leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </SeoSection>
    </SeoPage>
  )
}

/** Generates FAQPage + BreadcrumbList JSON-LD for role pages */
export function RoleJobSchema({ role, slug, faqs }: { role: string; slug: string; faqs: FaqItem[] }) {
  const base = 'https://findalljob.com'
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home',       item: base },
      { '@type': 'ListItem', position: 2, name: `${role} Jobs`, item: `${base}/${slug}` },
    ],
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
    </>
  )
}
