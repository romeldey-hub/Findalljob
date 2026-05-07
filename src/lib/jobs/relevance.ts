/**
 * Relevance Intelligence Layer — pre-filter before Claude scoring.
 *
 * Pipeline:  fetched jobs → relevance engine → filtered jobs → Claude scoring → final ranked jobs
 *
 * Scoring (max 100 + 5 competitor bonus):
 *   roleFamily  40%  — semantic taxonomy: ALLOW / LOW_CONFIDENCE / SUPPRESS
 *   seniority   20%  — 7-level ladder: intern → junior → mid → senior → lead → director → vp
 *   function    20%  — specialization within family (Growth, Embedded, DevOps, etc.)
 *   industry    10%  — domain alignment (Semiconductor, SaaS, Fintech, etc.)
 *   keyword     10%  — title token overlap with candidate's termSet
 *   competitor  +5   — bonus for competitor-company jobs (applied after base score)
 */

import type { NormalizedJob, ParsedResume } from '@/types'

// ─── Core types ────────────────────────────────────────────────────────────────

type RoleFamily =
  | 'product' | 'engineering' | 'sales' | 'fae'
  | 'marketing' | 'data' | 'design' | 'finance'
  | 'hr' | 'customer_success' | 'operations'

// 7-level seniority ladder
type SeniorityLevel = 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'director' | 'vp'

type RoleMatchLevel = 'allow' | 'low_confidence' | 'suppress' | 'unknown'

export interface CandidateProfile {
  roleFamily:  RoleFamily | null
  seniority:   SeniorityLevel
  functions:   string[]     // specializations: ["Growth", "Analytics", "Embedded"]
  industries:  string[]     // domains: ["Semiconductor", "SaaS", "Fintech"]
  termSet:     Set<string>  // all candidate tokens for keyword matching
  coreTitles:  string[]     // up to 5 most recent job titles
}

export interface RelevanceDecision {
  keep:              boolean
  relevanceScore:    number
  roleFamilyScore:   number
  seniorityScore:    number
  functionScore:     number
  industryScore:     number
  keywordScore:      number
  matchLevel:        RoleMatchLevel
  excludedReason:    string | null  // null if not suppressed
  removalLabel:      string | null  // human-readable removal reason for logs
}

export interface RemovalLog {
  title:   string
  company: string
  score:   number
  reason:  string
}

// ─── Phase 2: Role taxonomy — ALLOW / LOW_CONFIDENCE / SUPPRESS per family ────

interface FamilyTaxonomy {
  allow:          RegExp[]
  low_confidence: RegExp[]
  suppress:       RegExp[]
}

