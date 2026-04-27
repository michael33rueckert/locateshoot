'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AuthModal from '@/components/AuthModal'
import TemplatePreview from '@/components/TemplatePreview'
import { LaptopFrame, PhoneFrame } from '@/components/DeviceFrame'
import { PRESETS } from '@/lib/pick-template'
import type { User } from '@supabase/supabase-js'

const HomeMap = dynamic(() => import('@/components/HomeMap'), { ssr: false })

const HOW_STEPS = [
  { num:'01', icon:'📍', title:'Curate your portfolio',        desc:'Save your go-to shoot spots. Upload your own photos.' },
  { num:'02', icon:'🔗', title:'Drop one link in your workflow', desc:'HoneyBook, Dubsado, text — anywhere a URL fits.',       pro:true },
  { num:'03', icon:'🎯', title:'Client picks their spot',       desc:'One tap, name and email. Done.',                         pro:true },
  { num:'04', icon:'🔔', title:'You get notified instantly',    desc:'Email + in-app the moment they pick.',                   pro:true },
]

const SHARE_STEPS = [
  { icon: '🔗', headline: 'You send one link',         body: 'Works in HoneyBook, Dubsado, Calendly, or a text message.' },
  { icon: '🎯', headline: 'Client picks in 30 seconds', body: 'Your curated locations, one tap, done.' },
  { icon: '✉️', headline: 'You get the confirmation',   body: 'Email the moment they pick. No email chains.' },
]

// One feature highlight on the home page. Renders a small product
// mockup at the top (a real component, not a static screenshot) and
// a headline + body below. Stacked layout works the same in the
// auto-fit grid whether there are 2 or 3 cards visible per row.
function FeatureCard({ eyebrow, title, body, mockup }: { eyebrow: string; title: string; body: string; mockup: React.ReactNode }) {
  return (
    <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 2px 10px rgba(26,22,18,.04)' }}>
      <div style={{ background: 'var(--cream)', borderRadius: 8, padding: 12, minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '100%' }}>{mockup}</div>
      </div>
      <div style={{ padding: '0 4px 4px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--gold)', marginBottom: 6 }}>{eyebrow}</div>
        <h3 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 17, fontWeight: 700, color: 'var(--ink)', margin: '0 0 6px', lineHeight: 1.3 }}>{title}</h3>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.55, margin: 0 }}>{body}</p>
      </div>
    </div>
  )
}

