export default function ComingSoonPage() {
  return (
    <>
      <style>{`
        html, body { margin: 0; padding: 0; background: #1a1612; }
        * { box-sizing: border-box; }
      `}</style>

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '2rem', position: 'relative', zIndex: 1 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#c4922a', display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 900, color: '#f5f0e8', letterSpacing: '-.01em' }}>
            LocateShoot
          </span>
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 'clamp(36px, 7vw, 68px)',
          fontWeight: 900,
          lineHeight: 1.05,
          color: '#f5f0e8',
          marginBottom: '1.25rem',
          maxWidth: 640,
          position: 'relative',
          zIndex: 1,
        }}>
          Something beautiful<br />
          <em style={{ color: '#c4922a', fontStyle: 'italic' }}>is coming soon</em>
        </h1>

        <p style={{
          fontSize: 'clamp(15px, 2.5vw, 18px)',
          color: 'rgba(245,240,232,.45)',
          fontWeight: 300,
          lineHeight: 1.7,
          maxWidth: 420,
          marginBottom: '3rem',
          position: 'relative',
          zIndex: 1,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          We&apos;re putting the finishing touches on something made for photographers.
          Check back soon.
        </p>

        {/* Footer */}
        <div style={{
          fontSize: 12,
          color: 'rgba(245,240,232,.2)',
          position: 'relative',
          zIndex: 1,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          © {new Date().getFullYear()} LocateShoot
        </div>
      </div>
    </>
  )
}