const ROLE_TAXONOMY: Record<RoleFamily, FamilyTaxonomy> = {
  product: {
    allow: [
      /product\s*(manager|owner|lead|head|director|vp|analyst)/i,
      /growth\s*(manager|pm|product|lead)/i,
      /platform\s*pm/i, /\bcpo\b/i, /head\s*of\s*product/i,
      /\bpm\b.*(platform|growth|core|mobile|b2b|b2c|saas)/i,
    ],
    low_confidence: [
      /program\s*manager/i, /strategy\s*manager/i,
      /business\s*analyst/i, /project\s*manager/i, /\bpmo\b/i,
    ],
    suppress: [
      /\bsales\s*(executive|representative|associate|officer)\b/i,
      /relationship\s*manager/i,
      /\binsurance\b.*(advisor|agent|executive)\b/i,
      /real\s*estate\s*agent/i,
      /\btutor\b/i, /\bteacher\b/i, /\bnurse\b/i,
      /hr\s*(executive|recruiter|officer)\b/i,
      /customer\s*(support|care)\s*(executive|associate|agent|rep|officer)\b/i,
      /data\s*entry/i, /tele.?caller/i, /bpo.*voice/i, /voice\s*process/i,
    ],
  },

  engineering: {
    allow: [
      /(software|platform|staff|principal|embedded|firmware)\s*engineer/i,
      /\b(frontend|back.?end|full.?stack|devops)\s*(engineer|developer)\b/i,
      /software\s*developer/i, /\bswe\b/i, /\bsre\b/i,
      /solutions\s*engineer/i, /ml\s*engineer/i, /data\s*engineer/i,
      /(application|systems|integration|network|cloud|security)\s*engineer/i,
      /\b(software|cloud|data|solution|enterprise)\s*architect\b/i,
      /\b(android|ios|mobile)\s*(engineer|developer)\b/i,
    ],
    low_confidence: [
      /technical\s*program\s*manager/i, /engineering\s*manager/i,
      /systems\s*analyst/i, /\bit\s*(admin|manager|support)\b/i,
      /technical\s*lead/i,
    ],
    suppress: [
      /\bsales\s*(executive|representative|associate)\b/i,
      /relationship\s*manager/i,
      /\binsurance\b.*(advisor|agent)\b/i,
      /real\s*estate\s*agent/i,
      /\btutor\b/i, /\bteacher\b/i, /\bnurse\b/i,
      /hr\s*(executive|recruiter|officer)\b/i,
      /customer\s*(support|care)\s*(executive|associate|agent|rep)\b/i,
      /data\s*entry/i, /tele.?caller/i, /content\s*writer/i,
    ],
  },

  sales: {
    allow: [
      /\bsales\b.*(manager|executive|lead|director|head|vp|specialist)/i,
      /account\s*executive/i,
      /business\s*development\s*(manager|executive|representative)/i,
      /\b(enterprise|regional|field|inside|channel|territory|global)\s*sales\b/i,
      /\b(key|national|strategic)\s*account\s*manager\b/i,
    ],
    low_confidence: [
      /customer\s*success\s*manager/i, /account\s*manager/i,
      /partnerships\s*manager/i, /revenue\s*manager/i,
    ],
    suppress: [
      /software\s*(engineer|developer)/i, /data\s*scientist/i,
      /\btutor\b/i, /\bteacher\b/i, /\bnurse\b/i,
      /data\s*entry/i, /hr\s*(executive|recruiter)\b/i,
    ],
  },

  fae: {
    allow: [
      /field\s*application\s*engineer/i, /\bfae\b/i,
      /application\s*engineer/i, /sales\s*engineer/i,
      /technical\s*sales/i, /pre.?sales\s*engineer/i,
      /solutions\s*engineer/i, /technical\s*account\s*manager/i,
    ],
    low_confidence: [
      /business\s*development.*(engineer|technical)/i,
      /inside\s*sales.*technical/i,
      /\bse\b.*(solution|pre.?sales)/i,
    ],
    suppress: [
      /\btutor\b/i, /\bteacher\b/i, /\bnurse\b/i,
      /real\s*estate\s*agent/i,
      /\binsurance\b.*(agent|advisor)\b/i,
      /data\s*entry/i, /tele.?caller/i, /hr\s*executive/i,
    ],
  },

  marketing: {
    allow: [
      /marketing\s*(manager|director|head|lead|executive|analyst|specialist)/i,
      /digital\s*marketing/i, /growth\s*manager/i, /brand\s*manager/i,
      /demand\s*(gen|generation)/i, /campaign\s*manager/i,
      /\b(seo|sem)\s*(manager|specialist|analyst)\b/i,
      /content\s*(marketing|strategist|manager)/i,
    ],
    low_confidence: [
      /product\s*marketing/i, /partnerships\s*manager/i,
      /communications\s*manager/i, /\bpr\s*manager\b/i,
    ],
    suppress: [
      /software\s*(engineer|developer)/i, /data\s*scientist/i,
      /\btutor\b/i, /\bteacher\b/i, /\bnurse\b/i,
      /data\s*entry/i, /tele.?caller/i, /hr\s*executive/i,
    ],
  },

  data: {
    allow: [
      /data\s*(scientist|analyst|engineer|manager|lead|director)/i,
      /\b(ml|machine\s*learning|ai|deep\s*learning)\s*(engineer|scientist|researcher)\b/i,
      /(analytics|insights)\s*(manager|analyst|engineer|lead)/i,
      /research\s*scientist/i, /\bmlops\s*engineer\b/i,
      /\b(bi|business\s*intelligence)\s*analyst\b/i,
      /applied\s*(scientist|researcher)/i,
    ],
    low_confidence: [
      /business\s*analyst/i, /market\s*research\s*analyst/i,
      /quantitative\s*analyst/i, /\bquant\b/i,
    ],
    suppress: [
      /\bsales\s*(executive|representative)\b/i,
      /relationship\s*manager/i,
      /\binsurance\b.*(agent|advisor)\b/i,
      /real\s*estate\s*agent/i,
      /\btutor\b/i, /\bteacher\b/i, /\bnurse\b/i,
      /hr\s*(executive|recruiter)\b/i,
      /data\s*entry/i, /tele.?caller/i,
    ],
  },

  design: {
    allow: [
      /(ux|ui|product|visual|interaction|graphic)\s*designer/i,
      /ux\s*researcher/i, /design\s*(lead|manager|director|head)/i,
      /user\s*experience\s*designer/i, /user\s*interface\s*designer/i,
    ],
    low_confidence: [
      /creative\s*director/i, /art\s*director/i, /\bux\s*writer\b/i,
    ],
    suppress: [
      /\bsales\s*(executive|representative)\b/i,
      /relationship\s*manager/i,
      /\binsurance\b.*(agent|advisor)\b/i,
      /\btutor\b/i, /\bteacher\b/i, /\bnurse\b/i,
      /data\s*entry/i, /tele.?caller/i, /hr\s*executive/i,
    ],
  },

  finance: {
    allow: [
      /(finance|financial)\s*(manager|analyst|controller|director|head|officer)/i,
      /\b(cfo|fp&a)\b/i, /chief\s*financial/i,
      /\baccountant\b/i, /investment\s*(analyst|manager|banker)/i,
      /treasury\s*(manager|analyst)/i, /risk\s*(manager|analyst)/i,
    ],
    low_confidence: [
      /business\s*analyst/i, /strategy\s*analyst/i,
      /operations\s*(analyst|manager)/i,
    ],
    suppress: [
      /software\s*(engineer|developer)/i,
      /\btutor\b/i, /\bteacher\b/i, /\bnurse\b/i,
      /data\s*entry/i, /tele.?caller/i,
      /real\s*estate\s*agent/i,
    ],
  },

  hr: {
    allow: [
      /\b(hr|human\s*resources)\s*(manager|director|business\s*partner|head|officer)\b/i,
      /talent\s*(acquisition|manager|partner)\b/i,
      /\bhrbp\b/i, /people\s*(operations|partner|manager)\b/i,
      /\brecruiter\b/i, /\bta\s*manager\b/i,
    ],
    low_confidence: [
      /operations\s*manager/i, /admin\s*manager/i,
      /compensation\s*(and\s*benefits)?\s*manager/i,
    ],
    suppress: [
      /software\s*(engineer|developer)/i, /data\s*scientist/i,
      /product\s*manager/i,
      /\btutor\b/i, /\bteacher\b/i, /\bnurse\b/i,
      /data\s*entry/i, /tele.?caller/i,
    ],
  },

  customer_success: {
    allow: [
      /customer\s*success\s*(manager|lead|director|head|specialist)/i,
      /\bcsm\b/i, /client\s*success\s*manager/i,
      /customer\s*experience\s*(manager|director)/i,
    ],
    low_confidence: [
      /account\s*manager/i, /customer\s*support\s*manager/i,
      /client\s*services\s*manager/i,
    ],
    suppress: [
      /software\s*(engineer|developer)/i, /data\s*scientist/i,
      /\btutor\b/i, /\bteacher\b/i, /\bnurse\b/i,
      /data\s*entry/i, /tele.?caller/i,
    ],
  },

  operations: {
    allow: [
      /operations\s*(manager|director|head|lead|analyst|executive)/i,
      /supply\s*chain\s*(manager|analyst|director)/i,
      /logistics\s*(manager|coordinator|director)/i,
      /procurement\s*(manager|analyst|head)/i,
      /program\s*manager/i, /project\s*manager/i,
    ],
    low_confidence: [
      /business\s*analyst/i, /general\s*manager/i,
      /strategy\s*manager/i, /process\s*(improvement\s*)?manager/i,
    ],
    suppress: [
      /\btutor\b/i, /\bteacher\b/i, /\bnurse\b/i,
      /data\s*entry/i, /tele.?caller/i,
    ],
  },
}

