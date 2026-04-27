import Link from 'next/link'

// Beta-stage privacy policy. Written to be reasonably defensive
// without overpromising. To be reviewed by a real attorney before
// public launch — see the disclaimer banner inside.
//
// Maintained under app/privacy so /privacy resolves to this page
// and existing footer/legal links keep working.

export const metadata = {
  title: 'Privacy Policy — LocateShoot',
  description: 'How LocateShoot collects, uses, and protects your information.',
}

const LAST_UPDATED = 'April 27, 2026'

export default function PrivacyPolicyPage() {
  return (
    <div style={{ minHeight: '100svh', background: 'var(--cream)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>

        <Link href="/" style={{ fontSize: 13, color: 'var(--ink-soft)', textDecoration: 'none', display: 'inline-block', marginBottom: '1.25rem' }}>
          ← Back to home
        </Link>

        <h1 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 'clamp(28px,5vw,40px)', fontWeight: 900, color: 'var(--ink)', lineHeight: 1.15, marginBottom: 6 }}>
          Privacy Policy
        </h1>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: '2rem' }}>
          Last updated: {LAST_UPDATED}
        </div>

        <Section title="1. Who we are">
          <P>LocateShoot is operated by Michael Rueckert (&quot;LocateShoot&quot;, &quot;we&quot;, &quot;us&quot;). This Privacy Policy explains what information we collect when you use locateshoot.com (the &quot;Service&quot;), how we use that information, and the choices you have. By using the Service you agree to this Policy.</P>
        </Section>

        <Section title="2. Information you give us">
          <P>When you create an account, we collect the email address and password you sign up with. If you choose to fill out your photographer profile, we also collect the name, studio name, photo (logo), bio, and contact links you provide.</P>
          <P>When you build your portfolio of locations, you may add: location names, addresses, descriptions, tags, photos, permit notes, and other details about each location. When you create a Location Guide, you may add: the guide name, a message to your client, and your selection of which portfolio locations to include.</P>
          <P>When a client opens a Location Guide you sent them and submits a pick, the client provides: their first name, last name, and email address, plus the location(s) they chose. That information is associated with your account so we can email you the result and you can follow up with the client.</P>
          <P>If you upgrade to a paid plan, payment is processed by Stripe. Stripe collects your payment information directly — we do not see or store your full card number. We do receive a Stripe customer ID, your subscription status, and your billing email so that we can apply the correct plan to your account.</P>
        </Section>

        <Section title="3. Information we collect automatically">
          <P>When you use the Service, our servers automatically log standard request information: your IP address, browser user-agent, the pages you visit, timestamps, and (for clients viewing a Location Guide) approximate session length. We use this for security, debugging, abuse prevention, and to power the &quot;views and time spent&quot; analytics shown to photographers on paid plans.</P>
          <P>We use first-party cookies to keep you signed in and to remember your preferences. We do not use third-party advertising or tracking cookies.</P>
        </Section>

        <Section title="4. How we use your information">
          <P>We use the information we collect to:</P>
          <ul style={listStyle}>
            <li>Provide, maintain, and improve the Service.</li>
            <li>Authenticate you, secure your account, and detect abuse.</li>
            <li>Send transactional emails — sign-up confirmations, password resets, client-pick notifications, billing receipts.</li>
            <li>Show you analytics about how clients are interacting with your Location Guides (paid plans only).</li>
            <li>Respond to support requests and follow up on feedback you submit.</li>
            <li>Process payments and manage subscriptions through Stripe.</li>
            <li>Comply with legal obligations and enforce our Terms of Use.</li>
          </ul>
          <P>We do not sell your personal information. We do not use your data to train machine-learning models.</P>
        </Section>

        <Section title="5. Service providers we share data with">
          <P>To operate the Service, we share limited data with third-party providers who process it on our behalf:</P>
          <ul style={listStyle}>
            <li><strong>Supabase</strong> — database and authentication. Stores your account, profile, portfolio, Location Guides, and client picks.</li>
            <li><strong>Vercel</strong> — application hosting. Processes web requests and serves the Service.</li>
            <li><strong>Stripe</strong> — payments. Receives only the payment data you submit during checkout, plus the customer-billing-email and subscription metadata needed to keep your plan in sync.</li>
            <li><strong>Resend</strong> — transactional email delivery. Receives recipient addresses and email content for the messages we send on your behalf.</li>
            <li><strong>Cloudflare / Vercel CDN</strong> — caching and DDoS mitigation. May log request metadata (IP, user-agent, URL) for security purposes.</li>
          </ul>
          <P>Each of these providers has its own privacy practices and is bound by its own data-processing terms. We use commercially reasonable efforts to choose providers with strong security postures.</P>
        </Section>

        <Section title="6. Public-by-design content">
          <P>Some content you create is intended to be shared publicly. Specifically: when you generate a Location Guide link and share it with a client, anyone with that link can view the locations on that guide. If you have a custom domain configured, the guide is also reachable from that domain. Do not share Location Guide links on public channels (social media, blog posts) unless you intend the contents to be public.</P>
          <P>Locations you contribute to the public &quot;Explore&quot; map are visible to all signed-in photographers. Locations you keep in your private portfolio are visible only to you and to clients you specifically share with.</P>
        </Section>

        <Section title="7. How long we keep your data">
          <P>We keep your account data for as long as your account is active. If you delete your account, we delete your profile, portfolio, Location Guides, client-pick records, and uploaded photos within 30 days, except where we are required by law to retain certain records (for example, payment records for tax purposes).</P>
          <P>Server logs are kept for up to 90 days for security and debugging. Backups may persist for up to 30 days after deletion before being overwritten.</P>
        </Section>

        <Section title="8. Your rights">
          <P>Depending on where you live, you may have rights under privacy laws like the GDPR (Europe), CCPA / CPRA (California), and similar regulations. These typically include the right to:</P>
          <ul style={listStyle}>
            <li>Access the personal information we hold about you.</li>
            <li>Correct or update inaccurate information.</li>
            <li>Delete your information (subject to legal-retention obligations).</li>
            <li>Object to or restrict certain processing.</li>
            <li>Receive a portable copy of your data.</li>
            <li>Withdraw consent for processing that relies on consent.</li>
          </ul>
          <P>To exercise any of these rights, email <A href="mailto:privacy@locateshoot.com">privacy@locateshoot.com</A>. We&apos;ll respond within 30 days. We may need to verify your identity before fulfilling certain requests.</P>
        </Section>

        <Section title="9. Children&apos;s privacy">
          <P>The Service is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided us information, contact us and we will delete it.</P>
        </Section>

        <Section title="10. Security">
          <P>We use industry-standard practices to protect your information — encrypted connections (HTTPS), at-rest encryption with our database provider, scoped access controls, and routine security audits. No system is perfectly secure, however, and we cannot guarantee that unauthorized access will never occur. You are responsible for keeping your password confidential.</P>
        </Section>

        <Section title="11. International transfers">
          <P>Our service providers may process and store your information in the United States or other countries that may have different data-protection laws than your home country. By using the Service you consent to those transfers.</P>
        </Section>

        <Section title="12. Beta status">
          <P>The Service is currently in beta testing. During the beta, we may collect additional diagnostic information (error logs, feature usage) to identify and fix issues. We may also contact you for follow-up about feedback you submit. Anything submitted through the Feedback button may be used to improve the Service. The Service&apos;s features, pricing, and data-handling practices may change as we move out of beta — we will update this Policy and notify you of material changes.</P>
        </Section>

        <Section title="13. Changes to this Policy">
          <P>We may update this Policy from time to time. If we make material changes, we will notify you via email or via a prominent notice on the Service before the changes take effect. The &quot;Last updated&quot; date at the top of this page reflects the most recent revision. Continued use of the Service after the effective date constitutes acceptance of the updated Policy.</P>
        </Section>

        <Section title="14. Contact us">
          <P>Questions about this Policy or about how we handle your data: <A href="mailto:privacy@locateshoot.com">privacy@locateshoot.com</A>.</P>
        </Section>

        <div style={{ marginTop: '2.5rem', padding: '1rem 1.25rem', background: 'rgba(196,146,42,.08)', border: '1px solid rgba(196,146,42,.25)', borderRadius: 8, fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--gold)' }}>Beta disclaimer:</strong> This Privacy Policy is a starting draft for the LocateShoot beta and has not yet been reviewed by an attorney. It is not legal advice. We will publish a finalized version, reviewed by counsel, before exiting beta. If anything in this document conflicts with applicable law, the law controls.
        </div>

      </div>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────

const listStyle: React.CSSProperties = {
  margin: '0 0 1rem 1.5rem',
  padding: 0,
  fontSize: 15,
  color: 'var(--ink)',
  lineHeight: 1.7,
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, color: 'var(--ink)', lineHeight: 1.7 }}>
        {children}
      </div>
    </section>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: '0 0 1rem' }}>{children}</p>
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} style={{ color: 'var(--gold)', textDecoration: 'underline' }}>{children}</a>
}
