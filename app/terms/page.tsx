import Link from 'next/link'

// Beta-stage Terms of Use. Written to be reasonably defensive
// without overpromising. To be reviewed by a real attorney before
// public launch — see the disclaimer banner inside.

export const metadata = {
  title: 'Terms of Use — LocateShoot',
  description: 'The terms governing your use of LocateShoot.',
}

const LAST_UPDATED = 'April 27, 2026'

export default function TermsOfUsePage() {
  return (
    <div style={{ minHeight: '100svh', background: 'var(--cream)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>

        <Link href="/" style={{ fontSize: 13, color: 'var(--ink-soft)', textDecoration: 'none', display: 'inline-block', marginBottom: '1.25rem' }}>
          ← Back to home
        </Link>

        <h1 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 'clamp(28px,5vw,40px)', fontWeight: 900, color: 'var(--ink)', lineHeight: 1.15, marginBottom: 6 }}>
          Terms of Use
        </h1>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: '2rem' }}>
          Last updated: {LAST_UPDATED}
        </div>

        <P style={{ marginBottom: '1.5rem', fontStyle: 'italic' }}>
          Please read these Terms carefully before using LocateShoot. They are a binding agreement between you and us. If you do not agree, do not use the Service.
        </P>

        <Section title="1. Acceptance">
          <P>These Terms of Use (&quot;Terms&quot;) govern your access to and use of locateshoot.com and the LocateShoot service (the &quot;Service&quot;), operated by LocateShoot (&quot;we&quot;, &quot;us&quot;). By creating an account, accessing, or using the Service, you agree to these Terms and to our <A href="/privacy">Privacy Policy</A>. If you are using the Service on behalf of an organization, you represent that you have authority to bind that organization.</P>
        </Section>

        <Section title="2. Eligibility">
          <P>You must be at least 18 years old (or the age of majority in your jurisdiction) to create an account. The Service is intended for use by professional photographers, videographers, and content creators.</P>
        </Section>

        <Section title="3. Your account">
          <P>You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You agree to notify us immediately of any unauthorized use. We are not liable for any loss or damage arising from your failure to keep your credentials secure.</P>
          <P>You may close your account at any time. Upon closure, your data is deleted as described in the <A href="/privacy">Privacy Policy</A>.</P>
        </Section>

        <Section title="4. Plans, billing, and trials">
          <P>The Service offers Free, Starter, and Pro plans with different feature sets and quotas. Paid plans are billed monthly or yearly through Stripe and renew automatically until cancelled. The Pro plan includes a 14-day free trial that requires a payment method at signup; you will not be charged until the trial ends.</P>
          <P>You may cancel a paid plan at any time through your Profile &gt; Billing tab or by emailing <A href="mailto:billing@locateshoot.com">billing@locateshoot.com</A>. Cancellation takes effect at the end of the current billing period. Except as required by applicable law, fees already paid are non-refundable.</P>
          <P>We reserve the right to change pricing, add or remove features, or modify plan quotas with reasonable notice. Continued use of the Service after a price change constitutes acceptance of the new pricing.</P>
        </Section>

        <Section title="5. Acceptable use">
          <P>You agree not to:</P>
          <ul style={listStyle}>
            <li>Use the Service for any unlawful purpose or in violation of these Terms.</li>
            <li>Upload or share content that is illegal, infringing, defamatory, harassing, hateful, or sexually explicit.</li>
            <li>Upload content that depicts identifiable people without the consent required by law.</li>
            <li>Attempt to access another user&apos;s account, data, or non-public APIs.</li>
            <li>Reverse-engineer, decompile, or attempt to extract the source code of the Service except to the extent expressly permitted by law.</li>
            <li>Use automated tools (scrapers, bots, crawlers) to access the Service or its data, except for documented public APIs and within published rate limits.</li>
            <li>Interfere with or disrupt the Service, servers, or networks connected to the Service.</li>
            <li>Use the Service to send spam, phishing emails, or other unsolicited communications.</li>
            <li>Resell, sublicense, or redistribute the Service to third parties without our written permission.</li>
          </ul>
          <P>We may suspend or terminate your account for violations of this section without prior notice.</P>
        </Section>

        <Section title="6. Your content">
          <P>You retain all ownership rights in the content you upload to the Service — your photos, location descriptions, Location Guides, and other materials (&quot;Your Content&quot;). By uploading Your Content, you grant LocateShoot a worldwide, non-exclusive, royalty-free license to host, store, display, and transmit Your Content solely for the purpose of operating and providing the Service to you and to people you share Location Guides with.</P>
          <P>You represent and warrant that: (a) you own Your Content or have all rights necessary to upload it, (b) Your Content does not violate any law, third-party right, or these Terms, and (c) where Your Content depicts real people, you have any consents required to display those depictions.</P>
          <P>We do not claim ownership of Your Content. We do not use Your Content to train machine-learning models. We do not display Your Content publicly except where you have explicitly chosen to share it (for example, by adding it to a Location Guide and sharing the link).</P>
        </Section>

        <Section title="7. Locations submitted to the public Explore map">
          <P>If you contribute a location to the public &quot;Explore&quot; map (rather than keeping it in your private portfolio), you grant LocateShoot and other photographers using the Service a perpetual, non-exclusive, royalty-free license to display, reference, and copy that location entry (location name, coordinates, description, tags, public-photo, and similar metadata) within the Service. Submitted location entries may be moderated, edited, or removed at our discretion.</P>
          <P>You are responsible for accuracy and for confirming any access, parking, or permit information you submit. LocateShoot does not verify access rights for any location and does not guarantee the accuracy of permit, fee, parking, or access details.</P>
        </Section>

        <Section title="8. Permits, access, and on-site responsibility">
          <P><strong>The Service is informational only.</strong> Location entries may include notes about permits, fees, parking, and access — but those details are user-submitted and may be incomplete, outdated, or wrong. You are solely responsible for verifying access rights and obtaining required permits before any photo or video shoot. LocateShoot is not responsible for permit violations, trespass claims, fines, property damage, injuries, or any other consequences arising from your visit to or use of any location.</P>
          <P>If you are a photographer using LocateShoot to share a location with a client, you are responsible for advising your client of any access, safety, or permit considerations. The fact that a location appears on a Location Guide is not a representation that the location is safe, accessible, or open to the public at any given time.</P>
        </Section>

        <Section title="9. DMCA / copyright">
          <P>If you believe content on the Service infringes your copyright, send a written notice to <A href="mailto:dmca@locateshoot.com">dmca@locateshoot.com</A> including: (a) identification of the copyrighted work, (b) identification of the allegedly infringing material with enough detail to locate it, (c) your contact info, (d) a statement of good-faith belief that the use is not authorized, (e) a statement under penalty of perjury that you are the owner or authorized to act, and (f) your physical or electronic signature. We will respond consistent with the DMCA, including by removing or disabling access to allegedly infringing material.</P>
        </Section>

        <Section title="10. Service availability and beta status">
          <P>The Service is currently in <strong>beta</strong>. Features may break, change, or be removed without notice. We may take the Service offline for maintenance, debugging, or to roll back changes. Beta status may end at any time, after which different terms (including different pricing and feature gates) may apply.</P>
          <P>Outside the beta period, we use commercially reasonable efforts to keep the Service available, but we do not guarantee uptime or freedom from errors. The Service is provided &quot;as is&quot; (see Section 11).</P>
        </Section>

        <Section title="11. Disclaimer of warranties">
          <P>THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE,&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY LAW, LOCATESHOOT DISCLAIMS ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ANY WARRANTIES ARISING FROM COURSE OF DEALING OR USAGE OF TRADE. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR THAT INFORMATION ON THE SERVICE (INCLUDING LOCATION, PERMIT, AND ACCESS DETAILS) IS ACCURATE, COMPLETE, OR CURRENT.</P>
        </Section>

        <Section title="12. Limitation of liability">
          <P>TO THE FULLEST EXTENT PERMITTED BY LAW, IN NO EVENT WILL LOCATESHOOT OR ITS OFFICERS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE — REGARDLESS OF WHETHER THE CLAIM IS BASED IN CONTRACT, TORT (INCLUDING NEGLIGENCE), STATUTE, OR OTHERWISE, AND EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</P>
          <P>OUR TOTAL CUMULATIVE LIABILITY UNDER THESE TERMS WILL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU HAVE PAID US IN THE 12 MONTHS PRECEDING THE CLAIM, OR (B) USD $100. SOME JURISDICTIONS DO NOT ALLOW THE LIMITATIONS IN THIS SECTION; THOSE LIMITATIONS APPLY TO THE FULLEST EXTENT PERMITTED BY LAW.</P>
        </Section>

        <Section title="13. Indemnification">
          <P>You agree to indemnify and hold harmless LocateShoot, its officers, employees, and agents from any claim, demand, loss, or expense (including reasonable attorneys&apos; fees) arising out of: (a) Your Content, (b) your use of the Service, (c) your violation of these Terms, or (d) your violation of any third-party right (including any access, permit, or property right at any location you visit or share).</P>
        </Section>

        <Section title="14. Termination">
          <P>You may stop using the Service and delete your account at any time. We may suspend or terminate your access to the Service at any time, with or without cause, and with or without notice — for example, for violations of these Terms or for non-payment.</P>
          <P>Upon termination: your right to use the Service ends; we will delete your data as described in the <A href="/privacy">Privacy Policy</A>; sections of these Terms that by their nature should survive termination (including disclaimers, limitations of liability, indemnification, and dispute-resolution provisions) will survive.</P>
        </Section>

        <Section title="15. Changes to these Terms">
          <P>We may revise these Terms from time to time. If we make material changes, we will notify you via email or a prominent notice on the Service before the changes take effect. The &quot;Last updated&quot; date above reflects the most recent revision. Continued use of the Service after the effective date constitutes acceptance of the revised Terms.</P>
        </Section>

        <Section title="16. Governing law and dispute resolution">
          <P>These Terms are governed by the laws of the State of Missouri, USA, without regard to its conflict-of-laws principles. The exclusive venue for any dispute will be the state or federal courts located in Buchanan County, Missouri, and you consent to the personal jurisdiction of those courts.</P>
        </Section>

        <Section title="17. General">
          <P>These Terms (together with our Privacy Policy) are the entire agreement between you and LocateShoot regarding the Service. If any provision is held unenforceable, the remaining provisions remain in effect. Our failure to enforce a right is not a waiver of that right. You may not assign these Terms without our prior written consent; we may assign these Terms in connection with a merger, acquisition, or sale of substantially all of our assets.</P>
        </Section>

        <Section title="18. Contact us">
          <P>Questions about these Terms: <A href="mailto:legal@locateshoot.com">legal@locateshoot.com</A>.</P>
        </Section>

        <div style={{ marginTop: '2.5rem', padding: '1rem 1.25rem', background: 'rgba(196,146,42,.08)', border: '1px solid rgba(196,146,42,.25)', borderRadius: 8, fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--gold)' }}>Beta disclaimer:</strong> These Terms of Use are a starting draft for the LocateShoot beta and have not yet been reviewed by an attorney. They are not legal advice. We will publish a finalized version, reviewed by counsel, before exiting beta. If anything in this document conflicts with applicable law, the law controls.
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

function P({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <p style={{ margin: '0 0 1rem', ...(style ?? {}) }}>{children}</p>
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} style={{ color: 'var(--gold)', textDecoration: 'underline' }}>{children}</a>
}