// ─── Family definitions for CANDIDATE resume detection ────────────────────────

interface FamilyDef {
  resumePatterns: RegExp[]
  titlePatterns:  RegExp[]
  adjacent:       RoleFamily[]
}

const FAMILY_DEFS: Record<RoleFamily, FamilyDef> = {
  product: {
    resumePatterns: [/product\s*manager/i, /product\s*owner/i, /roadmap/i, /\bpm\b/i, /product\s*strategy/i],
    titlePatterns:  [/product\s*(manager|owner|lead)/i, /\bpm\b/i, /\bcpo\b/i, /growth\s*pm/i],
    adjacent:       ['engineering', 'data', 'marketing'],
  },
  engineering: {
    resumePatterns: [/engineer/i, /developer/i, /software/i, /coding/i, /programming/i, /\bstack\b/i],
    titlePatterns:  [/engineer/i, /developer/i, /\bswe\b/i, /\bsre\b/i, /architect/i, /devops/i],
    adjacent:       ['product', 'data', 'fae'],
  },
  sales: {
    resumePatterns: [/\bsales\b/i, /revenue/i, /quota/i, /\bpipeline\b/i, /business\s*development/i, /\bclosed\b.*deal/i],
    titlePatterns:  [/\bsales\b/i, /account\s*executive/i, /\bbdm\b/i, /\bbdr\b/i, /\bsdr\b/i],
    adjacent:       ['marketing', 'customer_success', 'fae'],
  },
  fae: {
    resumePatterns: [/field\s*application/i, /\bfae\b/i, /pre.?sales/i, /technical\s*sales/i, /sales\s*engineer/i],
    titlePatterns:  [/field\s*application/i, /\bfae\b/i, /sales\s*engineer/i, /pre.?sales/i, /solutions\s*engineer/i],
    adjacent:       ['engineering', 'sales', 'product'],
  },
  marketing: {
    resumePatterns: [/marketing/i, /\bbrand\b/i, /campaign/i, /demand\s*gen/i, /\bseo\b/i, /\bsem\b/i],
    titlePatterns:  [/marketing/i, /\bgrowth\b/i, /\bbrand\b/i, /digital\s*marketing/i, /\bseo\b/i],
    adjacent:       ['sales', 'product', 'design'],
  },
  data: {
    resumePatterns: [/data\s*scientist/i, /machine\s*learning/i, /analytics/i, /\bml\b/i, /\bsql\b/i, /python/i, /\bai\b/i],
    titlePatterns:  [/data\s*(scientist|analyst|engineer)/i, /\bml\b/i, /analytics/i, /\bai\b/i],
    adjacent:       ['engineering', 'product'],
  },
  design: {
    resumePatterns: [/designer/i, /\bux\b/i, /figma/i, /sketch/i, /adobe/i, /\bui\b/i],
    titlePatterns:  [/designer/i, /\bux\b/i, /\bui\b/i, /product\s*design/i],
    adjacent:       ['product', 'marketing'],
  },
  finance: {
    resumePatterns: [/\bfinance\b/i, /accounting/i, /financial/i, /\bcpa\b/i, /\bfp&a\b/i, /investment/i],
    titlePatterns:  [/\bfinance\b/i, /\bcfo\b/i, /accountant/i, /controller/i, /financial\s*analyst/i],
    adjacent:       ['operations'],
  },
  hr: {
    resumePatterns: [/\bhr\b/i, /human\s*resources/i, /recruiter/i, /talent\s*acquisition/i, /\bhrbp\b/i],
    titlePatterns:  [/\bhr\b/i, /human\s*resources/i, /recruiter/i, /talent\s*acquisition/i, /\bhrbp\b/i],
    adjacent:       ['operations'],
  },
  customer_success: {
    resumePatterns: [/customer\s*success/i, /client\s*management/i, /\bchurn\b/i, /\bnps\b/i, /\bcsm\b/i],
    titlePatterns:  [/customer\s*success/i, /\bcsm\b/i, /client\s*success/i],
    adjacent:       ['sales', 'operations'],
  },
  operations: {
    resumePatterns: [/operations/i, /supply\s*chain/i, /logistics/i, /procurement/i, /\bops\b/i],
    titlePatterns:  [/operations/i, /supply\s*chain/i, /logistics/i, /procurement/i, /program\s*manager/i],
    adjacent:       ['finance', 'hr'],
  },
}

