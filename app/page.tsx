'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AuthModal from '@/components/AuthModal'
import TemplatePreview from '@/components/TemplatePreview'
import { LaptopFrame, PhoneFrame } from '@/components/DeviceFrame'
import { DEFAULT_TEMPLATE, type LayoutKind } from '@/lib/pick-template'
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

        {/* 1/2/3 grid — auto-fit was breaking down to 2 cols around
            tablet width (Pixel Fold inner ~900px), leaving the third
            card alone on row 2. Use a fixed 3-col grid above 768px so
            the row stays intact, and stack to a single column on
            phones for legibility. */}
        <div className="share-steps-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, maxWidth: 1100, margin: '0 auto' }}>
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
        <style>{`
          @media (max-width: 768px) {
            .share-steps-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>

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
                src="/marketing/screenshots/LocationGuidePhoneScreenshot.png"
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

      {/* ── WHAT'S INSIDE A LOCATION GUIDE — 4-bullet expansion of
             the high-level "send a link" pitch above. Sits right
             after the device-hero screenshots so the reader has a
             visual anchor for what these features look like in
             practice. 2x2 grid on desktop, single column on mobile. */}
      <section className="section" style={{ background: 'var(--cream)', padding: 'clamp(3rem,7vw,4.5rem) clamp(1.25rem,6vw,4rem)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div className="section-eyebrow" style={{ justifyContent: 'center' }}>What&apos;s inside a Location Guide</div>
            <h2 className="section-title">More than a list — <em>everything</em> they need to pick.</h2>
          </div>
          <div className="feature-bullets-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.75rem 2.5rem' }}>
            {[
              {
                icon: '🔗',
                title: 'One branded link, sent anywhere you already work',
                body: 'Drop it into HoneyBook, Dubsado, Calendly, or a text — anywhere a URL fits. Your client opens it and sees your curated locations under your logo, colors, and font.',
              },
              {
                icon: '📸',
                title: 'A real preview of every spot — not just a name',
                body: 'Each location shows your own photos, sits on an interactive map, and includes permit requirements, parking info, and the best time to shoot. Your client can confidently pick before the session.',
              },
              {
                icon: '✉️',
                title: 'You get the email instantly. They get directions.',
                body: 'The pick lands in your dashboard the moment they tap it. Email + push to you, automatic confirmation email with map directions to the client. No more digging through inbox threads.',
              },
              {
                icon: '🎯',
                title: 'Multi-stop sessions? Set the rules.',
                body: "Let clients pick multiple locations for sessions that move between spots, and cap the maximum distance between picks so an engagement shoot doesn't accidentally turn into a road trip.",
              },
            ].map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0, width: 44, height: 44, borderRadius: '50%', background: 'rgba(196,146,42,.12)', border: '1px solid rgba(196,146,42,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                  {b.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3, marginBottom: 6 }}>
                    {b.title}
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.65, margin: 0 }}>
                    {b.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <style>{`
            @media (max-width: 768px) {
              .feature-bullets-grid { grid-template-columns: 1fr !important; gap: 1.25rem !important; }
            }
          `}</style>
        </div>
      </section>

      {/* ── FEATURE STRIPES — two alternating rows, image-left/text-
             right then text-left/image-right. Less card-heavy than the
             previous 3-card grid (which felt redundant against the
             SHARE_STEPS cards above and the HOW_STEPS cards below).
             Each row gets more visual real estate, telling a longer-
             form story than three small cards could. */}
      <section className="section" style={{ background: 'var(--cream)', padding: '4.5rem 1.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div className="section-eyebrow" style={{ justifyContent: 'center' }}>Built around your brand</div>
            <h2 className="section-title" style={{ fontSize: 'clamp(24px,4vw,34px)' }}>
              Looks like <em>your studio</em>, works like a workflow tool
            </h2>
          </div>

          {/* Row 1 — Templates (visual left, text right). The visual
              mirrors the Profile → Branding layout picker: six thumb-
              previews, each rendering the same template but with a
              different layout, in a 3×2 grid with a mask gradient that
              fades the bottom of each thumbnail so they line up evenly. */}
          <div className="feature-stripe">
            <div className="feature-stripe-visual">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: 14, background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 12, boxShadow: '0 4px 20px rgba(26,22,18,.05)' }}>
                {([
                  { value: 'editorial', label: 'Editorial' },
                  { value: 'card',      label: 'Card' },
                  { value: 'grid',      label: 'Grid' },
                  { value: 'magazine',  label: 'Magazine' },
                  { value: 'list',      label: 'Compact list' },
                  { value: 'minimal',   label: 'Minimal' },
                ] as { value: LayoutKind; label: string }[]).map(opt => (
                  <div key={opt.value} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 12, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>
                      {opt.label}
                    </div>
                    <div style={{
                      height: 130, overflow: 'hidden', borderRadius: 4,
                      WebkitMaskImage: 'linear-gradient(to bottom, black 78%, transparent 100%)',
                      maskImage:        'linear-gradient(to bottom, black 78%, transparent 100%)',
                    }}>
                      <TemplatePreview
                        template={{ ...DEFAULT_TEMPLATE, layout: opt.value }}
                        variant="thumb"
                        studioName="Studio"
                        intro="Pick your spot"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="feature-stripe-text">
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--gold)', marginBottom: 10 }}>Templates</div>
              <h3 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 'clamp(22px,3vw,28px)', fontWeight: 800, color: 'var(--ink)', lineHeight: 1.2, margin: '0 0 14px' }}>
                Six layout templates to choose from.
              </h3>
              <p style={{ fontSize: 15, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.7, margin: '0 0 14px' }}>
                Editorial, Card, Grid, Magazine, Compact list, and Minimal — each one a different way to walk a client through your locations. Pick the one that fits your brand and tweak the font, colors, and header from there.
              </p>
              <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.65, margin: 0 }}>
                Set a default and assign a different template per Location Guide — wedding clients see one look; engagement clients see another.
              </p>
            </div>
          </div>

          {/* Row 2 — Dashboard (text left, visual right) */}
          <div className="feature-stripe feature-stripe-reverse" style={{ marginTop: '3.5rem' }}>
            <div className="feature-stripe-text">
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--gold)', marginBottom: 10 }}>Your dashboard</div>
              <h3 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 'clamp(22px,3vw,28px)', fontWeight: 800, color: 'var(--ink)', lineHeight: 1.2, margin: '0 0 14px' }}>
                Every pick, in one chronological log.
              </h3>
              <p style={{ fontSize: 15, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.7, margin: '0 0 14px' }}>
                Client name, the location they chose, the timestamp. Push notifications hit your phone. Email lands in your inbox. The dashboard keeps the running history.
              </p>
              <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.65, margin: 0 }}>
                No more digging through email threads to remember which spot Sarah picked for Saturday&apos;s shoot.
              </p>
            </div>
            <div className="feature-stripe-visual">
              <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 20px rgba(26,22,18,.05)' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>✓ Client Selections</div>
                  <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(74,103,65,.1)', color: 'var(--sage)', border: '1px solid rgba(74,103,65,.2)' }}>5</span>
                </div>
                {[
                  { name: 'Sarah Chen',      loc: 'Loose Park',           when: 'Apr 26 · 2:14 PM' },
                  { name: 'James Patel',     loc: 'West Bottoms',         when: 'Apr 25 · 11:08 AM' },
                  { name: 'Emily Rodriguez', loc: 'Liberty Memorial',     when: 'Apr 23 · 6:42 PM' },
                  { name: 'Alex Bennett',    loc: 'Country Club Plaza',   when: 'Apr 22 · 10:21 AM' },
                  { name: 'Marina Olsen',    loc: 'Kaufman Center',       when: 'Apr 21 · 4:55 PM' },
                ].map((row, i, arr) => (
                  <div key={i} style={{ padding: '11px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--cream-dark)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13 }}>{row.name}</div>
                      <div style={{ color: 'var(--ink-soft)', fontSize: 12, marginTop: 1 }}>📍 {row.loc}</div>
                    </div>
                    <div style={{ color: 'var(--ink-soft)', fontSize: 11, whiteSpace: 'nowrap', fontWeight: 300 }}>{row.when}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '3rem' }}>
            {user
              ? <Link href="/dashboard" className="btn btn-gold btn-lg">Go to your dashboard →</Link>
              : <button className="btn btn-gold btn-lg" onClick={() => openModal('signup')}>Try it free — no card needed →</button>
            }
          </div>

          <style>{`
            .feature-stripe { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; align-items: center; }
            .feature-stripe-visual { min-width: 0; }
            .feature-stripe-text   { min-width: 0; }
            @media (max-width: 768px) {
              .feature-stripe { grid-template-columns: 1fr !important; gap: 1.5rem !important; }
              /* On mobile, always show visual first regardless of row order */
              .feature-stripe-reverse .feature-stripe-text   { order: 2; }
              .feature-stripe-reverse .feature-stripe-visual { order: 1; }
            }
          `}</style>
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
            <p className="footer-tagline">Branded Location Guides photographers send to clients. Built by photographers, for photographers.</p>
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