import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt     = 'FindAllJob — Apply smarter with AI-powered job matching'
export const size    = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const logoData = await fetch('https://www.findalljob.com/icon.png').then(r => r.arrayBuffer())

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
            src={logoData as unknown as string}
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