// ─── Phase 3: 7-level seniority ───────────────────────────────────────────────

const SENIORITY_INDEX: Record<SeniorityLevel, number> = {
  intern: 0, junior: 1, mid: 2, senior: 3, lead: 4, director: 5, vp: 6,
}

// Suppress internship/trainee titles for senior+ candidates
const INTERN_TITLE_PATTERNS: RegExp[] = [
  /\binternship\b/i, /\bfresher\b/i, /\btrainee\b/i, /\bapprentice\b/i,
  /graduate\s*trainee/i, /entry.?level/i, /campus\s*(hire|placement|recruitment)/i,
  /\bgraduate\s*program\b/i,
]
const SENIOR_PLUS: SeniorityLevel[] = ['senior', 'lead', 'director', 'vp']

// ─── Phase 4: Industry patterns ───────────────────────────────────────────────

const INDUSTRY_PATTERNS: Record<string, RegExp[]> = {
  'Semiconductor':    [/semiconductor/i, /\bchip\b/i, /\bsoc\b/i, /\bfpga\b/i, /silicon/i, /microcontroller/i, /analog\s*(ic|design)/i],
  'SaaS/Software':    [/\bsaas\b/i, /software\s*(company|platform|product)/i, /cloud\s*platform/i, /b2b\s*software/i],
  'Fintech':          [/fintech/i, /payments/i, /\bneobank\b/i, /financial\s*technology/i, /\bnbfc\b/i, /\bwealthtech\b/i],
  'Banking/Finance':  [/\bbanking\b/i, /investment\s*bank/i, /wealth\s*management/i, /\bbfsi\b/i],
  'E-commerce':       [/e.?commerce/i, /marketplace/i, /\bd2c\b/i, /online\s*retail/i, /quick\s*commerce/i],
  'Healthcare':       [/\bhealthcare\b/i, /pharmaceutical/i, /\bbiotech\b/i, /medical\s*devices/i, /\bclinical\b/i, /\bpharma\b/i],
  'Manufacturing':    [/manufacturing/i, /\bautomotive\b/i, /\bindustrial\b/i, /\boem\b/i, /factory/i],
  'Telecom':          [/telecom/i, /\btelco\b/i, /\b5g\b/i, /wireless/i, /\blte\b/i, /networking/i],
  'EdTech':           [/edtech/i, /e.?learning/i, /online\s*education/i, /\blms\b/i],
  'Logistics':        [/logistics/i, /supply\s*chain/i, /last.mile/i, /warehousing/i, /\b3pl\b/i],
  'Gaming':           [/\bgaming\b/i, /game\s*(studio|developer)/i, /\besports\b/i],
}

// ─── Phase 4: Function/specialization patterns ────────────────────────────────

