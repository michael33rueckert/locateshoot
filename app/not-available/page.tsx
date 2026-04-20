export default function NotAvailablePage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#1a1612',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'sans-serif',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <div>
        <div style={{
          fontFamily: 'Georgia, serif',
          fontSize: 28,
          fontWeight: 700,
          color: '#f5f0e8',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c4922a', display: 'inline-block' }} />
          LocateShoot
        </div>
        <h1 style={{ fontSize: 22, color: '#f5f0e8', fontWeight: 600, marginBottom: '0.75rem' }}>
          Not available in your region
        </h1>
        <p style={{ fontSize: 15, color: 'rgba(245,240,232,0.5)', maxWidth: 400, lineHeight: 1.6, margin: '0 auto' }}>
          LocateShoot is currently only available in the United States.
          We&apos;re working on expanding — check back soon.
        </p>
      </div>
    </div>
  )
}