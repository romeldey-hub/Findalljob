import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  MapPin, Briefcase, Mail, GraduationCap,
  Download, CheckCircle2, Sparkles, Globe, Lock, Phone,
} from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import type { ParsedResume, ResumeExperience, ResumeSection } from '@/types'
import { FileText } from 'lucide-react'
import { ShareButton } from '@/components/profile/ShareButton'
import { ReadMoreText } from '@/components/profile/ReadMoreText'
import { LogoMark } from '@/components/LogoMark'
import { ProfileThemeToggle } from './ProfileThemeToggle'

export const revalidate = 3600

// ── Reserved slugs (match existing Next.js routes) ────────────────────────────

const RESERVED = new Set([
  'login', 'signup', 'register', 'logout', 'auth', 'api', 'admin',
  'matches', 'resume', 'optimizer', 'tracker', 'settings', 'dashboard',
  'about', 'pricing', 'privacy', 'terms', 'contact', 'help', 'blog',
  'support', 'careers', 'jobs', 'u', 'profile', 'www', 'mail', 'app',
])

// ── Data helpers ──────────────────────────────────────────────────────────────

function yearOf(s: string): number | null {
  const m = s?.match(/\b(19|20)\d{2}\b/)
  return m ? parseInt(m[0]) : null
}

function computeYearsExperience(experience: ResumeExperience[]): number {
  let total = 0
  for (const exp of experience) {
    const sy = yearOf(exp.start_date)
    const ey = exp.end_date
      ? (yearOf(exp.end_date) ?? new Date().getFullYear())
      : new Date().getFullYear()
    if (sy !== null && ey > sy) total += ey - sy
  }
  return total
}

function computeProfileScore(
  pd: ParsedResume | null,
  hasAvatar: boolean,
): number {
  if (!pd) return hasAvatar ? 15 : 0
  let score = 0
  if (hasAvatar) score += 15
  if (pd.name?.trim()) score += 10
  if (pd.summary && pd.summary.length >= 80) score += 20
  if ((pd.skills?.length ?? 0) >= 5) score += 15
  else if ((pd.skills?.length ?? 0) >= 1) score += 8
  if ((pd.experience?.length ?? 0) >= 1) score += 20
  if ((pd.education?.length ?? 0) >= 1) score += 10
  if (pd.linkedin?.trim()) score += 5
  if ((pd.certifications?.length ?? 0) >= 1) score += 5
  return Math.min(100, score)
}

function formatDuration(start: string, end: string | null): string {
  const sy = yearOf(start)
  if (!sy) return start
  const ey = end ? (yearOf(end) ?? null) : null
  const endLabel = ey ? String(ey) : 'Present'
  if (!ey) return `${sy} – Present`
  const diff = ey - sy
  const dur = diff <= 0 ? '' : ` · ${diff} yr${diff > 1 ? 's' : ''}`
  return `${sy} – ${endLabel}${dur}`
}