const FUNCTION_PATTERNS: Record<string, RegExp[]> = {
  'Growth':           [/\bgrowth\b/i, /\ba\/b\s*test/i, /experimentation/i, /retention/i, /monetization/i, /acquisition/i],
  'Analytics':        [/analytics/i, /data.driven/i, /\bmetrics\b/i, /\bkpi\b/i, /\bdashboard\b/i, /\bsql\b/i],
  'B2B':              [/\bb2b\b/i, /enterprise\s*(sales|product)/i, /saas\s*(sales|product)/i, /\bsmb\b/i],
  'B2C':              [/\bb2c\b/i, /consumer\s*product/i, /\bd2c\b/i],
  'Platform':         [/\bplatform\b/i, /infrastructure/i, /developer\s*experience/i, /internal\s*tools/i],
  'Mobile':           [/\bmobile\b/i, /\bios\b/i, /\bandroid\b/i, /flutter/i, /react\s*native/i],
  'Frontend':         [/front.?end/i, /\breact\b/i, /\bvue\b/i, /\bangular\b/i, /\bcss\b/i, /\btailwind\b/i, /\bnext\.?js\b/i],
  'Backend':          [/back.?end/i, /\bnode\b/i, /\bdjango\b/i, /\bspring\b/i, /\brails\b/i, /\bfastapi\b/i, /\bexpress\b/i],
  'DevOps':           [/devops/i, /kubernetes/i, /\bdocker\b/i, /ci.?cd/i, /terraform/i, /\baws\b/i, /\bgcp\b/i, /\bazure\b/i],
  'ML/AI':            [/machine\s*learning/i, /\bml\b/i, /deep\s*learning/i, /tensorflow/i, /pytorch/i, /\bllm\b/i, /gen.?ai/i, /\bnlp\b/i],
  'Embedded':         [/embedded/i, /firmware/i, /\brtos\b/i, /\bfpga\b/i, /microcontroller/i, /verilog/i, /vhdl/i, /\bpcb\b/i, /\bcan\b.*bus/i],
  'Enterprise Sales': [/enterprise\s*sales/i, /key\s*account/i, /strategic\s*account/i],
  'Channel Sales':    [/channel/i, /partner.*sales/i, /reseller/i, /distribution/i, /\bvar\b/i],
  'BI':               [/business\s*intelligence/i, /\bbi\b/i, /tableau/i, /power\s*bi/i, /looker/i],
  'Data Engineering': [/data\s*engineering/i, /\betl\b/i, /\bspark\b/i, /\bhadoop\b/i, /\bkafka\b/i, /data\s*pipeline/i],
}

// ─── Phase 5: Negative filters ────────────────────────────────────────────────

const HARD_NEGATIVES: RegExp[] = [
  /security\s*guard/i, /warehouse\s*picker/i,
  /delivery\s*(boy|person|agent)/i, /\b(lorry|truck)\s*driver\b/i,
  /packing\s*worker/i, /factory\s*worker/i, /house.?keeping/i,
  /\bcleaner\b/i, /\bsweeper\b/i, /\bpeon\b/i,
]

const SOFT_NEGATIVES: RegExp[] = [
  /tele.?caller/i, /data\s*entry/i,
  /\bbpo\b.*voice/i, /voice\s*process/i,
  /life\s*insurance\s*agent/i, /real\s*estate\s*agent/i,
  /\btutor\b/i, /\breceptionist\b/i, /\bcashier\b/i,
]

const SOFT_NEGATIVE_EXEMPT = new Set<RoleFamily>([
  'sales', 'fae', 'customer_success', 'operations', 'marketing',
])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3)
}

// ─── Phase 3: Seniority detection ────────────────────────────────────────────

function detectCandidateSeniority(parsedResume: ParsedResume): SeniorityLevel {
  const experience  = parsedResume.experience ?? []
  const recentTitle = (experience[0]?.title ?? '').toLowerCase()

  if (/\b(vp|vice\s*president|evp|svp)\b/.test(recentTitle))                               return 'vp'
  if (/\b(director|chief|cto|ceo|coo|cmo|cpo|president)\b/.test(recentTitle))              return 'director'
  if (/\b(head\s*of|principal|staff\s*engineer|group\s*manager)\b/.test(recentTitle))      return 'lead'
  if (/\b(senior|lead|sr\.?|architect)\b/.test(recentTitle))                               return 'senior'
  if (/\b(junior|jr\.?|trainee|intern|fresher|graduate)\b/.test(recentTitle))              return 'intern'

  let totalYears = 0
  for (const exp of experience) {
    const start = exp.start_date ? parseInt(exp.start_date) : null
    const end   = exp.end_date   ? parseInt(exp.end_date)   : new Date().getFullYear()
    if (start && !isNaN(start) && !isNaN(end) && end > start) totalYears += end - start
  }
  if (totalYears === 0) totalYears = experience.length * 2

  if (totalYears >= 15) return 'vp'
  if (totalYears >= 10) return 'director'
  if (totalYears >= 7)  return 'lead'
  if (totalYears >= 4)  return 'senior'
  if (totalYears >= 2)  return 'mid'
  if (totalYears >= 1)  return 'junior'
  return 'intern'
}

