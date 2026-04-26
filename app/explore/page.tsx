'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usePlacePhotos } from '@/hooks/usePlacePhotos'
import AddressSearch, { type AddressResult } from '@/components/AddressSearch'
import AuthModal from '@/components/AuthModal'
import ImageLightbox from '@/components/ImageLightbox'
import AppNav from '@/components/AppNav'
import LocationEditModal, { type ManagedLocation } from '@/components/admin/LocationEditModal'
import { isAdminEmail } from '@/lib/admin'
import { thumbUrl } from '@/lib/image'
import type { ExploreLocation } from '@/components/ExploreMap'

const ExploreMap = dynamic(() => import('@/components/ExploreMap'), { ssr: false })

const BG_CYCLE = ['bg-1','bg-2','bg-3','bg-4','bg-5','bg-6']
// Default radius when the user drops a "Find Locations Near" pin or taps
// "Near me". Chosen so metro searches include suburbs without flooding the list.
const NEAR_RADIUS_MI = 50

function distMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity
  const R = 3958.7613
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}
const ALL_TAGS = ['Golden Hour','Sunrise','Sunset','Forest','Urban','Waterfront','Historic','Nature','Gardens','Architecture','Romantic','Dramatic','Editorial','Meadow','Creek','Bridge','Mural','Rooftop','Barn','Ranch','Vineyard','Campus','Trail','Industrial','Rustic','Colorful','Wedding','Family']
const SORT_OPTIONS = [{ value: 'quality', label: '⭐ Top rated' },{ value: 'rating_asc', label: '↑ Lowest rated' },{ value: 'name', label: '🔤 Name A–Z' },{ value: 'newest', label: '🕒 Newest first' }]
const RATING_OPTIONS = [{ value: 0, label: 'Any rating' },{ value: 4.5, label: '★ 4.5+' },{ value: 4.0, label: '★ 4.0+' },{ value: 3.5, label: '★ 3.5+' },{ value: 3.0, label: '★ 3.0+' }]
const PERMIT_CFG: Record<string,{label:string;bg:string;color:string;border:string}> = {
  verified: { label: '✓ Permit Verified',      bg: 'rgba(181,75,42,.1)',  color: 'var(--rust)', border: 'rgba(181,75,42,.25)' },
  likely:   { label: '⚠ Permit Likely Needed', bg: 'rgba(196,146,42,.1)', color: 'var(--gold)', border: 'rgba(196,146,42,.25)' },
  unknown:  { label: '? Permit Unknown',        bg: 'var(--cream-dark)',   color: 'var(--ink-soft)', border: 'var(--sand)' },
}

type SortValue = 'quality'|'rating_asc'|'name'|'newest'
type AccessFilter = 'All'|'Public'|'Private'|'My Portfolio'

// ── Modals ────────────────────────────────────────────────────────────────────

