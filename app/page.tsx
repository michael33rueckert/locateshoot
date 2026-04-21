'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AuthModal from '@/components/AuthModal'
import type { User } from '@supabase/supabase-js'

const HomeMap = dynamic(() => import('@/components/HomeMap'), { ssr: false })

// ── Data ──────────────────────────────────────────────────────────────────────

const CARDS = [
  { id:1, name:'Whispering Pines Grove',        city:'Cedar Falls, Iowa',     bg:'bg-1', access:'public',  rating:'4.9', reviews:48,  saves:312, tags:['Golden Hour','Forest','Couples'],   distance:'2.4 mi', featured:false },
  { id:2, name:'The Meridian Rooftop',          city:'Kansas City, Missouri', bg:'bg-2', access:'private', rating:'4.8', reviews:34,  saves:241, tags:['Rooftop','Urban','Skyline'],        distance:'5.1 mi', featured:true,  price:'From $150/hr' },
  { id:3, name:'Red Bluff Overlook',            city:'Sedona, Arizona',       bg:'bg-3', access:'public',  rating:'5.0', reviews:91,  saves:598, tags:['Landscape','Sunrise','Desert'],     distance:'11.2 mi',featured:false },
  { id:4, name:'Studio Indigo — Warehouse Loft',city:'Chicago, Illinois',     bg:'bg-4', access:'private', rating:'4.7', reviews:27,  saves:189, tags:['Studio','Indoor','Fashion'],        distance:'8.7 mi', featured:true,  price:'From $80/hr' },
  { id:5, name:'Emerald Lake Trailhead',        city:'Portland, Oregon',      bg:'bg-5', access:'public',  rating:'4.9', reviews:63,  saves:447, tags:['Water','Reflection','Nature'],      distance:'1.8 mi', featured:false },
  { id:6, name:'Desert Bloom Ranch',            city:'Scottsdale, Arizona',   bg:'bg-6', access:'private', rating:'4.8', reviews:41,  saves:274, tags:['Outdoor','Boho','Wedding'],         distance:'3.3 mi', featured:false },
]

const MAP_RESULTS = [
  { name:'The Meridian Rooftop',   city:'Kansas City, MO', rating:'4.8', bg:'bg-2', promoted:true,  lat:39.0997, lng:-94.5786 },
  { name:'Whispering Pines Grove', city:'Liberty, MO',     rating:'4.9', bg:'bg-1', promoted:false, lat:39.3542, lng:-94.8467 },
  { name:'Clinton Lake Shoreline', city:'Lawrence, KS',    rating:'4.6', bg:'bg-5', promoted:false, lat:38.9717, lng:-95.2353 },
  { name:'Flint Hills Prairie',    city:'Manhattan, KS',   rating:'5.0', bg:'bg-6', promoted:false, lat:39.2014, lng:-96.5716 },
]

const HOW_STEPS = [
  { num:'01', icon:'👤', title:'Create your free account', desc:'Sign up in seconds. No credit card needed. Start discovering and saving locations immediately.' },
  { num:'02', icon:'🗺', title:'Search & explore',         desc:'Browse the map by location or tag, or use Near Me. Filter by public access or private venues.' },
  { num:'03', icon:'🔗', title:'Share with your client',   desc:'Drop a pin near your client, pick favorites, and send a link for them to choose their spot.', pro:true },
  { num:'04', icon:'🔔', title:'Get notified instantly',   desc:"The moment your client picks a location you get an email. No back-and-forth needed.", pro:true },
]

