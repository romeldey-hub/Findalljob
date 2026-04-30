'use client'

import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import type { ParsedResume } from '@/types'

// ── Colours (match VisualResumeCard) ─────────────────────────────────────────
const C = {
  // Sidebar
  sidebarBg:     '#0F172A',
  sidebarLine:   '#1E293B',
  sideLabel:     '#60A5FA',   // blue-400
  sideText:      '#CBD5E1',   // slate-300
  sideMuted:     '#94A3B8',   // slate-400
  blueChipBg:    '#1D3461',
  blueChipBorder:'#1D4ED8',
  blueChipText:  '#93C5FD',
  subtleChipBg:  '#1A2942',
  subtleChipText:'#D1D5DB',
  // Content
  white:         '#FFFFFF',
  blue:          '#2563EB',
  bodyTitle:     '#0F172A',
  bodyBlue:      '#2563EB',
  bodyMeta:      '#9CA3AF',
  bodyText:      '#4B5563',
  bodySecondary: '#374151',
  border:        '#E5E7EB',
  sectionLine:   '#E5E7EB',
  cardBg:        '#F8FAFC',
}

const SIDE_W = 190
const PAD_S  = 22
const PAD_C  = 26

// ── Duration helper (mirrors VisualResumeCard) ────────────────────────────────
function computeDuration(start: string, end: string | null | undefined): string {
  const yr = (s: string) => { const m = s.match(/\b(19|20)\d{2}\b/); return m ? parseInt(m[0]) : 0 }
  const sy = yr(start)
  if (!sy) return ''
  const ey = end ? (yr(end) || new Date().getFullYear()) : new Date().getFullYear()
  const d = ey - sy
  return d <= 0 ? '< 1 yr' : `${d} yr${d > 1 ? 's' : ''}`
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: C.white,
  },

  // ── Sidebar — absolutely positioned so it never affects content flow;
  //             `fixed` repeats it on every page with a full-height dark strip
  sidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: SIDE_W,
    backgroundColor: C.sidebarBg,
    paddingTop: PAD_S,
    paddingBottom: PAD_S,
    paddingLeft: PAD_S,
    paddingRight: PAD_S,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.blue,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignSelf: 'center',
    marginBottom: 8,
    objectFit: 'cover' as const,
  },
  avatarText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 20,
    color: C.white,
  },
  sideName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    color: C.white,
    textAlign: 'center',
    marginBottom: 3,
    lineHeight: 1.3,
  },
  sideJobTitle: {
    fontSize: 8.5,
    color: C.sideLabel,
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 1.3,
  },
  sideDivider: {
    height: 0.75,
    backgroundColor: C.sidebarLine,
    marginBottom: 14,
  },
  sideSection: {
    marginBottom: 16,
  },
  sideSectionLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    color: C.sideLabel,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  sideSectionRule: {
    height: 0.5,
    backgroundColor: C.sidebarLine,
    marginBottom: 8,
  },
  contactRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  contactBullet: {
    fontSize: 8,
    color: C.sideLabel,
    width: 10,
    marginTop: 0.5,
  },
  contactText: {
    fontSize: 8,
    color: C.sideText,
    flex: 1,
    lineHeight: 1.4,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  chipBlue: {
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    borderRadius: 4,
    fontSize: 7.5,
    backgroundColor: C.blueChipBg,
    color: C.blueChipText,
    marginBottom: 3,
  },
  chipSubtle: {
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    borderRadius: 4,
    fontSize: 7.5,
    backgroundColor: C.subtleChipBg,
    color: C.subtleChipText,
    marginBottom: 3,
  },
  certRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  certArrow: {
    fontSize: 8,
    color: C.blue,
    width: 10,
    marginTop: 0.5,
  },
  certText: {
    fontSize: 8,
    color: C.sideText,
    flex: 1,
    lineHeight: 1.4,
  },

  // ── Content — offset by sidebar width so it never overlaps; flows across pages
  content: {
    marginLeft: SIDE_W,
    paddingTop: PAD_C,
    paddingBottom: PAD_C,
    paddingLeft: PAD_C,
    paddingRight: PAD_C,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },
  sectionIcon: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: C.blue,
    marginRight: 6,
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    color: C.bodyTitle,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  sectionRule: {
    flex: 1,
    height: 0.75,
    backgroundColor: C.sectionLine,
    marginLeft: 6,
  },

  // Summary
  summaryText: {
    fontSize: 9,
    color: C.bodyText,
    lineHeight: 1.55,
  },

  // Experience
  expList: {
    paddingLeft: 16,
  },
  expEntry: {
    marginBottom: 11,
    position: 'relative',
  },
  expDot: {
    position: 'absolute',
    left: -16,
    top: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expDotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.white,
  },
  expTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 1,
  },
  expTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    color: C.bodyTitle,
    flex: 1,
    marginRight: 6,
  },
  expDates: {
    fontSize: 8,
    color: C.bodyMeta,
    marginTop: 1,
  },
  expMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 5,
  },
  expCompany: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    color: C.bodyBlue,
  },
  expDuration: {
    fontSize: 8,
    color: C.bodyMeta,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  bulletDot: {
    fontSize: 8.5,
    color: C.blue,
    width: 8,
    marginTop: 0.5,
  },
  bulletText: {
    fontSize: 8.5,
    color: C.bodyText,
    flex: 1,
    lineHeight: 1.45,
  },

  // Education
  eduCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: C.cardBg,
    borderRadius: 6,
    padding: 9,
    marginBottom: 5,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  eduDegree: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: C.bodyTitle,
    marginBottom: 2,
  },
  eduSchool: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    color: C.bodyBlue,
  },
  eduYear: {
    fontSize: 8,
    color: C.bodyMeta,
    marginTop: 2,
  },
})

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <View style={s.sectionHeaderRow}>
      <View style={s.sectionIcon} />
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionRule} />
    </View>
  )
}

