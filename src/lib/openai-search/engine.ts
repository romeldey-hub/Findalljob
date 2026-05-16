import crypto from 'crypto'
import { z } from 'zod'
import { zodTextFormat } from 'openai/helpers/zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedJob, ParsedResume } from '@/types'
import { FREE_LIMITS } from '@/lib/limits'
import { isProUser } from '@/lib/admin'
import { resolveProUntil } from '@/lib/billing'
import { JobSourceRouter } from '@/lib/jobs/router'
import { openAIResponsesParse } from '@/lib/ai/openai'

const PROFILE_MODEL = process.env.OPENAI_SEARCH_MODEL ?? 'gpt-5.2'
const RERANK_MODEL = process.env.OPENAI_SEARCH_RERANK_MODEL ?? PROFILE_MODEL
const TARGET_PAID = 20
const MAX_AI_RERANK_JOBS = 50

const OPERATIONS_EXPANSION_TITLES = [
  'Operations Coordinator',
  'Operations Executive',
  'Business Operations Executive',
  'Business Operations Coordinator',
  'Logistics Coordinator',
  'Logistics Executive',
  'Supply Chain Executive',
  'Supply Chain Coordinator',
  'MIS Executive',
  'MIS Operations Executive',
  'Order Fulfillment Executive',
  'Order Management Executive',
  'Vendor Coordinator',
  'Procurement Coordinator',
  'Inventory Coordinator',
  'Ecommerce Operations Executive',
  'Client Operations Coordinator',
  'Backend Operations Executive',
]

const OPERATIONS_TITLE_KEYWORDS = [
  'operations',
  'logistics',
  'supply chain',
  'coordinator',
  'mis',
  'fulfillment',
  'inventory',
  'procurement',
  'vendor',
  'order management',
  'ecommerce operations',
  'client operations',
  'backend operations',
]

const OPERATIONS_NEGATIVE_TITLE_KEYWORDS = [
  'field sales',
  'telecaller',
  'recruiter',
  'insurance advisor',
  'real estate',
  'customer support',
  'customer care',
  'call center',
  'warehouse labor',
  'warehouse worker',
  'delivery driver',
  'driver',
  'data entry',
  'fresher',
  'internship',
  'intern',
]

const NON_OPERATIONS_ROLE_HINTS = [
  'devops',
  'software',
  'developer',
  'engineer',
  'sre',
  'platform',
  'design',
  'designer',
  'visual',
  'graphic',
  'marketing',
  'sales',
  'finance',
  'accounting',
]

const SEMICONDUCTOR_DOMAIN_KEYWORDS = [
  'semiconductor',
  'embedded',
  'hardware',
  'fpga',
  'compute',
  'processor',
  'cpu',
  'gpu',
  'soc',
  'asic',
  'pcb',
  'electronics',
  'oem',
  'channel',
  'pre sales',
  'presales',
  'technical sales',
  'field application',
  'field applications',
  'fae',
  'application engineering',
  'design win',
]

const SEMICONDUCTOR_ROLE_TITLES = [
  'Field Application Engineer',
  'Field Applications Engineer',
  'Application Engineer',
  'Applications Engineer',
  'Pre-Sales Engineer',
  'Presales Engineer',
  'Technical Sales Engineer',
  'Sales Engineer',
  'Solutions Engineer',
  'Solutions Consultant',
  'Technical Account Manager',
  'Partner Technical Manager',
  'OEM Technical Account Manager',
  'Application Engineering Manager',
  'Field Applications Manager',
]

const COMPANY_ECOSYSTEM_MAP: Record<string, {
  competitors: string[]
  similar: string[]
  adjacent: string[]
  products: string[]
  customers: string[]
  domains: string[]
}> = {
  amd: {
    competitors: ['Intel', 'NVIDIA', 'Qualcomm', 'Broadcom', 'Marvell', 'MediaTek', 'Arm'],
    similar: ['Texas Instruments', 'Analog Devices', 'NXP Semiconductors', 'Infineon', 'STMicroelectronics', 'Renesas', 'Microchip Technology', 'ON Semiconductor', 'Ambiq', 'Synopsys', 'Cadence'],
    adjacent: ['Arrow Electronics', 'Avnet', 'Mouser Electronics', 'DigiKey', 'Future Electronics', 'TD SYNNEX', 'Ingram Micro', 'Cisco', 'HPE'],
    products: ['CPU', 'GPU', 'FPGA', 'embedded processors', 'data center compute', 'semiconductor hardware'],
    customers: ['HP', 'Dell', 'Lenovo', 'Acer', 'Cisco', 'HPE', 'OEM', 'channel partners', 'government customers'],
    domains: SEMICONDUCTOR_DOMAIN_KEYWORDS,
  },
}

const CandidateSearchProfileSchema = z.object({
  current_recent_company: z.string(),
  target_titles: z.array(z.string()).max(10),
  acceptable_titles: z.array(z.string()).max(20),
  avoid_titles: z.array(z.string()).max(20),
  role_family: z.string(),
  seniority: z.string(),
  industries: z.array(z.string()).max(12),
  industry_domain: z.array(z.string()).max(16),
  product_ecosystem: z.array(z.string()).max(20),
  customer_partner_ecosystem: z.array(z.string()).max(20),
  competitor_companies: z.array(z.string()).max(20),
  similar_companies: z.array(z.string()).max(20),
  adjacent_companies: z.array(z.string()).max(20),
  must_have_skills: z.array(z.string()).max(20),
  must_have_keywords: z.array(z.string()).max(30),
  nice_to_have_skills: z.array(z.string()).max(20),
  location_preference: z.string(),
  negative_keywords: z.array(z.string()).max(30),
  search_queries: z.array(z.string()).min(1).max(12),
}).strict()

const RerankSchema = z.object({
  results: z.array(z.object({
    externalJobId: z.string(),
    rank: z.number().int().min(1),
    finalScore: z.number().int().min(0).max(100),
    matchLabel: z.enum(['strong', 'good', 'possible', 'weak_reject']),
    showRecommended: z.boolean(),
    matchedSkills: z.array(z.string()).max(12),
    missingSkills: z.array(z.string()).max(12),
    matchReasons: z.array(z.string()).max(5),
    concerns: z.array(z.string()).max(5),
    resumeFixSuggestions: z.array(z.string()).max(5),
  })).max(MAX_AI_RERANK_JOBS),
}).strict()

export type CandidateSearchProfile = z.infer<typeof CandidateSearchProfileSchema>
type RerankedJob = z.infer<typeof RerankSchema>['results'][number]

type SearchScope = {
  searchMode?: 'country' | 'international_remote'
  countryCode?: string | null
  countryName?: string | null
  testResumeId?: string | null
  includeCurrentCompany?: boolean
  usage?: OpenAIUsageContext
}

type OpenAIUsageContext = {
  userId?: string
  userEmail?: string | null
  isFreeUser?: boolean
  creditsCharged?: number
  creditFeatureKey?: string
  fallbackUsed?: boolean
  fallbackReason?: string | null
  resumeId?: string | null
}

type OpenAISearchRunResult = {
  runId: string
  savedCount: number
  targetCount: number
  failureReason: string | null
}

type ResumeRow = {
  id: string
  raw_text: string | null
  parsed_data: ParsedResume | null
}

type V2TestResumePayload = {
  id: string
  user_id: string
  file_name: string
  raw_text: string
  parsed_data?: ParsedResume | null
  resume_hash: string
  uploaded_at: string
}

type ProfileRow = {
  role?: string | null
  subscription_status?: string | null
  pro_until?: string | null
}

type ScoredJob = NormalizedJob & { localScore: number }
type SelectedJobRow = {
  job: ScoredJob
  local: number
  final: RerankedJob
  sourceGroup: 'first_pass' | 'rescue'
}

function hashResume(resume: ResumeRow) {
  return crypto
    .createHash('sha256')
    .update(`${resume.id}:${resume.raw_text ?? ''}:${JSON.stringify(resume.parsed_data ?? {})}`)
    .digest('hex')
}

function targetCount(isPro: boolean) {
  return isPro ? TARGET_PAID : FREE_LIMITS.matchesPerDay
}

function resumeText(resume: ResumeRow) {
  const parsed = resume.parsed_data
  const parts = [
    parsed?.name,
    parsed?.summary,
    parsed?.location,
    parsed?.skills?.join(', '),
    parsed?.experience?.map((e) => `${e.title} at ${e.company}. ${e.bullets?.join(' ') ?? ''}`).join('\n'),
    parsed?.education?.map((e) => `${e.degree} ${e.field} ${e.school}`).join('\n'),
    resume.raw_text,
  ].filter(Boolean)

  return parts.join('\n').slice(0, 16000)
}

function fallbackProfile(resume: ResumeRow): CandidateSearchProfile {
  const parsed = resume.parsed_data
  const latestTitle = parsed?.experience?.[0]?.title || 'Software Engineer'
  const latestCompany = parsed?.experience?.[0]?.company || ''
  const skills = parsed?.skills?.slice(0, 12) ?? []
  return {
    current_recent_company: latestCompany,
    target_titles: [latestTitle],
    acceptable_titles: [latestTitle],
    avoid_titles: ['intern', 'trainee', 'unpaid'],
    role_family: latestTitle,
    seniority: latestTitle.toLowerCase().includes('senior') ? 'senior' : 'mid-level',
    industries: [],
    industry_domain: [],
    product_ecosystem: [],
    customer_partner_ecosystem: [],
    competitor_companies: [],
    similar_companies: [],
    adjacent_companies: [],
    must_have_skills: skills.slice(0, 8),
    must_have_keywords: skills.slice(0, 8),
    nice_to_have_skills: skills.slice(8, 12),
    location_preference: parsed?.location || 'remote',
    negative_keywords: ['intern', 'trainee', 'unpaid'],
    search_queries: [latestTitle, ...skills.slice(0, 3).map((skill) => `${latestTitle} ${skill}`)],
  }
}