const VENUE_AD_ITEMS = [
  { name:'The Meridian Rooftop',          meta:'★ 4.8 · Kansas City, MO · From $150/hr', bg:'bg-2', promoted:true  },
  { name:'Studio Indigo — Warehouse Loft',meta:'★ 4.7 · Kansas City, MO · From $80/hr',  bg:'bg-4', promoted:true  },
  { name:'Crossroads Arts District Wall', meta:'★ 4.6 · Kansas City, MO · Public',        bg:'bg-3', promoted:false },
  { name:'18th & Vine Historic District', meta:'★ 4.5 · Kansas City, MO · Public',        bg:'bg-5', promoted:false },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [user,         setUser]         = useState<User | null>(null)
  const [authLoading,  setAuthLoading]  = useState(true)
  const [showModal,    setShowModal]    = useState(false)
  const [modalMode,    setModalMode]    = useState<'login' | 'signup'>('login')
  const [favorites,    setFavorites]    = useState<Set<number>>(new Set())
  const [activeFilter, setActiveFilter] = useState('All')
  const [mapFlyTo,     setMapFlyTo]     = useState<[number,number] | null>(null)
  const [toast,        setToast]        = useState<string | null>(null)

  // Load current auth state on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    // Listen for auth changes (sign in / sign out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(id)
  }, [toast])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setToast('Signed out successfully')
  }

  function openModal(mode: 'login' | 'signup') {
    setModalMode(mode)
    setShowModal(true)
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  function toggleFav(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    if (!user) { openModal('signup'); return }
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); setToast('Removed from favorites') }
      else               { next.add(id);   setToast('❤ Saved to favorites!') }
      return next
    })
  }

  function flyToResult(lat: number, lng: number) {
    setMapFlyTo([lat, lng])
    scrollTo('map-section')
  }

  return (
    <>
      {/* ── NAV ── */}
      <nav className="nav">
        <Link href="/" className="nav-logo">
          <span className="logo-dot" />LocateShoot
        </Link>
        <ul className="nav-links">
  <li><Link href="/explore" style={{ color: 'rgba(245,240,232,.65)', textDecoration: 'none' }}>Map</Link></li>
  <li><Link href="/dashboard" style={{ color: 'rgba(245,240,232,.65)', textDecoration: 'none' }}>Dashboard</Link></li>
  <li><a href="#pricing" onClick={e => { e.preventDefault(); scrollTo('pricing') }}>Pricing</a></li>
</ul>
        <div className="nav-cta">
          {authLoading ? (
            // Show nothing while checking auth state
            <div style={{ width: 140 }} />
          ) : user ? (
            // Signed in
            <>
              <Link href="/dashboard" className="btn btn-ghost">Dashboard</Link>
              <button className="btn btn-gold" onClick={handleSignOut}>Sign Out</button>
            </>
          ) : (
            // Signed out
            <>
              <button className="btn btn-ghost" onClick={() => openModal('login')}>Sign In</button>
              <button className="btn btn-gold"  onClick={() => openModal('signup')}>Join Free</button>
            </>
          )}
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-bg-texture" />
        <div className="hero-left">
          <div className="hero-eyebrow">The Photographer&apos;s Community</div>
          <h1 className="hero-title">Find your <em>perfect</em> location</h1>
          <p className="hero-sub">
            A community-powered map of stunning photoshoot locations. Discover hidden gems,
            save favorites, and send clients a beautiful link to pick their spot.
          </p>
          <div className="hero-actions">
            {user ? (
              <>
                <Link href="/share"     className="btn btn-gold btn-lg">🔗 New Client Share</Link>
                <Link href="/dashboard" className="btn btn-ghost btn-lg">Go to Dashboard</Link>
              </>
            ) : (
              <>
                <button className="btn btn-gold btn-lg" onClick={() => openModal('signup')}>Join Free — Start Exploring</button>
                <Link href="/explore" className="btn btn-ghost btn-lg">Browse the Map</Link>
              </>
            )}
          </div>
          <div className="hero-stats">
            <div><div className="hero-stat-num">4,200+</div><div className="hero-stat-label">Locations shared</div></div>
            <div><div className="hero-stat-num">12k</div>   <div className="hero-stat-label">Photographers</div></div>
            <div><div className="hero-stat-num">180+</div>  <div className="hero-stat-label">Cities covered</div></div>
          </div>
        </div>
        <div className="hero-right">
          <div className="hero-map-container">
            <HomeMap variant="hero" flyTo={null} />
          </div>
          <div className="hero-map-overlay" />
        </div>
      </section>

      {/* ── SEARCH BAR ── */}
      <div className="search-section">
        <div className="search-bar">
          <div className="search-field" style={{ flex: 2 }}>
            <span className="search-field-icon">🔍</span>
            <input type="text" placeholder="City, state, or landmark…" />
          </div>
          <div className="search-field">
            <span className="search-field-icon">📷</span>
            <select defaultValue="">
              <option value="">All Categories</option>
              <option>Golden Hour</option>
              <option>Urban / Architecture</option>
              <option>Nature / Forest</option>
              <option>Water / Beach</option>
              <option>Rooftop</option>
            </select>
          </div>
          <div className="search-field">
            <span className="search-field-icon">🔒</span>
            <select defaultValue="">
              <option value="">Public &amp; Private</option>
              <option>Public (Free)</option>
              <option>Private Venue</option>
            </select>
          </div>
          <Link href="/explore" className="location-btn">📍 Near Me</Link>
          <div className="search-btn-wrap">
            <button className="btn-search">Search</button>
          </div>
        </div>
      </div>

      {/* ── FEATURED LOCATIONS ── */}
      <section className="section featured-section">
        <div className="featured-header">
          <div>
            <div className="section-eyebrow">Community Picks</div>
            <h2 className="section-title">Trending <em>locations</em></h2>
            <p className="section-sub">Top-rated spots discovered and loved by photographers this week.</p>
          </div>
          <button className="btn btn-dark">View All Locations →</button>
        </div>

        <div className="location-grid">
          {CARDS.map(card => (
            <div key={card.id} className={`location-card${card.featured ? ' is-featured' : ''}`}>
              <div className={`card-img ${card.bg}`}>
                {card.featured
                  ? <span className="card-badge badge-featured">⭐ Featured</span>
                  : card.access === 'public'
                    ? <span className="card-badge badge-public">● Public</span>
                    : <span className="card-badge badge-private">🔒 Private Venue</span>
                }
                <button
                  className={`card-fav-btn${favorites.has(card.id) ? ' active' : ''}`}
                  onClick={e => toggleFav(card.id, e)}
                  title={user ? 'Save to favorites' : 'Sign in to save'}
                >
                  {favorites.has(card.id) ? '♥' : '♡'}
                </button>
                <div className="card-distance">{card.distance}</div>
              </div>
              <div className="card-body">
                <div className="card-title">{card.name}</div>
                <div className="card-location">📍 {card.city}</div>
                <div className="card-tags">
                  {card.tags.map(t => <span key={t} className="tag">{t}</span>)}
                </div>
                <div className="card-footer">
                  <div className="card-rating">
                    ★ {card.rating} <span>({card.reviews} reviews)</span>
                  </div>
                  <div className="card-saves">❤ {card.saves} saves</div>
                </div>
              </div>
              {card.featured && card.price && (
                <div className="promoted-strip">
                  ⭐ Featured venue &nbsp;·&nbsp; {card.price} &nbsp;·&nbsp;
                  <span style={{ opacity: 0.6, fontWeight: 300 }}>Sponsored</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)', marginTop: '1rem', fontWeight: 300 }}>
          Featured venues are paid placements and clearly labeled. All other results are organic community rankings.
        </p>
      </section>

      {/* ── MAP SECTION ── */}
      <section className="map-section" id="map-section">
        <div className="section-eyebrow" style={{ color: 'var(--gold)' }}>Explore the Map</div>
        <h2 className="section-title" style={{ color: 'var(--cream)' }}>Every great shot <em>starts here</em></h2>
        <p className="section-sub">Use your location to find nearby spots, or explore anywhere in the US.</p>
        <div className="map-layout">
          <div className="map-sidebar">
            <div className="map-sidebar-header">
              <span className="map-sidebar-title">Nearby Locations</span>
              <Link href="/explore" className="location-btn">📍 Near Me</Link>
            </div>
            <div className="map-filter-pills">
              {['All','Public','Private','⭐ Featured','Golden Hour','Nature'].map(f => (
                <button key={f} className={`filter-pill${activeFilter === f ? ' active' : ''}`} onClick={() => setActiveFilter(f)}>{f}</button>
              ))}
            </div>
            <div className="map-results-list">
              {MAP_RESULTS.map(r => (
                <div key={r.name} className={`map-result-item${r.promoted ? ' is-promoted' : ''}`} onClick={() => flyToResult(r.lat, r.lng)}>
                  <div className={`map-result-thumb ${r.bg}`} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="map-result-name">{r.name}</div>
                    <div className="map-result-meta">{r.promoted ? `⭐ Featured · ` : `★ ${r.rating} · `}{r.city}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="map-container">
            <HomeMap variant="main" flyTo={mapFlyTo} />
          </div>
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
          <div className="price-card">
            <div className="price-plan">Free forever</div>
            <div className="price-amount">$0</div>
            <div className="price-period">No credit card required</div>
            <ul className="price-features">
              <li>Full access to the location map</li>
              <li>Save unlimited favorites</li>
              <li>Add community locations</li>
              <li>Search by location &amp; category</li>
              <li>View permit info &amp; access details</li>
              <li className="dim">3 client share links per month</li>
              <li className="dim">Basic share analytics</li>
              <li className="dim">Pro badge on your profile</li>
            </ul>
            <button className="btn btn-dark" style={{ width: '100%', justifyContent: 'center', padding: 12 }} onClick={() => openModal('signup')}>Get started free</button>
          </div>
          <div className="price-card is-featured">
            <div className="popular-badge">Most popular</div>
            <div className="price-plan" style={{ color: 'var(--gold)' }}>Pro</div>
            <div className="price-amount">$12<span>/mo</span></div>
            <div className="price-period">Billed monthly · cancel anytime</div>
            <ul className="price-features">
              <li>Everything in Free</li>
              <li><strong>Unlimited client share links</strong></li>
              <li>Email notification when client picks</li>
              <li>Share analytics — views &amp; time spent</li>
              <li>Custom message &amp; branding on share page</li>
              <li>Secret locations — share hidden gems with clients</li>
              <li>Pro badge on your profile</li>
              <li>Priority support</li>
            </ul>
            <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center', padding: 12 }} onClick={() => openModal('signup')}>Start 14-day free trial</button>
            <p className="price-note">No charge until your trial ends. Cancel anytime.</p>
          </div>
        </div>
      </section>

      {/* ── VENUE ADS ── */}
      <section className="venue-section">
        <div className="section-eyebrow" style={{ color: 'var(--gold)' }}>For Venue Owners</div>
        <h2 className="section-title" style={{ color: 'var(--cream)' }}>Get your venue in front of <em>photographers</em></h2>
        <p className="section-sub">Any venue can appear on LocateShoot for free via the community. Pay to promote your listing to the top of results.</p>
        <div className="venue-layout">
          <div className="venue-benefits">
            {[
              { icon:'🔝', title:'Top of search results',   desc:'Your venue appears above organic results for your area. Clearly labeled as featured.' },
              { icon:'📍', title:'Highlighted map pin',      desc:'Stand out with a gold pin. Photographers browsing the map see featured venues first.' },
              { icon:'📷', title:'Up to 20 photos',          desc:'Full photo gallery plus pricing info and a direct link to your booking page.' },
              { icon:'📊', title:'Monthly analytics report', desc:'See how many photographers viewed, saved, and clicked through to your site each month.' },
            ].map(b => (
              <div key={b.title} className="venue-benefit">
                <span className="venue-benefit-icon">{b.icon}</span>
                <div><div className="venue-benefit-title">{b.title}</div><div className="venue-benefit-desc">{b.desc}</div></div>
              </div>
            ))}
            <div className="venue-price-box">
              <div>
                <div style={{ fontSize: 13, color: 'rgba(245,240,232,.6)', marginBottom: 3 }}>Featured listing</div>
                <div style={{ fontFamily: 'var(--font-playfair)', fontSize: 28, fontWeight: 700, color: 'var(--gold)' }}>$29<span style={{ fontSize: 15, color: 'rgba(245,240,232,.5)', fontWeight: 300 }}>/mo</span></div>
                <div style={{ fontSize: 12, color: 'rgba(245,240,232,.4)' }}>Cancel anytime · self-serve</div>
              </div>
              <button className="btn btn-gold" onClick={() => setToast('📧 Venue signup coming soon!')}>Get Featured →</button>
            </div>
          </div>
          <div className="venue-ad-card">
            <div className="venue-ad-header">
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--cream)' }}>Search results — &quot;studio Kansas City&quot;</span>
              <span style={{ fontSize: 11, color: 'rgba(245,240,232,.3)' }}>Example</span>
            </div>
            {VENUE_AD_ITEMS.map(item => (
              <div key={item.name} className={`venue-list-item${item.promoted ? ' is-promoted' : ''}`}>
                <div className={`map-result-thumb ${item.bg}`} style={{ borderRadius: 6 }} />
                <div><div className="venue-list-name">{item.name}</div><div className="venue-list-meta">{item.meta}</div></div>
                {item.promoted ? <span className="promoted-tag">⭐ Featured</span> : <span className="organic-tag">Organic</span>}
              </div>
            ))}
            <div style={{ padding: '.75rem 1.25rem', fontSize: 11, color: 'rgba(245,240,232,.3)', borderTop: '1px solid rgba(255,255,255,.06)' }}>
              Featured venues appear above organic results and are clearly labeled.
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="how-section">
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

      {/* ── COMMUNITY CTA ── */}
      <section className="community-section">
        <div className="section-eyebrow" style={{ justifyContent: 'center' }}>Join the community</div>
        <h2 className="section-title">Be part of something <em>bigger</em></h2>
        <p className="section-sub" style={{ margin: '0 auto 3rem' }}>Add a location today and help a fellow photographer find their perfect shot. Free, always.</p>
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
            <div className="footer-heading">Explore</div>
            <ul className="footer-links">
              <li><a href="#">Browse Locations</a></li>
              <li><a href="#">Map View</a></li>
              <li><a href="#">Near Me</a></li>
              <li><a href="#">Top Rated</a></li>
            </ul>
          </div>
          <div>
            <div className="footer-heading">For Photographers</div>
            <ul className="footer-links">
              <li><a href="#">Add a Location</a></li>
              <li><a href="#">My Favorites</a></li>
              <li><Link href="/share">Client Share Links</Link></li>
              <li><a href="#pricing">Pro Plan</a></li>
            </ul>
          </div>
          <div>
            <div className="footer-heading">Company</div>
            <ul className="footer-links">
              <li><a href="#">About</a></li>
              <li><a href="#">For Venues</a></li>
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Terms of Service</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-copy">© 2025 LocateShoot.com — All rights reserved.</div>
          <div className="footer-copy">Made for photographers everywhere ●</div>
        </div>
      </footer>

      {/* ── AUTH MODAL ── */}
      {showModal && (
        <AuthModal
          initialMode={modalMode}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* ── TOAST ── */}
      {toast && <div className="toast">{toast}</div>}
    </>
  )

}