// ── Pricing (3 tiers) ─────────────────────────────────────────────────────────
// Three side-by-side cards: Free / Starter / Pro. One monthly/yearly
// toggle at the top drives both paid cards' price strings — keeps the
// two paid cadences visually in sync.
function PricingTiers({ onSignup }: { onSignup: () => void }) {
  const [yearly, setYearly] = useState(false)
  const starterMonthly = '$12'
  const starterYearly  = '$10'   // $120/yr ÷ 12
  const proMonthly     = '$25'
  const proYearly      = '$21'   // $250/yr ÷ 12 ≈ $20.83
  return (
    <>
      {/* Toggle pill — solid white card with shadow so it stands out
          against the cream pricing section. The track color flips
          ink/gold (high contrast) instead of cream-dark (which was
          too subtle to see). */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div onClick={() => setYearly(p => !p)} style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderRadius: 999, background: 'white', border: '1px solid var(--sand)', boxShadow: '0 2px 6px rgba(26,22,18,.08)', cursor: 'pointer' }}>
          <span style={{ fontSize: 13, color: !yearly ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: !yearly ? 600 : 400 }}>Monthly</span>
          <div style={{ width: 44, height: 24, borderRadius: 12, background: yearly ? 'var(--gold)' : 'var(--ink)', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 2, left: yearly ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
          </div>
          <span style={{ fontSize: 13, color: yearly ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: yearly ? 600 : 400 }}>
            Yearly <span style={{ fontSize: 11, color: 'var(--sage)', fontWeight: 700, marginLeft: 2 }}>Save ~16%</span>
          </span>
        </div>
      </div>

      <div className="pricing-grid">
        {/* FREE */}
        <div className="price-card">
          <div className="price-plan">Free</div>
          <div className="price-amount">$0</div>
          <div className="price-period">No credit card required</div>
          <ul className="price-features">
            <li>Auto-generated Portfolio Location Guide</li>
            <li>Up to 5 portfolio locations</li>
            <li>Email when a client picks (sent to you)</li>
            <li>Full access to the location map</li>
            <li>Search by location &amp; category</li>
          </ul>
          <button className="btn btn-dark" style={{ width: '100%', justifyContent: 'center', padding: 12 }} onClick={onSignup}>
            Get started free
          </button>
        </div>

        {/* STARTER — most popular */}
        <div className="price-card is-featured">
          <div className="popular-badge">Most popular</div>
          <div className="price-plan" style={{ color: 'var(--gold)' }}>Starter</div>
          <div className="price-amount">{yearly ? starterYearly : starterMonthly}<span>/mo</span></div>
          <div className="price-period">{yearly ? 'Billed $120/year · cancel anytime' : 'Billed monthly · cancel anytime'}</div>
          <ul className="price-features">
            <li>Everything in Free</li>
            <li><strong>Unlimited Location Guides</strong></li>
            <li><strong>Unlimited portfolio locations</strong></li>
            <li>✉ Client confirmation email with directions</li>
            <li>📌 Pinterest &amp; blog post links per location</li>
            <li>📋 Permit info fields on each location</li>
          </ul>
          <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center', padding: 12 }} onClick={onSignup}>
            Start with Starter
          </button>
          <p className="price-note">Cancel anytime. No contract.</p>
        </div>

        {/* PRO */}
        <div className="price-card">
          <div className="price-plan" style={{ color: 'var(--gold)' }}>Pro</div>
          <div className="price-amount">{yearly ? proYearly : proMonthly}<span>/mo</span></div>
          <div className="price-period">{yearly ? 'Billed $250/year · cancel anytime' : 'Billed monthly · cancel anytime'}</div>
          <ul className="price-features">
            <li>Everything in Starter</li>
            <li>🌐 Custom domain for your Location Guides</li>
            <li>🎨 White-label pages with your own logo</li>
            <li>🖌 Customizable Location Guide templates</li>
            <li>Layout, font &amp; color editor</li>
          </ul>
          <button className="btn btn-dark" style={{ width: '100%', justifyContent: 'center', padding: 12 }} onClick={onSignup}>
            Start 14-day free trial
          </button>
          <p className="price-note">Card required. No charge until day 15.</p>
        </div>
      </div>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HomePage() {
  const [user,          setUser]          = useState<User | null>(null)
  const [authLoading,   setAuthLoading]   = useState(true)
  const [showModal,     setShowModal]     = useState(false)
  const [modalMode,     setModalMode]     = useState<'login' | 'signup'>('login')
  const [toast,         setToast]         = useState<string | null>(null)

  // Auth. Signed-in users visiting home get sent to their dashboard — home is
  // a marketing surface and has no value for them.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) { window.location.replace('/dashboard'); return }
      setUser(null)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.user) { window.location.replace('/dashboard'); return }
      setUser(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(id)
  }, [toast])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setToast('Signed out successfully')
  }

  function openModal(mode: 'login' | 'signup') { setModalMode(mode); setShowModal(true) }
  function scrollTo(id: string) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }

  return (
    <>
      {/* ── NAV ── */}
      <nav className="nav">
        <Link href="/" className="nav-logo">
          <span className="logo-dot" />LocateShoot
        </Link>
        <ul className="nav-links">
          <li><a href="#how"     onClick={e => { e.preventDefault(); scrollTo('how')     }}>How it works</a></li>
          <li><a href="#pricing" onClick={e => { e.preventDefault(); scrollTo('pricing') }}>Pricing</a></li>
        </ul>
        <div className="nav-cta">
          {authLoading ? <div style={{ width: 140 }} /> : user ? (
            <>
              <button className="btn btn-ghost" onClick={handleSignOut}>Sign Out</button>
              <Link href="/dashboard" className="btn btn-gold btn-lg">Dashboard →</Link>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => openModal('login')}>Sign In</button>
              <button className="btn btn-gold"  onClick={() => openModal('signup')}>Join Free</button>
            </>
          )}
        </div>
      </nav>

      {/* ── HERO — full-bleed map background ── */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', overflow: 'hidden', background: '#1a1612' }}>
        {/* Map fills the entire section */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <HomeMap variant="hero" flyTo={null} />
        </div>
        {/* Dark gradient — strong on left for text legibility, fades right */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'linear-gradient(110deg, rgba(26,22,18,.97) 0%, rgba(26,22,18,.88) 45%, rgba(26,22,18,.55) 70%, rgba(26,22,18,.2) 100%)' }} />
        {/* Bottom fade */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, zIndex: 1, background: 'linear-gradient(to top, #1a1612, transparent)' }} />

        {/* Text content */}
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 680, padding: 'clamp(5rem,10vw,7rem) clamp(1.5rem,8vw,8rem) 4rem' }}>
          <div className="hero-eyebrow">Built for working photographers</div>
          <h1 className="hero-title">Let clients <em>pick the spot</em> in one tap.</h1>
          <p className="hero-sub">
            Send one link. They pick a location. You get the email. No more 20-message chains.
          </p>
          <div className="hero-actions">
            {user ? (
              <>
                <Link href="/location-guides" className="btn btn-gold btn-lg">📚 New Location Guide</Link>
                <Link href="/explore"          className="btn btn-ghost btn-lg">Browse the Map</Link>
              </>
            ) : (
              <>
                <button className="btn btn-gold btn-lg"  onClick={() => openModal('signup')}>Join Free — Set Up Your Location Guide</button>
                <button className="btn btn-ghost btn-lg" onClick={() => openModal('login')}>Sign In</button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── CLIENT SHARE WORKFLOW — the headline feature ── */}
      <section className="section share-section" style={{ background: 'var(--cream)', padding: 'clamp(3rem,7vw,5rem) clamp(1.25rem,6vw,4rem)' }}>
        <div className="how-center" style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 2.5rem' }}>
          <div className="section-eyebrow" style={{ justifyContent: 'center' }}>The time-saver</div>
          <h2 className="section-title">Booking a session? <em>Send one link.</em></h2>
          <p className="section-sub" style={{ margin: '0 auto' }}>
            Let your client choose the location. You focus on the shoot.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, maxWidth: 1100, margin: '0 auto' }}>
          {SHARE_STEPS.map((s, i) => (
            <div key={i} style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 14, padding: '1.5rem 1.5rem 1.75rem', boxShadow: '0 2px 10px rgba(26,22,18,.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontFamily: 'var(--font-playfair),serif', fontWeight: 900, fontSize: 13, color: 'var(--gold)' }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontSize: 22 }}>{s.icon}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 19, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.25, marginBottom: 10 }}>{s.headline}</div>
              <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.65, margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
          {user
            ? <Link href="/location-guides" className="btn btn-gold btn-lg">📚 Create your first Location Guide →</Link>
            : <button className="btn btn-gold btn-lg" onClick={() => openModal('signup')}>See how it works — Join free →</button>
          }
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 10 }}>
            Works anywhere you can paste a URL.
          </div>
        </div>
      </section>

      {/* ── DEVICE HERO — real product screenshots in a laptop + phone
             frame so visitors see the actual UI, not just live
             component mockups. Photographer side (laptop) shows the
             Dashboard with portfolio + guides + client picks; client
             side (phone) shows the Pick page they receive. PhoneFrame
             uses a placeholder until the client-side screenshot is
             saved at /marketing/screenshots/pick.png. */}
      <section className="section" style={{ background: 'var(--ink)', padding: '4rem 1.5rem', color: 'var(--cream)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'rgba(196,146,42,.12)', color: 'var(--gold)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>
              See it in action
            </div>
            <h2 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 'clamp(26px,4vw,38px)', fontWeight: 800, lineHeight: 1.15, color: 'var(--cream)', margin: '0 0 12px' }}>
              The whole flow, <em style={{ color: 'var(--gold)' }}>both sides</em>
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(245,240,232,.65)', fontWeight: 300, lineHeight: 1.6, maxWidth: 540, margin: '0 auto' }}>
              Manage your portfolio + Location Guides on the left. Drop one link to your client and they get the polished pick experience on the right.
            </p>
          </div>

          {/* Laptop wide on the left, phone narrow on the right.
              Auto-fit grid stacks them on mobile. */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 2.2fr) minmax(0, 1fr)',
            gap: 32,
            alignItems: 'center',
          }} className="device-hero-grid">
            <div>
              <LaptopFrame
                src="/marketing/screenshots/DashboardScreenshot.png"
                alt="LocateShoot photographer dashboard with portfolio, Location Guides, and client picks"
                caption="Photographer dashboard"
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <PhoneFrame
                src="/marketing/screenshots/PickPageScreenshot1.png"
                alt="A client viewing a Location Guide on their phone"
                caption="What your client sees"
              />
            </div>
          </div>
          <style>{`
            @media (max-width: 768px) {
              .device-hero-grid { grid-template-columns: 1fr !important; }
            }
          `}</style>
        </div>
      </section>

      {/* ── FEATURE HIGHLIGHTS — what the product actually looks like.
             Replaces the old 'community map' block (we no longer accept
             user-contributed locations to the public directory, so the
             framing didn't fit). Each card is a small live mockup
             rendered with real product components — TemplatePreview is
             the same renderer we use inside the editor and on the
             actual Pick page, so what visitors see here is what their
             clients will see. */}
      <section className="section" style={{ background: 'var(--cream)', padding: '4rem 1.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div className="section-eyebrow" style={{ justifyContent: 'center' }}>What you&apos;re shipping</div>
            <h2 className="section-title" style={{ fontSize: 'clamp(24px,4vw,34px)' }}>
              Polished, on-brand, <em>ridiculously easy</em>
            </h2>
            <p className="section-sub" style={{ maxWidth: 540, margin: '0 auto' }}>
              Real product views — exactly what your clients see and what shows up in your dashboard the moment they pick.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>

            {/* Card 1 — Pick page */}
            <FeatureCard
              eyebrow="Client view"
              title="Send one link. They tap a location. Done."
              body="Your client opens a Location Guide, picks a spot, and you get the email. No back-and-forth thread, no Pinterest screenshots."
              mockup={
                <TemplatePreview template={PRESETS[0].config} variant="thumb" studioName="Your Studio" intro="Pick the location for our session" />
              }
            />

            {/* Card 2 — Templates */}
            <FeatureCard
              eyebrow="Pro feature"
              title="Templates that match your brand."
              body="Five starter templates plus a full editor — fonts, colors, layout, header. Save as many as you want and pick one per guide."
              mockup={
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <TemplatePreview template={PRESETS[1].config} variant="thumb" studioName="Studio" intro="Pick your spot" />
                  <TemplatePreview template={PRESETS[2].config} variant="thumb" studioName="Studio" intro="Pick your spot" />
                  <TemplatePreview template={PRESETS[3].config} variant="thumb" studioName="Studio" intro="Pick your spot" />
                  <TemplatePreview template={PRESETS[4].config} variant="thumb" studioName="Studio" intro="Pick your spot" />
                </div>
              }
            />

            {/* Card 3 — Dashboard picks list */}
            <FeatureCard
              eyebrow="Your dashboard"
              title="Every pick, in one chronological log."
              body="Client name, the location they chose, when they picked it. Push notifications and email keep you in the loop."
              mockup={
                <div style={{ background: 'white', border: '1px solid #e8e2d6', borderRadius: 6, overflow: 'hidden', fontSize: 11 }}>
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid #e8e2d6', fontWeight: 700, color: '#1a1612', display: 'flex', alignItems: 'center', gap: 6 }}>
                    ✓ Client Selections
                    <span style={{ padding: '1px 6px', borderRadius: 20, fontSize: 9, fontWeight: 700, background: 'rgba(74,103,65,.1)', color: '#4a6741', border: '1px solid rgba(74,103,65,.2)' }}>3</span>
                  </div>
                  {[
                    { name: 'Sarah Chen',     loc: 'Loose Park',    when: 'Apr 26 · 2:14 PM' },
                    { name: 'James Patel',    loc: 'West Bottoms',  when: 'Apr 25 · 11:08 AM' },
                    { name: 'Emily Rodriguez', loc: 'Liberty Memorial', when: 'Apr 23 · 6:42 PM' },
                  ].map((row, i) => (
                    <div key={i} style={{ padding: '7px 10px', borderBottom: i < 2 ? '1px solid #f0ece4' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#1a1612', fontSize: 11 }}>{row.name}</div>
                        <div style={{ color: '#6b5f52', fontSize: 10 }}>📍 {row.loc}</div>
                      </div>
                      <div style={{ color: '#a89c8d', fontSize: 9, whiteSpace: 'nowrap' }}>{row.when}</div>
                    </div>
                  ))}
                </div>
              }
            />

          </div>

          <div style={{ textAlign: 'center', marginTop: '2.25rem' }}>
            {user
              ? <Link href="/dashboard" className="btn btn-gold btn-lg">Go to your dashboard →</Link>
              : <button className="btn btn-gold btn-lg" onClick={() => openModal('signup')}>Try it free — no card needed →</button>
            }
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="how-section" id="how">
        <div className="how-center">
          <div className="section-eyebrow" style={{ justifyContent: 'center' }}>Simple process</div>
          <h2 className="section-title">Built for how photographers <em>actually work</em></h2>
        </div>
        <div className="how-grid">
          {HOW_STEPS.map(s => (
            <div key={s.num} className="how-card">
              <div className="how-num">{s.num}</div>
              <div className="how-icon">{s.icon}</div>
              <div className="how-title">{s.title}</div>
              <p className="how-desc">{s.desc}{s.pro && <span className="how-pro"> Pro feature.</span>}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="section pricing-section" id="pricing">
        <div className="pricing-center">
          <div className="section-eyebrow" style={{ justifyContent: 'center' }}>Simple, honest pricing</div>
          {/* Title kept on a single phrase per line. <wbr> hint after
              "Starter" lets browsers break there if absolutely needed
              (narrow phones) but won't orphan single words. The
              non-breaking space before "it." prevents that single
              short word from wrapping alone on its own line. */}
          <h2 className="section-title">Free to start.<br /><em>Starter</em> to grow.&nbsp;<em>Pro</em> to brand.</h2>
          <p className="section-sub" style={{ margin: '0 auto', textWrap: 'balance' as any }}>
            Three tiers — start with what fits today, upgrade when you outgrow&nbsp;it.
          </p>
        </div>

        <PricingTiers onSignup={() => openModal('signup')} />
      </section>

      {/* ── COMMUNITY CTA ── */}
      <section className="community-section">
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-gold btn-lg" onClick={() => openModal('signup')}>Create Free Account</button>
          <button className="btn btn-dark btn-lg" onClick={() => scrollTo('pricing')}>See Pro features →</button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="footer-grid">
          <div>
            <div className="footer-brand"><span className="logo-dot" />LocateShoot</div>
            <p className="footer-tagline">A community map of the best photoshoot locations. Built by photographers, for photographers.</p>
          </div>
          <div>
            <div className="footer-heading">Product</div>
            <ul className="footer-links">
              <li><a href="#how" onClick={e => { e.preventDefault(); scrollTo('how') }}>How it works</a></li>
              <li><a href="#pricing" onClick={e => { e.preventDefault(); scrollTo('pricing') }}>Pricing</a></li>
              <li><Link href="/onboarding/how-it-works">Getting Started</Link></li>
            </ul>
          </div>
          <div>
            <div className="footer-heading">Get started</div>
            <ul className="footer-links">
              <li><button onClick={() => openModal('signup')} className="footer-link-btn">Create free account</button></li>
              <li><button onClick={() => openModal('login')}  className="footer-link-btn">Sign in</button></li>
            </ul>
          </div>
          <div>
            <div className="footer-heading">Legal</div>
            <ul className="footer-links">
              <li><Link href="/privacy">Privacy Policy</Link></li>
              <li><Link href="/terms">Terms of Use</Link></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-copy">© {new Date().getFullYear()} LocateShoot.com — All rights reserved.</div>
          <div className="footer-copy">Made for photographers everywhere ●</div>
        </div>
      </footer>

      {showModal && <AuthModal initialMode={modalMode} onClose={() => setShowModal(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}