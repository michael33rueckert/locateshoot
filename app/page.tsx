'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AuthModal from '@/components/AuthModal'
import type { User } from '@supabase/supabase-js'

const HomeMap = dynamic(() => import('@/components/HomeMap'), { ssr: false })

interface TrendingLocation {
  id: string
  name: string
  city: string
  state: string
  rating: number | null
  save_count: number
  tags: string[]
  access_type: string
  quality_score: number
  photo_url?: string | null
}

const BG_CYCLE = ['bg-1','bg-2','bg-3','bg-4','bg-5','bg-6']

const HOW_STEPS = [
  { num:'01', icon:'👤', title:'Create your free account',  desc:'Sign up in seconds. No credit card needed. Start discovering and saving locations immediately.' },
  { num:'02', icon:'🗺', title:'Search & explore',          desc:'Browse the map by location or tag. Filter by public access, tags, or rating.' },
  { num:'03', icon:'🔗', title:'Share with your client',    desc:'Pick favorites from the map and send a link for them to choose their spot.',        pro:true },
  { num:'04', icon:'🔔', title:'Get notified instantly',    desc:'The moment your client picks a location you get an email. No back-and-forth needed.', pro:true },
]

// ── Pricing toggle ────────────────────────────────────────────────────────────
function PricingToggle({ onSignup }: { onSignup: () => void }) {
  const [yearly, setYearly] = useState(false)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
        <span style={{ fontSize: 13, color: !yearly ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: !yearly ? 500 : 400 }}>Monthly</span>
        <div onClick={() => setYearly(p => !p)} style={{ width: 40, height: 22, borderRadius: 11, background: yearly ? 'var(--gold)' : 'var(--cream-dark)', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 3, left: yearly ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
        </div>
        <span style={{ fontSize: 13, color: yearly ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: yearly ? 500 : 400 }}>
          Yearly <span style={{ fontSize: 11, color: 'var(--sage)', fontWeight: 600 }}>Save $24</span>
        </span>
      </div>
      <div className="price-amount">{yearly ? '$10' : '$12'}<span>/mo</span></div>
      <div className="price-period">
        {yearly ? 'Billed $120/year · cancel anytime' : 'Billed monthly · cancel anytime'}
      </div>
      <ul className="price-features">
        <li>Everything in Free</li>
        <li><strong>Unlimited client share links</strong></li>
        <li>🌐 <strong>Custom domain</strong> — share links on <code>locations.yoursite.com</code></li>
        <li>🔒 <strong>Permit info &amp; access details</strong> on every location</li>
        <li>Email notification when client picks</li>
        <li>Share analytics — views &amp; time spent</li>
        <li>🎨 <strong>White-label share pages</strong> — your logo, not ours</li>
        <li>Custom message &amp; branding</li>
        <li>Pro badge on your profile</li>
      </ul>
      <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center', padding: 12 }} onClick={onSignup}>
        Start 14-day free trial
      </button>
      <p className="price-note">No charge until your trial ends. Cancel anytime.</p>
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
  const [locationCount, setLocationCount] = useState<number | null>(null)
  const [cityCount,     setCityCount]     = useState<number | null>(null)
  const [trendingLocs,  setTrendingLocs]  = useState<TrendingLocation[]>([])
  const [statsLoading,  setStatsLoading]  = useState(true)

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

  // Real stats + trending
  useEffect(() => {
    async function load() {
      try {
        const [countRes, citiesRes, trendRes] = await Promise.all([
          supabase.from('locations').select('id', { count: 'exact', head: true }).eq('status', 'published'),
          supabase.from('locations').select('city', { count: 'exact' }).eq('status', 'published'),
          supabase.from('locations')
            .select('id,name,city,state,rating,save_count,tags,access_type,quality_score')
            .eq('status', 'published')
            .eq('source', 'curated')
            .not('latitude', 'is', null)
            .order('quality_score', { ascending: false })
            .limit(6),
        ])
        if (countRes.count !== null) setLocationCount(countRes.count)
        if (citiesRes.data) {
          const unique = new Set(citiesRes.data.map((r: any) => r.city?.toLowerCase()).filter(Boolean))
          setCityCount(unique.size)
        }
        if (trendRes.data && trendRes.data.length > 0) {
          const ids = trendRes.data.map((r: any) => r.id)
          const { data: photos } = await supabase.from('location_photos')
            .select('location_id,url,created_at')
            .in('location_id', ids)
            .eq('is_private', false)
            .order('created_at', { ascending: true })
          const photoMap: Record<string, string> = {}
          ;(photos ?? []).forEach((p: any) => { if (p.location_id && !photoMap[p.location_id]) photoMap[p.location_id] = p.url })
          setTrendingLocs(trendRes.data.map((r: any) => ({ ...r, photo_url: photoMap[r.id] ?? null })))
        }
      } catch (e) { console.error(e) }
      finally { setStatsLoading(false) }
    }
    load()
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

  function handleViewLocations() {
    if (user) window.location.href = '/explore'
    else openModal('signup')
  }

  function fmtCount(n: number | null) {
    if (n === null) return '—'
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k+`
    return `${n}+`
  }

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
              <Link href="/dashboard" className="btn btn-ghost">Dashboard</Link>
              <button className="btn btn-gold" onClick={handleSignOut}>Sign Out</button>
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
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 660, padding: 'clamp(5rem,10vw,7rem) clamp(1.5rem,8vw,8rem) 4rem' }}>
          <div className="hero-eyebrow">The Photographer&apos;s Community</div>
          <h1 className="hero-title">Find your <em>perfect</em> location</h1>
          <p className="hero-sub">
            A community-powered map of stunning photoshoot locations. Discover hidden gems,
            save favorites, and send clients a beautiful link to pick their spot.
          </p>
          <div className="hero-actions">
            {user ? (
              <>
                <Link href="/share"   className="btn btn-gold btn-lg">🔗 New Client Share</Link>
                <Link href="/explore" className="btn btn-ghost btn-lg">Browse the Map</Link>
              </>
            ) : (
              <>
                <button className="btn btn-gold btn-lg"  onClick={() => openModal('signup')}>Join Free — Start Exploring</button>
                <button className="btn btn-ghost btn-lg" onClick={() => openModal('login')}>Sign In</button>
              </>
            )}
          </div>
          <div className="hero-stats">
            <div>
              <div className="hero-stat-num">{statsLoading ? '…' : fmtCount(locationCount)}</div>
              <div className="hero-stat-label">Locations mapped</div>
            </div>
            <div>
              <div className="hero-stat-num">{statsLoading ? '…' : cityCount !== null ? `${cityCount}+` : '—'}</div>
              <div className="hero-stat-label">Cities covered</div>
            </div>
            <div>
              <div className="hero-stat-num">Free</div>
              <div className="hero-stat-label">To get started</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRENDING LOCATIONS — real data, gated ── */}
      <section className="section featured-section">
        <div className="featured-header">
          <div>
            <div className="section-eyebrow">Community Picks</div>
            <h2 className="section-title">Trending <em>locations</em></h2>
            <p className="section-sub">Top-rated spots loved by photographers right now.</p>
          </div>
          <button className="btn btn-dark" onClick={handleViewLocations}>
            {user ? 'View All Locations →' : 'Sign Up to See All →'}
          </button>
        </div>

        <div className="location-grid">
          {statsLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="location-card" style={{ opacity: 0.35 }}>
                  <div className={`card-img ${BG_CYCLE[i]}`} />
                  <div className="card-body">
                    <div style={{ height: 14, background: 'var(--cream-dark)', borderRadius: 4, marginBottom: 8, width: '80%' }} />
                    <div style={{ height: 11, background: 'var(--cream-dark)', borderRadius: 4, width: '55%' }} />
                  </div>
                </div>
              ))
            : trendingLocs.map((loc, i) => (
                <div
                  key={loc.id}
                  className="location-card"
                  style={{ cursor: user ? 'pointer' : 'default', position: 'relative', overflow: 'hidden' }}
                  onClick={user ? handleViewLocations : undefined}
                >
                  <div className={`card-img ${BG_CYCLE[i % BG_CYCLE.length]}`} style={{ position: 'relative', overflow: 'hidden' }}>
                    {loc.photo_url && <img src={loc.photo_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                    <span className={`card-badge ${loc.access_type === 'public' ? 'badge-public' : 'badge-private'}`} style={{ position: 'relative', zIndex: 1 }}>
                      {loc.access_type === 'public' ? '● Public' : '🔒 Private'}
                    </span>
                  </div>
                  <div className="card-body">
                    <div className="card-title">{loc.name}</div>
                    <div className="card-location">📍 {loc.city}{loc.state ? `, ${loc.state}` : ''}</div>
                    <div className="card-tags">
                      {(loc.tags ?? []).slice(0, 3).map((t: string) => <span key={t} className="tag">{t}</span>)}
                    </div>
                    <div className="card-footer">
                      {user ? (
                        <>
                          <div className="card-rating">★ {loc.rating ? parseFloat(loc.rating.toString()).toFixed(1) : 'New'}</div>
                          <div className="card-saves">❤ {loc.save_count ?? 0} saves</div>
                        </>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); openModal('signup') }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, padding: 0 }}
                        >
                          Sign in to see ratings →
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Gradient gate for non-signed-in users */}
                  {!user && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%', background: 'linear-gradient(to top, rgba(249,246,241,1) 50%, rgba(249,246,241,0))', pointerEvents: 'none' }} />
                  )}
                </div>
              ))
          }
        </div>

        {!user && !statsLoading && (
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <p style={{ fontSize: 15, color: 'var(--ink-soft)', marginBottom: '1rem', fontWeight: 300 }}>
              Create a free account to see full location details, ratings, permit info, and more.
            </p>
            <button className="btn btn-gold btn-lg" onClick={() => openModal('signup')}>
              Join Free — It&apos;s Instant
            </button>
          </div>
        )}
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
          <h2 className="section-title">Free to explore.<br /><em>Pro</em> to grow.</h2>
          <p className="section-sub" style={{ margin: '0 auto' }}>
            LocateShoot is free for every photographer. Upgrade to Pro for the tools that save you real time with clients.
          </p>
        </div>
        <div className="pricing-grid">
          {/* FREE */}
          <div className="price-card">
            <div className="price-plan">Free forever</div>
            <div className="price-amount">$0</div>
            <div className="price-period">No credit card required</div>
            <ul className="price-features">
              <li>Full access to the location map</li>
              <li>Save unlimited favorites</li>
              <li>Add community locations</li>
              <li>Search by location &amp; category</li>
              <li className="dim">1 client share link per month</li>
              <li className="dim">Secret locations</li>
              <li className="dim">Permit info &amp; access details</li>
              <li className="dim">White-label share pages</li>
            </ul>
            <button className="btn btn-dark" style={{ width: '100%', justifyContent: 'center', padding: 12 }} onClick={() => openModal('signup')}>
              Get started free
            </button>
          </div>

          {/* PRO */}
          <div className="price-card is-featured">
            <div className="popular-badge">Most popular</div>
            <div className="price-plan" style={{ color: 'var(--gold)' }}>Pro</div>
            <PricingToggle onSignup={() => openModal('signup')} />
          </div>
        </div>
      </section>

      {/* ── COMMUNITY CTA ── */}
      <section className="community-section">
        <div className="section-eyebrow" style={{ justifyContent: 'center' }}>Join the community</div>
        <h2 className="section-title">Be part of something <em>bigger</em></h2>
        <p className="section-sub" style={{ margin: '0 auto 3rem' }}>
          Add a location today and help a fellow photographer find their perfect shot. Free, always.
        </p>
        <div className="community-badges">
          {['📷 Portrait photographers','🎬 Videographers','🌅 Landscape artists','💒 Wedding photographers','👗 Fashion & editorial','🏙 Urban explorers','🎨 Content creators'].map(b => (
            <span key={b} className="community-badge">{b}</span>
          ))}
        </div>
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