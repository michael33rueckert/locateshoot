export default function ComingSoonPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#1a1612',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      textAlign: 'center',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Background glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 60%, rgba(196,146,42,.08) 0%, transparent 65%)',
      }} />

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '3rem' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#c4922a', display: 'inline-block' }} />
        <span style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 'clamp(22px, 4vw, 30px)',
          fontWeight: 900,
          color: '#f5f0e8',
          letterSpacing: '-.01em',
        }}>
          LocateShoot
        </span>
      </div>

      {/* Main headline */}
      <h1 style={{
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: 'clamp(36px, 7vw, 72px)',
        fontWeight: 900,
        lineHeight: 1.05,
        color: '#f5f0e8',
        marginBottom: '1.25rem',
        maxWidth: 700,
      }}>
        The perfect location<br />
        <em style={{ color: '#c4922a', fontStyle: 'italic' }}>for your next session</em>
      </h1>

      <p style={{
        fontSize: 'clamp(15px, 2.5vw, 19px)',
        color: 'rgba(245,240,232,.5)',
        fontWeight: 300,
        lineHeight: 1.7,
        maxWidth: 520,
        marginBottom: '2.5rem',
      }}>
        We&apos;re building a community-powered map of photoshoot locations —
        curated by photographers, for photographers.
      </p>

      {/* Feature list */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        marginBottom: '3rem',
        textAlign: 'left',
        maxWidth: 360,
        width: '100%',
      }}>
        {[
          { icon: '📍', text: 'Discover public & private shoot locations near you' },
          { icon: '🔗', text: 'Send clients a link to pick their favorite spot' },
          { icon: '🤫', text: 'Save your own secret hidden gems' },
          { icon: '⭐', text: 'Community ratings from real photographers' },
        ].map(item => (
          <div key={item.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
            <span style={{ fontSize: 'clamp(13px, 2vw, 15px)', color: 'rgba(245,240,232,.55)', fontWeight: 300, lineHeight: 1.5 }}>
              {item.text}
            </span>
          </div>
        ))}
      </div>

      {/* Email signup */}
      <div style={{ width: '100%', maxWidth: 420, marginBottom: '2rem' }}>
        <div style={{ fontSize: 13, color: 'rgba(245,240,232,.4)', marginBottom: 10 }}>
          Get notified when we launch
        </div>
        <div style={{
          display: 'flex', gap: 8,
          flexDirection: 'column',
        }}>
          <input
            type="email"
            placeholder="your@email.com"
            style={{
              padding: '13px 16px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,.12)',
              background: 'rgba(255,255,255,.07)',
              color: '#f5f0e8',
              fontFamily: 'inherit',
              fontSize: 15,
              outline: 'none',
              width: '100%',
            }}
          />
          <button style={{
            padding: '13px 24px',
            borderRadius: 6,
            background: '#c4922a',
            color: '#1a1612',
            border: 'none',
            fontFamily: 'inherit',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
          }}>
            Notify me →
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(245,240,232,.2)', marginTop: 8 }}>
          No spam. Unsubscribe any time.
        </div>
      </div>

      {/* Footer */}
      <div style={{ fontSize: 12, color: 'rgba(245,240,232,.2)', marginTop: '2rem' }}>
        © {new Date().getFullYear()} LocateShoot · Built for photographers
      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder { color: rgba(245,240,232,.25); }
        @media (min-width: 480px) {
          .email-row { flex-direction: row !important; }
          .email-row input { flex: 1; }
          .email-row button { width: auto !important; }
        }
      `}</style>
    </div>
  )
}