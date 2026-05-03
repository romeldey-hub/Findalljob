import type { ParsedResume } from '@/types'

const C = {
  sidebarBg:    '#0F172A',
  sidebarLine:  '#1E293B',
  sideLabel:    '#60A5FA',
  sideText:     '#CBD5E1',
  blue:         '#2563EB',
  blueChipBg:   '#1D3461',
  blueChipText: '#93C5FD',
  subtleChipBg: '#1A2942',
  subtleChipText:'#D1D5DB',
  bodyTitle:    '#0F172A',
  bodyBlue:     '#2563EB',
  bodyMeta:     '#9CA3AF',
  bodyText:     '#4B5563',
  border:       '#E5E7EB',
  cardBg:       '#F8FAFC',
  white:        '#FFFFFF',
}

function computeDuration(start: string, end: string | null | undefined): string {
  const yr = (s: string) => { const m = s.match(/\b(19|20)\d{2}\b/); return m ? parseInt(m[0]) : 0 }
  const sy = yr(start)
  if (!sy) return ''
  const ey = end ? (yr(end) || new Date().getFullYear()) : new Date().getFullYear()
  const d = ey - sy
  return d <= 0 ? '< 1 yr' : `${d} yr${d > 1 ? 's' : ''}`
}

function SectionHead({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
      <div style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: C.blue, flexShrink: 0 }} />
      <span style={{ fontSize: '7pt', fontWeight: 700, color: C.bodyTitle, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
        {title}
      </span>
      <div style={{ flex: 1, height: 1, backgroundColor: C.border }} />
    </div>
  )
}

function SideSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: '7pt', fontWeight: 700, color: C.sideLabel, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ height: 1, backgroundColor: C.sidebarLine, marginBottom: 6 }} />
      {children}
    </div>
  )
}

function ContactLine({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', marginBottom: 4, gap: 5, alignItems: 'flex-start' }}>
      <span style={{ fontSize: '7pt', color: C.sideLabel, flexShrink: 0, marginTop: 1 }}>▸</span>
      <span style={{ fontSize: '7pt', color: C.sideText, lineHeight: 1.4 }}>{children}</span>
    </div>
  )
}

