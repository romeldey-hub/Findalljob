import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt     = 'FindAllJob — Apply smarter with AI-powered job matching'
export const size    = { width: 1200, height: 630 }
export const contentType = 'image/png'

const LOGO_B64 = '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'

export default function Image() {
  const logoSrc = `data:image/png;base64,${LOGO_B64}`
  return new ImageResponse(
    (
      <div
        style={{
          width:           '1200px',
          height:          '630px',
          display:         'flex',
          flexDirection:   'column',
          alignItems:      'center',
          justifyContent:  'center',
          background:      'linear-gradient(135deg, #040D21 0%, #0A1628 60%, #0D1F40 100%)',
          position:        'relative',
          overflow:        'hidden',
          fontFamily:      'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Background glow top-left */}
        <div
          style={{
            position:     'absolute',
            top:          '-120px',
            left:         '-80px',
            width:        '500px',
            height:       '500px',
            borderRadius: '50%',
            background:   'radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)',
          }}
        />
        {/* Background glow bottom-right */}
        <div
          style={{
            position:     'absolute',
            bottom:       '-100px',
            right:        '-80px',
            width:        '500px',
            height:       '500px',
            borderRadius: '50%',
            background:   'radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 70%)',
          }}
        />

        {/* Logo icon + wordmark row */}
        <div
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '20px',
            marginBottom: '36px',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            width={80}
            height={80}
            style={{ display: 'flex' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0px' }}>
            <span
              style={{
                fontSize:      '56px',
                fontWeight:    '900',
                color:         '#ffffff',
                lineHeight:    '1',
                letterSpacing: '-0.03em',
              }}
            >
              FindAll
            </span>
            <span
              style={{
                fontSize:      '56px',
                fontWeight:    '900',
                color:         '#60A5FA',
                lineHeight:    '1',
                letterSpacing: '-0.03em',
              }}
            >
              Job
            </span>
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            width:        '80px',
            height:       '3px',
            background:   'linear-gradient(90deg, #3B82F6, #60A5FA)',
            borderRadius: '2px',
            marginBottom: '36px',
          }}
        />

        {/* Headline */}
        <div
          style={{
            fontSize:      '38px',
            fontWeight:    '800',
            color:         '#ffffff',
            lineHeight:    '1.15',
            textAlign:     'center',
            letterSpacing: '-0.02em',
            marginBottom:  '24px',
            maxWidth:      '820px',
          }}
        >
          Apply smarter with AI-powered job matching
        </div>

        {/* Sub-copy */}
        <div
          style={{
            fontSize:     '20px',
            fontWeight:   '400',
            color:        '#94A3B8',
            textAlign:    'center',
            lineHeight:   '1.55',
            maxWidth:     '760px',
          }}
        >
          Upload your resume · Find better-fit jobs · Improve your resume · Prepare for interviews
        </div>

        {/* Bottom badge */}
        <div
          style={{
            display:         'flex',
            alignItems:      'center',
            gap:             '8px',
            marginTop:       '44px',
            background:      'rgba(59,130,246,0.12)',
            border:          '1px solid rgba(59,130,246,0.30)',
            borderRadius:    '50px',
            padding:         '10px 28px',
          }}
        >
          <div
            style={{
              width:        '8px',
              height:       '8px',
              borderRadius: '50%',
              background:   '#60A5FA',
            }}
          />
          <span
            style={{
              fontSize:   '16px',
              fontWeight: '600',
              color:      '#93C5FD',
              letterSpacing: '0.01em',
            }}
          >
            findalljob.com
          </span>
        </div>
      </div>
    ),
    { ...size },
  )
}