async function extractCandidateProfile(resume: ResumeRow, usage?: OpenAIUsageContext, runId?: string): Promise<CandidateSearchProfile> {
  try {
    const response = await openAIResponsesParse<{ output_parsed?: CandidateSearchProfile }>({
      model: PROFILE_MODEL,
      instructions: [
        'Extract a strict recruiter-grade job-search intelligence profile from the candidate resume.',
        'Identify the current or most recent company, role family, seniority, industry/domain, product ecosystem, customer/partner ecosystem, competitors, similar companies, adjacent companies, must-have keywords, and exclusion keywords.',
        'Use company/category intelligence, not only title similarity. Competitor and adjacent-company lists should contain employers likely to value the candidate domain background.',
        'Return only role-safe search terms. Avoid inflated titles and avoid unrelated roles.',
        'Search queries should be concise phrases suitable for job APIs and should mix exact titles, adjacent titles, competitor/similar companies, same-industry terms, and ecosystem keywords.',
      ].join(' '),
      input: resumeText(resume),
      text: { format: zodTextFormat(CandidateSearchProfileSchema, 'candidate_search_profile') },
    }, {
      feature: 'openai_search_profile_extract',
      userId: usage?.userId,
      userEmail: usage?.userEmail,
      isFreeUser: usage?.isFreeUser,
      creditsCharged: usage?.creditsCharged,
      creditFeatureKey: usage?.creditFeatureKey,
      fallbackUsed: usage?.fallbackUsed,
      fallbackReason: usage?.fallbackReason,
      searchRunId: runId,
      resumeId: resume.id,
    })

    return response.output_parsed ?? fallbackProfile(resume)
  } catch (error) {
    console.error('[openai-search] profile extraction failed:', error)
    throw error
  }
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    const key = normalizeText(trimmed)
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function companyKey(value: string) {
  return normalizeText(value)
    .replace(/\b(inc|corp|corporation|ltd|limited|llc|pvt|private|technologies|technology|semiconductors|semiconductor)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function companyMatchesAny(company: string, companies: string[]) {
  const normalizedCompany = companyKey(company)
  if (!normalizedCompany) return false
  return companies.some((candidate) => {
    const normalizedCandidate = companyKey(candidate)
    return normalizedCandidate.length > 1 &&
      (normalizedCompany === normalizedCandidate ||
        normalizedCompany.includes(normalizedCandidate) ||
        normalizedCandidate.includes(normalizedCompany))
  })
}

function currentCompanyNames(profile: CandidateSearchProfile) {
  return uniqueStrings([
    profile.current_recent_company,
  ]).filter(Boolean)
}

function isCurrentCompanyJob(job: NormalizedJob, profile: CandidateSearchProfile) {
  const currentCompanies = currentCompanyNames(profile)
  return currentCompanies.length > 0 && companyMatchesAny(job.company, currentCompanies)
}

function stripCurrentCompanyTerms(values: string[], profile: CandidateSearchProfile) {
  const currentCompanies = currentCompanyNames(profile)
  if (currentCompanies.length === 0) return values
  return values.filter((value) => !companyMatchesAny(value, currentCompanies))
}

function queryMentionsCurrentCompany(query: string, profile: CandidateSearchProfile) {
  const currentCompanies = currentCompanyNames(profile)
  if (currentCompanies.length === 0) return false
  return currentCompanies.some((company) => {
    const key = companyKey(company)
    return key.length > 1 && normalizeText(query).includes(key)
  })
}

function resumeIntelligenceText(resume: ResumeRow, profile: CandidateSearchProfile) {
  const parsed = resume.parsed_data
  return normalizeText([
    resume.raw_text,
    parsed?.summary,
    parsed?.location,
    parsed?.skills?.join(' '),
    parsed?.experience?.map((experience) =>
      `${experience.title} ${experience.company} ${(experience.bullets ?? []).join(' ')}`
    ).join(' '),
    profile.current_recent_company,
    profile.role_family,
    ...profile.target_titles,
    ...profile.acceptable_titles,
    ...profile.industries,
    ...profile.industry_domain,
    ...profile.product_ecosystem,
    ...profile.customer_partner_ecosystem,
    ...profile.must_have_keywords,
  ].filter(Boolean).join(' '))
}

function countryNameForQueries(scope: SearchScope, profile: CandidateSearchProfile) {
  if (scope.countryName) return scope.countryName
  if (scope.countryCode?.toLowerCase() === 'in') return 'India'
  const location = normalizeText(profile.location_preference)
  if (/\bindia\b|\bdelhi\b|\bncr\b|\bgurgaon\b|\bgurugram\b|\bnoida\b|\bmumbai\b|\bbangalore\b|\bbengaluru\b|\bhyderabad\b|\bpune\b|\bchennai\b|\bkolkata\b/.test(location)) return 'India'
  return ''
}

function isTechnicalPresalesProfile(profile: CandidateSearchProfile) {
  const roleText = normalizeText([
    profile.role_family,
    ...profile.target_titles,
    ...profile.acceptable_titles,
    ...profile.search_queries,
    ...profile.must_have_keywords,
    ...profile.industry_domain,
  ].join(' '))

  return /\b(pre sales|presales|field application|field applications|fae|solutions engineer|sales engineer|technical sales|technical account|application engineering|oem|channel|hardware)\b/.test(roleText)
}

function isSemiconductorHardwareProfile(profile: CandidateSearchProfile, resume: ResumeRow) {
  const text = resumeIntelligenceText(resume, profile)
  const hasDomain = SEMICONDUCTOR_DOMAIN_KEYWORDS.some((keyword) => text.includes(normalizeText(keyword)))
  const hasCompanyMap = Boolean(COMPANY_ECOSYSTEM_MAP[companyKey(profile.current_recent_company)])
  return (isTechnicalPresalesProfile(profile) && hasDomain) || hasCompanyMap
}

function enrichProfileWithResumeIntelligence(
  profile: CandidateSearchProfile,
  resume: ResumeRow,
  scope: SearchScope
): CandidateSearchProfile {
  const parsed = resume.parsed_data
  const currentCompany = profile.current_recent_company || parsed?.experience?.[0]?.company || ''
  const latestTitle = parsed?.experience?.[0]?.title || ''
  const country = countryNameForQueries(scope, profile)
  const city = cityFromLocation(profile.location_preference || parsed?.location || '')
  const ecosystem = COMPANY_ECOSYSTEM_MAP[companyKey(currentCompany)]
  const semiconductorMode = isSemiconductorHardwareProfile({ ...profile, current_recent_company: currentCompany }, resume)

  const targetTitles = uniqueStrings([
    ...profile.target_titles,
    latestTitle,
    ...(semiconductorMode ? SEMICONDUCTOR_ROLE_TITLES.slice(0, 7) : []),
  ]).slice(0, 18)

  const acceptableTitles = uniqueStrings([
    ...profile.acceptable_titles,
    ...(semiconductorMode ? SEMICONDUCTOR_ROLE_TITLES : []),
  ]).slice(0, 70)

  const industryDomain = uniqueStrings([
    ...profile.industry_domain,
    ...(ecosystem?.domains ?? []),
    ...(semiconductorMode ? SEMICONDUCTOR_DOMAIN_KEYWORDS : []),
  ]).slice(0, 30)

  const productEcosystem = uniqueStrings([
    ...profile.product_ecosystem,
    ...(ecosystem?.products ?? []),
  ]).slice(0, 30)

  const customerPartnerEcosystem = uniqueStrings([
    ...profile.customer_partner_ecosystem,
    ...(ecosystem?.customers ?? []),
  ]).slice(0, 30)

  const competitorCompanies = stripCurrentCompanyTerms(uniqueStrings([
    ...profile.competitor_companies,
    ...(ecosystem?.competitors ?? []),
  ]), { ...profile, current_recent_company: currentCompany }).slice(0, 30)

  const similarCompanies = stripCurrentCompanyTerms(uniqueStrings([
    ...profile.similar_companies,
    ...(ecosystem?.similar ?? []),
  ]), { ...profile, current_recent_company: currentCompany }).slice(0, 30)

  const adjacentCompanies = stripCurrentCompanyTerms(uniqueStrings([
    ...profile.adjacent_companies,
    ...(ecosystem?.adjacent ?? []),
  ]), { ...profile, current_recent_company: currentCompany }).slice(0, 30)

  const roleQueries = targetTitles.slice(0, 7).map((title) => country ? `${title} ${country}` : title)
  const companyQueries = [...competitorCompanies, ...similarCompanies, ...adjacentCompanies]
    .slice(0, 14)
    .flatMap((company, index) => {
      const title = targetTitles[index % Math.max(targetTitles.length, 1)] || profile.role_family
      return [
        country ? `${title} ${company} ${country}` : `${title} ${company}`,
        country && index < 6 ? `${company} ${profile.role_family} ${country}` : '',
      ]
    })

  const domainQueries = uniqueStrings([
    ...industryDomain.slice(0, 8).map((domain) => country ? `${profile.role_family} ${domain} ${country}` : `${profile.role_family} ${domain}`),
    ...productEcosystem.slice(0, 6).map((product) => country ? `${profile.role_family} ${product} ${country}` : `${profile.role_family} ${product}`),
    ...customerPartnerEcosystem.slice(0, 5).map((customer) => country ? `${profile.role_family} ${customer} ${country}` : `${profile.role_family} ${customer}`),
    ...(city ? targetTitles.slice(0, 5).map((title) => `${title} ${city}`) : []),
  ])

  return {
    ...profile,
    current_recent_company: currentCompany,
    target_titles: targetTitles.slice(0, 10),
    acceptable_titles: acceptableTitles.slice(0, 60),
    industries: uniqueStrings([
      ...profile.industries,
      ...(semiconductorMode ? ['Semiconductor', 'Embedded Hardware', 'Electronics', 'OEM Hardware'] : []),
    ]).slice(0, 16),
    industry_domain: industryDomain.slice(0, 16),
    product_ecosystem: productEcosystem.slice(0, 20),
    customer_partner_ecosystem: customerPartnerEcosystem.slice(0, 20),
    competitor_companies: competitorCompanies.slice(0, 20),
    similar_companies: similarCompanies.slice(0, 20),
    adjacent_companies: adjacentCompanies.slice(0, 20),
    must_have_keywords: uniqueStrings([
      ...profile.must_have_keywords,
      ...profile.must_have_skills,
      ...industryDomain,
      ...productEcosystem,
    ]).slice(0, 30),
    search_queries: stripCurrentCompanyTerms(uniqueStrings([
      ...profile.search_queries,
      ...roleQueries,
      ...companyQueries,
      ...domainQueries,
    ]), { ...profile, current_recent_company: currentCompany }).slice(0, 60),
  }
}

function isOperationsProfile(profile: CandidateSearchProfile) {
  const roleText = normalizeText([
    profile.role_family,
    ...profile.target_titles,
    ...profile.acceptable_titles,
    ...profile.search_queries,
  ].join(' '))

  const hasOperationsSignal = [
    'operations',
    'business operations',
    'logistics',
    'supply chain',
    'coordination',
    'coordinator',
    'administration',
    'mis',
    'order fulfillment',
    'vendor coordination',
    'ecommerce operations',
  ].some((term) => roleText.includes(normalizeText(term)))

  if (!hasOperationsSignal) return false
  return !NON_OPERATIONS_ROLE_HINTS.some((term) => roleText.includes(term))
}

function cityFromLocation(value: string) {
  const normalized = normalizeText(value)
  const knownCities = [
    'mumbai',
    'delhi',
    'gurgaon',
    'gurugram',
    'noida',
    'bangalore',
    'bengaluru',
    'pune',
    'hyderabad',
    'chennai',
    'kolkata',
    'ahmedabad',
  ]
  return knownCities.find((city) => normalized.includes(city)) ?? ''
}

function buildOperationsExpansion(profile: CandidateSearchProfile, scope: SearchScope) {
  if (!isOperationsProfile(profile)) {
    return {
      enabled: false,
      detectedRoleFamily: profile.role_family,
      expansionTitles: [] as string[],
      expansionQueries: [] as string[],
      negativeKeywords: [] as string[],
    }
  }

  const country = scope.countryName || (scope.countryCode?.toLowerCase() === 'in' ? 'India' : '')
  const city = cityFromLocation(scope.countryName || profile.location_preference || '')
  const expansionTitles = uniqueStrings([
    ...OPERATIONS_EXPANSION_TITLES,
    ...profile.target_titles.filter((title) => titleContainsAny(title, OPERATIONS_TITLE_KEYWORDS)),
    ...profile.acceptable_titles.filter((title) => titleContainsAny(title, OPERATIONS_TITLE_KEYWORDS)),
  ])

  const expansionQueries = uniqueStrings([
    ...expansionTitles.map((title) => country ? `${title} ${country}` : title),
    ...(city ? expansionTitles.slice(0, 10).map((title) => `${title} ${city}`) : []),
  ])

  return {
    enabled: true,
    detectedRoleFamily: profile.role_family,
    expansionTitles,
    expansionQueries,
    negativeKeywords: OPERATIONS_NEGATIVE_TITLE_KEYWORDS,
  }
}

function profileWithOperationsExpansion(profile: CandidateSearchProfile, expansion: ReturnType<typeof buildOperationsExpansion>) {
  if (!expansion.enabled) return profile
  return {
    ...profile,
    acceptable_titles: uniqueStrings([
      ...profile.acceptable_titles,
      ...expansion.expansionTitles,
    ]).slice(0, 40),
    negative_keywords: uniqueStrings([
      ...profile.negative_keywords,
      ...expansion.negativeKeywords,
    ]).slice(0, 60),
    search_queries: uniqueStrings([
      ...profile.search_queries,
      ...expansion.expansionQueries,
    ]).slice(0, 36),
  }
}

function stripTitleQualifier(title: string) {
  return title
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function profileWithUploadedResumeTitleExpansion(profile: CandidateSearchProfile) {
  const roleText = normalizeText([
    profile.role_family,
    ...profile.target_titles,
    ...profile.acceptable_titles,
    ...profile.search_queries,
  ].join(' '))

  const expandedTitles = uniqueStrings([
    ...profile.target_titles,
    ...profile.acceptable_titles,
    ...profile.target_titles.map(stripTitleQualifier),
    ...profile.acceptable_titles.map(stripTitleQualifier),
  ])

  const isTechnicalPresales = /\b(pre sales|presales|field application|fae|solutions engineer|sales engineer|technical sales|technical account|tender|rfp|bid|gem|oem|hardware)\b/.test(roleText)

  const presalesTitles = isTechnicalPresales ? [
    'Field Application Engineer',
    'Field Applications Engineer',
    'Application Engineer',
    'Pre-Sales Engineer',
    'Presales Engineer',
    'Technical Pre-Sales Engineer',
    'Technical Sales Engineer',
    'Sales Engineer',
    'Solutions Engineer',
    'Solutions Consultant',
    'Technical Consultant',
    'Technical Account Manager',
    'OEM Technical Account Manager',
    'Partner Technical Manager',
    'Technical Bid Manager',
    'Bid Manager',
    'Tender Manager',
    'RFP Manager',
    'Tender Specialist',
    'Government Sales Support',
    'GeM Marketplace Manager',
    'Product Manager IT Hardware',
  ] : []

  const finalTitles = uniqueStrings([...expandedTitles, ...presalesTitles])
  if (!isTechnicalPresales && finalTitles.length === expandedTitles.length) return profile

  return {
    ...profile,
    target_titles: uniqueStrings([...profile.target_titles, ...presalesTitles.slice(0, 8)]).slice(0, 18),
    acceptable_titles: uniqueStrings([...profile.acceptable_titles, ...finalTitles]).slice(0, 60),
    search_queries: uniqueStrings([
      ...profile.search_queries,
      ...presalesTitles.map((title) => `${title} India`),
      ...presalesTitles.slice(0, 10).map((title) => `${title} Delhi NCR`),
      ...presalesTitles.slice(0, 8).map((title) => `${title} Gurgaon`),
    ]).slice(0, 48),
  }
}

function scopeFromProfileLocation(profile: CandidateSearchProfile): SearchScope {
  const location = normalizeText(profile.location_preference || '')
  if (/\b(remote|worldwide|anywhere|global|international)\b/.test(location) && !/\bindia\b/.test(location)) {
    return {
      searchMode: 'international_remote',
      countryCode: null,
      countryName: null,
    }
  }

  const countryMap: Array<{ code: string; name: string; patterns: RegExp[] }> = [
    { code: 'in', name: 'India', patterns: [/\bindia\b/, /\bdelhi\b/, /\bncr\b/, /\bgurgaon\b/, /\bgurugram\b/, /\bnoida\b/, /\bmumbai\b/, /\bbangalore\b/, /\bbengaluru\b/, /\bhyderabad\b/, /\bpune\b/, /\bchennai\b/, /\bkolkata\b/] },
    { code: 'us', name: 'United States', patterns: [/\bunited states\b/, /\busa\b/, /\bus\b/] },
    { code: 'gb', name: 'United Kingdom', patterns: [/\bunited kingdom\b/, /\buk\b/, /\blondon\b/] },
    { code: 'ca', name: 'Canada', patterns: [/\bcanada\b/, /\btoronto\b/, /\bvancouver\b/] },
    { code: 'au', name: 'Australia', patterns: [/\baustralia\b/, /\bsydney\b/, /\bmelbourne\b/] },
    { code: 'sg', name: 'Singapore', patterns: [/\bsingapore\b/] },
    { code: 'ae', name: 'United Arab Emirates', patterns: [/\buae\b/, /\bdubai\b/, /\babu dhabi\b/] },
  ]

  for (const country of countryMap) {
    if (country.patterns.some((pattern) => pattern.test(location))) {
      return {
        searchMode: 'country',
        countryCode: country.code,
        countryName: country.name,
      }
    }
  }

  return {}
}

function effectiveSearchScope(scope: SearchScope, profile: CandidateSearchProfile, inferFromProfile: boolean): SearchScope {
  if (!inferFromProfile || scope.searchMode || scope.countryCode || scope.countryName) return scope
  return scopeFromProfileLocation(profile)
}

function dedupeKey(job: NormalizedJob) {
  const apply = normalizeText(job.applyUrl || job.url || '')
  return [
    normalizeText(job.company),
    normalizeText(job.title),
    normalizeText(job.location.split(',')[0] ?? job.location),
    apply,
  ].join('|')
}

function dedupeJobs(jobs: NormalizedJob[]) {
  const seen = new Set<string>()
  const deduped: NormalizedJob[] = []
  for (const job of jobs) {
    const key = dedupeKey(job)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(job)
  }
  return deduped
}

function dedupeFinalRows<T extends { job: NormalizedJob }>(rows: T[]) {
  const seen = new Set<string>()
  const deduped: T[] = []
  for (const row of rows) {
    const sourceKey = `${row.job.source}:${row.job.externalId}`
    const cardKey = [
      normalizeText(row.job.company),
      normalizeText(row.job.title),
      normalizeText(row.job.location.split(',')[0] ?? row.job.location),
    ].join('|')
    if (seen.has(sourceKey) || seen.has(cardKey)) continue
    seen.add(sourceKey)
    seen.add(cardKey)
    deduped.push(row)
  }
  return deduped
}

function finalRowKeys(job: NormalizedJob) {
  return {
    sourceKey: `${job.source}:${job.externalId}`,
    cardKey: [
      normalizeText(job.company),
      normalizeText(job.title),
      normalizeText(job.location.split(',')[0] ?? job.location),
    ].join('|'),
  }
}

function externalJobId(job: NormalizedJob) {
  return `${job.source}:${job.externalId}`
}

function labelPriority(label: RerankedJob['matchLabel']) {
  if (label === 'strong') return 3
  if (label === 'good') return 2
  if (label === 'possible') return 1
  return 0
}

function finalRoleFamilyTieScore(row: SelectedJobRow, profile: CandidateSearchProfile) {
  if (titleContainsAny(row.job.title, profile.target_titles)) return 3
  if (titleContainsAny(row.job.title, profile.acceptable_titles)) return 2
  const family = normalizeText(profile.role_family)
  const body = normalizeText(`${row.job.title} ${row.job.description}`)
  return family.length > 1 && body.includes(family) ? 1 : 0
}

function finalDomainTieScore(row: SelectedJobRow, profile: CandidateSearchProfile) {
  const text = normalizeText(`${row.job.title} ${row.job.company} ${row.job.description}`)
  let score = 0
  for (const keyword of [
    ...profile.industry_domain,
    ...profile.product_ecosystem,
    ...profile.must_have_keywords,
  ]) {
    const normalized = normalizeText(keyword)
    if (normalized.length > 2 && text.includes(normalized)) score += 1
  }
  if (companyMatchesAny(row.job.company, profile.competitor_companies)) score += 4
  else if (companyMatchesAny(row.job.company, [...profile.similar_companies, ...profile.adjacent_companies])) score += 3
  else if (companyMatchesAny(row.job.company, profile.customer_partner_ecosystem)) score += 2
  return score
}

function postedAtTime(row: SelectedJobRow) {
  if (!row.job.postedAt) return 0
  const time = new Date(row.job.postedAt).getTime()
  return Number.isFinite(time) ? time : 0
}

function sortFinalSelectedRows(rows: SelectedJobRow[], profile: CandidateSearchProfile) {
  return [...rows].sort((a, b) =>
    b.final.finalScore - a.final.finalScore ||
    finalRoleFamilyTieScore(b, profile) - finalRoleFamilyTieScore(a, profile) ||
    finalDomainTieScore(b, profile) - finalDomainTieScore(a, profile) ||
    postedAtTime(b) - postedAtTime(a) ||
    labelPriority(b.final.matchLabel) - labelPriority(a.final.matchLabel) ||
    b.local - a.local ||
    a.final.rank - b.final.rank
  )
}

function countLabels(results: RerankedJob[]) {
  return {
    strong: results.filter((result) => result.matchLabel === 'strong').length,
    good: results.filter((result) => result.matchLabel === 'good').length,
    possible: results.filter((result) => result.matchLabel === 'possible').length,
    weakReject: results.filter((result) => result.matchLabel === 'weak_reject').length,
  }
}

function possibleReasonsSummary(rows: Array<{ job: NormalizedJob; final: RerankedJob }>) {
  const text = rows
    .filter((row) => row.final.matchLabel === 'possible')
    .flatMap((row) => [...row.final.concerns, ...row.final.matchReasons])
    .join(' ')
    .toLowerCase()

  const summary: Record<string, number> = {}
  const patterns: Array<[string, RegExp]> = [
    ['missing_specific_tools', /\b(tool|software|erp|crm|wms|tms|sap|system)\b/g],
    ['domain_mismatch', /\b(domain|industry|sector|ecommerce|logistics|supply chain)\b/g],
    ['seniority_mismatch', /\b(senior|manager|lead|junior|experience|years)\b/g],
    ['location_less_preferred', /\b(location|city|mumbai|remote|onsite|relocat)\b/g],
    ['adjacent_title', /\b(adjacent|generic|title|not exact|partly|partial)\b/g],
  ]

  for (const [key, pattern] of patterns) {
    const matches = text.match(pattern)
    if (matches?.length) summary[key] = matches.length
  }

  return summary
}

function hasRequiredFields(job: NormalizedJob) {
  return Boolean(job.externalId && job.source && job.title && job.company && job.location && job.description && job.url)
}

function hasApplyUrl(job: NormalizedJob) {
  return Boolean(job.applyUrl || job.url)
}

function matchesLocation(job: NormalizedJob, profile: CandidateSearchProfile, scope: SearchScope) {
  const loc = normalizeText(job.location)
  const pref = normalizeText(scope.countryName || profile.location_preference || '')
  const country = (scope.countryCode || '').toLowerCase()

  if (scope.searchMode === 'international_remote') {
    return /\b(remote|worldwide|anywhere|global|emea|europe|international)\b/.test(loc)
  }

  if (country === 'in') {
    return /\b(india|delhi|mumbai|bangalore|bengaluru|chennai|hyderabad|pune|kolkata|noida|gurgaon|gurugram)\b/.test(loc)
  }

  if (pref) return loc.includes(pref) || pref.includes(loc)
  return true
}

function titleContainsAny(title: string, terms: string[]) {
  const normalized = normalizeText(title)
  return terms.some((term) => {
    const t = normalizeText(term)
    return t.length > 1 && normalized.includes(t)
  })
}

function matchesRole(job: NormalizedJob, profile: CandidateSearchProfile) {
  const title = normalizeText(job.title)
  const body = normalizeText(`${job.title} ${job.description}`)
  const positiveTitles = [...profile.target_titles, ...profile.acceptable_titles]
  const hasTitleMatch = positiveTitles.some((term) => {
    const t = normalizeText(term)
    return t.length > 1 && (title.includes(t) || t.includes(title))
  })
  const hasSkillMatch = [...profile.must_have_skills, ...profile.nice_to_have_skills]
    .some((skill) => body.includes(normalizeText(skill)))
  const family = normalizeText(profile.role_family)
  const hasFamily = family.length > 1 && body.includes(family)
  const hasDomainMatch = [
    ...profile.industry_domain,
    ...profile.product_ecosystem,
    ...profile.customer_partner_ecosystem,
    ...profile.must_have_keywords,
  ].some((keyword) => {
    const normalized = normalizeText(keyword)
    return normalized.length > 2 && body.includes(normalized)
  })
  const hasEcosystemCompany = companyMatchesAny(job.company, [
    ...profile.competitor_companies,
    ...profile.similar_companies,
    ...profile.adjacent_companies,
    ...profile.customer_partner_ecosystem,
  ])
  return hasTitleMatch || hasSkillMatch || hasFamily || (hasDomainMatch && (hasEcosystemCompany || isTechnicalPresalesProfile(profile)))
}

function isFreshEnough(job: NormalizedJob) {
  if (!job.postedAt) return true
  const ageDays = (Date.now() - new Date(job.postedAt).getTime()) / 86_400_000
  return !Number.isFinite(ageDays) || ageDays <= 45
}

function passesHardFilters(job: NormalizedJob, profile: CandidateSearchProfile, scope: SearchScope) {
  if (!hasRequiredFields(job)) return false
  if (!matchesLocation(job, profile, scope)) return false
  if (titleContainsAny(job.title, [...profile.avoid_titles, ...profile.negative_keywords])) return false
  if (job.description.length < 120) return false
  if (!isFreshEnough(job)) return false
  return matchesRole(job, profile)
}

function localScore(job: NormalizedJob, profile: CandidateSearchProfile, scope: SearchScope) {
  const text = normalizeText(`${job.title} ${job.company} ${job.location} ${job.description}`)
  let score = 0

  if (titleContainsAny(job.title, profile.target_titles)) score += 28
  else if (titleContainsAny(job.title, profile.acceptable_titles)) score += 18

  if (isOperationsProfile(profile)) {
    if (titleContainsAny(job.title, OPERATIONS_EXPANSION_TITLES)) score += 22
    else if (titleContainsAny(job.title, OPERATIONS_TITLE_KEYWORDS)) score += 15

    const textTitle = normalizeText(job.title)
    if (/\b(manager|director|head|vp|chief)\b/.test(textTitle)) score -= 8
    if (titleContainsAny(job.title, OPERATIONS_NEGATIVE_TITLE_KEYWORDS)) score -= 35
  }

  for (const skill of profile.must_have_skills) {
    if (text.includes(normalizeText(skill))) score += 5
  }
  for (const skill of profile.nice_to_have_skills) {
    if (text.includes(normalizeText(skill))) score += 2
  }

  const ecosystemCompanies = [
    ...profile.competitor_companies,
    ...profile.similar_companies,
    ...profile.adjacent_companies,
    ...profile.customer_partner_ecosystem,
  ]
  if (companyMatchesAny(job.company, profile.competitor_companies)) score += 16
  else if (companyMatchesAny(job.company, [...profile.similar_companies, ...profile.adjacent_companies])) score += 12
  else if (companyMatchesAny(job.company, profile.customer_partner_ecosystem)) score += 8

  let domainMatches = 0
  for (const keyword of [
    ...profile.industry_domain,
    ...profile.product_ecosystem,
    ...profile.must_have_keywords,
  ]) {
    const normalized = normalizeText(keyword)
    if (normalized.length > 2 && text.includes(normalized)) domainMatches += 1
  }
  score += Math.min(domainMatches * 4, 20)

  const titleMatched = titleContainsAny(job.title, [...profile.target_titles, ...profile.acceptable_titles])
  const domainRichProfile = [
    ...profile.industry_domain,
    ...profile.product_ecosystem,
    ...profile.competitor_companies,
    ...profile.similar_companies,
    ...profile.adjacent_companies,
  ].length >= 4
  if (titleMatched && domainRichProfile && domainMatches === 0 && !companyMatchesAny(job.company, ecosystemCompanies)) {
    score -= 14
  }

  if (matchesLocation(job, profile, scope)) score += 15
  if (job.description.length > 600) score += 10
  if (job.postedAt) {
    const ageDays = (Date.now() - new Date(job.postedAt).getTime()) / 86_400_000
    score += ageDays < 7 ? 10 : ageDays < 21 ? 5 : 0
  }
  if (titleContainsAny(job.title, [...profile.avoid_titles, ...profile.negative_keywords])) score -= 40

  return Math.max(0, Math.min(100, score))
}

function nearTitleKey(title: string) {
  return normalizeText(title)
    .replace(/\b(senior|sr|lead|principal|staff|manager|associate|executive|specialist|ii|iii|iv|remote|india)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function diversifyScoredJobs(jobs: ScoredJob[], target: number) {
  const companyCounts = new Map<string, number>()
  const companyTitleCounts = new Map<string, number>()
  const primary: ScoredJob[] = []
  const overflow: ScoredJob[] = []
  const maxPerCompany = Math.max(2, Math.ceil(target / 6))
  const maxNearTitlePerCompany = 2

  for (const job of jobs) {
    const company = companyKey(job.company) || normalizeText(job.company)
    const titleKey = `${company}|${nearTitleKey(job.title)}`
    const companyCount = companyCounts.get(company) ?? 0
    const titleCount = companyTitleCounts.get(titleKey) ?? 0
    if (companyCount < maxPerCompany && titleCount < maxNearTitlePerCompany) {
      primary.push(job)
      companyCounts.set(company, companyCount + 1)
      companyTitleCounts.set(titleKey, titleCount + 1)
    } else {
      overflow.push(job)
    }
  }

  return [...primary, ...overflow]
}

function diversifySelectedRows(rows: SelectedJobRow[], target: number) {
  const companyCounts = new Map<string, number>()
  const primary: SelectedJobRow[] = []
  const overflow: SelectedJobRow[] = []
  const maxPerCompany = Math.max(3, Math.ceil(target / 5))

  for (const row of rows) {
    const company = companyKey(row.job.company) || normalizeText(row.job.company)
    const count = companyCounts.get(company) ?? 0
    if (count < maxPerCompany) {
      primary.push(row)
      companyCounts.set(company, count + 1)
    } else {
      overflow.push(row)
    }
  }

  return [...primary, ...overflow].slice(0, target)
}

async function rerankWithOpenAI(
  jobs: Array<NormalizedJob & { localScore: number }>,
  profile: CandidateSearchProfile,
  usage?: OpenAIUsageContext,
  runId?: string,
) {
  if (jobs.length === 0) return []
  const operationsMode = isOperationsProfile(profile)
  const payload = jobs.slice(0, MAX_AI_RERANK_JOBS).map((job, index) => ({
    externalJobId: externalJobId(job),
    jobIndex: index,
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description.slice(0, 1800),
    localScore: job.localScore,
  }))

  const operationsInstructions = operationsMode
    ? [
        'This candidate is an operations/business/logistics/coordinator profile. Calibrate labels for this role family.',
        'For operations profiles, label strong when the title directly matches operations, logistics, supply chain, coordinator, MIS, order fulfillment, vendor coordination, inventory, ecommerce operations, or client operations; the candidate has direct or transferable operations experience; location and seniority are realistic; the role is not sales/customer support/warehouse labor/data-entry-only; and at least 3 meaningful responsibilities overlap.',
        'Label good when the title is clearly within the operations/business/logistics/coordinator family, the candidate has partial responsibility evidence, missing tools or domain specifics can be fixed in the resume, and seniority/location are realistic.',
        'Use possible only when the role is adjacent but not exact, key evidence is missing, responsibilities are partly relevant but not clearly aligned, city is less preferred but still valid, or the title is generic and needs careful review.',
        'Use weak_reject for field sales, telecalling, recruiting, insurance or real-estate sales, pure customer support, warehouse labor, delivery driver, data-entry-only, internship/fresher roles for experienced candidates, wrong country/location, or roles with no meaningful operations responsibilities.',
        'For operations profiles use score bands: strong 78-100, good 62-77, possible 45-61, weak_reject below 45. Do not score a truly relevant operations role below 60 only because one tool name is missing.',
        'Match reasons must cite concrete overlap such as logistics coordination, vendor coordination, order management, MIS/reporting, inventory coordination, ecommerce operations, client operations, scheduling, documentation, or cross-functional coordination.',
        'Concerns should explain possible-match weaknesses: missing logistics software, domain mismatch, seniority mismatch, location less preferred, or adjacent/generic title.',
        'Resume fix suggestions must be specific: add logistics coordination achievements, MIS/reporting examples, vendor/client coordination examples, order fulfillment metrics, inventory/procurement exposure, and relevant Excel/ERP/CRM/WMS/TMS tools only when useful.',
      ].join(' ')
    : 'Use score bands: strong 75-100, good 60-74, possible 40-59, weak_reject below 40.'

  const response = await openAIResponsesParse<{ output_parsed?: { results: RerankedJob[] } }>({
    model: RERANK_MODEL,
    instructions: [
      'Judge and rerank every job for this candidate. Return exactly one row for every input job.',
      'Do not return only perfect matches. Rank the best available jobs from the provided role-safe pool.',
      'Use matchLabel strong for highly relevant jobs worth applying to, good for relevant jobs worth considering, possible for somewhat relevant jobs that can be shown if stronger matches are scarce, and weak_reject for jobs that should not be shown.',
      'Use the candidate ecosystem intelligence: current/recent company, competitor companies, similar companies, adjacent companies, industry/domain keywords, product ecosystem, and customer/partner ecosystem. Jobs at companies in the same ecosystem or roles using the same domain context should score above generic title-only matches.',
      'Penalize jobs that only match generic title words but miss the candidate domain, customer type, product ecosystem, or seniority.',
      'Avoid over-ranking many near-identical roles from the same employer when equally relevant roles exist at other ecosystem companies.',
      operationsInstructions,
      'Set showRecommended true only for strong, good, or possible jobs. Never recommend unrelated role families.',
      'Return each externalJobId exactly once.',
    ].join(' '),
    input: JSON.stringify({ candidate_profile: profile, jobs: payload }),
    text: { format: zodTextFormat(RerankSchema, 'openai_job_rerank') },
  }, {
    feature: 'openai_search_rerank',
    userId: usage?.userId,
    userEmail: usage?.userEmail,
    isFreeUser: usage?.isFreeUser,
    creditsCharged: usage?.creditsCharged,
    creditFeatureKey: usage?.creditFeatureKey,
    fallbackUsed: usage?.fallbackUsed,
    fallbackReason: usage?.fallbackReason,
    searchRunId: runId,
    resumeId: usage?.resumeId ?? null,
    metadata: { jobs_count: payload.length },
  })

  return response.output_parsed?.results ?? []
}

async function rescueRerankWithOpenAI(
  jobs: ScoredJob[],
  profile: CandidateSearchProfile,
  usage?: OpenAIUsageContext,
  runId?: string,
) {
  if (jobs.length === 0) return []
  const operationsMode = isOperationsProfile(profile)
  const payload = jobs.slice(0, MAX_AI_RERANK_JOBS).map((job, index) => ({
    externalJobId: externalJobId(job),
    jobIndex: index,
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description.slice(0, 1800),
    localScore: job.localScore,
  }))

  const operationsInstructions = operationsMode
    ? [
        'For operations/business/logistics/coordinator profiles, favor usable fallback matches with direct or adjacent operations evidence.',
        'Good means the title is within operations, logistics, supply chain, coordinator, MIS, fulfillment, inventory, procurement, vendor, order management, ecommerce operations, or client operations and seniority/location are realistic.',
        'Possible means adjacent but still plausibly useful: partial operations responsibilities, less preferred city but valid country, missing tool/domain details, or generic title needing careful review.',
        'Weak reject field sales, telecalling, recruiting, insurance or real-estate sales, delivery driver, warehouse labor, data-entry-only, pure customer support, fresher/internship for experienced candidates, wrong location, or no meaningful operations responsibilities.',
        'Concrete reasons must mention operations overlap such as logistics coordination, order management, MIS/reporting, inventory, vendor/client coordination, ecommerce operations, scheduling, documentation, or cross-functional coordination.',
      ].join(' ')
    : 'Good means clearly useful fallback match. Possible means adjacent but plausibly useful. Weak reject unrelated or low-quality roles.'

  const response = await openAIResponsesParse<{ output_parsed?: { results: RerankedJob[] } }>({
    model: RERANK_MODEL,
    instructions: [
      'These candidates already passed deterministic hard filters and local relevance scoring.',
      'Judge whether they are usable fallback matches for the candidate. Do not require a perfect match.',
      'Return a judgment for every candidate. Use only good, possible, or weak_reject; do not use strong in this rescue pass.',
      'Use showRecommended true only for good or possible. Never recommend unrelated filler.',
      'Prefer same ecosystem/category matches over generic title-only matches. Company/domain relevance matters when the role family is still right.',
      operationsInstructions,
      'Return each externalJobId exactly once.',
    ].join(' '),
    input: JSON.stringify({ candidate_profile: profile, jobs: payload }),
    text: { format: zodTextFormat(RerankSchema, 'openai_job_rescue_rerank') },
  }, {
    feature: 'openai_search_rescue_rerank',
    userId: usage?.userId,
    userEmail: usage?.userEmail,
    isFreeUser: usage?.isFreeUser,
    creditsCharged: usage?.creditsCharged,
    creditFeatureKey: usage?.creditFeatureKey,
    fallbackUsed: usage?.fallbackUsed,
    fallbackReason: usage?.fallbackReason,
    searchRunId: runId,
    resumeId: usage?.resumeId ?? null,
    metadata: { jobs_count: payload.length },
  })

  return response.output_parsed?.results ?? []
}

async function logDiagnostic(
  admin: SupabaseClient,
  userId: string,
  runId: string | null,
  stage: string,
  countValue: number | null,
  details: Record<string, unknown> = {}
) {
  await admin.from('openai_search_diagnostics').insert({
    user_id: userId,
    search_run_id: runId,
    stage,
    count_value: countValue,
    details,
  })
}

function resultSnapshot(job: NormalizedJob, final: RerankedJob, local: number) {
  return {
    id: `${job.source}:${job.externalId}`,
    final_score: final.finalScore,
    local_score: local,
    match_label: final.matchLabel,
    matched_skills: final.matchedSkills,
    missing_skills: final.missingSkills,
    match_reasons: final.matchReasons,
    concerns: final.concerns,
    resume_fix_suggestions: final.resumeFixSuggestions,
    job: {
      external_id: job.externalId,
      source: job.source,
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description,
      url: job.url,
      apply_url: job.applyUrl ?? job.url,
      posted_at: job.postedAt ?? null,
      salary: job.salary ?? null,
    },
  }
}

async function loadV2TestResume(
  admin: SupabaseClient,
  userId: string,
  testResumeId: string
): Promise<{ resume: ResumeRow; payload: V2TestResumePayload }> {
  const safeId = testResumeId.replace(/[^a-f0-9]/gi, '').toLowerCase()
  if (!safeId) throw new Error('Invalid V2 test resume id')

  const { data, error } = await admin.storage
    .from('openai-v2-test-resumes')
    .download(`${userId}/${safeId}.json`)

  if (error || !data) {
    throw new Error(error?.message ?? 'V2 test resume is not available')
  }

  const payload = JSON.parse(await data.text()) as V2TestResumePayload
  if (payload.user_id !== userId || payload.id !== safeId) {
    throw new Error('V2 test resume does not belong to this user')
  }
  if (!payload.raw_text || payload.raw_text.length < 50) {
    throw new Error('V2 test resume has no readable text')
  }

  return {
    payload,
    resume: {
      id: payload.id,
      raw_text: payload.raw_text,
      parsed_data: payload.parsed_data ?? null,
    },
  }
}

export async function runOpenAIJobSearch(
  admin: SupabaseClient,
  user: { id: string; email?: string | null },
  scope: SearchScope = {}
): Promise<OpenAISearchRunResult> {
  const { data: profileRow } = await admin
    .from('profiles')
    .select('role, subscription_status, pro_until')
    .eq('user_id', user.id)
    .maybeSingle()

  let resume: ResumeRow | null = null
  let v2TestResume: V2TestResumePayload | null = null

  if (scope.testResumeId) {
    const loaded = await loadV2TestResume(admin, user.id, scope.testResumeId)
    resume = loaded.resume
    v2TestResume = loaded.payload
  } else {
    const { data: activeResume } = await admin
      .from('resumes')
      .select('id, raw_text, parsed_data')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    resume = activeResume as ResumeRow | null
  }

  if (!resume) throw new Error('No active resume available')

  const effectiveProUntil = await resolveProUntil(
    admin,
    user.id,
    (profileRow as ProfileRow | null)?.subscription_status,
    (profileRow as ProfileRow | null)?.pro_until
  )
  const isPro = isProUser(
    user.email,
    (profileRow as ProfileRow | null)?.role,
    (profileRow as ProfileRow | null)?.subscription_status,
    effectiveProUntil
  )
  const target = targetCount(isPro)
  const resumeHash = v2TestResume?.resume_hash ?? hashResume(resume)

  const { data: runRow, error: runError } = await admin
    .from('openai_search_runs')
    .insert({
      user_id: user.id,
      resume_id: v2TestResume ? null : resume.id,
      resume_hash: resumeHash,
      status: 'running',
      user_plan: isPro ? 'pro' : 'free',
      target_count: target,
      search_mode: scope.searchMode ?? null,
      country_code: scope.countryCode ?? null,
      country_name: scope.countryName ?? null,
    })
    .select('id')
    .single()

  if (runError || !runRow?.id) {
    throw new Error(runError?.message ?? 'Failed to create OpenAI search run')
  }

  const runId = runRow.id as string
  const router = new JobSourceRouter()
  const sourceFetchCounts: Record<string, number> = {}
  const sourceIssues: Array<{ source: string; status: 'source_rate_limited' | 'source_unavailable'; error: string }> = []

  try {
    const usageContext: OpenAIUsageContext = {
      userId: scope.usage?.userId ?? user.id,
      userEmail: scope.usage?.userEmail ?? user.email ?? null,
      isFreeUser: scope.usage?.isFreeUser ?? !isPro,
      creditsCharged: scope.usage?.creditsCharged,
      creditFeatureKey: scope.usage?.creditFeatureKey,
      fallbackUsed: scope.usage?.fallbackUsed,
      fallbackReason: scope.usage?.fallbackReason,
      resumeId: (resume as ResumeRow).id,
    }
    const extractedProfile = await extractCandidateProfile(resume as ResumeRow, usageContext, runId)
    const scopeForProfile = effectiveSearchScope(scope, extractedProfile, Boolean(v2TestResume))
    const intelligenceProfile = enrichProfileWithResumeIntelligence(extractedProfile, resume as ResumeRow, scopeForProfile)
    const uploadExpandedProfile = v2TestResume
      ? profileWithUploadedResumeTitleExpansion(intelligenceProfile)
      : intelligenceProfile
    const scopedSearch = effectiveSearchScope(scope, uploadExpandedProfile, Boolean(v2TestResume))
    const operationsExpansion = buildOperationsExpansion(uploadExpandedProfile, scopedSearch)
    const profile = profileWithOperationsExpansion(uploadExpandedProfile, operationsExpansion)
    await logDiagnostic(admin, user.id, runId, 'profile_extracted', null, {
      profile,
      original_profile: extractedProfile,
      enriched_profile: intelligenceProfile,
      uploaded_resume_profile_expanded: Boolean(v2TestResume),
      inferred_search_scope: scopedSearch,
      v2_test_resume_used: Boolean(v2TestResume),
      v2_test_resume_id: v2TestResume?.id ?? null,
      v2_test_resume_file_name: v2TestResume?.file_name ?? null,
      v2_test_resume_character_count: v2TestResume?.raw_text.length ?? null,
      include_current_company: scope.includeCurrentCompany === true,
      detected_role_family: operationsExpansion.detectedRoleFamily,
      expansion_titles_used: operationsExpansion.expansionTitles,
      expansion_queries_used: operationsExpansion.expansionQueries,
      current_recent_company: profile.current_recent_company,
      competitor_companies: profile.competitor_companies,
      similar_companies: profile.similar_companies,
      adjacent_companies: profile.adjacent_companies,
      industry_domain: profile.industry_domain,
      product_ecosystem: profile.product_ecosystem,
      customer_partner_ecosystem: profile.customer_partner_ecosystem,
    })

    if (v2TestResume && (scopedSearch.searchMode || scopedSearch.countryCode || scopedSearch.countryName)) {
      await admin
        .from('openai_search_runs')
        .update({
          search_mode: scopedSearch.searchMode ?? null,
          country_code: scopedSearch.countryCode ?? null,
          country_name: scopedSearch.countryName ?? null,
        })
        .eq('id', runId)
    }

    const includeCurrentCompany = scope.includeCurrentCompany === true
    const queryLimit = operationsExpansion.enabled ? 28 : isSemiconductorHardwareProfile(profile, resume as ResumeRow) ? 36 : 18
    const queries = uniqueStrings(profile.search_queries.filter(Boolean))
      .filter((query) => includeCurrentCompany || !queryMentionsCurrentCompany(query, profile))
      .slice(0, queryLimit)
    const broadQueries = uniqueStrings([
      ...queries,
      ...profile.target_titles,
      ...profile.acceptable_titles.slice(0, operationsExpansion.enabled ? 20 : 10),
      ...operationsExpansion.expansionQueries,
      ...profile.competitor_companies.slice(0, 10).flatMap((company) =>
        profile.target_titles.slice(0, 3).map((title) => `${title} ${company} ${countryNameForQueries(scopedSearch, profile)}`.trim())
      ),
      ...profile.similar_companies.slice(0, 8).flatMap((company) =>
        profile.target_titles.slice(0, 2).map((title) => `${title} ${company} ${countryNameForQueries(scopedSearch, profile)}`.trim())
      ),
      ...profile.adjacent_companies.slice(0, 6).flatMap((company) =>
        profile.target_titles.slice(0, 2).map((title) => `${title} ${company} ${countryNameForQueries(scopedSearch, profile)}`.trim())
      ),
      ...profile.industry_domain.slice(0, 8).map((domain) =>
        `${profile.role_family} ${domain} ${countryNameForQueries(scopedSearch, profile)}`.trim()
      ),
      ...profile.product_ecosystem.slice(0, 6).map((product) =>
        `${profile.role_family} ${product} ${countryNameForQueries(scopedSearch, profile)}`.trim()
      ),
      `${profile.role_family} ${profile.must_have_skills.slice(0, 2).join(' ')}`.trim(),
    ])
      .filter(Boolean)
      .filter((query) => includeCurrentCompany || !queryMentionsCurrentCompany(query, profile))
      .slice(0, operationsExpansion.enabled ? 56 : 72)

    const rawJobs: NormalizedJob[] = []
    const addJobs = (jobs: NormalizedJob[]) => {
      for (const job of jobs) {
        sourceFetchCounts[job.source] = (sourceFetchCounts[job.source] ?? 0) + 1
        rawJobs.push(job)
      }
    }
    const recordSourceErrors = (errors: Array<{ source: string; error: string }>) => {
      for (const error of errors) {
        sourceIssues.push({
          source: error.source,
          status: /429|rate limit/i.test(error.error) ? 'source_rate_limited' : 'source_unavailable',
          error: error.error,
        })
      }
    }

    const location = scopedSearch.countryName || profile.location_preference || ''
    const countryCode = scopedSearch.countryCode ?? undefined
    const countRoleSafeJobs = () => dedupeJobs(rawJobs).filter((job) =>
      (includeCurrentCompany || !isCurrentCompanyJob(job, profile)) &&
      passesHardFilters(job, profile, scopedSearch)
    ).length

    for (const query of broadQueries) {
      const [adzuna, jsearch] = await Promise.all([
        router.searchSource({ title: query, location, countryCode, limit: 50 }, 'adzuna'),
        router.searchSource({ title: query, location, countryCode, limit: 50 }, 'jsearch'),
      ])
      recordSourceErrors(adzuna.errors)
      recordSourceErrors(jsearch.errors)
      addJobs(adzuna.jobs)
      addJobs(jsearch.jobs)
      if (countRoleSafeJobs() >= target * 3) break
    }

    await logDiagnostic(admin, user.id, runId, 'fetched', rawJobs.length, { source_fetch_counts: sourceFetchCounts })

    if (countRoleSafeJobs() < target * 2) {
      for (const query of broadQueries.slice(0, operationsExpansion.enabled ? 14 : 6)) {
        const expanded = await router.searchAllForScoring({ title: query, location: '', countryCode, limit: 50 })
        recordSourceErrors(expanded.errors)
        addJobs(expanded.jobs)
      }
      await logDiagnostic(admin, user.id, runId, 'expanded_fetch', rawJobs.length, { source_fetch_counts: sourceFetchCounts })
    }

    const normalized = rawJobs.filter(hasRequiredFields)
    await logDiagnostic(admin, user.id, runId, 'normalized', normalized.length)

    const deduped = dedupeJobs(normalized)
    await logDiagnostic(admin, user.id, runId, 'deduped', deduped.length)

    const afterLocation = deduped.filter((job) => matchesLocation(job, profile, scopedSearch))
    await logDiagnostic(admin, user.id, runId, 'location_filtered', afterLocation.length)

    const currentCompanyExcludedCount = includeCurrentCompany
      ? 0
      : afterLocation.filter((job) => isCurrentCompanyJob(job, profile)).length
    const afterCurrentCompanyExclusion = includeCurrentCompany
      ? afterLocation
      : afterLocation.filter((job) => !isCurrentCompanyJob(job, profile))
    await logDiagnostic(admin, user.id, runId, 'current_company_excluded', currentCompanyExcludedCount, {
      current_recent_company: profile.current_recent_company,
      include_current_company: includeCurrentCompany,
    })

    const rejectedNegativeKeywordCount = afterCurrentCompanyExclusion.filter((job) =>
      hasRequiredFields(job) &&
      titleContainsAny(job.title, [...profile.avoid_titles, ...profile.negative_keywords])
    ).length

    const rejectedWrongRoleCount = afterCurrentCompanyExclusion.filter((job) =>
      hasRequiredFields(job) &&
      !titleContainsAny(job.title, [...profile.avoid_titles, ...profile.negative_keywords]) &&
      job.description.length >= 120 &&
      isFreshEnough(job) &&
      !matchesRole(job, profile)
    ).length

    const afterRole = afterCurrentCompanyExclusion.filter((job) => passesHardFilters(job, profile, scopedSearch))
    await logDiagnostic(admin, user.id, runId, 'role_filtered', afterRole.length, {
      detected_role_family: operationsExpansion.detectedRoleFamily,
      expansion_titles_used: operationsExpansion.expansionTitles,
      expansion_queries_used: operationsExpansion.expansionQueries,
      current_recent_company: profile.current_recent_company,
      include_current_company: includeCurrentCompany,
      current_company_excluded_count: currentCompanyExcludedCount,
      rejected_wrong_role_count: rejectedWrongRoleCount,
      rejected_negative_keyword_count: rejectedNegativeKeywordCount,
    })

    const locallyScored = afterRole
      .map((job) => ({ ...job, localScore: localScore(job, profile, scopedSearch) }))
      .filter((job) => job.localScore >= 35)
      .sort((a, b) => b.localScore - a.localScore)

    await logDiagnostic(admin, user.id, runId, 'scored', locallyScored.length)

    const diversifiedScored = diversifyScoredJobs(locallyScored, target)
    await logDiagnostic(admin, user.id, runId, 'diversified_score_pool', diversifiedScored.length, {
      company_diversity_count: new Set(diversifiedScored.slice(0, MAX_AI_RERANK_JOBS).map((job) => companyKey(job.company))).size,
    })

    const openaiInput = diversifiedScored.slice(0, MAX_AI_RERANK_JOBS)
    await logDiagnostic(admin, user.id, runId, 'openai_input_count', openaiInput.length)

    const reranked = await rerankWithOpenAI(openaiInput, profile, usageContext, runId)
    const labelCounts = countLabels(reranked)
    await logDiagnostic(admin, user.id, runId, 'openai_returned_count', reranked.length, {
      strong_count: labelCounts.strong,
      good_count: labelCounts.good,
      possible_count: labelCounts.possible,
      weak_reject_count: labelCounts.weakReject,
    })
    await logDiagnostic(admin, user.id, runId, 'openai_reranked', reranked.length)
    for (const issue of sourceIssues) {
      await logDiagnostic(admin, user.id, runId, issue.status, null, issue)
    }

    const byExternalId = new Map(reranked.map((result) => [result.externalJobId, result]))
    const finalRows = openaiInput
      .map((job) => ({ job, local: job.localScore, final: byExternalId.get(externalJobId(job)) }))
      .filter((row): row is { job: ScoredJob; local: number; final: RerankedJob } => Boolean(row.final))
      .filter((row) => row.final.showRecommended && row.final.matchLabel !== 'weak_reject' && row.final.finalScore >= 40)
      .sort((a, b) =>
        labelPriority(b.final.matchLabel) - labelPriority(a.final.matchLabel) ||
        b.final.finalScore - a.final.finalScore ||
        a.final.rank - b.final.rank
      )

    const selectedRows: SelectedJobRow[] = dedupeFinalRows(finalRows)
      .slice(0, target)
      .map((row) => ({ ...row, sourceGroup: 'first_pass' }))
    const firstPassSelectedCount = selectedRows.length

    const selectedKeys = new Set<string>()
    for (const row of selectedRows) {
      const keys = finalRowKeys(row.job)
      selectedKeys.add(keys.sourceKey)
      selectedKeys.add(keys.cardKey)
    }

    let rescuePassTriggered = false
    let rescueCandidateCount = 0
    let rescueOpenAIInputCount = 0
    let rescueOpenAIReturnedCount = 0
    let rescueGoodCount = 0
    let rescuePossibleCount = 0
    let rescueWeakRejectCount = 0
    let rescueSelectedCount = 0

    if (selectedRows.length < target) {
      rescuePassTriggered = true
      const rescueCandidates = locallyScored
        .filter((job) => {
          const keys = finalRowKeys(job)
          return !selectedKeys.has(keys.sourceKey) &&
            !selectedKeys.has(keys.cardKey) &&
            hasRequiredFields(job) &&
            hasApplyUrl(job) &&
            passesHardFilters(job, profile, scopedSearch) &&
            job.localScore >= (operationsExpansion.enabled ? 40 : 35) &&
            !titleContainsAny(job.title, [...profile.avoid_titles, ...profile.negative_keywords])
        })
        .sort((a, b) => {
          const aOps = operationsExpansion.enabled && titleContainsAny(a.title, OPERATIONS_TITLE_KEYWORDS) ? 1 : 0
          const bOps = operationsExpansion.enabled && titleContainsAny(b.title, OPERATIONS_TITLE_KEYWORDS) ? 1 : 0
          return bOps - aOps || b.localScore - a.localScore
        })

      rescueCandidateCount = rescueCandidates.length
      const rescueInput = rescueCandidates.slice(0, MAX_AI_RERANK_JOBS)
      rescueOpenAIInputCount = rescueInput.length

      const rescueReranked = await rescueRerankWithOpenAI(rescueInput, profile, usageContext, runId)
      rescueOpenAIReturnedCount = rescueReranked.length
      const rescueLabelCounts = countLabels(rescueReranked)
      rescueGoodCount = rescueLabelCounts.good
      rescuePossibleCount = rescueLabelCounts.possible
      rescueWeakRejectCount = rescueLabelCounts.weakReject

      const rescueByExternalId = new Map(rescueReranked.map((result) => [result.externalJobId, result]))
      const rescueRows = rescueInput
        .map((job) => ({ job, local: job.localScore, final: rescueByExternalId.get(externalJobId(job)) }))
        .filter((row): row is { job: ScoredJob; local: number; final: RerankedJob } => Boolean(row.final))
        .filter((row) =>
          row.final.showRecommended &&
          (row.final.matchLabel === 'good' || row.final.matchLabel === 'possible') &&
          row.final.finalScore >= 40
        )
        .sort((a, b) =>
          (b.final.matchLabel === 'good' ? 1 : 0) - (a.final.matchLabel === 'good' ? 1 : 0) ||
          b.final.finalScore - a.final.finalScore ||
          b.local - a.local ||
          a.final.rank - b.final.rank
        )

      for (const row of rescueRows) {
        if (selectedRows.length >= target) break
        const keys = finalRowKeys(row.job)
        if (selectedKeys.has(keys.sourceKey) || selectedKeys.has(keys.cardKey)) continue
        selectedRows.push({ ...row, sourceGroup: 'rescue' })
        selectedKeys.add(keys.sourceKey)
        selectedKeys.add(keys.cardKey)
        rescueSelectedCount += 1
      }
    }

    const diversitySelectedRows = diversifySelectedRows(sortFinalSelectedRows(selectedRows, profile), target)
    const finalSelectedRows = sortFinalSelectedRows(diversitySelectedRows, profile)
    const expansionAttemptsUsed = selectedRows.length < target ? 1 : 0
    const labelCalibrationMode = operationsExpansion.enabled ? 'operations' : 'standard'
    const selectedLabelCounts = {
      strong: finalSelectedRows.filter((row) => row.final.matchLabel === 'strong').length,
      good: finalSelectedRows.filter((row) => row.final.matchLabel === 'good').length,
      possible: finalSelectedRows.filter((row) => row.final.matchLabel === 'possible').length,
    }
    const topPossibleReasonsSummary = possibleReasonsSummary(finalSelectedRows)

    const failureReason = finalSelectedRows.length < target
      ? `only_${finalSelectedRows.length}_of_${target}_openai_ranked_jobs_met_quality_after_all_v2_filters`
      : null

    const rows = finalSelectedRows.map(({ job, local, final }, index) => ({
      user_id: user.id,
      search_run_id: runId,
      source: job.source,
      external_id: job.externalId,
      rank_position: index + 1,
      final_score: final.finalScore,
      local_score: local,
      match_label: final.matchLabel,
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description,
      url: job.url,
      apply_url: job.applyUrl ?? job.url,
      posted_at: job.postedAt ?? null,
      salary: job.salary ?? null,
      matched_skills: final.matchedSkills,
      missing_skills: final.missingSkills,
      match_reasons: final.matchReasons,
      concerns: final.concerns,
      resume_fix_suggestions: final.resumeFixSuggestions,
      job_snapshot: resultSnapshot(job, final, local),
    }))

    if (rows.length) {
      const { error: saveError } = await admin.from('openai_search_results').insert(rows)
      if (saveError) throw new Error(saveError.message)
    }

    await logDiagnostic(admin, user.id, runId, 'selected_saved_count', rows.length, {
      target_count: target,
      strong_count: selectedLabelCounts.strong,
      good_count: selectedLabelCounts.good,
      possible_count: selectedLabelCounts.possible,
    })
    await logDiagnostic(admin, user.id, runId, 'label_calibration', rows.length, {
      label_calibration_mode: labelCalibrationMode,
      selected_strong_count: selectedLabelCounts.strong,
      selected_good_count: selectedLabelCounts.good,
      selected_possible_count: selectedLabelCounts.possible,
      rejected_weak_count: labelCounts.weakReject,
      top_possible_reasons_summary: topPossibleReasonsSummary,
    })
    await logDiagnostic(admin, user.id, runId, 'rescue_pass', rows.length, {
      rescue_pass_triggered: rescuePassTriggered,
      first_pass_selected_count: firstPassSelectedCount,
      rescue_candidate_count: rescueCandidateCount,
      rescue_openai_input_count: rescueOpenAIInputCount,
      rescue_openai_returned_count: rescueOpenAIReturnedCount,
      rescue_good_count: rescueGoodCount,
      rescue_possible_count: rescuePossibleCount,
      rescue_weak_reject_count: rescueWeakRejectCount,
      rescue_selected_count: rescueSelectedCount,
      final_saved_count: rows.length,
      final_scarcity_reason: failureReason,
    })
    await logDiagnostic(admin, user.id, runId, 'expansion_attempts_used', expansionAttemptsUsed)
    await logDiagnostic(admin, user.id, runId, 'expansion_metadata', expansionAttemptsUsed, {
      detected_role_family: operationsExpansion.detectedRoleFamily,
      expansion_titles_used: operationsExpansion.expansionTitles,
      expansion_queries_used: operationsExpansion.expansionQueries,
      expansion_attempts_used: expansionAttemptsUsed,
      rejected_wrong_role_count: rejectedWrongRoleCount,
      rejected_negative_keyword_count: rejectedNegativeKeywordCount,
    })
    await logDiagnostic(admin, user.id, runId, 'saved', rows.length, { target_count: target, failure_reason: failureReason })

    await admin
      .from('openai_search_runs')
      .update({
        status: 'success',
        candidate_profile: profile,
        fetched_count: rawJobs.length,
        normalized_count: normalized.length,
        deduped_count: deduped.length,
        location_filtered_count: afterLocation.length,
        role_filtered_count: afterRole.length,
        scored_count: locallyScored.length,
        saved_count: rows.length,
        failure_reason: failureReason,
        source_fetch_counts: {
          ...sourceFetchCounts,
          diagnostics: {
            openai_input_count: openaiInput.length,
            openai_returned_count: reranked.length,
            strong_count: labelCounts.strong,
            good_count: labelCounts.good,
            possible_count: labelCounts.possible,
            weak_reject_count: labelCounts.weakReject,
            rescue_pass_triggered: rescuePassTriggered,
            first_pass_selected_count: firstPassSelectedCount,
            rescue_candidate_count: rescueCandidateCount,
            rescue_openai_input_count: rescueOpenAIInputCount,
            rescue_openai_returned_count: rescueOpenAIReturnedCount,
            rescue_good_count: rescueGoodCount,
            rescue_possible_count: rescuePossibleCount,
            rescue_weak_reject_count: rescueWeakRejectCount,
            rescue_selected_count: rescueSelectedCount,
            final_saved_count: rows.length,
            final_scarcity_reason: failureReason,
            label_calibration_mode: labelCalibrationMode,
            selected_strong_count: selectedLabelCounts.strong,
            selected_good_count: selectedLabelCounts.good,
            selected_possible_count: selectedLabelCounts.possible,
            rejected_weak_count: labelCounts.weakReject,
            top_possible_reasons_summary: topPossibleReasonsSummary,
            expansion_attempts_used: expansionAttemptsUsed,
            detected_role_family: operationsExpansion.detectedRoleFamily,
            expansion_titles_used: operationsExpansion.expansionTitles,
            expansion_queries_used: operationsExpansion.expansionQueries,
            current_recent_company: profile.current_recent_company,
            include_current_company: includeCurrentCompany,
            current_company_excluded_count: currentCompanyExcludedCount,
            competitor_companies: profile.competitor_companies,
            similar_companies: profile.similar_companies,
            adjacent_companies: profile.adjacent_companies,
            industry_domain: profile.industry_domain,
            product_ecosystem: profile.product_ecosystem,
            customer_partner_ecosystem: profile.customer_partner_ecosystem,
            rejected_wrong_role_count: rejectedWrongRoleCount,
            rejected_negative_keyword_count: rejectedNegativeKeywordCount,
            source_issues: sourceIssues,
            inferred_search_scope: scopedSearch,
            uploaded_resume_profile_expanded: Boolean(v2TestResume),
            v2_test_resume_used: Boolean(v2TestResume),
            v2_test_resume_id: v2TestResume?.id ?? null,
            v2_test_resume_file_name: v2TestResume?.file_name ?? null,
            v2_test_resume_character_count: v2TestResume?.raw_text.length ?? null,
          },
        },
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)

    console.log('[openai-search] run complete', {
      runId,
      target,
      fetched: rawJobs.length,
      normalized: normalized.length,
      deduped: deduped.length,
      afterLocation: afterLocation.length,
      afterRole: afterRole.length,
      scored: locallyScored.length,
      saved: rows.length,
      openaiInput: openaiInput.length,
      openaiReturned: reranked.length,
      labelCounts,
      expansionAttemptsUsed,
      failureReason,
    })

    return { runId, savedCount: rows.length, targetCount: target, failureReason }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenAI search failed'
    await logDiagnostic(admin, user.id, runId, 'failed', null, { error: message })
    await admin
      .from('openai_search_runs')
      .update({ status: 'failed', failure_reason: message, completed_at: new Date().toISOString() })
      .eq('id', runId)
    throw error
  }
}