function detectJobSeniority(title: string): SeniorityLevel {
  const t = title.toLowerCase()
  if (/\b(vp|vice\s*president|evp)\b/.test(t))                                    return 'vp'
  if (/\b(director|chief|cto|ceo|coo|cmo)\b/.test(t))                             return 'director'
  if (/\b(head\s*of|principal|staff|group\s*manager)\b/.test(t))                  return 'lead'
  if (/\b(senior|lead|sr\.?|architect|manager)\b/.test(t))                        return 'senior'
  if (/\b(junior|jr\.?|trainee|intern|fresher|entry.?level|graduate|associate)\b/.test(t)) return 'intern'
  return 'mid'
}

function calcSeniorityPoints(candidate: SeniorityLevel, job: SeniorityLevel): number {
  const diff = Math.abs(SENIORITY_INDEX[candidate] - SENIORITY_INDEX[job])
  if (diff === 0) return 20
  if (diff === 1) return 14
  if (diff === 2) return 6
  return 0
}

// ─── Phase 1: Career identity — family detection ──────────────────────────────

function detectCandidateFamily(parsedResume: ParsedResume, searchQueries: string[]): RoleFamily | null {
  const fullText = [
    ...(parsedResume.experience ?? []).map((e) => `${e.title ?? ''} ${(e.bullets ?? []).join(' ')}`),
    parsedResume.summary ?? '',
    (parsedResume.skills ?? []).join(' '),
    ...searchQueries,
  ].join(' ')

  const recentTitle = parsedResume.experience?.[0]?.title ?? ''

  const scores: Partial<Record<RoleFamily, number>> = {}
  for (const [family, def] of Object.entries(FAMILY_DEFS) as [RoleFamily, FamilyDef][]) {
    let score = 0
    for (const pat of def.resumePatterns) {
      score += fullText.match(new RegExp(pat.source, 'gi'))?.length ?? 0
    }
    for (const pat of def.titlePatterns) {
      if (pat.test(recentTitle)) score += 5
    }
    if (score > 0) scores[family] = score
  }

  const entries = (Object.entries(scores) as [RoleFamily, number][]).sort(([, a], [, b]) => b - a)
  return entries[0]?.[0] ?? null
}

// ─── Phase 4: Function & industry detection from resume ───────────────────────

function detectFunctions(parsedResume: ParsedResume, searchQueries: string[]): string[] {
  const text = [
    parsedResume.summary,
    (parsedResume.skills ?? []).join(' '),
    ...(parsedResume.experience ?? []).flatMap((e) => [(e.bullets ?? []).join(' '), e.title]),
    ...searchQueries,
  ].filter(Boolean).join(' ')

  const detected: string[] = []
  for (const [fn, patterns] of Object.entries(FUNCTION_PATTERNS)) {
    if (patterns.some((p) => p.test(text))) detected.push(fn)
  }
  return detected
}

function detectIndustries(parsedResume: ParsedResume): string[] {
  const text = [
    parsedResume.summary,
    ...(parsedResume.experience ?? []).flatMap((e) => [
      e.company, e.title, (e.bullets ?? []).join(' '),
    ]),
    (parsedResume.skills ?? []).join(' '),
  ].filter(Boolean).join(' ')

  const detected: string[] = []
  for (const [industry, patterns] of Object.entries(INDUSTRY_PATTERNS)) {
    if (patterns.some((p) => p.test(text))) detected.push(industry)
  }
  return detected
}

// ─── Phase 2: Semantic role taxonomy scoring ──────────────────────────────────

function getRoleMatchLevel(title: string, family: RoleFamily): RoleMatchLevel {
  const taxonomy = ROLE_TAXONOMY[family]
  if (taxonomy.allow.some((p)          => p.test(title))) return 'allow'
  if (taxonomy.suppress.some((p)       => p.test(title))) return 'suppress'
  if (taxonomy.low_confidence.some((p) => p.test(title))) return 'low_confidence'
  return 'unknown'
}

function calcRoleFamilyPoints(title: string, profile: CandidateProfile): { points: number; matchLevel: RoleMatchLevel } {
  if (!profile.roleFamily) return { points: 20, matchLevel: 'unknown' }

  const matchLevel = getRoleMatchLevel(title, profile.roleFamily)
  if (matchLevel === 'allow')          return { points: 40, matchLevel }
  if (matchLevel === 'suppress')       return { points: -1, matchLevel }  // sentinel → block
  if (matchLevel === 'low_confidence') return { points: 20, matchLevel }

  // 'unknown' — check adjacent families for partial credit
  const adjacents = FAMILY_DEFS[profile.roleFamily].adjacent
  for (const adj of adjacents) {
    const adjLevel = getRoleMatchLevel(title, adj)
    if (adjLevel === 'allow')          return { points: 20, matchLevel: 'low_confidence' }
    if (adjLevel === 'low_confidence') return { points: 12, matchLevel: 'low_confidence' }
  }

  return { points: 0, matchLevel: 'unknown' }
}