// ── PDF Document ──────────────────────────────────────────────────────────────
export function ResumePDF({ data, avatarUrl }: { data: ParsedResume & Record<string, unknown>; avatarUrl?: string | null }) {
  const initials = (data.name ?? '')
    .split(' ').filter(Boolean).slice(0, 2)
    .map((w: string) => w[0]).join('').toUpperCase() || '?'

  const currentTitle = data.experience?.[0]?.title ?? null

  return (
    <Document title={`${data.name ?? 'Resume'}`} creator="Find All Job">
      <Page size="A4" style={s.page}>

        {/* ── SIDEBAR ──────────────────────────────────────────────── */}
        <View style={s.sidebar} fixed>

          {/* Avatar */}
          {avatarUrl
            ? <Image src={avatarUrl} style={s.avatarImage} />
            : <View style={s.avatarCircle}><Text style={s.avatarText}>{initials}</Text></View>
          }

          {/* Name + Title */}
          <Text style={s.sideName}>{data.name ?? 'Your Name'}</Text>
          {currentTitle && <Text style={s.sideJobTitle}>{currentTitle}</Text>}

          <View style={s.sideDivider} />

          {/* Contact */}
          <View style={s.sideSection}>
            <Text style={s.sideSectionLabel}>Contact</Text>
            <View style={s.sideSectionRule} />
            {data.phone    && <View style={s.contactRow}><Text style={s.contactBullet}>▸</Text><Text style={s.contactText}>{data.phone}</Text></View>}
            {data.email    && <View style={s.contactRow}><Text style={s.contactBullet}>▸</Text><Text style={s.contactText}>{data.email}</Text></View>}
            {data.location && <View style={s.contactRow}><Text style={s.contactBullet}>▸</Text><Text style={s.contactText}>{data.location}</Text></View>}
          </View>

          {/* Key Skills */}
          {(data.skills?.length ?? 0) > 0 && (
            <View style={s.sideSection}>
              <Text style={s.sideSectionLabel}>Key Skills</Text>
              <View style={s.sideSectionRule} />
              <View style={s.chipsWrap}>
                {(data.skills ?? []).map((skill: string, i: number) => (
                  <Text key={i} style={i < 5 ? s.chipBlue : s.chipSubtle}>{skill}</Text>
                ))}
              </View>
            </View>
          )}

          {/* Certifications */}
          {(data.certifications?.length ?? 0) > 0 && (
            <View style={s.sideSection}>
              <Text style={s.sideSectionLabel}>Certifications</Text>
              <View style={s.sideSectionRule} />
              {(data.certifications ?? []).map((cert: string, i: number) => (
                <View key={i} style={s.certRow}>
                  <Text style={s.certArrow}>▸</Text>
                  <Text style={s.certText}>{cert}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── CONTENT ──────────────────────────────────────────────── */}
        <View style={s.content}>

          {/* Professional Summary */}
          {!!data.summary && (
            <View style={s.section}>
              <SectionHeader title="Professional Summary" />
              <Text style={s.summaryText}>{data.summary}</Text>
            </View>
          )}

          {/* Work Experience */}
          {(data.experience?.length ?? 0) > 0 && (
            <View style={s.section}>
              <SectionHeader title="Work Experience" />
              <View style={s.expList}>
                {(data.experience ?? []).map((exp, i: number) => {
                  const duration = computeDuration(exp.start_date, exp.end_date)
                  return (
                    <View key={i} style={s.expEntry}>
                      {/* Keep title + company header together — never orphan the heading */}
                      <View wrap={false}>
                        <View style={s.expDot}>
                          <View style={s.expDotInner} />
                        </View>
                        <View style={s.expTitleRow}>
                          <Text style={s.expTitle}>{exp.title}</Text>
                          <Text style={s.expDates}>{exp.start_date} – {exp.end_date ?? 'Present'}</Text>
                        </View>
                        <View style={s.expMetaRow}>
                          <Text style={s.expCompany}>{exp.company}</Text>
                          {duration && <Text style={s.expDuration}>· {duration}</Text>}
                        </View>
                      </View>
                      {/* Bullets flow freely across pages */}
                      {(exp.bullets ?? []).map((b: string, j: number) => (
                        <View key={j} style={s.bulletRow} wrap={false}>
                          <Text style={s.bulletDot}>•</Text>
                          <Text style={s.bulletText}>{b}</Text>
                        </View>
                      ))}
                    </View>
                  )
                })}
              </View>
            </View>
          )}

          {/* Education */}
          {(data.education?.length ?? 0) > 0 && (
            <View style={s.section}>
              <SectionHeader title="Education" />
              {(data.education ?? []).map((edu, i: number) => (
                <View key={i} style={s.eduCard} wrap={false}>
                  <View>
                    <Text style={s.eduDegree}>
                      {[edu.degree, edu.field].filter(Boolean).join(' in ')}
                    </Text>
                    <Text style={s.eduSchool}>{edu.school}</Text>
                  </View>
                  <Text style={s.eduYear}>{edu.graduation_year}</Text>
                </View>
              ))}
            </View>
          )}

        </View>
      </Page>
    </Document>
  )
}
