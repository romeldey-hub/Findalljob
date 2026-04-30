'use client'

import { useState } from 'react'
import {
  Mail, Phone, MapPin, Briefcase, GraduationCap,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import type { ParsedResume, Resume, ResumeExperience } from '@/types'

interface VisualResumeCardProps {
  resume: Resume
  parsedData: ParsedResume
  avatarUrl?: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeDuration(start: string, end: string | null): string {
  const yearOf = (s: string) => {
    const m = s.match(/\b(19|20)\d{2}\b/)
    return m ? parseInt(m[0]) : 0
  }
  const sy = yearOf(start)
  if (!sy) return ''
  const ey = end ? (yearOf(end) || new Date().getFullYear()) : new Date().getFullYear()
  const diff = ey - sy
  if (diff <= 0) return '< 1 yr'
  return `${diff} yr${diff > 1 ? 's' : ''}`
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SidebarLabel({ children }: { children: string }) {
  return (
    <div className="mb-3">
      <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-blue-400">{children}</p>
      <div className="mt-1.5 h-px bg-white/10" />
    </div>
  )
}

function ContactRow({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-blue-400 mt-0.5 flex-shrink-0">{icon}</span>
      <span className="text-[12px] text-gray-300 break-all leading-snug">{value}</span>
    </div>
  )
}

function ContentSection({
  title, icon, children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="flex-shrink-0">{icon}</span>
        <h3 className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#0F172A] dark:text-[#F1F5F9]">{title}</h3>
        <div className="flex-1 h-px bg-[#E5E7EB] dark:bg-[#334155]" />
      </div>
      {children}
    </div>
  )
}

function ExperienceEntry({ exp }: { exp: ResumeExperience }) {
  const [expanded, setExpanded] = useState(false)
  const LIMIT   = 4
  const bullets = exp.bullets ?? []
  const visible = expanded ? bullets : bullets.slice(0, LIMIT)
  const hasMore = bullets.length > LIMIT
  const duration = computeDuration(exp.start_date, exp.end_date)

  return (
    <div className="relative pl-8">
      {/* Timeline dot */}
      <div className="absolute left-0 top-1 w-5 h-5 rounded-full bg-[#2563EB] ring-4 ring-blue-50 dark:ring-[#1E3A5F] flex items-center justify-center z-10 flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-white" />
      </div>

      {/* Content */}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-0.5">
          <h4 className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">{exp.title}</h4>
          <span className="text-[12px] text-gray-400 dark:text-slate-500 whitespace-nowrap">
            {exp.start_date} – {exp.end_date ?? 'Present'}
          </span>
        </div>
        <div className="flex items-center gap-2 mb-2.5">
          <p className="text-[13px] text-[#2563EB] font-semibold">{exp.company}</p>
          {duration && (
            <>
              <span className="text-gray-200 dark:text-slate-700">·</span>
              <span className="text-[12px] text-gray-400 dark:text-slate-500">{duration}</span>
            </>
          )}
        </div>

        {bullets.length > 0 && (
          <ul className="space-y-1.5 mb-1">
            {visible.map((b, j) => (
              <li key={j} className="flex gap-2.5 text-[13px] text-gray-600 dark:text-slate-400">
                <span className="text-[#2563EB] mt-1 flex-shrink-0 leading-none">•</span>
                <span className="leading-relaxed">{b}</span>
              </li>
            ))}
          </ul>
        )}

        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1.5 flex items-center gap-1 text-[12px] font-semibold text-[#2563EB] hover:text-blue-700 transition-colors"
          >
            {expanded
              ? <><ChevronUp   className="w-3.5 h-3.5" />Show less</>
              : <><ChevronDown className="w-3.5 h-3.5" />+{bullets.length - LIMIT} more points</>}
          </button>
        )}
      </div>
    </div>
  )
}

// ── VisualResumeCard ──────────────────────────────────────────────────────────

export function VisualResumeCard({ resume, parsedData, avatarUrl }: VisualResumeCardProps) {
  const { name, email, phone, location, summary, skills, experience, education, certifications } = parsedData

  const [showAllSkills, setShowAllSkills] = useState(false)

  const initials = (name ?? '')
    .split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0]).join('').toUpperCase() || '??'

  const currentTitle = experience?.[0]?.title ?? null

  const SKILLS_PREVIEW = 10
  const visibleSkills = showAllSkills ? (skills ?? []) : (skills ?? []).slice(0, SKILLS_PREVIEW)
  const hiddenCount   = (skills?.length ?? 0) - SKILLS_PREVIEW

  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm overflow-hidden">
      <div className="flex flex-col md:flex-row">

        {/* ── LEFT SIDEBAR ──────────────────────────────────────── */}
        <aside className="w-full md:w-[260px] flex-shrink-0 bg-[#0F172A] text-white p-7 space-y-7">

          {/* Avatar + Name + Title */}
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full ring-4 ring-white/10 shadow-lg overflow-hidden flex-shrink-0">
                {avatarUrl
                  ? <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] flex items-center justify-center">
                      <span className="text-2xl font-bold text-white">{initials}</span>
                    </div>
                }
              </div>
            </div>
            <div>
              <h2 className="font-bold text-[15px] text-white leading-snug">{name || 'Your Name'}</h2>
              {currentTitle && (
                <p className="text-[12px] text-blue-300 mt-1 leading-snug">{currentTitle}</p>
              )}
            </div>
          </div>

          <div className="h-px bg-white/10" />

          {/* Contact */}
          <div>
            <SidebarLabel>Contact</SidebarLabel>
            <div className="space-y-2.5">
              {phone    && <ContactRow icon={<Phone  className="w-3.5 h-3.5" />} value={phone}    />}
              {email    && <ContactRow icon={<Mail   className="w-3.5 h-3.5" />} value={email}    />}
              {location && <ContactRow icon={<MapPin className="w-3.5 h-3.5" />} value={location} />}
            </div>
          </div>

          {/* Key Skills */}
          {(skills?.length ?? 0) > 0 && (
            <div>
              <SidebarLabel>Key Skills</SidebarLabel>
              <div className="flex flex-wrap gap-1.5">
                {visibleSkills.map((skill, i) => (
                  <span
                    key={i}
                    className={
                      i < 5
                        ? 'px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#2563EB]/20 border border-[#2563EB]/30 text-blue-200'
                        : 'px-2.5 py-1 rounded-md text-[11px] font-medium bg-white/5 border border-white/10 text-gray-300'
                    }
                  >
                    {skill}
                  </span>
                ))}
                {!showAllSkills && hiddenCount > 0 && (
                  <button
                    onClick={() => setShowAllSkills(true)}
                    className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white/10 text-gray-300 hover:bg-white/20 transition-colors flex items-center gap-1"
                  >
                    +{hiddenCount} more <ChevronDown className="w-3 h-3" />
                  </button>
                )}
                {showAllSkills && hiddenCount > 0 && (
                  <button
                    onClick={() => setShowAllSkills(false)}
                    className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white/10 text-gray-300 hover:bg-white/20 transition-colors flex items-center gap-1"
                  >
                    Show less <ChevronUp className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Certifications */}
          {(certifications?.length ?? 0) > 0 && (
            <div>
              <SidebarLabel>Certifications</SidebarLabel>
              <ul className="space-y-2">
                {certifications.map((cert, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-gray-300 leading-snug">
                    <span className="text-[#2563EB] mt-0.5 flex-shrink-0">▸</span>
                    {cert}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* ── RIGHT CONTENT ─────────────────────────────────────── */}
        <div className="flex-1 bg-white dark:bg-[#1E293B] p-8 space-y-8 min-w-0">

          {/* Professional Summary */}
          {summary && (
            <ContentSection
              title="Professional Summary"
              icon={<span className="text-[#2563EB] text-base leading-none">◈</span>}
            >
              <p className="text-[14px] text-gray-600 dark:text-slate-400 leading-relaxed">{summary}</p>
            </ContentSection>
          )}

          {/* Work Experience */}
          {(experience?.length ?? 0) > 0 && (
            <ContentSection
              title="Work Experience"
              icon={<Briefcase className="w-4 h-4 text-[#2563EB]" />}
            >
              <div className="relative">
                <div className="absolute left-2.5 top-5 bottom-2 w-px bg-[#E5E7EB] dark:bg-[#334155]" />
                <div className="space-y-7">
                  {experience.map((exp, i) => (
                    <ExperienceEntry key={i} exp={exp} />
                  ))}
                </div>
              </div>
            </ContentSection>
          )}

          {/* Education */}
          {(education?.length ?? 0) > 0 && (
            <ContentSection
              title="Education"
              icon={<GraduationCap className="w-4 h-4 text-[#2563EB]" />}
            >
              <div className="space-y-3">
                {education.map((edu, i) => (
                  <div
                    key={i}
                    className="flex items-start justify-between gap-4 p-4 rounded-xl bg-[#F8FAFC] dark:bg-[#263549] border border-[#E5E7EB] dark:border-[#334155] hover:shadow-sm transition-shadow"
                  >
                    <div>
                      <p className="font-semibold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">
                        {[edu.degree, edu.field].filter(Boolean).join(' in ')}
                      </p>
                      <p className="text-[13px] text-[#2563EB] font-medium mt-0.5">{edu.school}</p>
                    </div>
                    <span className="text-[12px] text-gray-400 dark:text-slate-500 whitespace-nowrap mt-0.5">
                      {edu.graduation_year}
                    </span>
                  </div>
                ))}
              </div>
            </ContentSection>
          )}

        </div>
      </div>
    </div>
  )
}
