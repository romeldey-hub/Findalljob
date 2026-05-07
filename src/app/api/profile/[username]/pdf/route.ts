import { createElement } from 'react'
import {
  renderToBuffer,
  Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/supabase/server'
import type { ParsedResume } from '@/types'

// ── Reserved slugs ────────────────────────────────────────────────────────────

const RESERVED = new Set([
  'login', 'signup', 'register', 'logout', 'auth', 'api', 'admin',
  'matches', 'resume', 'optimizer', 'tracker', 'settings', 'dashboard',
  'about', 'pricing', 'privacy', 'terms', 'contact', 'help', 'blog',
  'support', 'careers', 'jobs', 'u', 'profile', 'www', 'mail', 'app',
])

// ── Colours ───────────────────────────────────────────────────────────────────

const C = {
  sidebarBg:      '#0F172A',
  sidebarLine:    '#1E293B',
  sideLabel:      '#60A5FA',
  sideText:       '#CBD5E1',
  blueChipBg:     '#1D3461',
  blueChipBorder: '#1D4ED8',
  blueChipText:   '#93C5FD',
  subtleChipBg:   '#1A2942',
  subtleChipText: '#D1D5DB',
  white:          '#FFFFFF',
  blue:           '#2563EB',
  bodyTitle:      '#0F172A',
  bodyBlue:       '#2563EB',
  bodyMeta:       '#9CA3AF',
  bodyText:       '#4B5563',
  border:         '#E5E7EB',
  sectionLine:    '#E5E7EB',
  cardBg:         '#F8FAFC',
}

const SIDE_W = 190
const PAD_S  = 22
const PAD_C  = 26

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', backgroundColor: C.white },
  sidebarBg: {
    position: 'absolute', top: 0, left: 0,
    height: 842, width: SIDE_W, backgroundColor: C.sidebarBg,
  },
  sidebar: {
    position: 'absolute', top: 0, left: 0,
    width: SIDE_W, height: 842,
    paddingTop: PAD_S, paddingBottom: PAD_S,
    paddingLeft: PAD_S, paddingRight: PAD_S,
  },
  content: {
    marginLeft: SIDE_W,
    paddingTop: PAD_C, paddingBottom: PAD_C,
    paddingLeft: PAD_C, paddingRight: PAD_C,
  },
  avatarCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: C.blue, alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  avatarImage: {
    width: 60, height: 60, borderRadius: 30,
    alignSelf: 'center', marginBottom: 8, objectFit: 'cover' as const,
  },
  avatarText:   { fontFamily: 'Helvetica-Bold', fontSize: 20, color: C.white },
  sideName:     { fontFamily: 'Helvetica-Bold', fontSize: 12, color: C.white, textAlign: 'center', marginBottom: 3, lineHeight: 1.3 },
  sideJobTitle: { fontSize: 8.5, color: C.sideLabel, textAlign: 'center', marginBottom: 14, lineHeight: 1.3 },
  sideDivider:  { height: 0.75, backgroundColor: C.sidebarLine, marginBottom: 14 },
  sideSection:  { marginBottom: 16 },
  sideSectionLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.sideLabel, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 5 },
  sideSectionRule:  { height: 0.5, backgroundColor: C.sidebarLine, marginBottom: 8 },
  contactRow:   { flexDirection: 'row', marginBottom: 5 },
  contactBullet:{ fontSize: 8, color: C.sideLabel, width: 10, marginTop: 0.5 },
  contactText:  { fontSize: 8, color: C.sideText, flex: 1, lineHeight: 1.4 },
  chipsWrap:    { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chipBlue:     { paddingVertical: 2.5, paddingHorizontal: 6, borderRadius: 4, fontSize: 7.5, backgroundColor: C.blueChipBg, color: C.blueChipText, marginBottom: 3 },
  chipSubtle:   { paddingVertical: 2.5, paddingHorizontal: 6, borderRadius: 4, fontSize: 7.5, backgroundColor: C.subtleChipBg, color: C.subtleChipText, marginBottom: 3 },
  certRow:      { flexDirection: 'row', marginBottom: 4 },
  certArrow:    { fontSize: 8, color: C.blue, width: 10, marginTop: 0.5 },
  certText:     { fontSize: 8, color: C.sideText, flex: 1, lineHeight: 1.4 },
  section:      { marginBottom: 16 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  sectionIcon:  { width: 10, height: 10, borderRadius: 2, backgroundColor: C.blue, marginRight: 6 },
  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: C.bodyTitle, textTransform: 'uppercase', letterSpacing: 1.2 },
  sectionRule:  { flex: 1, height: 0.75, backgroundColor: C.sectionLine, marginLeft: 6 },
  summaryText:  { fontSize: 9, color: C.bodyText, lineHeight: 1.55 },
  expList:      { paddingLeft: 16 },
  expEntry:     { marginBottom: 11, position: 'relative' },
  expDot:       { position: 'absolute', left: -16, top: 2, width: 10, height: 10, borderRadius: 5, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  expDotInner:  { width: 4, height: 4, borderRadius: 2, backgroundColor: C.white },
  expTitleRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 1 },
  expTitle:     { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: C.bodyTitle, flex: 1, marginRight: 6 },
  expDates:     { fontSize: 8, color: C.bodyMeta, marginTop: 1 },
  expMetaRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 5 },
  expCompany:   { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.bodyBlue },
  expDuration:  { fontSize: 8, color: C.bodyMeta },
  bulletRow:    { flexDirection: 'row', marginBottom: 2 },
  bulletDot:    { fontSize: 8.5, color: C.blue, width: 8, marginTop: 0.5 },
  bulletText:   { fontSize: 8.5, color: C.bodyText, flex: 1, lineHeight: 1.45 },
  eduCard:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', backgroundColor: C.cardBg, borderRadius: 6, padding: 9, marginBottom: 5, borderWidth: 0.5, borderColor: C.border },
  eduDegree:    { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.bodyTitle, marginBottom: 2 },
  eduSchool:    { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.bodyBlue },
  eduYear:      { fontSize: 8, color: C.bodyMeta, marginTop: 2 },
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function yearOf(s: string): number {
  const m = s?.match(/\b(19|20)\d{2}\b/)
  return m ? parseInt(m[0]) : 0
}