// ─── Phase 4: Function match scoring ─────────────────────────────────────────

function calcFunctionPoints(job: NormalizedJob, profile: CandidateProfile): number {
  if (!profile.functions.length) return 10  // unknown functions → neutral, don't penalize

  const titleAndDesc = `${job.title ?? ''} ${(job.description ?? '').slice(0, 400)}`

  for (const fn of profile.functions) {
    const patterns = FUNCTION_PATTERNS[fn]
    if (patterns?.some((p) => p.test(titleAndDesc))) return 20
  }

  // Partial: description-only hit is weaker but still positive
  const descOnly = (job.description ?? '').slice(0, 400)
  for (const fn of profile.functions) {
    const patterns = FUNCTION_PATTERNS[fn]
    if (patterns?.some((p) => p.test(descOnly))) return 10
  }

  return 0
}

// ─── Phase 4: Industry match scoring ─────────────────────────────────────────

function calcIndustryPoints(job: NormalizedJob, profile: CandidateProfile): number {
  if (!profile.industries.length) return 5  // unknown industries → neutral

  const target = `${job.title ?? ''} ${job.company ?? ''} ${(job.description ?? '').slice(0, 300)}`

  for (const industry of profile.industries) {
    const patterns = INDUSTRY_PATTERNS[industry]
    if (patterns?.some((p) => p.test(target))) return 10
  }

  // If industries detected for candidate but no match found in job → 0
  return 0
}

// ─── Keyword overlap scoring ──────────────────────────────────────────────────

