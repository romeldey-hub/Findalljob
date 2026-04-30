import type { OptimizedResumeData } from '@/lib/ai/optimizer'

export function ResumePreview({ data }: { data: OptimizedResumeData }) {
  const contacts = [data.email, data.phone, data.location, data.linkedin].filter(Boolean)

  return (
    <div
      className="bg-white text-gray-900 mx-auto shadow-xl"
      style={{
        width: '210mm',
        minHeight: '297mm',
        padding: '40px 48px',
        fontFamily: 'Helvetica, Arial, sans-serif',
        fontSize: '9.5pt',
        lineHeight: 1.45,
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1
          style={{
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontSize: 26,
            fontWeight: 700,
            color: '#1e3a8a',
            letterSpacing: 0.4,
            margin: 0,
            marginBottom: 5,
          }}
        >
          {data.name}
        </h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 3 }}>
          {contacts.map((c, i) => (
            <span key={i} style={{ fontSize: '8.5pt', color: '#6b7280' }}>
              {c}
            </span>
          ))}
        </div>
        <div style={{ height: 2, backgroundColor: '#1e3a8a', marginTop: 10 }} />
      </div>

      {/* Summary */}
      {!!data.summary && (
        <Section title="Professional Summary">
          <p style={{ fontSize: '9.5pt', color: '#374151', lineHeight: 1.55, margin: 0 }}>
            {data.summary}
          </p>
        </Section>
      )}

      {/* Experience */}
      {data.experience?.length > 0 && (
        <Section title="Experience">
          {data.experience.map((exp, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 1 }}>
                <span style={{ fontWeight: 700, fontSize: 10, color: '#111827' }}>{exp.title}</span>
                <span style={{ fontSize: '8.5pt', color: '#6b7280', whiteSpace: 'nowrap', marginLeft: 8 }}>
                  {exp.start_date} – {exp.end_date}
                </span>
              </div>
              <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 4 }}>
                {exp.company}{exp.location ? `  ·  ${exp.location}` : ''}
              </div>
              {exp.bullets?.map((b, j) => (
                <div key={j} style={{ display: 'flex', marginBottom: 2, paddingLeft: 2 }}>
                  <span style={{ fontSize: 9, color: '#1e3a8a', marginRight: 6, marginTop: 1, width: 8, flexShrink: 0 }}>▸</span>
                  <span style={{ fontSize: 9, color: '#374151', lineHeight: 1.45 }}>{b}</span>
                </div>
              ))}
            </div>
          ))}
        </Section>
      )}

      {/* Skills */}
      {data.skills?.length > 0 && (
        <Section title="Skills">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {data.skills.map((s, i) => (
              <span
                key={i}
                style={{
                  backgroundColor: '#f1f5f9',
                  padding: '2.5px 8px',
                  borderRadius: 4,
                  fontSize: '8.5pt',
                  color: '#111827',
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Education */}
      {data.education?.length > 0 && (
        <Section title="Education">
          {data.education.map((edu, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '9.5pt', color: '#111827' }}>
                  {[edu.degree, edu.field].filter(Boolean).join(' in ')}
                </div>
                <div style={{ fontSize: 9, color: '#6b7280', marginTop: 1 }}>{edu.school}</div>
              </div>
              <div style={{ fontSize: '8.5pt', color: '#6b7280', textAlign: 'right', marginTop: 1, whiteSpace: 'nowrap', marginLeft: 8 }}>
                {edu.graduation_year}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Certifications */}
      {data.certifications?.length > 0 && (
        <Section title="Certifications">
          {data.certifications.map((cert, i) => (
            <div key={i} style={{ display: 'flex', marginBottom: 2 }}>
              <span style={{ fontSize: 9, color: '#1e3a8a', marginRight: 6, width: 8, flexShrink: 0 }}>▸</span>
              <span style={{ fontSize: 9, color: '#374151' }}>{cert}</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontWeight: 700,
          fontSize: '8.5pt',
          color: '#1e3a8a',
          textTransform: 'uppercase',
          letterSpacing: 1.4,
          marginBottom: 7,
          paddingBottom: 3,
          borderBottom: '0.75px solid #e2e8f0',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}