// ── ResumePrintView ───────────────────────────────────────────────────────────
// A4-sized (210mm × 297mm) inline-styled component captured by html-to-image.
// overflow:hidden on both columns guarantees exactly 1 page — no blank pages.
export function ResumePrintView({
  data,
  avatarUrl,
}: {
  data: ParsedResume
  avatarUrl?: string | null
}) {
  const initials = (data.name ?? '')
    .split(' ').filter(Boolean).slice(0, 2)
    .map((w: string) => w[0]).join('').toUpperCase() || '?'

  const currentTitle = data.experience?.[0]?.title ?? null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      width: 794,
      height: 1123,
      fontFamily: 'Helvetica, Arial, sans-serif',
      backgroundColor: C.white,
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>

      {/* ── SIDEBAR ──────────────────────────────────────────────── */}
      <div style={{
        width: 257,
        flexShrink: 0,
        backgroundColor: C.sidebarBg,
        padding: '18pt 14pt',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}>

        {/* Avatar */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          {avatarUrl
            ? <img src={avatarUrl} alt="" style={{ width: 52, height: 52, borderRadius: 26, objectFit: 'cover' }} />
            : <div style={{
                width: 52, height: 52, borderRadius: 26,
                backgroundColor: C.blue,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18pt', fontWeight: 700, color: C.white,
              }}>{initials}</div>
          }
        </div>

        {/* Name + Title */}
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: '11pt', fontWeight: 700, color: C.white, lineHeight: 1.3 }}>
            {data.name ?? 'Your Name'}
          </div>
          {currentTitle && (
            <div style={{ fontSize: '8pt', color: C.sideLabel, marginTop: 3, lineHeight: 1.3 }}>
              {currentTitle}
            </div>
          )}
        </div>

        <div style={{ height: 1, backgroundColor: C.sidebarLine, marginBottom: 10 }} />

        {/* Contact */}
        <SideSection label="Contact">
          {data.phone    && <ContactLine>{data.phone}</ContactLine>}
          {data.email    && <ContactLine>{data.email}</ContactLine>}
          {data.location && <ContactLine>{data.location}</ContactLine>}
        </SideSection>

        {/* Key Skills */}
        {(data.skills?.length ?? 0) > 0 && (
          <SideSection label="Key Skills">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {(data.skills ?? []).map((skill: string, i: number) => (
                <span key={i} style={{
                  padding: '2pt 5pt',
                  borderRadius: 3,
                  fontSize: '7pt',
                  backgroundColor: i < 5 ? C.blueChipBg : C.subtleChipBg,
                  color: i < 5 ? C.blueChipText : C.subtleChipText,
                  marginBottom: 2,
                }}>
                  {skill}
                </span>
              ))}
            </div>
          </SideSection>
        )}

        {/* Certifications */}
        {(data.certifications?.length ?? 0) > 0 && (
          <SideSection label="Certifications">
            {(data.certifications ?? []).map((cert: string, i: number) => (
              <ContactLine key={i}>{cert}</ContactLine>
            ))}
          </SideSection>
        )}

      </div>

      {/* ── CONTENT ──────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        backgroundColor: C.white,
        padding: '18pt 20pt',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}>

        {/* Professional Summary */}
        {!!data.summary && (
          <div style={{ marginBottom: 13 }}>
            <SectionHead title="Professional Summary" />
            <p style={{ fontSize: '8.5pt', color: C.bodyText, lineHeight: 1.55, margin: 0 }}>
              {data.summary}
            </p>
          </div>
        )}

        {/* Work Experience */}
        {(data.experience?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 13 }}>
            <SectionHead title="Work Experience" />
            <div style={{ paddingLeft: 14 }}>
              {(data.experience ?? []).map((exp, i: number) => {
                const duration = computeDuration(exp.start_date, exp.end_date)
                return (
                  <div key={i} style={{ marginBottom: 9, position: 'relative' }}>
                    {/* Timeline dot */}
                    <div style={{
                      position: 'absolute', left: -14, top: 2,
                      width: 9, height: 9, borderRadius: 5,
                      backgroundColor: C.blue,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: C.white }} />
                    </div>
                    {/* Title + Dates */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 1 }}>
                      <span style={{ fontSize: '9pt', fontWeight: 700, color: C.bodyTitle }}>{exp.title}</span>
                      <span style={{ fontSize: '7.5pt', color: C.bodyMeta, whiteSpace: 'nowrap', marginLeft: 6 }}>
                        {exp.start_date} – {exp.end_date ?? 'Present'}
                      </span>
                    </div>
                    {/* Company + Duration */}
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: '8pt', fontWeight: 700, color: C.bodyBlue }}>{exp.company}</span>
                      {duration && <span style={{ fontSize: '7.5pt', color: C.bodyMeta }}>· {duration}</span>}
                    </div>
                    {/* Bullets */}
                    {(exp.bullets ?? []).map((b: string, j: number) => (
                      <div key={j} style={{ display: 'flex', marginBottom: 2 }}>
                        <span style={{ fontSize: '8pt', color: C.blue, width: 8, flexShrink: 0, marginTop: 1 }}>•</span>
                        <span style={{ fontSize: '8pt', color: C.bodyText, lineHeight: 1.45 }}>{b}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Education */}
        {(data.education?.length ?? 0) > 0 && (
          <div>
            <SectionHead title="Education" />
            {(data.education ?? []).map((edu, i: number) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                backgroundColor: C.cardBg, borderRadius: 5,
                padding: '7pt 8pt', marginBottom: 4,
                border: `0.5px solid ${C.border}`,
                boxSizing: 'border-box',
              }}>
                <div>
                  <div style={{ fontSize: '8.5pt', fontWeight: 700, color: C.bodyTitle, marginBottom: 2 }}>
                    {[edu.degree, edu.field].filter(Boolean).join(' in ')}
                  </div>
                  <div style={{ fontSize: '8pt', fontWeight: 700, color: C.bodyBlue }}>{edu.school}</div>
                </div>
                <div style={{ fontSize: '7.5pt', color: C.bodyMeta, whiteSpace: 'nowrap', marginLeft: 8, marginTop: 2 }}>
                  {edu.graduation_year}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