function calcKeywordPoints(title: string, profile: CandidateProfile): number {
  const tokens = tokenize(title)
  if (!tokens.length) return 0
  const matched = tokens.filter((t) => profile.termSet.has(t)).length
  return Math.round((matched / tokens.length) * 10)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildCandidateProfile(
  parsedResume: ParsedResume,
  searchQueries: string[] = [],
): CandidateProfile {
  const roleFamily = detectCandidateFamily(parsedResume, searchQueries)
  const seniority  = detectCandidateSeniority(parsedResume)
  const functions  = detectFunctions(parsedResume, searchQueries)
  const industries = detectIndustries(parsedResume)

  const termText = [
    parsedResume.summary,
    (parsedResume.skills ?? []).join(' '),
    ...(parsedResume.experience ?? []).flatMap((e) => [
      e.title, e.company, (e.bullets ?? []).join(' '),
    ]),
    ...searchQueries,
  ].filter(Boolean).join(' ')

  const termSet    = new Set(tokenize(termText))
  const coreTitles = (parsedResume.experience ?? []).map((e) => e.title ?? '').filter(Boolean).slice(0, 5)

  return { roleFamily, seniority, functions, industries, termSet, coreTitles }
}

export function scoreJobRelevance(
  job: NormalizedJob,
  profile: CandidateProfile,
  competitorSet: Set<string> = new Set(),
): RelevanceDecision {
  const title = job.title ?? ''

  // Phase 5: hard negatives — always block
  if (HARD_NEGATIVES.some((p) => p.test(title))) {
    return {
      keep: false, relevanceScore: 0, roleFamilyScore: 0, seniorityScore: 0,
      functionScore: 0, industryScore: 0, keywordScore: 0,
      matchLevel: 'suppress', excludedReason: 'hard_negative',
      removalLabel: 'hard_negative_title',
    }
  }

  // Phase 5: soft negatives — block unless exempt family
  const isSoftNeg = SOFT_NEGATIVES.some((p) => p.test(title))
  const isExempt  = profile.roleFamily ? SOFT_NEGATIVE_EXEMPT.has(profile.roleFamily) : false
  if (isSoftNeg && !isExempt) {
    return {
      keep: false, relevanceScore: 0, roleFamilyScore: 0, seniorityScore: 0,
      functionScore: 0, industryScore: 0, keywordScore: 0,
      matchLevel: 'suppress', excludedReason: 'soft_negative',
      removalLabel: 'soft_negative_title',
    }
  }

  // Phase 3: senior+ candidates never see internship/trainee titles
  const jobSeniority = detectJobSeniority(title)
  if (SENIOR_PLUS.includes(profile.seniority) && INTERN_TITLE_PATTERNS.some((p) => p.test(title))) {
    return {
      keep: false, relevanceScore: 0, roleFamilyScore: 0, seniorityScore: 0,
      functionScore: 0, industryScore: 0, keywordScore: 0,
      matchLevel: 'suppress', excludedReason: 'seniority_mismatch',
      removalLabel: 'seniority_mismatch',
    }
  }

  // Phase 2: role family semantic scoring
  const { points: rfPoints, matchLevel } = calcRoleFamilyPoints(title, profile)
  if (rfPoints === -1) {
    // SUPPRESS from taxonomy
    return {
      keep: false, relevanceScore: 0, roleFamilyScore: 0, seniorityScore: 0,
      functionScore: 0, industryScore: 0, keywordScore: 0,
      matchLevel: 'suppress', excludedReason: 'role_family_mismatch',
      removalLabel: 'role_family_mismatch',
    }
  }

  // Phase 3: seniority score
  const senPoints = calcSeniorityPoints(profile.seniority, jobSeniority)

  // Phase 4: function + industry
  const fnPoints  = calcFunctionPoints(job, profile)
  const indPoints = calcIndustryPoints(job, profile)

  // Keyword overlap
  const kwPoints = calcKeywordPoints(title, profile)

  // Competitor bonus (applied on top, not counted in base 100)
  const compBonus = competitorSet.has((job.company ?? '').toLowerCase()) ? 5 : 0

  const total = rfPoints + senPoints + fnPoints + indPoints + kwPoints + compBonus

  return {
    keep:            true,
    relevanceScore:  total,
    roleFamilyScore: rfPoints,
    seniorityScore:  senPoints,
    functionScore:   fnPoints,
    industryScore:   indPoints,
    keywordScore:    kwPoints,
    matchLevel,
    excludedReason:  null,
    removalLabel:    null,
  }
}

export function applyAdvancedRelevanceFilter(
  jobs: NormalizedJob[],
  profile: CandidateProfile,
  competitorSet: Set<string> = new Set(),
): {
  filtered:       NormalizedJob[]
  removedCount:   number
  removalReasons: Record<string, number>
  removedSamples: RemovalLog[]
  thresholdUsed:  number
  usedFallback:   boolean
} {
  const PRIMARY_THRESHOLD = 55
  const RELAXED_THRESHOLD = 40
  const RELAXED_MIN       = 40
  const FALLBACK_MIN      = 25

  // Score every job once
  const scored = jobs.map((job) => ({ job, decision: scoreJobRelevance(job, profile, competitorSet) }))

  function filterAtThreshold(threshold: number): {
    kept: NormalizedJob[]
    reasons: Record<string, number>
    samples: RemovalLog[]
  } {
    const kept: NormalizedJob[]       = []
    const reasons: Record<string, number> = {}
    const samples: RemovalLog[]       = []

    for (const { job, decision } of scored) {
      // Blocked by hard/soft/seniority/role-family suppress
      if (!decision.keep) {
        const reason = decision.removalLabel ?? decision.excludedReason ?? 'excluded'
        reasons[reason] = (reasons[reason] ?? 0) + 1
        if (samples.length < 15) {
          samples.push({ title: job.title ?? '(no title)', company: job.company ?? '', score: 0, reason })
        }
        continue
      }
      // Score below threshold
      if (decision.relevanceScore < threshold) {
        reasons['weak_relevance_score'] = (reasons['weak_relevance_score'] ?? 0) + 1
        if (samples.length < 15) {
          const reason = `score_${decision.relevanceScore}_below_${threshold}`
          samples.push({ title: job.title ?? '(no title)', company: job.company ?? '', score: decision.relevanceScore, reason })
        }
        continue
      }
      kept.push(job)
    }
    return { kept, reasons, samples }
  }

  // Try primary threshold first
  const primary = filterAtThreshold(PRIMARY_THRESHOLD)
  if (primary.kept.length >= RELAXED_MIN) {
    return {
      filtered:       primary.kept,
      removedCount:   jobs.length - primary.kept.length,
      removalReasons: primary.reasons,
      removedSamples: primary.samples,
      thresholdUsed:  PRIMARY_THRESHOLD,
      usedFallback:   false,
    }
  }

  // Relax threshold
  const relaxed = filterAtThreshold(RELAXED_THRESHOLD)
  if (relaxed.kept.length >= FALLBACK_MIN) {
    return {
      filtered:       relaxed.kept,
      removedCount:   jobs.length - relaxed.kept.length,
      removalReasons: relaxed.reasons,
      removedSamples: relaxed.samples,
      thresholdUsed:  RELAXED_THRESHOLD,
      usedFallback:   false,
    }
  }

  // Final fallback: old token-overlap (hard negatives + seniority suppress still applied)
  const fallbackKept = jobs.filter((job) => {
    if (HARD_NEGATIVES.some((p) => p.test(job.title ?? ''))) return false
    if (SENIOR_PLUS.includes(profile.seniority) && INTERN_TITLE_PATTERNS.some((p) => p.test(job.title ?? ''))) return false
    return tokenize(job.title ?? '').some((tok) => profile.termSet.has(tok))
  })

  return {
    filtered:       fallbackKept,
    removedCount:   jobs.length - fallbackKept.length,
    removalReasons: { fallback_token_overlap: jobs.length - fallbackKept.length },
    removedSamples: [],
    thresholdUsed:  0,
    usedFallback:   true,
  }
}