function ReportModal({ locName, locId, onClose }: { locName:string; locId:any; onClose:()=>void }) {
  const [msg,setMsg]=useState('');const [sent,setSent]=useState(false);const [sending,setSending]=useState(false);const [err,setErr]=useState('')
  async function submit() {
    if (!msg.trim()) return
    setSending(true); setErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/report-correction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ locationName: locName, locationId: String(locId ?? ''), message: msg.trim() }),
      })
      if (!res.ok) { setErr('Could not send right now — please try again in a moment.'); return }
      setSent(true)
    } catch { setErr('Network error — please try again.') }
    finally { setSending(false) }
  }
  return(<><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(26,22,18,.5)',zIndex:600}}/><div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',background:'white',borderRadius:12,width:420,maxWidth:'92vw',padding:'1.5rem',zIndex:700,boxShadow:'0 20px 60px rgba(0,0,0,.25)'}}>
    {sent?<div style={{textAlign:'center',padding:'1rem 0'}}><div style={{fontSize:36,marginBottom:10}}>✓</div><div style={{fontSize:16,fontWeight:500,color:'var(--ink)',marginBottom:6}}>Thanks — sent.</div><button onClick={onClose} style={{padding:'8px 20px',borderRadius:4,background:'var(--gold)',color:'var(--ink)',border:'none',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit'}}>Close</button></div>
    :<><div style={{fontSize:16,fontWeight:500,color:'var(--ink)',marginBottom:4}}>Report a correction</div><div style={{fontSize:13,color:'var(--ink-soft)',marginBottom:'1rem'}}>{locName}</div><textarea value={msg} onChange={e=>setMsg(e.target.value)} rows={4} placeholder="Describe the correction…" style={{width:'100%',padding:'9px 12px',border:'1px solid var(--cream-dark)',borderRadius:4,fontFamily:'inherit',fontSize:13,outline:'none',resize:'vertical',marginBottom:10}}/>{err&&<div style={{fontSize:12,color:'var(--rust)',marginBottom:8}}>{err}</div>}<div style={{display:'flex',gap:8}}><button onClick={submit} disabled={!msg.trim()||sending} style={{flex:1,padding:'9px',borderRadius:4,background:'var(--ink)',color:'var(--cream)',border:'none',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit',opacity:msg.trim()&&!sending?1:.4}}>{sending?'Sending…':'Send'}</button><button onClick={onClose} style={{padding:'9px 16px',borderRadius:4,background:'transparent',color:'var(--ink-soft)',border:'1px solid var(--sand)',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button></div></>}
  </div></>)
}


// ── Detail panel ──────────────────────────────────────────────────────────────
// Defined OUTSIDE the main component so it's a stable React component.
// Google photos are loaded inside a try/catch wrapper to prevent crashes
// from taking down the whole panel.

function DetailPanel({ loc, portfolioId, onClose, onAddToPortfolio, onSignIn, onOpenLightbox, user, isAdmin, onAdminEdit, onAdminDelete }: {
  loc:any; portfolioId:string|null; onClose:()=>void; onAddToPortfolio:(id:any)=>void; onSignIn:()=>void; onOpenLightbox:(src:string|string[], start?:number)=>void; user:any
  isAdmin:boolean; onAdminEdit:(locId:string)=>void; onAdminDelete:(locId:string)=>Promise<void>
}) {
  const isInPortfolio = !!portfolioId
  const router = useRouter()
  const { photos: googlePhotos, loading: googleLoading } = usePlacePhotos(loc.name, loc.city, loc.lat, loc.lng)
  const [activePhoto, setActivePhoto] = useState(0)
  const [showReport,  setShowReport]  = useState(false)

  // Reset gallery to first image when switching locations.
  useEffect(() => { setActivePhoto(0) }, [loc.id])

  const hasGoogle = googlePhotos.length > 0
  const permitCfg = PERMIT_CFG[loc.permit_certainty ?? 'unknown'] ?? PERMIT_CFG.unknown

  function shareWithClient() {
    sessionStorage.setItem('sharePreselectedLocation', JSON.stringify({ id:loc.id, name:loc.name, city:loc.city, lat:loc.lat, lng:loc.lng, access:loc.access, rating:loc.rating, bg:loc.bg, type:'favorite' }))
    router.push('/location-guides?new=1')
  }

  return (
    <>
      <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(26,22,18,.5)',backdropFilter:'blur(3px)',zIndex:400}}/>
      <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:600,background:'white',borderRadius:'16px 16px 0 0',zIndex:500,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 -8px 48px rgba(26,22,18,.25)'}}>
        <div style={{display:'flex',justifyContent:'center',padding:'12px 0 6px'}}><div style={{width:36,height:4,borderRadius:2,background:'var(--sand)'}}/></div>
        <button onClick={onClose} style={{position:'absolute',top:14,right:14,width:32,height:32,borderRadius:'50%',background:'rgba(26,22,18,.6)',border:'none',cursor:'pointer',fontSize:16,color:'white',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10}}>✕</button>

        {/* Photo area — Google Places photos only. We removed community
            uploads + the Photographer / Add-yours tabs along with the rest
            of the public-contribution surface. */}
        <div style={{position:'relative',height:'clamp(260px, 44vw, 380px)',background:'#1a1612',overflow:'hidden'}}>
          {googleLoading
            ?<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}><div className={loc.bg} style={{position:'absolute',inset:0,opacity:.4}}/><div style={{width:24,height:24,border:'2px solid rgba(255,255,255,.2)',borderTop:'2px solid rgba(255,255,255,.7)',borderRadius:'50%',animation:'spin .7s linear infinite',zIndex:1}}/></div>
            :hasGoogle?<img src={googlePhotos[activePhoto].url} alt={loc.name} onClick={()=>onOpenLightbox(googlePhotos.map(p=>p.url), activePhoto)} style={{width:'100%',height:'100%',objectFit:'cover',cursor:'zoom-in'}}/>
            :<div className={loc.bg} style={{position:'absolute',inset:0}}/>}
          <div style={{position:'absolute',top:10,left:10,padding:'4px 10px',borderRadius:4,fontSize:11,fontWeight:500,background:loc.access==='public'?'rgba(74,103,65,.85)':'rgba(181,75,42,.85)',color:loc.access==='public'?'#c8e8c4':'#ffd0c0',backdropFilter:'blur(4px)'}}>{loc.access==='public'?'● Public':'🔒 Private'}</div>
          {hasGoogle&&googlePhotos.length>1&&<div style={{position:'absolute',top:10,right:10,background:'rgba(26,22,18,.7)',borderRadius:20,padding:'3px 10px',fontSize:11,color:'rgba(255,255,255,.8)'}}>{activePhoto+1} / {googlePhotos.length}</div>}
        </div>

        {hasGoogle&&googlePhotos.length>1&&<div style={{display:'flex',gap:4,padding:'8px 1.25rem',overflowX:'auto',borderBottom:'1px solid var(--cream-dark)'}}>
          {googlePhotos.map((p,i)=><div key={i} onClick={()=>setActivePhoto(i)} style={{width:56,height:56,borderRadius:6,flexShrink:0,overflow:'hidden',cursor:'pointer',border:`2px solid ${activePhoto===i?'var(--gold)':'transparent'}`}}><img src={p.url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/></div>)}
        </div>}
        <div style={{padding:'6px 1.25rem',borderBottom:'1px solid var(--cream-dark)',display:'flex',alignItems:'center',gap:6}}><img src="https://developers.google.com/static/maps/documentation/images/google_on_white.png" alt="Google" style={{height:11,opacity:.4}}/><span style={{fontSize:10,color:'var(--ink-soft)'}}>Photos via Google · Not affiliated with LocateShoot</span></div>

        {/* Details */}
        <div style={{padding:'1rem 1.25rem 1.5rem'}}>
          <div style={{fontFamily:'var(--font-playfair),serif',fontSize:22,fontWeight:700,color:'var(--ink)',marginBottom:3}}>{loc.name}</div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:'1rem',flexWrap:'wrap'}}>
            <span style={{fontSize:13,color:'var(--ink-soft)'}}>📍 {loc.city}</span>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([loc.name, loc.city].filter(Boolean).join(' '))}&query_place_id=`} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:'var(--sky)',textDecoration:'none',fontWeight:500,display:'inline-flex',alignItems:'center',gap:4}}>
              Open in Google Maps →
            </a>
          </div>
          {(loc.tags??[]).length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:'1rem'}}>{(loc.tags??[]).map((t:string)=><span key={t} style={{padding:'4px 10px',borderRadius:20,fontSize:12,background:'var(--cream-dark)',color:'var(--ink-soft)',border:'1px solid var(--sand)'}}>{t}</span>)}</div>}
          {loc.desc&&<p style={{fontSize:14,color:'var(--ink-soft)',fontWeight:300,lineHeight:1.7,marginBottom:'1.25rem'}}>{loc.desc}</p>}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:'1rem'}}>
            {[{icon:'🔒',label:'Access',value:loc.access==='public'?'Free public access':'Private — booking required'},{icon:'⭐',label:'Rating',value:loc.rating!=='—'?`${loc.rating} out of 5`:'Not yet rated'},{icon:'📷',label:'Photos',value:`${hasGoogle?googlePhotos.length:0} Google`}].map(item=>(
              <div key={item.label} style={{background:'var(--cream)',borderRadius:8,padding:'10px 12px',border:'1px solid var(--cream-dark)'}}>
                <div style={{fontSize:11,fontWeight:500,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--ink-soft)',marginBottom:4}}>{item.icon} {item.label}</div>
                <div style={{fontSize:13,color:'var(--ink)',lineHeight:1.4}}>{item.value}</div>
              </div>
            ))}
          </div>
          <div style={{background:'var(--cream)',border:'1px solid var(--cream-dark)',borderRadius:8,padding:'12px 14px',marginBottom:'1rem'}}>
            <div style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--ink-soft)',marginBottom:8}}>🔒 Permit Requirements</div>
            <span style={{padding:'3px 9px',borderRadius:20,fontSize:11,fontWeight:600,background:permitCfg.bg,color:permitCfg.color,border:`1px solid ${permitCfg.border}`}}>{permitCfg.label}</span>
            {loc.permit_fee>0&&<span style={{marginLeft:8,fontSize:12,color:'var(--ink)',fontWeight:500}}>Fee: ${loc.permit_fee}</span>}
            {loc.permit_notes&&<div style={{fontSize:12,color:'var(--ink-soft)',lineHeight:1.55,marginTop:8}}>{loc.permit_notes}</div>}
            {loc.permit_website&&<a href={loc.permit_website} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:4,marginTop:6,fontSize:12,color:'var(--sky)',textDecoration:'none',fontWeight:500}}>🔗 Permit info source →</a>}
          </div>
          {user
            ? (isInPortfolio
                ? <div style={{display:'flex',gap:8,marginBottom:10}}>
                    <div style={{flex:1,padding:'12px',borderRadius:4,fontFamily:'inherit',fontSize:14,fontWeight:600,background:'rgba(74,103,65,.1)',color:'var(--sage)',border:'1px solid rgba(74,103,65,.3)',textAlign:'center'}}>✓ In your portfolio</div>
                    <Link href={`/dashboard?editPortfolio=${portfolioId}`} style={{padding:'12px 16px',borderRadius:4,fontFamily:'inherit',fontSize:14,fontWeight:600,background:'var(--ink)',color:'var(--cream)',textDecoration:'none',whiteSpace:'nowrap',display:'flex',alignItems:'center'}}>Edit & add photos →</Link>
                  </div>
                : <button onClick={()=>onAddToPortfolio(loc.id)} style={{width:'100%',padding:'12px',borderRadius:4,cursor:'pointer',fontFamily:'inherit',fontSize:14,fontWeight:600,marginBottom:10,background:'var(--gold)',color:'var(--ink)',border:'none'}}>Add to my portfolio</button>)
            : <button onClick={onSignIn} style={{width:'100%',padding:'12px',borderRadius:4,background:'var(--ink)',color:'var(--cream)',fontFamily:'inherit',fontSize:14,fontWeight:600,border:'none',cursor:'pointer',marginBottom:10}}>Sign in to add to your portfolio</button>}
          {user&&<button onClick={shareWithClient} style={{width:'100%',padding:'12px',borderRadius:4,background:'var(--gold)',color:'var(--ink)',border:'none',fontFamily:'inherit',fontSize:14,fontWeight:500,cursor:'pointer',marginBottom:'1rem'}}>🔗 Share with client</button>}
          {isAdmin&&(
            <div style={{padding:'10px 12px',background:'rgba(26,22,18,.04)',border:'1px dashed var(--cream-dark)',borderRadius:6,marginBottom:'1rem',display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
              <span style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--ink-soft)',marginRight:'auto'}}>🛠 Admin</span>
              <button onClick={()=>onAdminEdit(loc.id)} style={{padding:'7px 14px',borderRadius:4,border:'1px solid var(--cream-dark)',background:'white',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',color:'var(--ink)'}}>Edit</button>
              <button onClick={async()=>{ if(confirm(`Delete ${loc.name}? This removes it from the public map and unlinks any portfolio rows.`)){ await onAdminDelete(loc.id); } }} style={{padding:'7px 14px',borderRadius:4,border:'1px solid rgba(181,75,42,.3)',background:'rgba(181,75,42,.05)',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',color:'var(--rust)'}}>Delete</button>
            </div>
          )}
          <div style={{padding:'10px 12px',background:'rgba(196,146,42,.04)',border:'1px solid rgba(196,146,42,.15)',borderRadius:6,marginBottom:10}}>
            <div style={{fontSize:10,color:'var(--ink-soft)',lineHeight:1.6,fontWeight:300}}>⚠ <strong style={{fontWeight:500}}>Disclaimer:</strong> Always verify access rights, permit requirements, and safety before your session.</div>
          </div>
          <div style={{textAlign:'center'}}><button onClick={()=>setShowReport(true)} style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:'var(--ink-soft)',fontFamily:'inherit',textDecoration:'underline',padding:0}}>Report a correction</button></div>
        </div>
      </div>
      {showReport&&<ReportModal locName={loc.name} locId={loc.id} onClose={()=>setShowReport(false)}/>}
    </>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ExplorePage() {
  const [locations,      setLocations]      = useState<any[]>([])
  const [dbLoading,      setDbLoading]      = useState(true)
  const [userLocation,   setUserLocation]   = useState<{lat:number;lng:number}|null>(null)
  // The signed-in user's saved home city (preferences.home in profiles).
  // Used as the map's initial framing — falls back to a USA-wide view
  // when the user hasn't set one. We keep it in state so the prop change
  // can recenter the map if prefs load after the map mounts.
  const [homeLocation,   setHomeLocation]   = useState<{lat:number;lng:number}|null>(null)
  const [locGranted,     setLocGranted]     = useState(false)
  const [locLoading,     setLocLoading]     = useState(false)
  const [activeId,       setActiveId]       = useState<any>(null)
  const [detailLoc,      setDetailLoc]      = useState<any>(null)
  const [user,           setUser]           = useState<any>(null)
  const [adminEditLoc,   setAdminEditLoc]   = useState<ManagedLocation|null>(null)
  const [authOpen,       setAuthOpen]       = useState<'login'|'signup'|null>(null)
  const [toast,          setToast]          = useState<string|null>(null)
  const [searchQuery,    setSearchQuery]    = useState('')
  const [showFilters,    setShowFilters]    = useState(false)
  const [accessFilter,   setAccessFilter]   = useState<AccessFilter>('All')
  const [selectedTags,   setSelectedTags]   = useState<string[]>([])
  const [minRating,      setMinRating]      = useState(0)
  const [sortBy,         setSortBy]         = useState<SortValue>('quality')
  const [photoMap,       setPhotoMap]       = useState<Record<string,string>>({})
  // Map: public locations.id → portfolio_locations.id, so we can deep-link
  // to the portfolio edit modal after a user adds a location.
  const [portfolioSources, setPortfolioSources] = useState<Map<string, string>>(new Map())
  const [mobileMapVisible, setMobileMapVisible] = useState(false)
  const [searchPin,        setSearchPin]        = useState<{lat:number;lng:number;label:string}|null>(null)
  const [showPinSearch,    setShowPinSearch]    = useState(false)
  const [lightboxSrc,      setLightboxSrc]      = useState<string | string[] | null>(null)
  const [lightboxStart,    setLightboxStart]    = useState(0)
  const openLightbox = useCallback((src: string | string[], start = 0) => { setLightboxSrc(src); setLightboxStart(start) }, [])

  // ── FIX 1: Trigger Leaflet resize on mount so map fills its container ──
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 400)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (mobileMapVisible) setTimeout(() => window.dispatchEvent(new Event('resize')), 150)
  }, [mobileMapVisible])

  useEffect(() => { supabase.auth.getUser().then(({data:{user}})=>setUser(user)) }, [])

  // Pull the photographer's saved home city from profile preferences. If
  // they set it during onboarding (or later via the Profile page) we'll
  // open the map there instead of a generic US-wide view.
  useEffect(() => {
    if (!user) { setHomeLocation(null); return }
    let cancelled = false
    supabase.from('profiles').select('preferences').eq('id', user.id).single().then(({ data }) => {
      if (cancelled) return
      const home = (data?.preferences as any)?.home
      if (home && Number.isFinite(home.lat) && Number.isFinite(home.lng)) {
        setHomeLocation({ lat: home.lat, lng: home.lng })
      } else {
        setHomeLocation(null)
      }
    })
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    async function load() {
      setDbLoading(true)
      try {
        const { data } = await supabase.from('locations')
          .select('id,name,city,state,latitude,longitude,access_type,tags,quality_score,rating,save_count,description,created_at,added_by,source,permit_required,permit_notes,permit_fee,permit_website,permit_certainty,permit_scanned_at')
          .eq('status','published').not('latitude','is',null).not('longitude','is',null).limit(500)
        setLocations((data??[]).map((loc:any,idx:number)=>({
          id:loc.id, name:loc.name,
          city:loc.city&&loc.state?`${loc.city}, ${loc.state}`:(loc.city??loc.state??''),
          lat:loc.latitude, lng:loc.longitude,
          access:loc.access_type??'public',
          rating:loc.rating?parseFloat(loc.rating).toFixed(1):'—',
          ratingNum:loc.rating?parseFloat(loc.rating):0,
          bg:BG_CYCLE[idx%BG_CYCLE.length],
          tags:loc.tags??[], saves:loc.save_count??0,
          desc:loc.description??'', qualityScore:loc.quality_score??0,
          createdAt:loc.created_at, addedBy:loc.added_by, source:loc.source,
          permit_required:loc.permit_required, permit_notes:loc.permit_notes,
          permit_fee:loc.permit_fee, permit_website:loc.permit_website,
          permit_certainty:loc.permit_certainty??'unknown', permit_scanned_at:loc.permit_scanned_at,
        })))
      } catch(e){console.error(e)} finally{setDbLoading(false)}
    }
    load()
  }, [])

  useEffect(() => {
    if (!locations.length) return
    const ids = locations.map((l: any) => l.id)
    let cancelled = false
    ;(async () => {
      // Bumped from limit(1000) — with ~500 explore locations and
      // multiple photos per source location, the old cap could starve
      // some tiles of any photo at all (same row-limit issue as the
      // dashboard fix earlier).
      const { data } = await supabase
        .from('location_photos')
        .select('location_id,url')
        .in('location_id', ids)
        .eq('is_private', false)
        .limit(5000)
      if (cancelled || !data) return
      const m: Record<string, string> = {}
      data.forEach((p: any) => { if (!m[p.location_id]) m[p.location_id] = p.url })
      setPhotoMap(m)

      // Lazy-fetch Google Place photos for locations with no DB photo.
      // Same sessionStorage cache key as dashboard/portfolio so once a
      // photo is resolved on any page, all three pages reuse it without
      // re-spending Google API credits in the same browser session.
      const numCoerce = (v: any): number => typeof v === 'number' ? v : parseFloat(v)
      const missing = locations.filter((l: any) => {
        if (m[l.id]) return false
        const lat = numCoerce(l.lat); const lng = numCoerce(l.lng)
        return Number.isFinite(lat) && Number.isFinite(lng)
      })
      missing.forEach(async (loc: any) => {
        if (cancelled) return
        const cacheKey = `google-photo:${loc.id}`
        const lat = numCoerce(loc.lat); const lng = numCoerce(loc.lng)
        try {
          const cached = typeof window !== 'undefined' ? sessionStorage.getItem(cacheKey) : null
          if (cached) {
            setPhotoMap(prev => ({ ...prev, [loc.id]: cached }))
            return
          }
          const res = await fetch('/api/place-photos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: loc.name, city: loc.city, lat, lng }),
          })
          if (!res.ok) return
          const json = await res.json()
          const url = json?.photos?.[0]?.url
          if (!url) return
          try { sessionStorage.setItem(cacheKey, url) } catch { /* quota etc. */ }
          if (cancelled) return
          setPhotoMap(prev => ({ ...prev, [loc.id]: url }))
        } catch { /* non-fatal */ }
      })
    })()
    return () => { cancelled = true }
  }, [locations])

  useEffect(() => {
    if(!user){setPortfolioSources(new Map());return}
    supabase.from('portfolio_locations').select('id,source_location_id').eq('user_id',user.id)
      .then(({data})=>{
        if(!data)return
        const m=new Map<string,string>()
        data.forEach((r:any)=>{ if(r.source_location_id) m.set(String(r.source_location_id), String(r.id)) })
        setPortfolioSources(m)
      })
  }, [user])

  useEffect(() => {
    if(!toast)return
    const id=setTimeout(()=>setToast(null),2600)
    return()=>clearTimeout(id)
  }, [toast])

  useEffect(() => {
    function onKey(e:KeyboardEvent){if(e.key==='Escape'){setDetailLoc(null);setShowFilters(false);setShowPinSearch(false)}}
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  }, [])

  function requestLocation() {
    if(!navigator.geolocation)return; setLocLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos=>{setUserLocation({lat:pos.coords.latitude,lng:pos.coords.longitude});setLocGranted(true);setLocLoading(false);setToast('📍 Showing locations near you!')},
      ()=>{setLocLoading(false)},{timeout:10000}
    )
  }

  function handlePinSearch(r:AddressResult){setSearchPin({lat:r.lat,lng:r.lng,label:r.label??r.shortLabel??''});setUserLocation({lat:r.lat,lng:r.lng});setShowPinSearch(false);setToast(`📍 Showing locations near ${r.shortLabel}`)}

  const handleMarkerClick = useCallback((id:any)=>{
    const loc=locations.find((l:any)=>String(l.id)===String(id))
    if(loc){setDetailLoc(loc);setActiveId(id);setMobileMapVisible(false)}
  },[locations])

  async function addToPortfolio(locId:any) {
    if(!user){setToast('Sign in to build your portfolio');return}
    const key=String(locId)
    if(portfolioSources.has(key))return
    try {
      const { data: full, error: fetchErr } = await supabase.from('locations')
        .select('id,name,description,city,state,latitude,longitude,access_type,tags,permit_required,permit_notes,best_time,parking_info')
        .eq('id',locId).single()
      if(fetchErr||!full)throw fetchErr??new Error('Location not found')
      const { data: inserted, error } = await supabase.from('portfolio_locations').insert({
        user_id:            user.id,
        source_location_id: full.id,
        name:               full.name,
        description:        full.description,
        city:               full.city,
        state:              full.state,
        latitude:           full.latitude,
        longitude:          full.longitude,
        access_type:        full.access_type,
        tags:               full.tags,
        permit_required:    full.permit_required,
        permit_notes:       full.permit_notes,
        best_time:          full.best_time,
        parking_info:       full.parking_info,
        is_secret:          false,
      }).select('id').single()
      if(error||!inserted)throw error??new Error('Insert failed')
      setPortfolioSources(prev=>{const n=new Map(prev);n.set(key,String(inserted.id));return n})
      setToast('✓ Added! Next: upload your own pro photos from the dashboard.')
    } catch(e: any){
      console.error(e)
      // The free-plan 5-location cap is enforced by a DB trigger.
      // Surface a clear upgrade message instead of a generic failure.
      if (typeof e?.message === 'string' && e.message.includes('free_plan_location_cap')) {
        setToast('⚠ Free plan allows 5 portfolio locations. Upgrade to Starter for unlimited.')
      } else {
        setToast('⚠ Could not add to portfolio — please try again')
      }
    }
  }

  function toggleTag(tag:string){setSelectedTags(prev=>prev.includes(tag)?prev.filter(t=>t!==tag):[...prev,tag])}
  function clearAllFilters(){setAccessFilter('All');setSelectedTags([]);setMinRating(0);setSortBy('quality')}

  const isAdmin = !!user?.email && isAdminEmail(user.email)

  // ?loc=<id> from /admin → auto-open the matching detail panel. Tries the
  // already-loaded list first; falls back to a direct DB fetch when the
  // location is filtered out or paginated past.
  useEffect(() => {
    if (typeof window === 'undefined' || dbLoading) return
    const params = new URLSearchParams(window.location.search)
    const locId = params.get('loc')
    if (!locId) return
    const existing = locations.find((l: any) => String(l.id) === String(locId))
    if (existing) {
      setDetailLoc(existing); setActiveId(existing.id)
    } else {
      supabase.from('locations')
        .select('id,name,city,state,latitude,longitude,access_type,tags,quality_score,rating,save_count,description,permit_required,permit_notes,permit_fee,permit_website,permit_certainty')
        .eq('id', locId).maybeSingle()
        .then(({ data }) => {
          if (!data) return
          setDetailLoc({
            id: data.id, name: data.name,
            city: data.city && data.state ? `${data.city}, ${data.state}` : (data.city ?? data.state ?? ''),
            lat: data.latitude, lng: data.longitude,
            access: data.access_type ?? 'public',
            rating: data.rating ? parseFloat(data.rating).toFixed(1) : '—',
            ratingNum: data.rating ? parseFloat(data.rating) : 0,
            bg: BG_CYCLE[0],
            tags: data.tags ?? [], saves: data.save_count ?? 0,
            desc: data.description ?? '', qualityScore: data.quality_score ?? 0,
            permit_required: data.permit_required, permit_notes: data.permit_notes,
            permit_fee: data.permit_fee, permit_website: data.permit_website,
            permit_certainty: data.permit_certainty,
          })
          setActiveId(data.id)
        })
    }
    // Strip the param so a refresh doesn't re-trigger this.
    params.delete('loc')
    const qs = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
  }, [dbLoading, locations])

  async function adminEditLocation(locId: string) {
    // Pull the full row so the edit modal has every column it expects to
    // render (status, source, category, etc. aren't on the lightweight
    // detailLoc shape).
    const { data, error } = await supabase.from('locations')
      .select('id,name,description,city,state,latitude,longitude,category,access_type,tags,permit_required,permit_fee,permit_notes,permit_website,permit_certainty,best_time,parking_info,status,rating,quality_score,source,created_at')
      .eq('id', locId).single()
    if (error || !data) { setToast('⚠ Could not load location for edit'); return }
    setAdminEditLoc(data as any)
  }
  async function adminSaveLocation(updates: Partial<ManagedLocation>) {
    if (!adminEditLoc) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/admin/locations/${adminEditLoc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(updates),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setToast(`⚠ ${j.error ?? 'Update failed'}`); return }
    setAdminEditLoc(null)
    setToast('✓ Saved')
    // Refresh the detail panel + the loaded markers so the change is visible.
    setLocations(prev => prev.map(l => String(l.id) === String(adminEditLoc.id) ? { ...l, ...j.location } : l))
    if (detailLoc && String(detailLoc.id) === String(adminEditLoc.id)) {
      setDetailLoc((prev: any) => prev ? { ...prev, ...j.location, name: j.location.name ?? prev.name } : prev)
    }
  }
  async function adminDeleteLocation(locId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/admin/locations/${locId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setToast(`⚠ ${j.error ?? 'Delete failed'}`); return }
    setLocations(prev => prev.filter(l => String(l.id) !== String(locId)))
    setDetailLoc(null)
    setToast('Deleted')
  }

  // Two kinds of "where am I" references, on purpose:
  //   • strictNearRef — searchPin or geolocation. Both are explicit user
  //     actions ("show me locations around here"), so we keep the strict
  //     50-mile filter — far-away spots are noise.
  //   • homeLocation — quiet personalization from profile prefs. Used only
  //     for *sort priority*; we don't drop far locations from either the
  //     map or the list, so a user in KC zooming out can still see Denver.
  const strictNearRef = searchPin
    ? { lat: searchPin.lat, lng: searchPin.lng }
    : (locGranted && userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null)

  // "Default state" = the user hasn't typed a search, picked tags, changed
  // access/rating, or swapped the sort. This is the just-opened-the-page
  // state where our smart defaults kick in (distance-from-home sort, or
  // pin-trending-six-to-top). Once they touch anything we get out of the
  // way and respect their choices.
  const isDefaultState = searchQuery.trim() === '' && selectedTags.length === 0 && accessFilter === 'All' && minRating === 0 && sortBy === 'quality'
  const homeOnly       = !!homeLocation && !strictNearRef

  const filtered = useMemo(()=>{
    let result=locations.filter((loc:any)=>{
      const matchesAccess=accessFilter==='All'?true:accessFilter==='Public'?loc.access==='public':accessFilter==='Private'?loc.access==='private':accessFilter==='My Portfolio'?portfolioSources.has(loc.id):true
      const matchesTags=selectedTags.length===0||selectedTags.some(t=>(loc.tags??[]).some((lt:string)=>lt.toLowerCase().includes(t.toLowerCase())))
      const q=searchQuery.toLowerCase().trim()
      const matchesSearch=q===''||loc.name.toLowerCase().includes(q)||loc.city.toLowerCase().includes(q)||(loc.tags??[]).some((t:string)=>t.toLowerCase().includes(q))
      const matchesRating=minRating===0||(loc.ratingNum??0)>=minRating
      // Only strict-near filters out distant pins. Home-city is sort-only.
      const matchesNear = !strictNearRef || distMiles(strictNearRef.lat, strictNearRef.lng, loc.lat, loc.lng) <= NEAR_RADIUS_MI
      return matchesAccess&&matchesTags&&matchesSearch&&matchesRating&&matchesNear
    })
    let sorted = [...result].sort((a:any,b:any)=>{
      // Strict-near (searchPin / Near me): closest first, overrides sort mode
      // since the user explicitly asked for proximity.
      if (strictNearRef) {
        const da = distMiles(strictNearRef.lat, strictNearRef.lng, a.lat, a.lng)
        const db = distMiles(strictNearRef.lat, strictNearRef.lng, b.lat, b.lng)
        if (da !== db) return da - db
      }
      // Home-city + default state: closest-to-home rises to the top, the
      // rest fall in by distance. The user's saved city locations naturally
      // bubble up first; spots in the next metro come below; coast-to-coast
      // tail still appears below that. If the user picked a non-default
      // sort we respect that instead.
      if (homeOnly && isDefaultState && homeLocation) {
        const da = distMiles(homeLocation.lat, homeLocation.lng, a.lat, a.lng)
        const db = distMiles(homeLocation.lat, homeLocation.lng, b.lat, b.lng)
        if (da !== db) return da - db
      }
      // Put locations with photos first regardless of sort mode. Blank-gradient
      // cards at the top look like the photos are broken.
      const ap=photoMap[a.id]?1:0, bp=photoMap[b.id]?1:0
      if(ap!==bp)return bp-ap
      switch(sortBy){
        case'quality':return(b.qualityScore??0)-(a.qualityScore??0)
        case'rating_asc':return(a.ratingNum??0)-(b.ratingNum??0)
        case'name':return a.name.localeCompare(b.name)
        case'newest':return new Date(b.createdAt??0).getTime()-new Date(a.createdAt??0).getTime()
        default:return 0
      }
    })
    // No reference at all + default state → pin the same six curated
    // highlights the marketing home page shows to the very top, then let
    // the rest of the catalog flow below by quality_score (popularity).
    // This gives signed-in users with no home set the same "what's
    // hot right now" landing as anonymous visitors, plus the long tail
    // they need for actual exploration.
    if (!strictNearRef && !homeOnly && isDefaultState) {
      const trending = sorted.filter((l:any) => l.source === 'curated').slice(0, 6)
      const trendingIds = new Set(trending.map((l:any) => l.id))
      const rest = sorted.filter((l:any) => !trendingIds.has(l.id))
      sorted = [...trending, ...rest]
    }
    return sorted
  },[locations,accessFilter,selectedTags,searchQuery,minRating,sortBy,user,photoMap,strictNearRef,homeLocation,homeOnly,isDefaultState])

  const activeFilterCount=(accessFilter!=='All'?1:0)+selectedTags.length+(minRating>0?1:0)+(sortBy!=='quality'?1:0)

  return (
    <div style={{height:'100svh',display:'flex',flexDirection:'column',overflow:'hidden',background:'#f9f6f1'}}>

      <AppNav rightExtra={user ? <Link href="/dashboard" className="explore-back-dash" style={{fontSize:12,color:'rgba(245,240,232,.55)',textDecoration:'none',padding:'5px 10px',borderRadius:4,border:'1px solid rgba(255,255,255,.15)',whiteSpace:'nowrap'}}>← Dashboard</Link> : null} />

      {/* Location banner */}
      {!locGranted&&(
        <div style={{background:'rgba(61,110,140,.08)',borderBottom:'1px solid rgba(61,110,140,.18)',padding:'8px 1.5rem',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,gap:12}}>
          <div style={{fontSize:13,color:'var(--sky)'}}>📍 Allow location access to see spots near you</div>
          <button onClick={requestLocation} disabled={locLoading} style={{padding:'5px 16px',borderRadius:4,background:'var(--sky)',color:'white',border:'none',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',opacity:locLoading?.6:1}}>
            {locLoading?'Getting…':'Use my location'}
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div style={{background:'white',borderBottom:'1px solid var(--cream-dark)',flexShrink:0,zIndex:100}}>
        <div className="explore-filter-row" style={{padding:'8px 1.5rem',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <button onClick={()=>setShowFilters(p=>!p)} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:20,fontSize:12,fontWeight:500,border:`1px solid ${showFilters||activeFilterCount>0?'var(--gold)':'var(--cream-dark)'}`,background:showFilters||activeFilterCount>0?'rgba(196,146,42,.08)':'white',color:showFilters||activeFilterCount>0?'var(--gold)':'var(--ink-soft)',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',flexShrink:0}}>
            ⚙ Filters & Sort
            {activeFilterCount>0&&<span style={{width:16,height:16,borderRadius:'50%',background:'var(--gold)',color:'var(--ink)',fontSize:10,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>{activeFilterCount}</span>}
          </button>
          {user&&<button onClick={()=>setAccessFilter(accessFilter==='My Portfolio'?'All':'My Portfolio')} style={{display:'flex',alignItems:'center',gap:5,padding:'7px 14px',borderRadius:20,fontSize:12,fontWeight:600,border:'none',background:accessFilter==='My Portfolio'?'var(--gold)':'var(--ink)',color:accessFilter==='My Portfolio'?'var(--ink)':'var(--cream)',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',flexShrink:0,boxShadow:'0 2px 6px rgba(26,22,18,.15)'}}>
            {accessFilter==='My Portfolio'?'✓ My Portfolio':'⭐ My Portfolio'}
            {portfolioSources.size>0&&<span style={{padding:'1px 7px',borderRadius:20,fontSize:10,fontWeight:700,background:accessFilter==='My Portfolio'?'rgba(26,22,18,.15)':'rgba(196,146,42,.3)',color:accessFilter==='My Portfolio'?'var(--ink)':'var(--gold)'}}>{portfolioSources.size}</span>}
          </button>}
          <button onClick={()=>setShowPinSearch(p=>!p)} style={{display:'flex',alignItems:'center',gap:5,padding:'7px 14px',borderRadius:20,fontSize:12,fontWeight:500,border:`1px solid ${searchPin?'var(--sky)':'var(--cream-dark)'}`,background:searchPin?'rgba(61,110,140,.08)':'white',color:searchPin?'var(--sky)':'var(--ink-soft)',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',flexShrink:0}}>
            📍 {searchPin?searchPin.label.split(',')[0]:'Find Locations Near'}
            {searchPin&&<span onClick={e=>{e.stopPropagation();setSearchPin(null);setUserLocation(null)}} style={{marginLeft:2}}>✕</span>}
          </button>
          <button onClick={requestLocation} disabled={locLoading} style={{display:'flex',alignItems:'center',gap:5,padding:'7px 14px',borderRadius:20,fontSize:12,fontWeight:500,border:`1px solid ${locGranted?'var(--sage)':'var(--cream-dark)'}`,background:locGranted?'rgba(74,103,65,.08)':'white',color:locGranted?'var(--sage)':'var(--ink-soft)',cursor:locLoading?'default':'pointer',fontFamily:'inherit',whiteSpace:'nowrap',flexShrink:0,opacity:locLoading?.6:1}}>
            {locLoading?'Locating…':locGranted?'✓ Near me':'📡 Near me'}
          </button>
          {accessFilter!=='All'&&<span onClick={()=>setAccessFilter('All')} style={{padding:'4px 10px',borderRadius:20,fontSize:11,background:'var(--ink)',color:'var(--cream)',cursor:'pointer',display:'flex',alignItems:'center',gap:5,flexShrink:0,marginLeft:'auto'}}>{accessFilter} ✕</span>}
          {selectedTags.map(t=><span key={t} onClick={()=>toggleTag(t)} style={{padding:'4px 10px',borderRadius:20,fontSize:11,background:'var(--ink)',color:'var(--cream)',cursor:'pointer',display:'flex',alignItems:'center',gap:5,flexShrink:0}}>{t} ✕</span>)}
          {activeFilterCount>0&&<button onClick={clearAllFilters} style={{fontSize:11,color:'var(--rust)',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',padding:0,fontWeight:500}}>Clear all</button>}
        </div>

        {showPinSearch&&(
          <div style={{padding:'0 1.5rem 1rem',borderTop:'1px solid var(--cream-dark)'}}>
            <div style={{fontSize:12,color:'var(--ink-soft)',marginBottom:6,paddingTop:10}}>Search for a city or address to find nearby locations:</div>
            <AddressSearch onSelect={handlePinSearch} placeholder="e.g. Loose Park, Kansas City…"/>
          </div>
        )}

        {showFilters&&(
          <div className="explore-filter-panel">
            <div><div style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--ink-soft)',marginBottom:8}}>Access</div><div className="explore-filter-section">{(['All','Public','Private','My Portfolio'] as AccessFilter[]).map(opt=><button key={opt} onClick={()=>setAccessFilter(opt)} style={{padding:'6px 12px',borderRadius:20,fontSize:12,fontWeight:500,border:`1px solid ${accessFilter===opt?'var(--gold)':'var(--cream-dark)'}`,background:accessFilter===opt?'rgba(196,146,42,.12)':'white',color:accessFilter===opt?'var(--gold)':'var(--ink-soft)',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>{opt}</button>)}</div></div>
            <div><div style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--ink-soft)',marginBottom:8}}>Location type</div><div className="explore-filter-section">{ALL_TAGS.map(tag=><button key={tag} onClick={()=>toggleTag(tag)} style={{padding:'5px 10px',borderRadius:20,fontSize:11,fontWeight:500,border:`1px solid ${selectedTags.includes(tag)?'var(--gold)':'var(--cream-dark)'}`,background:selectedTags.includes(tag)?'rgba(196,146,42,.12)':'white',color:selectedTags.includes(tag)?'var(--gold)':'var(--ink-soft)',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>{tag}</button>)}</div></div>
            <div><div style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--ink-soft)',marginBottom:8}}>Min rating</div><div className="explore-filter-section">{RATING_OPTIONS.map(opt=><button key={opt.value} onClick={()=>setMinRating(opt.value)} style={{padding:'6px 12px',borderRadius:20,fontSize:12,fontWeight:500,border:`1px solid ${minRating===opt.value?'var(--gold)':'var(--cream-dark)'}`,background:minRating===opt.value?'rgba(196,146,42,.12)':'white',color:minRating===opt.value?'var(--gold)':'var(--ink-soft)',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>{opt.label}</button>)}</div></div>
            <div><div style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--ink-soft)',marginBottom:8}}>Sort by</div><div className="explore-filter-section">{SORT_OPTIONS.map(opt=><button key={opt.value} onClick={()=>setSortBy(opt.value as SortValue)} style={{padding:'6px 12px',borderRadius:20,fontSize:12,fontWeight:500,border:`1px solid ${sortBy===opt.value?'var(--gold)':'var(--cream-dark)'}`,background:sortBy===opt.value?'rgba(196,146,42,.12)':'white',color:sortBy===opt.value?'var(--gold)':'var(--ink-soft)',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>{opt.label}</button>)}</div></div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="explore-body">

        {/* ── SIDEBAR ──
            FIX 2: No position:sticky on search/count headers.
            Sticky inside overflow:auto can intercept clicks in some browsers.
            The sidebar scrolls as a whole — search/count scroll away naturally. */}
        <div className={`explore-sidebar${mobileMapVisible?' mobile-hidden':''}`}>

          {/* Search — normal flow, no sticky */}
          <div style={{background:'white',borderBottom:'1px solid var(--cream-dark)',padding:'10px 1.25rem',flexShrink:0}}>
            <div style={{position:'relative'}}>
              <input type="text" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search locations"
                style={{width:'100%',padding:'8px 32px 8px 12px',border:'1px solid var(--cream-dark)',borderRadius:6,fontFamily:'inherit',fontSize:13,outline:'none',color:'var(--ink)',background:'white'}}/>
              {searchQuery
                ?<button onClick={()=>setSearchQuery('')} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:14,color:'var(--ink-soft)',lineHeight:1}}>✕</button>
                :<span style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',fontSize:14,color:'var(--ink-soft)',pointerEvents:'none'}}>🔍</span>}
            </div>
          </div>

          {/* Count — normal flow, no sticky */}
          <div style={{background:'#f9f6f1',borderBottom:'1px solid var(--cream-dark)',padding:'7px 1.25rem',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
            <div style={{fontSize:13,fontWeight:500,color:'var(--ink)'}}>
              {dbLoading?<span style={{color:'var(--ink-soft)',fontWeight:300}}>Loading…</span>:<>{filtered.length}<span style={{fontWeight:300,color:'var(--ink-soft)',fontSize:11}}> of {locations.length}</span></>}
            </div>
            <div style={{fontSize:11,color:'var(--ink-soft)'}}>{SORT_OPTIONS.find(s=>s.value===sortBy)?.label}</div>
          </div>

          {/* Location list — scroll wrapper keeps search/count pinned at top */}
          <div style={{flex:1,minHeight:0,overflowY:'auto'}}>
          {dbLoading?(
            <div style={{padding:'3rem',textAlign:'center'}}>
              <div style={{width:28,height:28,border:'2px solid var(--cream-dark)',borderTop:'2px solid var(--gold)',borderRadius:'50%',animation:'spin .7s linear infinite',margin:'0 auto 12px'}}/>
              <div style={{fontSize:13,color:'var(--ink-soft)',fontWeight:300}}>Loading locations…</div>
            </div>
          ):filtered.length===0?(
            <div style={{padding:'2rem',textAlign:'center'}}>
              <div style={{fontSize:32,marginBottom:10}}>🔍</div>
              <div style={{fontSize:14,fontWeight:500,color:'var(--ink)',marginBottom:6}}>{locations.length===0?'No locations yet':'No matches'}</div>
              <div style={{fontSize:13,color:'var(--ink-soft)',fontWeight:300}}>{locations.length===0?'Run the AI scanner from your dashboard.':'Try adjusting your filters.'}</div>
              {activeFilterCount>0&&<button onClick={clearAllFilters} style={{marginTop:12,padding:'6px 16px',borderRadius:20,background:'var(--gold)',color:'var(--ink)',border:'none',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit'}}>Clear filters</button>}
            </div>
          ):filtered.map((loc:any)=>{
            const isActive=String(activeId)===String(loc.id)
            const thumb=photoMap[loc.id]
            return(
              <div key={String(loc.id)}
                onClick={()=>{ setDetailLoc(loc); setActiveId(loc.id) }}
                style={{display:'flex',gap:10,padding:'10px 1.25rem',borderBottom:'1px solid var(--cream-dark)',cursor:'pointer',background:isActive?'rgba(196,146,42,.06)':'white',borderLeft:`3px solid ${isActive?'var(--gold)':'transparent'}`,transition:'background .12s'}}>
                <div
                  className={thumb ? loc.bg : undefined}
                  onClick={thumb ? e => { e.stopPropagation(); setLightboxSrc(thumb) } : undefined}
                  style={{
                    width:56, height:56, borderRadius:8, flexShrink:0,
                    position:'relative', overflow:'hidden',
                    cursor: thumb ? 'zoom-in' : 'pointer',
                    background: thumb ? undefined : 'var(--cream-dark)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}
                >
                  {thumb
                    ? <img
                        src={thumbUrl(thumb) ?? thumb}
                        alt=""
                        decoding="async"
                        // Render-endpoint fallback — see notes on the
                        // dashboard portfolio tile. Without this, a flaky
                        // /render/image/ response leaves the tile sitting
                        // on its background-color placeholder forever.
                        onError={e => { if (e.currentTarget.src !== thumb) e.currentTarget.src = thumb }}
                        style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}
                      />
                    : <span style={{fontSize:22,color:'var(--ink-soft)',opacity:.45}}>📍</span>
                  }
                  {loc.rating!=='—'&&<div style={{position:'absolute',bottom:3,right:3,background:'rgba(26,22,18,.75)',borderRadius:4,padding:'1px 5px',fontSize:10,fontWeight:600,color:'var(--gold)',zIndex:1}}>★{loc.rating}</div>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500,color:'var(--ink)',marginBottom:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{loc.name}</div>
                  <div style={{fontSize:11,color:'var(--ink-soft)',marginBottom:4}}>📍 {loc.city}</div>
                  <span style={{padding:'2px 7px',borderRadius:20,fontSize:10,fontWeight:500,background:loc.access==='public'?'rgba(74,103,65,.1)':'rgba(181,75,42,.1)',color:loc.access==='public'?'var(--sage)':'var(--rust)',border:`1px solid ${loc.access==='public'?'rgba(74,103,65,.2)':'rgba(181,75,42,.2)'}`}}>{loc.access==='public'?'● Public':'🔒 Private'}</span>
                </div>
              </div>
            )
          })}

          <div style={{height:80}}/>
          </div>
        </div>

        {/* Map */}
        <div className={`explore-map-col${mobileMapVisible?' mobile-visible':''}`}>
          {mobileMapVisible&&(
            <button onClick={()=>setMobileMapVisible(false)} style={{position:'absolute',top:12,left:12,zIndex:500,display:'flex',alignItems:'center',gap:6,padding:'8px 14px',borderRadius:20,background:'rgba(26,22,18,.9)',color:'var(--cream)',border:'1px solid rgba(255,255,255,.15)',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit',backdropFilter:'blur(4px)'}}>
              ← List
            </button>
          )}
          <ExploreMap locations={filtered as ExploreLocation[]} activeId={activeId} userLocation={userLocation} homeLocation={homeLocation} onMarkerClick={handleMarkerClick}/>
          <div style={{position:'absolute',bottom:24,left:16,zIndex:500,background:'white',borderRadius:8,padding:'.75rem 1rem',border:'1px solid var(--cream-dark)',boxShadow:'0 4px 16px rgba(26,22,18,.1)'}}>
            {[{color:'#4a6741',label:'Public'},{color:'#b54b2a',label:'Private'},{color:'#c4922a',label:'Selected'},{color:'#3d6e8c',label:'You'}].map(item=>(
              <div key={item.label} style={{display:'flex',alignItems:'center',gap:7,fontSize:11,color:'var(--ink)',marginBottom:3}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:item.color,border:'2px solid white',flexShrink:0}}/>{item.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <button className="explore-mobile-toggle" onClick={()=>setMobileMapVisible(p=>!p)}>
        {mobileMapVisible?'☰ View List':'🗺 View Map'}
        {!mobileMapVisible&&filtered.length>0&&<span style={{padding:'2px 8px',borderRadius:20,background:'rgba(255,255,255,.15)',fontSize:11}}>{filtered.length}</span>}
      </button>

      {detailLoc&&(
        <DetailPanel loc={detailLoc} portfolioId={portfolioSources.get(String(detailLoc.id)) ?? null} onClose={()=>setDetailLoc(null)} onAddToPortfolio={addToPortfolio} onSignIn={()=>setAuthOpen('login')} onOpenLightbox={openLightbox} user={user} isAdmin={isAdmin} onAdminEdit={adminEditLocation} onAdminDelete={adminDeleteLocation}/>
      )}
      {adminEditLoc&&(
        <LocationEditModal loc={adminEditLoc} onClose={()=>setAdminEditLoc(null)} onSave={adminSaveLocation}/>
      )}
      {authOpen&&<AuthModal initialMode={authOpen} onClose={()=>setAuthOpen(null)}/>}
      <ImageLightbox src={lightboxSrc} startIndex={lightboxStart} onClose={()=>setLightboxSrc(null)}/>

      {toast&&(
        <div style={{position:'fixed',bottom:'5rem',right:'1.5rem',background:'var(--ink)',color:'var(--cream)',padding:'10px 18px',borderRadius:10,fontSize:13,border:'1px solid rgba(255,255,255,.1)',zIndex:9999,boxShadow:'0 8px 32px rgba(0,0,0,.3)'}}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        /* FIX 3: Force Leaflet map container to always fill its column */
        .explore-map-col .leaflet-container {
          height: 100% !important;
          min-height: 300px;
        }
        /* Mobile-only back-to-Dashboard chip next to hamburger */
        .explore-back-dash { display: none; }
        @media (max-width: 768px) {
          .explore-back-dash { display: inline-block; }
        }
      `}</style>
    </div>
  )
}