function computeDuration(start: string, end: string | null | undefined): string {
  const sy = yearOf(start)
  if (!sy) return ''
  const ey = end ? (yearOf(end) || new Date().getFullYear()) : new Date().getFullYear()
  const d = ey - sy
  return d <= 0 ? '< 1 yr' : `${d} yr${d > 1 ? 's' : ''}`
}

function safeName(name: string): string {
  return name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim()
}

// ── PDF sub-components ────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return createElement(View, { style: s.sectionHeaderRow },
    createElement(View, { style: s.sectionIcon }),
    createElement(Text, { style: s.sectionTitle }, title),
    createElement(View, { style: s.sectionRule }),
  )
}

// ── PDF Document ──────────────────────────────────────────────────────────────

interface PDFProps {
  pd:         ParsedResume
  name:       string
  avatarUrl:  string | null
  showEmail:  boolean
  showPhone:  boolean
}

function ProfilePDFDocument({ pd, name, avatarUrl, showEmail, showPhone }: PDFProps) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
  const currentTitle = pd.experience?.[0]?.title ?? null

  return createElement(Document, { title: `${name} — Resume`, creator: 'FindAllJob' },
    createElement(Page, { size: 'A4', style: s.page },

      // Dark background strip (visual only)
      createElement(View, { fixed: true, style: s.sidebarBg }),

      // ── SIDEBAR ──────────────────────────────────────────────────────────
      createElement(View, { style: s.sidebar },

        // Avatar
        avatarUrl
          ? createElement(Image, { src: avatarUrl, style: s.avatarImage })
          : createElement(View, { style: s.avatarCircle },
              createElement(Text, { style: s.avatarText }, initials)
            ),

        // Name + title
        createElement(Text, { style: s.sideName }, name),
        currentTitle ? createElement(Text, { style: s.sideJobTitle }, currentTitle) : null,
        createElement(View, { style: s.sideDivider }),

        // Contact
        (showEmail || showPhone || pd.location) ? createElement(View, { style: s.sideSection },
          createElement(Text, { style: s.sideSectionLabel }, 'Contact'),
          createElement(View, { style: s.sideSectionRule }),
          showPhone && pd.phone ? createElement(View, { style: s.contactRow },
            createElement(Text, { style: s.contactBullet }, '▸'),
            createElement(Text, { style: s.contactText }, pd.phone),
          ) : null,
          showEmail && pd.email ? createElement(View, { style: s.contactRow },
            createElement(Text, { style: s.contactBullet }, '▸'),
            createElement(Text, { style: s.contactText }, pd.email),
          ) : null,
          pd.location ? createElement(View, { style: s.contactRow },
            createElement(Text, { style: s.contactBullet }, '▸'),
            createElement(Text, { style: s.contactText }, pd.location),
          ) : null,
        ) : null,

        // Key Skills
        (pd.skills?.length ?? 0) > 0 ? createElement(View, { style: s.sideSection },
          createElement(Text, { style: s.sideSectionLabel }, 'Key Skills'),
          createElement(View, { style: s.sideSectionRule }),
          createElement(View, { style: s.chipsWrap },
            ...(pd.skills ?? []).map((skill, i) =>
              createElement(Text, { key: String(i), style: i < 5 ? s.chipBlue : s.chipSubtle }, skill)
            )
          ),
        ) : null,

        // Certifications
        (pd.certifications?.length ?? 0) > 0 ? createElement(View, { style: s.sideSection },
          createElement(Text, { style: s.sideSectionLabel }, 'Certifications'),
          createElement(View, { style: s.sideSectionRule }),
          ...(pd.certifications ?? []).map((cert, i) =>
            createElement(View, { key: String(i), style: s.certRow },
              createElement(Text, { style: s.certArrow }, '▸'),
              createElement(Text, { style: s.certText }, cert),
            )
          ),
        ) : null,
      ),

      // ── CONTENT ──────────────────────────────────────────────────────────
      createElement(View, { style: s.content },

        // Professional Summary
        pd.summary ? createElement(View, { style: s.section },
          createElement(View, { wrap: false },
            createElement(SectionHeader, { title: 'Professional Summary' }),
            createElement(Text, { style: s.summaryText }, pd.summary),
          ),
        ) : null,

        // Work Experience
        (pd.experience?.length ?? 0) > 0 ? createElement(View, { style: s.section },
          createElement(View, { style: s.expList },
            ...(pd.experience ?? []).map((exp, i) => {
              const duration = computeDuration(exp.start_date, exp.end_date)
              return createElement(View, { key: String(i), style: s.expEntry },
                createElement(View, { wrap: false },
                  i === 0 ? createElement(SectionHeader, { title: 'Work Experience' }) : null,
                  createElement(View, { style: s.expDot },
                    createElement(View, { style: s.expDotInner }),
                  ),
                  createElement(View, { style: s.expTitleRow },
                    createElement(Text, { style: s.expTitle }, exp.title),
                    createElement(Text, { style: s.expDates }, `${exp.start_date} – ${exp.end_date ?? 'Present'}`),
                  ),
                  createElement(View, { style: s.expMetaRow },
                    createElement(Text, { style: s.expCompany }, exp.company),
                    duration ? createElement(Text, { style: s.expDuration }, `· ${duration}`) : null,
                  ),
                ),
                ...(exp.bullets ?? []).map((b, j) =>
                  createElement(View, { key: String(j), style: s.bulletRow, wrap: false },
                    createElement(Text, { style: s.bulletDot }, '•'),
                    createElement(Text, { style: s.bulletText }, b),
                  )
                ),
              )
            }),
          ),
        ) : null,

        // Education
        (pd.education?.length ?? 0) > 0 ? createElement(View, { style: s.section },
          createElement(View, { wrap: false },
            createElement(SectionHeader, { title: 'Education' }),
            pd.education[0] ? createElement(View, { style: s.eduCard },
              createElement(View, null,
                createElement(Text, { style: s.eduDegree },
                  [pd.education[0].degree, pd.education[0].field].filter(Boolean).join(' in ')
                ),
                createElement(Text, { style: s.eduSchool }, pd.education[0].school),
              ),
              pd.education[0].graduation_year
                ? createElement(Text, { style: s.eduYear }, pd.education[0].graduation_year)
                : null,
            ) : null,
          ),
          ...(pd.education ?? []).slice(1).map((edu, i) =>
            createElement(View, { key: String(i + 1), style: s.eduCard, wrap: false },
              createElement(View, null,
                createElement(Text, { style: s.eduDegree },
                  [edu.degree, edu.field].filter(Boolean).join(' in ')
                ),
                createElement(Text, { style: s.eduSchool }, edu.school),
              ),
              edu.graduation_year
                ? createElement(Text, { style: s.eduYear }, edu.graduation_year)
                : null,
            )
          ),
        ) : null,
      ),
    )
  )
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params
  const slug = username.trim().toLowerCase()

  if (RESERVED.has(slug)) {
    return new Response('Not found', { status: 404 })
  }

  const admin = createAdminClient()

  const { data: profileRow } = await admin
    .from('profiles')
    .select('user_id, full_name, avatar_url, profile_public, show_email, show_phone, show_resume_download, username')
    .ilike('username', slug)
    .maybeSingle()

  if (!profileRow || !profileRow.profile_public || !profileRow.show_resume_download) {
    return new Response('Not found', { status: 404 })
  }

  const { data: resumeRow } = await admin
    .from('resumes')
    .select('parsed_data')
    .eq('user_id', profileRow.user_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const pd = (resumeRow?.parsed_data ?? {}) as ParsedResume
  const name = pd.name || profileRow.full_name || username

  const buffer = await renderToBuffer(
    ProfilePDFDocument({
      pd,
      name,
      avatarUrl: profileRow.avatar_url ?? null,
      showEmail: Boolean(profileRow.show_email),
      showPhone: Boolean(profileRow.show_phone),
    })
  )

  const filename = `${safeName(name)}-Resume.pdf`

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'private, no-store',
    },
  })
}