// AI-derived role & industry signals from resume text
function deriveAIInsights(
  experience: ResumeExperience[],
  skills: string[],
): { roles: string[]; industries: string[] } {
  const allText = [
    ...experience.map((e) => e.title),
    ...experience.map((e) => e.company),
    ...skills,
    ...experience.flatMap((e) => e.bullets ?? []),
  ].join(' ')

  const ROLES: Array<[RegExp, string]> = [
    [/pre.?sales|solution.?consult|technical.?sales/i, 'Pre-Sales Consulting'],
    [/field.?application|fae\b|applications? engineer/i, 'Field Application Engineering'],
    [/account.?manag|technical.?account/i, 'Technical Account Management'],
    [/product.?manag/i, 'Product Management'],
    [/software.?engineer|backend|frontend|full.?stack/i, 'Software Engineering'],
    [/data.?scien|machine.?learn|ml\b|ai.?engineer/i, 'Data Science & AI'],
    [/ux|ui.?design|graphic.?design/i, 'Design & UX'],
    [/marketing|growth|content.?market/i, 'Digital Marketing'],
    [/director|vp\b|head.?of|vice.?president/i, 'Executive Leadership'],
    [/manager|team.?lead/i, 'Technical Leadership'],
    [/enterprise|b2b.?sales/i, 'Enterprise Solutions'],
    [/oem|partner|channel/i, 'Partner & Channel Management'],
    [/government|public.?sector|tender|rfp/i, 'Government & Public Sector'],
    [/devops|sre|cloud.?infra/i, 'DevOps & Infrastructure'],
    [/customer.?success|service.?delivery/i, 'Customer Success'],
    [/consulting|business.?develop/i, 'Business Development'],
  ]

  const INDUSTRIES: Array<[RegExp, string]> = [
    [/semiconductor|chip|vlsi|asic|fpga/i, 'Semiconductor'],
    [/telecom|telco|5g|4g|wireless|network/i, 'Telecom & Networks'],
    [/erp|sap|enterprise.?software/i, 'Enterprise Software'],
    [/saas|cloud|aws|azure|gcp/i, 'Cloud & SaaS'],
    [/fintech|banking|finance|payment/i, 'Fintech & Finance'],
    [/healthcare|medtech|pharma|clinical/i, 'Healthcare & Medtech'],
    [/e.?commerce|retail|consumer/i, 'E-commerce & Retail'],
    [/hardware|embedded|iot|edge/i, 'Hardware & IoT'],
    [/defence|military|aerospace/i, 'Defence & Aerospace'],
    [/edtech|education|learning/i, 'Education & EdTech'],
    [/media|entertainment|gaming/i, 'Media & Entertainment'],
    [/artificial.?intelligence|llm|generative.?ai/i, 'Artificial Intelligence'],
  ]

  const roles      = ROLES.filter(([p]) => p.test(allText)).map(([, l]) => l).slice(0, 5)
  const industries = INDUSTRIES.filter(([p]) => p.test(allText)).map(([, l]) => l).slice(0, 4)
  return { roles, industries }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProfileScoreRing({ score }: { score: number }) {
  const r     = 38
  const circ  = 2 * Math.PI * r
  const fill  = Math.max(0, Math.min(score, 100)) / 100 * circ
  const color = score >= 80 ? '#16A34A' : score >= 60 ? '#2563EB' : '#D97706'
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : 'Fair'

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="100" height="100" viewBox="0 0 100 100" aria-label={`Profile score: ${score}`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
        <text x="50" y="46" textAnchor="middle" fontSize="22" fontWeight="800" fill="white">
          {score}
        </text>
        <text x="50" y="60" textAnchor="middle" fontSize="9" fontWeight="500" fill="rgba(255,255,255,0.55)">
          PROFILE
        </text>
      </svg>
      <span className="text-[11px] font-semibold" style={{ color }}>{label}</span>
    </div>
  )
}

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <span className="flex-shrink-0">{icon}</span>
      <h2 className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#0F172A] dark:text-[#F1F5F9]">
        {title}
      </h2>
      <div className="flex-1 h-px bg-[#E5E7EB] dark:bg-[#334155]" />
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-6 ${className}`}>
      {children}
    </div>
  )
}

// ── Data fetch ────────────────────────────────────────────────────────────────

async function fetchPublicProfile(username: string) {
  const admin = createAdminClient()

  const { data: profileRow } = await admin
    .from('profiles')
    .select(`
      user_id, full_name, avatar_url, headline,
      profile_public, show_email, show_phone, show_resume_download, open_to_opportunities,
      username,
      linkedin_url, show_linkedin,
      x_url, show_x,
      facebook_url, show_facebook
    `)
    .ilike('username', username)
    .maybeSingle()

  if (!profileRow) return null

  const { data: resumeRow } = await admin
    .from('resumes')
    .select('parsed_data, file_url')
    .eq('user_id', profileRow.user_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return { profileRow, resumeRow }
}

// ── OG metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> }
): Promise<Metadata> {
  const { username } = await params
  if (RESERVED.has(username.toLowerCase())) return {}

  const result = await fetchPublicProfile(username)
  if (!result || !result.profileRow.profile_public) return {}

  const { profileRow, resumeRow } = result
  const pd   = resumeRow?.parsed_data as ParsedResume | null
  const name = pd?.name || profileRow.full_name || username
  const role = profileRow.headline || pd?.experience?.[0]?.title || 'Professional'
  const desc = pd?.summary
    ? pd.summary.slice(0, 160)
    : `${name} — Professional profile on FindAllJob.`

  return {
    title: `${name} · ${role} | FindAllJob`,
    description: desc,
    openGraph: {
      title: `${name} · ${role}`,
      description: desc,
      url: `https://findalljob.com/${username}`,
      type: 'profile',
      images: profileRow.avatar_url ? [{ url: profileRow.avatar_url }] : [],
    },
    twitter: {
      card: 'summary',
      title: `${name} · ${role}`,
      description: desc,
    },
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PublicProfilePage(
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params

  if (RESERVED.has(username.toLowerCase())) notFound()

  const result = await fetchPublicProfile(username)
  if (!result) notFound()

  const { profileRow, resumeRow } = result

  // Private profile — minimal private screen (not 404, to give helpful feedback)
  if (!profileRow.profile_public) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A] flex flex-col">
        <nav className="bg-white dark:bg-[#0F172A] border-b border-[#E5E7EB] dark:border-[#1E293B] px-4 py-2.5">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <LogoMark href="/" size="sm" onDark={false} />
            <div className="flex items-center gap-2">
              <ProfileThemeToggle />
              <a
                href="/signup"
                className="text-[12px] font-semibold text-[#2563EB] hover:text-blue-700 transition-colors"
              >
                Create your profile →
              </a>
            </div>
          </div>
        </nav>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6 text-gray-400" />
            </div>
            <h1 className="text-[18px] font-bold text-[#0F172A] dark:text-[#F1F5F9] mb-2">
              This profile is private
            </h1>
            <p className="text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed">
              The owner of this profile has set it to private.
            </p>
            <a
              href="/"
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
            >
              Go to FindAllJob
            </a>
          </div>
        </div>
      </div>
    )
  }

  const pd             = resumeRow?.parsed_data as ParsedResume | null
  const name           = pd?.name         || profileRow.full_name || username
  const currentTitle   = profileRow.headline || pd?.experience?.[0]?.title || ''
  const location       = pd?.location      || ''
  const phone          = pd?.phone         || ''
  const email          = pd?.email         || ''
  const summary        = pd?.summary       || ''
  const skills         = pd?.skills        ?? []
  const experience     = pd?.experience    ?? []
  const education      = pd?.education     ?? []
  const certifications = pd?.certifications ?? []
  const linkedin       = pd?.linkedin      || ''

  const STRUCTURED_TITLES = new Set([
    'summary', 'professional summary', 'profile', 'objective', 'about',
    'experience', 'work experience', 'employment', 'career history',
    'skills', 'core competencies', 'key skills', 'technical skills',
    'education', 'academic', 'qualifications',
    'certifications', 'certificates', 'credentials', 'licenses',
  ])
  const customSections: ResumeSection[] = (pd?.sections ?? []).filter(
    s => !STRUCTURED_TITLES.has(s.title.trim().toLowerCase())
  )

  const showEmail    = Boolean(profileRow.show_email    && email)
  const showPhone    = Boolean(profileRow.show_phone    && phone)
  const showDownload = Boolean(profileRow.show_resume_download && resumeRow?.file_url)

  // Pre-filled mailto for recruiters
  const firstName  = name.split(' ')[0]
  const roleLabel  = currentTitle || 'your field'
  const mailtoHref = showEmail
    ? `mailto:${email}?subject=${encodeURIComponent(
        'Opportunity discussion via FindAllJob profile'
      )}&body=${encodeURIComponent(
        `Hi ${firstName},\n\nI came across your FindAllJob profile and would like to connect regarding a possible opportunity.\n\nYour experience in ${roleLabel} looks relevant to what we are exploring.\n\nCould we schedule a quick conversation?\n\nRegards,`
      )}`
    : null

  function resolveUrl(raw: string | null | undefined): string {
    if (!raw) return ''
    return raw.startsWith('http') ? raw : `https://${raw}`
  }

  const linkedinUrl  = resolveUrl(profileRow.linkedin_url)
  const xUrl         = resolveUrl(profileRow.x_url)
  const facebookUrl  = resolveUrl(profileRow.facebook_url)
  const showLinkedin = Boolean(profileRow.show_linkedin && linkedinUrl)
  const showX        = Boolean(profileRow.show_x        && xUrl)
  const showFacebook = Boolean(profileRow.show_facebook && facebookUrl)

  const hasAvatar    = Boolean(profileRow.avatar_url)
  const initials     = name.split(' ').filter(Boolean).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase() || '?'
  const yearsExp     = computeYearsExperience(experience)
  const profileScore = computeProfileScore(pd, hasAvatar)
  const { roles: aiRoles, industries: aiIndustries } = deriveAIInsights(experience, skills)
  const profileUrl   = `https://findalljob.com/${username}`

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A]">

      {/* ── Slim top nav ─────────────────────────────────────────────────────── */}
      <nav className="bg-white dark:bg-[#0F172A] border-b border-[#E5E7EB] dark:border-[#1E293B] px-4 py-2.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <LogoMark href="/" size="sm" onDark={false} />
          <div className="flex items-center gap-2">
            <ProfileThemeToggle />
            <a
              href="/signup"
              className="text-[12px] font-semibold text-[#2563EB] hover:text-blue-700 transition-colors"
            >
              Create your profile →
            </a>
          </div>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <div className="bg-[#0F172A] border-b border-[#1E293B]">
        <div className="max-w-4xl mx-auto px-4 py-10 sm:py-12">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8">

            {/* Avatar */}
            <div className="flex-shrink-0">
              <div className="w-24 h-24 rounded-2xl ring-4 ring-white/10 overflow-hidden shadow-xl">
                {profileRow.avatar_url ? (
                  <img src={profileRow.avatar_url} alt={name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] flex items-center justify-center">
                    <span className="text-3xl font-black text-white">{initials}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row sm:items-stretch sm:justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                    <h1 className="text-[26px] sm:text-[30px] font-black text-white leading-tight tracking-tight">
                      {name}
                    </h1>
                    {profileRow.open_to_opportunities && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/15 border border-green-500/30 text-[11px] font-semibold text-green-400 flex-shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        Open to opportunities
                      </span>
                    )}
                  </div>
                  {currentTitle && (
                    <p className="text-[15px] text-blue-300 font-medium mt-1 leading-snug">
                      {currentTitle}
                    </p>
                  )}

                  {/* Meta chips */}
                  <div className="flex flex-wrap justify-center sm:justify-start items-center gap-x-4 gap-y-1.5 mt-3">
                    {location && (
                      <span className="flex items-center gap-1.5 text-[13px] text-gray-400">
                        <MapPin className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                        {location}
                      </span>
                    )}
                    {yearsExp > 0 && (
                      <span className="flex items-center gap-1.5 text-[13px] text-gray-400">
                        <Briefcase className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                        {yearsExp}+ yrs experience
                      </span>
                    )}
                    {skills.length > 0 && (
                      <span className="flex items-center gap-1.5 text-[13px] text-gray-400">
                        <CheckCircle2 className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                        {skills.length} skills
                      </span>
                    )}
                    {showPhone && (
                      <span className="flex items-center gap-1.5 text-[13px] text-gray-400">
                        <Phone className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                        {phone}
                      </span>
                    )}
                  </div>

                  {/* Share + social icons */}
                  <div className="flex flex-wrap justify-center sm:justify-start items-center gap-2 mt-4">
                    <ShareButton url={profileUrl} name={name} />
                    {showLinkedin && (
                      <a
                        href={linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="LinkedIn"
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/8 text-white/50 hover:bg-white/15 hover:text-white transition-all duration-150"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true">
                          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                        </svg>
                      </a>
                    )}
                    {showX && (
                      <a
                        href={xUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="X / Twitter"
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/8 text-white/50 hover:bg-white/15 hover:text-white transition-all duration-150"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      </a>
                    )}
                    {showFacebook && (
                      <a
                        href={facebookUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Facebook"
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/8 text-white/50 hover:bg-white/15 hover:text-white transition-all duration-150"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>

                {/* Right: score ring + CTA buttons */}
                <div className="flex flex-col items-center justify-between flex-shrink-0">
                  <ProfileScoreRing score={profileScore} />

                  <div className="flex flex-col items-center gap-2">
                    {mailtoHref ? (
                      <a
                        href={mailtoHref}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563EB] text-white text-[12px] font-semibold hover:bg-blue-700 transition-colors w-full"
                      >
                        <Mail className="w-3.5 h-3.5" />Contact
                      </a>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <span className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/30 text-[12px] font-semibold cursor-not-allowed w-full">
                          <Mail className="w-3.5 h-3.5" />Contact
                        </span>
                        <p className="text-[10px] text-white/30 text-center leading-snug max-w-[130px]">
                          Email contact not enabled
                        </p>
                      </div>
                    )}
                    {showDownload && (
                      <a
                        href={`/api/profile/${username}/pdf`}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-white/20 text-white text-[12px] font-medium hover:bg-white/10 transition-colors w-full"
                      >
                        <Download className="w-3.5 h-3.5" />Download CV
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── BODY ─────────────────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">

        {/* Professional Summary */}
        {summary && (
          <Card>
            <SectionHeading
              icon={<span className="text-[#2563EB] text-base leading-none">◈</span>}
              title="Professional Summary"
            />
            <ReadMoreText text={summary} lines={5} />
          </Card>
        )}

        {/* Core Expertise */}
        {skills.length > 0 && (
          <Card>
            <SectionHeading
              icon={<CheckCircle2 className="w-4 h-4 text-[#2563EB]" />}
              title="Core Expertise"
            />
            <div className="flex flex-wrap gap-2">
              {skills.map((skill, i) => (
                <span
                  key={i}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border ${
                    i < 6
                      ? 'bg-[#EFF6FF] dark:bg-[#1E3A5F]/60 border-[#DBEAFE] dark:border-[#1E3A5F] text-[#2563EB] dark:text-blue-300'
                      : 'bg-[#F8FAFC] dark:bg-[#263549]/60 border-[#E5E7EB] dark:border-[#334155] text-gray-600 dark:text-slate-400'
                  }`}
                >
                  {skill}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Work Experience */}
        {experience.length > 0 && (
          <Card>
            <SectionHeading
              icon={<Briefcase className="w-4 h-4 text-[#2563EB]" />}
              title="Work Experience"
            />
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[9px] top-6 bottom-4 w-px bg-[#E5E7EB] dark:bg-[#334155]" />
              <div className="space-y-8">
                {experience.map((exp, i) => (
                  <div key={i} className="relative pl-9">
                    {/* Timeline dot */}
                    <div className="absolute left-0 top-1 w-5 h-5 rounded-full bg-[#2563EB] ring-4 ring-blue-50 dark:ring-[#1E3A5F] flex items-center justify-center z-10">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>

                    {/* Header */}
                    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-0.5">
                      <h3 className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9] leading-snug">
                        {exp.title}
                      </h3>
                      <span className="text-[12px] text-gray-400 dark:text-slate-500 whitespace-nowrap flex-shrink-0">
                        {formatDuration(exp.start_date, exp.end_date)}
                      </span>
                    </div>
                    <p className="text-[13px] font-semibold text-[#2563EB] mb-3">
                      {exp.company}
                    </p>

                    {/* Bullets — max 5 for clarity */}
                    {(exp.bullets ?? []).length > 0 && (
                      <ul className="space-y-1.5">
                        {(exp.bullets ?? []).slice(0, 5).map((b, j) => (
                          <li key={j} className="flex gap-2.5 text-[13px] text-gray-600 dark:text-slate-400 leading-relaxed">
                            <span className="text-[#2563EB] mt-1 flex-shrink-0 leading-none text-[10px]">▸</span>
                            {b}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Education */}
        {education.length > 0 && (
          <Card>
            <SectionHeading
              icon={<GraduationCap className="w-4 h-4 text-[#2563EB]" />}
              title="Education"
            />
            <div className="space-y-3">
              {education.map((edu, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 p-4 rounded-xl bg-[#F8FAFC] dark:bg-[#263549]/60 border border-[#E5E7EB] dark:border-[#334155]"
                >
                  <div>
                    <p className="font-semibold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">
                      {[edu.degree, edu.field].filter(Boolean).join(' in ')}
                    </p>
                    <p className="text-[13px] text-[#2563EB] font-medium mt-0.5">{edu.school}</p>
                  </div>
                  {edu.graduation_year && (
                    <span className="text-[12px] text-gray-400 dark:text-slate-500 flex-shrink-0">
                      {edu.graduation_year}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Certifications */}
        {certifications.length > 0 && (
          <Card>
            <SectionHeading
              icon={<CheckCircle2 className="w-4 h-4 text-[#2563EB]" />}
              title="Certifications"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {certifications.map((cert, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#263549]/60 border border-[#E5E7EB] dark:border-[#334155]"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-[13px] text-[#0F172A] dark:text-[#F1F5F9] leading-snug">{cert}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Custom / Additional Sections (Languages, Awards, Interests, etc.) */}
        {customSections.length > 0 && customSections.map((section, i) => (
          <Card key={i}>
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-[#2563EB] flex-shrink-0" />
              <h2 className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#0F172A] dark:text-[#F1F5F9]">
                {section.title}
              </h2>
              <div className="flex-1 h-px bg-[#E5E7EB] dark:bg-[#334155]" />
            </div>
            {(section.type === 'bullets') && (section.items?.length ?? 0) > 0 ? (
              <ul className="space-y-1.5">
                {section.items!.map((item, j) => (
                  <li key={j} className="flex gap-2.5 text-[13px] text-gray-600 dark:text-slate-400 leading-relaxed">
                    <span className="text-[#2563EB] mt-1 flex-shrink-0 leading-none text-[10px]">▸</span>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (section.type === 'keyvalue') && (section.pairs?.length ?? 0) > 0 ? (
              <div className="space-y-2">
                {section.pairs!.map((pair, j) => (
                  <div key={j} className="flex items-baseline gap-3 text-[13px]">
                    <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9] min-w-[110px] flex-shrink-0">{pair.key}</span>
                    <span className="text-gray-300 dark:text-slate-600 flex-shrink-0">:</span>
                    <span className="text-gray-600 dark:text-slate-400 leading-relaxed">{pair.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-gray-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">{section.content}</p>
            )}
          </Card>
        ))}

        {/* AI Match Insights */}
        {(aiRoles.length > 0 || aiIndustries.length > 0) && (
          <Card>
            <div className="flex items-center gap-2 mb-5">
              <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <h2 className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#0F172A] dark:text-[#F1F5F9]">
                AI Match Insights
              </h2>
              <div className="flex-1 h-px bg-[#E5E7EB] dark:bg-[#334155]" />
              <span className="text-[10px] text-gray-400 dark:text-slate-500 italic flex-shrink-0">
                AI-derived
              </span>
            </div>

            <div className="space-y-4">
              {aiRoles.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-2">
                    Best matched for
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {aiRoles.map((role, i) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#EFF6FF] dark:bg-[#1E3A5F]/60 border border-[#DBEAFE] dark:border-[#1E3A5F] text-[#2563EB] dark:text-blue-300"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {aiIndustries.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-2">
                    Top industries
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {aiIndustries.map((ind, i) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400"
                      >
                        {ind}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Contact */}
        {showEmail || showPhone || linkedin ? (
          <Card>
            <SectionHeading
              icon={<Globe className="w-4 h-4 text-[#2563EB]" />}
              title="Contact"
            />
            <div className="flex flex-wrap gap-4">
              {showEmail && mailtoHref && (
                <a
                  href={mailtoHref}
                  className="flex items-center gap-2 text-[13px] text-gray-600 dark:text-slate-400 hover:text-[#2563EB] dark:hover:text-blue-400 transition-colors"
                >
                  <Mail className="w-4 h-4 text-[#2563EB]" />
                  {email}
                </a>
              )}
              {showPhone && (
                <a
                  href={`tel:${phone}`}
                  className="flex items-center gap-2 text-[13px] text-gray-600 dark:text-slate-400 hover:text-[#2563EB] dark:hover:text-blue-400 transition-colors"
                >
                  <Phone className="w-4 h-4 text-[#2563EB]" />
                  {phone}
                </a>
              )}
              {linkedin && (
                <a
                  href={linkedin.startsWith('http') ? linkedin : `https://${linkedin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[13px] text-gray-600 dark:text-slate-400 hover:text-[#2563EB] dark:hover:text-blue-400 transition-colors"
                >
                  <Globe className="w-4 h-4 text-[#2563EB]" />
                  {linkedin.replace(/https?:\/\/(www\.)?/i, '')}
                </a>
              )}
            </div>
          </Card>
        ) : null}

      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#E5E7EB] dark:border-[#1E293B] py-8 mt-4">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-gray-400 dark:text-slate-500">
          <LogoMark href="/" size="sm" onDark={false} />
          <p>AI-powered job matching &amp; resume optimization</p>
          <a
            href="/signup"
            className="text-[#2563EB] font-semibold hover:text-blue-700 transition-colors"
          >
            Create your profile →
          </a>
        </div>
      </footer>

    </div>
  )
}
