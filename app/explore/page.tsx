'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usePlacePhotos } from '@/hooks/usePlacePhotos'
import AddressSearch, { type AddressResult } from '@/components/AddressSearch'
import type { ExploreLocation } from '@/components/ExploreMap'

const ExploreMap = dynamic(() => import('@/components/ExploreMap'), { ssr: false })

const BG_CYCLE = ['bg-1','bg-2','bg-3','bg-4','bg-5','bg-6']
const ALL_TAGS = ['Golden Hour','Sunrise','Sunset','Forest','Urban','Waterfront','Historic','Nature','Gardens','Architecture','Romantic','Dramatic','Editorial','Meadow','Creek','Bridge','Mural','Rooftop','Barn','Ranch','Vineyard','Campus','Trail','Industrial','Rustic','Colorful','Wedding','Family']
const SORT_OPTIONS = [{ value: 'quality', label: '⭐ Top rated' },{ value: 'rating_asc', label: '↑ Lowest rated' },{ value: 'name', label: '🔤 Name A–Z' },{ value: 'newest', label: '🕒 Newest first' },{ value: 'saves', label: '❤ Most saved' }]
const RATING_OPTIONS = [{ value: 0, label: 'Any rating' },{ value: 4.5, label: '★ 4.5+' },{ value: 4.0, label: '★ 4.0+' },{ value: 3.5, label: '★ 3.5+' },{ value: 3.0, label: '★ 3.0+' }]
const PERMIT_CFG: Record<string,{label:string;bg:string;color:string;border:string}> = {
  verified: { label: '✓ Permit Verified',      bg: 'rgba(181,75,42,.1)',  color: 'var(--rust)', border: 'rgba(181,75,42,.25)' },
  likely:   { label: '⚠ Permit Likely Needed', bg: 'rgba(196,146,42,.1)', color: 'var(--gold)', border: 'rgba(196,146,42,.25)' },
  unknown:  { label: '? Permit Unknown',        bg: 'var(--cream-dark)',   color: 'var(--ink-soft)', border: 'var(--sand)' },
}

type SortValue = 'quality'|'rating_asc'|'name'|'newest'|'saves'
type AccessFilter = 'All'|'Public'|'Private'|'My Locations'

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useCommunityPhotos(locationId: any, currentUserId: string|null) {
  const [photos,  setPhotos]  = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!locationId) return
    setLoading(true)
    supabase.from('location_photos').select('id,url,is_private,caption,photographer_name,created_at,user_id').eq('location_id', locationId).order('created_at',{ascending:false})
      .then(({ data }) => { setPhotos((data??[]).filter((p:any)=>!p.is_private||p.user_id===currentUserId)); setLoading(false) })
  }, [locationId, currentUserId])
  return { photos, loading }
}

// ── Photo upload ──────────────────────────────────────────────────────────────

function PhotoUploadPanel({ locationId, user, onUpload }: { locationId:any; user:any; onUpload:()=>void }) {
  const [files,setFiles]=useState<File[]>([])
  const [isPrivate,setIsPrivate]=useState(false)
  const [caption,setCaption]=useState('')
  const [uploading,setUploading]=useState(false)
  const [count,setCount]=useState(0)
  const [done,setDone]=useState(false)
  const ref=useRef<HTMLInputElement>(null)
  async function upload(){
    if(!user||!files.length)return;setUploading(true);let c=0
    const {data:p}=await supabase.from('profiles').select('full_name').eq('id',user.id).single()
    for(const f of files){try{const ext=f.name.split('.').pop(),path=`${user.id}/${locationId}/${Date.now()}.${ext}`;const{error:ue}=await supabase.storage.from('location-photos').upload(path,f,{contentType:f.type});if(ue)continue;const{data:u}=supabase.storage.from('location-photos').getPublicUrl(path);await supabase.from('location_photos').insert({location_id:locationId,user_id:user.id,url:u.publicUrl,storage_path:path,is_private:isPrivate,caption:caption.trim()||null,photographer_name:p?.full_name??''});c++;setCount(c)}catch(e){console.error(e)}}
    setUploading(false);setDone(true);onUpload()
  }
  if(done)return<div style={{padding:'12px 14px',background:'rgba(74,103,65,.08)',border:'1px solid rgba(74,103,65,.2)',borderRadius:8,fontSize:13,color:'var(--sage)',textAlign:'center'}}>✓ {count} photo{count!==1?'s':''} uploaded!</div>
  return(
    <div style={{border:'1px solid var(--cream-dark)',borderRadius:10,overflow:'hidden'}}>
      <div style={{padding:'10px 14px',background:'var(--cream)',borderBottom:'1px solid var(--cream-dark)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{fontSize:13,fontWeight:500,color:'var(--ink)'}}>📷 Add your photos</div>
        <button onClick={()=>ref.current?.click()} style={{padding:'5px 12px',borderRadius:4,background:'var(--ink)',color:'var(--cream)',border:'none',fontSize:11,fontWeight:500,cursor:'pointer',fontFamily:'inherit'}}>Browse</button>
        <input ref={ref} type="file" accept="image/*" multiple onChange={e=>setFiles(p=>[...p,...Array.from(e.target.files??[])].slice(0,10))} style={{display:'none'}}/>
      </div>
      <div style={{padding:'12px 14px'}}>
        {!files.length?<div onClick={()=>ref.current?.click()} style={{border:'2px dashed var(--cream-dark)',borderRadius:8,padding:'1rem',textAlign:'center',cursor:'pointer'}}><div style={{fontSize:22,marginBottom:4}}>📷</div><div style={{fontSize:12,color:'var(--ink-soft)',fontWeight:300}}>Click to select photos</div></div>:(
          <>
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:5,marginBottom:10}}>
              {files.map((f,i)=><div key={i} style={{position:'relative',aspectRatio:'1',borderRadius:6,overflow:'hidden',border:'1px solid var(--cream-dark)'}}><img src={URL.createObjectURL(f)} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/><button onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))} style={{position:'absolute',top:2,right:2,width:18,height:18,borderRadius:'50%',background:'rgba(26,22,18,.7)',border:'none',cursor:'pointer',fontSize:10,color:'white',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button></div>)}
            </div>
            <input value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Caption (optional)" style={{width:'100%',padding:'7px 10px',border:'1px solid var(--cream-dark)',borderRadius:4,fontFamily:'inherit',fontSize:12,outline:'none',marginBottom:8}}/>
            <div onClick={()=>setIsPrivate(p=>!p)} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:6,cursor:'pointer',border:`1px solid ${isPrivate?'rgba(124,92,191,.3)':'var(--cream-dark)'}`,background:isPrivate?'rgba(124,92,191,.05)':'white',marginBottom:10}}>
              <div style={{width:16,height:16,borderRadius:3,border:`1.5px solid ${isPrivate?'#7c5cbf':'var(--sand)'}`,background:isPrivate?'#7c5cbf':'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'white',flexShrink:0}}>{isPrivate?'✓':''}</div>
              <div style={{fontSize:12,fontWeight:500,color:isPrivate?'#7c5cbf':'var(--ink)'}}>🔒 Private</div>
            </div>
            <button onClick={upload} disabled={uploading} style={{width:'100%',padding:'9px',borderRadius:4,background:'var(--gold)',color:'var(--ink)',border:'none',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit',opacity:uploading?.6:1}}>
              {uploading?`Uploading… (${count}/${files.length})`:`Upload ${files.length} photo${files.length!==1?'s':''}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Modals ────────────────────────────────────────────────────────────────────

function ReportModal({ locName, onClose }: { locName:string; onClose:()=>void }) {
  const [msg,setMsg]=useState('');const [sent,setSent]=useState(false)
  return(<><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(26,22,18,.5)',zIndex:600}}/><div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',background:'white',borderRadius:12,width:420,maxWidth:'92vw',padding:'1.5rem',zIndex:700,boxShadow:'0 20px 60px rgba(0,0,0,.25)'}}>
    {sent?<div style={{textAlign:'center',padding:'1rem 0'}}><div style={{fontSize:36,marginBottom:10}}>✓</div><div style={{fontSize:16,fontWeight:500,color:'var(--ink)',marginBottom:6}}>Thanks!</div><button onClick={onClose} style={{padding:'8px 20px',borderRadius:4,background:'var(--gold)',color:'var(--ink)',border:'none',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit'}}>Close</button></div>
    :<><div style={{fontSize:16,fontWeight:500,color:'var(--ink)',marginBottom:4}}>Report a correction</div><div style={{fontSize:13,color:'var(--ink-soft)',marginBottom:'1rem'}}>{locName}</div><textarea value={msg} onChange={e=>setMsg(e.target.value)} rows={4} placeholder="Describe the correction…" style={{width:'100%',padding:'9px 12px',border:'1px solid var(--cream-dark)',borderRadius:4,fontFamily:'inherit',fontSize:13,outline:'none',resize:'vertical',marginBottom:10}}/><div style={{display:'flex',gap:8}}><button onClick={()=>setSent(true)} disabled={!msg.trim()} style={{flex:1,padding:'9px',borderRadius:4,background:'var(--ink)',color:'var(--cream)',border:'none',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit',opacity:msg.trim()?1:.4}}>Send</button><button onClick={onClose} style={{padding:'9px 16px',borderRadius:4,background:'transparent',color:'var(--ink-soft)',border:'1px solid var(--sand)',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button></div></>}
  </div></>)
}

function AddLocationModal({ onClose, user }: { onClose:()=>void; user:any }) {
  const [name,setName]=useState('');const [city,setCity]=useState('');const [state,setState]=useState('');const [desc,setDesc]=useState('');const [access,setAccess]=useState('public');const [tags,setTags]=useState<string[]>([]);const [tagIn,setTagIn]=useState('');const [saving,setSaving]=useState(false);const [saved,setSaved]=useState(false);const [err,setErr]=useState('');const [pin,setPin]=useState<{lat:number;lng:number}|null>(null);const [photos,setPhotos]=useState<File[]>([]);const ref=useRef<HTMLInputElement>(null)
  const SUGGESTIONS=['Golden Hour','Forest','Urban','Waterfront','Historic','Nature','Romantic','Dramatic','Meadow','Creek','Bridge']
  function onAddr(r:AddressResult){setPin({lat:r.lat,lng:r.lng});if(!name.trim()){const p=r.label?.split(',')??[];if(p.length>0)setName(p[0].trim())};if(!city.trim()){const p=r.label?.split(',')??[];if(p.length>1)setCity(p[1].trim())}}
  function addTag(t:string){const v=t.trim();if(!v||tags.includes(v)||tags.length>=8)return;setTags(p=>[...p,v]);setTagIn('')}
  const input:React.CSSProperties={width:'100%',padding:'9px 12px',border:'1px solid var(--cream-dark)',borderRadius:4,fontFamily:'var(--font-dm-sans),sans-serif',fontSize:14,color:'var(--ink)',background:'white',outline:'none'}
  const label:React.CSSProperties={display:'block',fontSize:11,fontWeight:500,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--ink-soft)',marginBottom:5}
  async function submit(){if(!name.trim()||!city.trim()||!state.trim()){setErr('Name, city, and state are required.');return}if(!pin){setErr('Please search for the location first.');return}setSaving(true);setErr('');try{const{data,error:ie}=await supabase.from('locations').insert({name:name.trim(),city:city.trim(),state:state.trim().slice(0,2).toUpperCase(),latitude:pin.lat,longitude:pin.lng,description:desc.trim()||null,access_type:access,tags,status:'pending',source:'community',added_by:user?.id??null}).select('id').single();if(ie)throw ie;if(photos.length>0&&data?.id){const{data:prof}=user?await supabase.from('profiles').select('full_name').eq('id',user.id).single():{data:null};for(const f of photos){try{const ext=f.name.split('.').pop(),path=`${user?.id??'guest'}/${data.id}/${Date.now()}.${ext}`;const{error:ue}=await supabase.storage.from('location-photos').upload(path,f,{contentType:f.type});if(ue)continue;const{data:u}=supabase.storage.from('location-photos').getPublicUrl(path);await supabase.from('location_photos').insert({location_id:data.id,user_id:user?.id??null,url:u.publicUrl,storage_path:path,is_private:false,caption:null,photographer_name:prof?.full_name??''})}catch{}}}setSaved(true)}catch(e:any){setErr('Could not submit — please try again.');console.error(e)}finally{setSaving(false)}}
  return(<><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(26,22,18,.6)',backdropFilter:'blur(4px)',zIndex:800}}/><div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',background:'white',borderRadius:16,width:560,maxWidth:'94vw',maxHeight:'92vh',overflowY:'auto',zIndex:900,boxShadow:'0 24px 64px rgba(0,0,0,.3)'}}>
    <div style={{padding:'1.5rem'}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'1.25rem'}}><div><div style={{fontFamily:'var(--font-playfair),serif',fontSize:22,fontWeight:700,color:'var(--ink)',marginBottom:3}}>📍 Add a location</div><div style={{fontSize:13,color:'var(--ink-soft)',fontWeight:300}}>Know a great spot? Submit it to the community.</div></div><button onClick={onClose} style={{width:32,height:32,borderRadius:'50%',background:'var(--cream-dark)',border:'none',cursor:'pointer',fontSize:16,color:'var(--ink-soft)',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button></div>
      {saved?<div style={{textAlign:'center',padding:'2rem 0'}}><div style={{fontSize:48,marginBottom:12}}>🎉</div><div style={{fontFamily:'var(--font-playfair),serif',fontSize:20,fontWeight:700,color:'var(--ink)',marginBottom:8}}>Thanks!</div><div style={{fontSize:14,color:'var(--ink-soft)',fontWeight:300,marginBottom:'1.5rem'}}>Your location has been submitted for review.</div><button onClick={onClose} style={{padding:'10px 24px',borderRadius:4,background:'var(--gold)',color:'var(--ink)',border:'none',fontSize:14,fontWeight:500,cursor:'pointer',fontFamily:'inherit'}}>Done</button></div>
      :<>
        <div style={{marginBottom:'1.25rem'}}><label style={label}>Search for the location *</label><AddressSearch onSelect={onAddr} placeholder="Search by name or address…"/>{pin&&<div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 13px',borderRadius:6,marginTop:8,background:'rgba(74,103,65,.08)',border:'1px solid rgba(74,103,65,.2)',fontSize:13,color:'var(--sage)'}}><span>📍</span><div style={{flex:1}}><div style={{fontWeight:500}}>Pin placed</div><div style={{fontSize:10,marginTop:1}}>{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</div></div><button onClick={()=>setPin(null)} style={{fontSize:11,color:'var(--rust)',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>Clear</button></div>}</div>
        <div style={{marginBottom:'1rem'}}><label style={label}>Location name *</label><input value={name} onChange={e=>setName(e.target.value)} style={input}/></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 90px',gap:10,marginBottom:'1rem'}}><div><label style={label}>City *</label><input value={city} onChange={e=>setCity(e.target.value)} style={input}/></div><div><label style={label}>State *</label><input value={state} onChange={e=>setState(e.target.value.slice(0,2).toUpperCase())} style={input} placeholder="MO" maxLength={2}/></div></div>
        <div style={{marginBottom:'1rem'}}><label style={label}>Description</label><textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3} style={{...input,resize:'vertical'}}/></div>
        <div style={{marginBottom:'1rem'}}><label style={label}>Access</label><div style={{display:'flex',gap:8}}>{['public','private'].map(t=><button key={t} onClick={()=>setAccess(t)} style={{flex:1,padding:'9px',borderRadius:4,border:`1.5px solid ${access===t?'var(--gold)':'var(--cream-dark)'}`,background:access===t?'rgba(196,146,42,.08)':'white',color:access===t?'var(--gold)':'var(--ink-soft)',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit'}}>{t==='public'?'● Public':'🔒 Private'}</button>)}</div></div>
        <div style={{marginBottom:'1.25rem'}}><label style={label}>Tags (up to 8)</label><div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:8}}>{SUGGESTIONS.map(t=><button key={t} onClick={()=>addTag(t)} style={{padding:'3px 9px',borderRadius:20,fontSize:11,cursor:'pointer',fontFamily:'inherit',border:'1px solid var(--sand)',background:tags.includes(t)?'var(--ink)':'var(--cream)',color:tags.includes(t)?'var(--cream)':'var(--ink-soft)'}}>{t}</button>)}</div>{tags.length>0&&<div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:6}}>{tags.map(t=><span key={t} onClick={()=>setTags(p=>p.filter(x=>x!==t))} style={{padding:'3px 8px',borderRadius:20,fontSize:11,background:'var(--gold)',color:'var(--ink)',cursor:'pointer',fontWeight:500}}>{t} ✕</span>)}</div>}<div style={{display:'flex',gap:6}}><input value={tagIn} onChange={e=>setTagIn(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addTag(tagIn)}} placeholder="Custom tag…" style={{...input,flex:1}}/><button onClick={()=>addTag(tagIn)} style={{padding:'9px 14px',borderRadius:4,background:'var(--ink)',color:'var(--cream)',border:'none',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Add</button></div></div>
        <div style={{marginBottom:'1.25rem'}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}><label style={{...label,marginBottom:0}}>Photos (optional)</label><button onClick={()=>ref.current?.click()} style={{padding:'6px 12px',borderRadius:4,background:'var(--ink)',color:'var(--cream)',border:'none',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit'}}>+ Add</button><input ref={ref} type="file" accept="image/*" multiple onChange={e=>setPhotos(p=>[...p,...Array.from(e.target.files??[])].slice(0,10))} style={{display:'none'}}/></div>
        {photos.length>0?<div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:6}}>{photos.map((f,i)=><div key={i} style={{position:'relative',aspectRatio:'1',borderRadius:8,overflow:'hidden',border:'1px solid var(--cream-dark)'}}><img src={URL.createObjectURL(f)} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/><button onClick={()=>setPhotos(p=>p.filter((_,j)=>j!==i))} style={{position:'absolute',top:3,right:3,width:20,height:20,borderRadius:'50%',background:'rgba(26,22,18,.7)',border:'none',cursor:'pointer',fontSize:12,color:'white',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button></div>)}</div>
        :<div onClick={()=>ref.current?.click()} style={{border:'2px dashed var(--cream-dark)',borderRadius:10,padding:'1rem',textAlign:'center',cursor:'pointer',background:'var(--cream)'}}><div style={{fontSize:24,marginBottom:4}}>📷</div><div style={{fontSize:12,color:'var(--ink-soft)',fontWeight:300}}>Tap to add photos</div></div>}</div>
        {err&&<div style={{padding:'8px 12px',background:'rgba(181,75,42,.08)',border:'1px solid rgba(181,75,42,.2)',borderRadius:6,fontSize:13,color:'var(--rust)',marginBottom:'1rem'}}>{err}</div>}
        <div style={{display:'flex',gap:10}}><button onClick={submit} disabled={saving||!name.trim()||!city.trim()||!state.trim()||!pin} style={{flex:1,padding:'12px',borderRadius:4,background:'var(--gold)',color:'var(--ink)',border:'none',fontSize:14,fontWeight:500,cursor:'pointer',fontFamily:'inherit',opacity:saving||!name.trim()||!city.trim()||!state.trim()||!pin?.5:1}}>{saving?'Submitting…':!pin?'Search for location first':'Submit location →'}</button><button onClick={onClose} style={{padding:'12px 20px',borderRadius:4,background:'transparent',color:'var(--ink-soft)',border:'1px solid var(--sand)',fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button></div>
      </>}
    </div>
  </div></>)
}

// ── Detail panel ──────────────────────────────────────────────────────────────
// Defined OUTSIDE the main component so it's a stable React component.
// Google photos are loaded inside a try/catch wrapper to prevent crashes
// from taking down the whole panel.

function DetailPanel({ loc, isFav, isInPortfolio, onClose, onToggleFavorite, onAddToPortfolio, user }: {
  loc:any; isFav:boolean; isInPortfolio:boolean; onClose:()=>void; onToggleFavorite:(id:any)=>void; onAddToPortfolio:(id:any)=>void; user:any
}) {
  const router = useRouter()
  const { photos: googlePhotos, loading: googleLoading } = usePlacePhotos(loc.name, loc.city, loc.lat, loc.lng)
  const { photos: communityPhotos } = useCommunityPhotos(loc.id, user?.id ?? null)
  const [activePhoto, setActivePhoto] = useState(0)
  const [photoTab,    setPhotoTab]    = useState<'google'|'community'|'upload'>('google')
  const [showReport,  setShowReport]  = useState(false)

  useEffect(() => { setActivePhoto(0); setPhotoTab('google') }, [loc.id])
  useEffect(() => {
    if (!googleLoading && !googlePhotos.length && communityPhotos.length) setPhotoTab('community')
  }, [googleLoading, googlePhotos.length, communityPhotos.length])

  const hasGoogle    = googlePhotos.length > 0
  const hasCommunity = communityPhotos.length > 0
  const permitCfg    = PERMIT_CFG[loc.permit_certainty ?? 'unknown'] ?? PERMIT_CFG.unknown

  function shareWithClient() {
    sessionStorage.setItem('sharePreselectedLocation', JSON.stringify({ id:loc.id, name:loc.name, city:loc.city, lat:loc.lat, lng:loc.lng, access:loc.access, rating:loc.rating, bg:loc.bg, type:'favorite' }))
    router.push('/share?step=3')
  }

  return (
    <>
      <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(26,22,18,.5)',backdropFilter:'blur(3px)',zIndex:400}}/>
      <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:600,background:'white',borderRadius:'16px 16px 0 0',zIndex:500,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 -8px 48px rgba(26,22,18,.25)'}}>
        <div style={{display:'flex',justifyContent:'center',padding:'12px 0 6px'}}><div style={{width:36,height:4,borderRadius:2,background:'var(--sand)'}}/></div>
        <button onClick={onClose} style={{position:'absolute',top:14,right:14,width:32,height:32,borderRadius:'50%',background:'rgba(26,22,18,.6)',border:'none',cursor:'pointer',fontSize:16,color:'white',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10}}>✕</button>

        {/* Photo area */}
        <div style={{position:'relative',height:220,background:'#1a1612',overflow:'hidden'}}>
          {photoTab==='google'&&(googleLoading
            ?<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}><div className={loc.bg} style={{position:'absolute',inset:0,opacity:.4}}/><div style={{width:24,height:24,border:'2px solid rgba(255,255,255,.2)',borderTop:'2px solid rgba(255,255,255,.7)',borderRadius:'50%',animation:'spin .7s linear infinite',zIndex:1}}/></div>
            :hasGoogle?<img src={googlePhotos[activePhoto].url} alt={loc.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
            :<div className={loc.bg} style={{position:'absolute',inset:0}}/>)}
          {photoTab==='community'&&(hasCommunity?<img src={communityPhotos[0].url} alt={loc.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<div className={loc.bg} style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:8}}><span style={{fontSize:32}}>📷</span><span style={{fontSize:12,color:'rgba(255,255,255,.6)'}}>No community photos yet</span></div>)}
          {photoTab==='upload'&&<div className={loc.bg} style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:36}}>📷</span></div>}
          {photoTab!=='upload'&&<div style={{position:'absolute',top:10,left:10,padding:'4px 10px',borderRadius:4,fontSize:11,fontWeight:500,background:loc.access==='public'?'rgba(74,103,65,.85)':'rgba(181,75,42,.85)',color:loc.access==='public'?'#c8e8c4':'#ffd0c0',backdropFilter:'blur(4px)'}}>{loc.access==='public'?'● Public':'🔒 Private'}</div>}
          {photoTab==='google'&&hasGoogle&&googlePhotos.length>1&&<div style={{position:'absolute',top:10,right:10,background:'rgba(26,22,18,.7)',borderRadius:20,padding:'3px 10px',fontSize:11,color:'rgba(255,255,255,.8)'}}>{activePhoto+1} / {googlePhotos.length}</div>}
        </div>

        {/* Photo tabs */}
        <div style={{borderBottom:'1px solid var(--cream-dark)',display:'flex',overflowX:'auto'}}>
          {[{key:'google',label:`Google${hasGoogle?` (${googlePhotos.length})`:''}`},{key:'community',label:`Photographer${hasCommunity?` (${communityPhotos.length})`:''}`},{key:'upload',label:user?'+ Add yours':'📷 Sign in to add'}].map(tab=>(
            <button key={tab.key} onClick={()=>{if(tab.key==='upload'&&!user)return;setPhotoTab(tab.key as any)}} style={{padding:'8px 14px',fontSize:12,fontWeight:500,border:'none',borderBottom:`2px solid ${photoTab===tab.key?'var(--gold)':'transparent'}`,background:'white',color:photoTab===tab.key?'var(--ink)':'var(--ink-soft)',cursor:tab.key==='upload'&&!user?'default':'pointer',fontFamily:'inherit',whiteSpace:'nowrap',opacity:tab.key==='upload'&&!user?.5:1,flexShrink:0}}>{tab.label}</button>
          ))}
        </div>
        {photoTab==='google'&&hasGoogle&&googlePhotos.length>1&&<div style={{display:'flex',gap:4,padding:'8px 1.25rem',overflowX:'auto',borderBottom:'1px solid var(--cream-dark)'}}>
          {googlePhotos.map((p,i)=><div key={i} onClick={()=>setActivePhoto(i)} style={{width:56,height:56,borderRadius:6,flexShrink:0,overflow:'hidden',cursor:'pointer',border:`2px solid ${activePhoto===i?'var(--gold)':'transparent'}`}}><img src={p.url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/></div>)}
        </div>}
        {photoTab==='google'&&<div style={{padding:'6px 1.25rem',borderBottom:'1px solid var(--cream-dark)',display:'flex',alignItems:'center',gap:6}}><img src="https://developers.google.com/static/maps/documentation/images/google_on_white.png" alt="Google" style={{height:11,opacity:.4}}/><span style={{fontSize:10,color:'var(--ink-soft)'}}>Photos via Google · Not affiliated with LocateShoot</span></div>}
        {photoTab==='upload'&&user&&<div style={{padding:'1rem 1.25rem',borderBottom:'1px solid var(--cream-dark)'}}><PhotoUploadPanel locationId={loc.id} user={user} onUpload={()=>setPhotoTab('community')}/></div>}

        {/* Details */}
        <div style={{padding:'1rem 1.25rem 1.5rem'}}>
          <div style={{fontFamily:'var(--font-playfair),serif',fontSize:22,fontWeight:700,color:'var(--ink)',marginBottom:3}}>{loc.name}</div>
          <div style={{fontSize:13,color:'var(--ink-soft)',marginBottom:'1rem'}}>📍 {loc.city}</div>
          {(loc.tags??[]).length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:'1rem'}}>{(loc.tags??[]).map((t:string)=><span key={t} style={{padding:'4px 10px',borderRadius:20,fontSize:12,background:'var(--cream-dark)',color:'var(--ink-soft)',border:'1px solid var(--sand)'}}>{t}</span>)}</div>}
          {loc.desc&&<p style={{fontSize:14,color:'var(--ink-soft)',fontWeight:300,lineHeight:1.7,marginBottom:'1.25rem'}}>{loc.desc}</p>}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:'1rem'}}>
            {[{icon:'🔒',label:'Access',value:loc.access==='public'?'Free public access':'Private — booking required'},{icon:'⭐',label:'Rating',value:loc.rating!=='—'?`${loc.rating} out of 5`:'Not yet rated'},{icon:'❤',label:'Saves',value:(loc.saves??0)>0?`${loc.saves}`:'Be the first!'},{icon:'📷',label:'Photos',value:`${hasGoogle?googlePhotos.length:0} Google · ${hasCommunity?communityPhotos.length:0} community`}].map(item=>(
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
            {loc.permit_website&&<a href={loc.permit_website} target="_blank" rel="noopener noreferrer" style={{display:'block',marginTop:6,fontSize:12,color:'var(--sky)',textDecoration:'none',fontWeight:500}}>View permit info →</a>}
          </div>
          {user
            ? <button
                onClick={()=>!isInPortfolio&&onAddToPortfolio(loc.id)}
                disabled={isInPortfolio}
                style={{width:'100%',padding:'12px',borderRadius:4,cursor:isInPortfolio?'default':'pointer',fontFamily:'inherit',fontSize:14,fontWeight:600,marginBottom:10,background:isInPortfolio?'rgba(74,103,65,.1)':'var(--gold)',color:isInPortfolio?'var(--sage)':'var(--ink)',border:isInPortfolio?'1px solid rgba(74,103,65,.3)':'none'}}>
                {isInPortfolio?'✓ In your portfolio':'+ Add to my portfolio'}
              </button>
            : <Link href="/" style={{display:'block',width:'100%',padding:'12px',borderRadius:4,background:'var(--ink)',color:'var(--cream)',fontFamily:'inherit',fontSize:14,fontWeight:600,textDecoration:'none',textAlign:'center',marginBottom:10}}>Join free to build your portfolio →</Link>}
          <div style={{display:'flex',gap:10,marginBottom:'1rem'}}>
            <button onClick={()=>onToggleFavorite(loc.id)} style={{flex:1,padding:'12px',borderRadius:4,cursor:'pointer',fontFamily:'inherit',fontSize:14,fontWeight:500,background:isFav?'rgba(196,146,42,.1)':'var(--cream)',color:isFav?'var(--gold)':'var(--ink-soft)',border:`1px solid ${isFav?'rgba(196,146,42,.3)':'var(--cream-dark)'}`}}>{isFav?'♥ Saved':'♡ Save to favorites'}</button>
            {user&&<button onClick={shareWithClient} style={{flex:1,padding:'12px',borderRadius:4,background:'var(--cream)',color:'var(--ink-soft)',border:'1px solid var(--cream-dark)',fontFamily:'inherit',fontSize:14,fontWeight:500,cursor:'pointer'}}>🔗 Share with client</button>}
          </div>
          <div style={{padding:'10px 12px',background:'rgba(196,146,42,.04)',border:'1px solid rgba(196,146,42,.15)',borderRadius:6,marginBottom:10}}>
            <div style={{fontSize:10,color:'var(--ink-soft)',lineHeight:1.6,fontWeight:300}}>⚠ <strong style={{fontWeight:500}}>Disclaimer:</strong> Always verify access rights, permit requirements, and safety before your session.</div>
          </div>
          <div style={{textAlign:'center'}}><button onClick={()=>setShowReport(true)} style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:'var(--ink-soft)',fontFamily:'inherit',textDecoration:'underline',padding:0}}>Report a correction</button></div>
        </div>
      </div>
      {showReport&&<ReportModal locName={loc.name} onClose={()=>setShowReport(false)}/>}
    </>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ExplorePage() {
  const [locations,      setLocations]      = useState<any[]>([])
  const [dbLoading,      setDbLoading]      = useState(true)
  const [userLocation,   setUserLocation]   = useState<{lat:number;lng:number}|null>(null)
  const [locGranted,     setLocGranted]     = useState(false)
  const [locLoading,     setLocLoading]     = useState(false)
  const [activeId,       setActiveId]       = useState<any>(null)
  const [detailLoc,      setDetailLoc]      = useState<any>(null)
  const [favorites,      setFavorites]      = useState<Set<any>>(new Set())
  const [user,           setUser]           = useState<any>(null)
  const [toast,          setToast]          = useState<string|null>(null)
  const [searchQuery,    setSearchQuery]    = useState('')
  const [showAddModal,   setShowAddModal]   = useState(false)
  const [showFilters,    setShowFilters]    = useState(false)
  const [accessFilter,   setAccessFilter]   = useState<AccessFilter>('All')
  const [selectedTags,   setSelectedTags]   = useState<string[]>([])
  const [minRating,      setMinRating]      = useState(0)
  const [sortBy,         setSortBy]         = useState<SortValue>('quality')
  const [photoMap,       setPhotoMap]       = useState<Record<string,string>>({})
  const [portfolioSources, setPortfolioSources] = useState<Set<string>>(new Set())
  const [mobileMapVisible, setMobileMapVisible] = useState(false)
  const [mobileMenuOpen,   setMobileMenuOpen]   = useState(false)
  const [searchPin,        setSearchPin]        = useState<{lat:number;lng:number;label:string}|null>(null)
  const [showPinSearch,    setShowPinSearch]    = useState(false)

  // ── FIX 1: Trigger Leaflet resize on mount so map fills its container ──
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 400)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (mobileMapVisible) setTimeout(() => window.dispatchEvent(new Event('resize')), 150)
  }, [mobileMapVisible])

  useEffect(() => { supabase.auth.getUser().then(({data:{user}})=>setUser(user)) }, [])

  useEffect(() => {
    async function load() {
      setDbLoading(true)
      try {
        const { data } = await supabase.from('locations')
          .select('id,name,city,state,latitude,longitude,access_type,tags,quality_score,rating,save_count,description,created_at,added_by,permit_required,permit_notes,permit_fee,permit_website,permit_certainty,permit_scanned_at')
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
          createdAt:loc.created_at, addedBy:loc.added_by,
          permit_required:loc.permit_required, permit_notes:loc.permit_notes,
          permit_fee:loc.permit_fee, permit_website:loc.permit_website,
          permit_certainty:loc.permit_certainty??'unknown', permit_scanned_at:loc.permit_scanned_at,
        })))
      } catch(e){console.error(e)} finally{setDbLoading(false)}
    }
    load()
  }, [])

  useEffect(() => {
    if(!locations.length)return
    const ids=locations.slice(0,200).map((l:any)=>l.id)
    supabase.from('location_photos').select('location_id,url').in('location_id',ids).eq('is_private',false).limit(300)
      .then(({data})=>{if(!data)return;const m:Record<string,string>={};data.forEach((p:any)=>{if(!m[p.location_id])m[p.location_id]=p.url});setPhotoMap(m)})
  }, [locations])

  useEffect(() => {
    if(!user)return
    supabase.from('favorites').select('location_id').eq('user_id',user.id)
      .then(({data})=>{if(data)setFavorites(new Set(data.map((f:any)=>f.location_id)))})
  }, [user])

  useEffect(() => {
    if(!user){setPortfolioSources(new Set());return}
    supabase.from('portfolio_locations').select('source_location_id').eq('user_id',user.id)
      .then(({data})=>{if(data)setPortfolioSources(new Set(data.map((r:any)=>r.source_location_id).filter(Boolean)))})
  }, [user])

  useEffect(() => {
    if(!toast)return
    const id=setTimeout(()=>setToast(null),2600)
    return()=>clearTimeout(id)
  }, [toast])

  useEffect(() => {
    function onKey(e:KeyboardEvent){if(e.key==='Escape'){setDetailLoc(null);setShowAddModal(false);setShowFilters(false);setMobileMenuOpen(false);setShowPinSearch(false)}}
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

  async function toggleFavorite(locId:any, e?:React.MouseEvent) {
    e?.stopPropagation()
    if(!user){setToast('Sign in to save favorites');return}
    if(favorites.has(locId)||favorites.has(Number(locId))){
      setFavorites(prev=>{const n=new Set(prev);n.delete(locId);n.delete(Number(locId));return n});setToast('Removed from favorites')
      await supabase.from('favorites').delete().eq('user_id',user.id).eq('location_id',locId)
    } else {
      setFavorites(prev=>new Set([...prev,locId]));setToast('❤ Saved!')
      await supabase.from('favorites').insert({user_id:user.id,location_id:locId})
    }
  }

  async function addToPortfolio(locId:any) {
    if(!user){setToast('Sign in to build your portfolio');return}
    if(portfolioSources.has(locId))return
    setPortfolioSources(prev=>new Set([...prev,locId]))
    try {
      const { data: full, error: fetchErr } = await supabase.from('locations')
        .select('id,name,description,city,state,latitude,longitude,access_type,tags,permit_required,permit_notes,best_time,parking_info')
        .eq('id',locId).single()
      if(fetchErr||!full)throw fetchErr??new Error('Location not found')
      const { error } = await supabase.from('portfolio_locations').insert({
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
      })
      if(error)throw error
      setToast('✓ Added to your portfolio! Add your own photos from your dashboard.')
    } catch(e){
      console.error(e)
      setPortfolioSources(prev=>{const n=new Set(prev);n.delete(locId);return n})
      setToast('⚠ Could not add to portfolio — please try again')
    }
  }

  function toggleTag(tag:string){setSelectedTags(prev=>prev.includes(tag)?prev.filter(t=>t!==tag):[...prev,tag])}
  function clearAllFilters(){setAccessFilter('All');setSelectedTags([]);setMinRating(0);setSortBy('quality')}

  const filtered = useMemo(()=>{
    let result=locations.filter((loc:any)=>{
      const matchesAccess=accessFilter==='All'?true:accessFilter==='Public'?loc.access==='public':accessFilter==='Private'?loc.access==='private':accessFilter==='My Locations'?loc.addedBy===user?.id:true
      const matchesTags=selectedTags.length===0||selectedTags.some(t=>(loc.tags??[]).some((lt:string)=>lt.toLowerCase().includes(t.toLowerCase())))
      const q=searchQuery.toLowerCase().trim()
      const matchesSearch=q===''||loc.name.toLowerCase().includes(q)||loc.city.toLowerCase().includes(q)||(loc.tags??[]).some((t:string)=>t.toLowerCase().includes(q))
      const matchesRating=minRating===0||(loc.ratingNum??0)>=minRating
      return matchesAccess&&matchesTags&&matchesSearch&&matchesRating
    })
    return[...result].sort((a:any,b:any)=>{
      switch(sortBy){
        case'quality':return(b.qualityScore??0)-(a.qualityScore??0)
        case'rating_asc':return(a.ratingNum??0)-(b.ratingNum??0)
        case'name':return a.name.localeCompare(b.name)
        case'newest':return new Date(b.createdAt??0).getTime()-new Date(a.createdAt??0).getTime()
        case'saves':return(b.saves??0)-(a.saves??0)
        default:return 0
      }
    })
  },[locations,accessFilter,selectedTags,searchQuery,minRating,sortBy,user])

  const activeFilterCount=(accessFilter!=='All'?1:0)+selectedTags.length+(minRating>0?1:0)+(sortBy!=='quality'?1:0)

  return (
    <div style={{height:'100svh',display:'flex',flexDirection:'column',overflow:'hidden',background:'#f9f6f1'}}>

      {/* NAV */}
      <nav style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 1.5rem',height:56,background:'rgba(26,22,18,.96)',backdropFilter:'blur(8px)',borderBottom:'1px solid rgba(255,255,255,.07)',flexShrink:0,zIndex:200}}>
        <Link href="/" style={{fontFamily:'var(--font-playfair),serif',fontSize:18,fontWeight:900,color:'var(--cream)',display:'flex',alignItems:'center',gap:7,textDecoration:'none'}}>
          <span style={{width:6,height:6,borderRadius:'50%',background:'var(--gold)',display:'inline-block'}}/>LocateShoot
        </Link>
        <div className="nav-links" style={{flex:1,maxWidth:400,margin:'0 1.5rem',position:'relative'}}>
          <input type="text" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search locations, tags, cities…" style={{width:'100%',padding:'7px 14px 7px 34px',background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.15)',borderRadius:6,color:'var(--cream)',fontFamily:'inherit',fontSize:13,outline:'none'}}/>
          <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:14,color:'rgba(245,240,232,.4)'}}>🔍</span>
        </div>
        <div className="nav-links" style={{display:'flex',alignItems:'center',gap:10}}>
          <button onClick={()=>setShowAddModal(true)} style={{padding:'6px 12px',borderRadius:4,background:'rgba(196,146,42,.15)',color:'var(--gold)',border:'1px solid rgba(196,146,42,.3)',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>+ Add location</button>
          {user?<Link href="/dashboard" style={{fontSize:13,color:'rgba(245,240,232,.55)',textDecoration:'none'}}>Dashboard</Link>
            :<Link href="/" style={{padding:'5px 14px',borderRadius:4,background:'var(--gold)',color:'var(--ink)',fontSize:13,fontWeight:500,textDecoration:'none'}}>Join Free</Link>}
        </div>
        <button className="hamburger-btn" onClick={()=>setMobileMenuOpen(p=>!p)}>{mobileMenuOpen?'✕':'☰'}</button>
      </nav>

      {mobileMenuOpen&&(
        <div className="mobile-menu" onClick={()=>setMobileMenuOpen(false)}>
          {user?<Link href="/dashboard">Dashboard</Link>:<Link href="/">Join Free</Link>}
          <button onClick={()=>{setShowAddModal(true);setMobileMenuOpen(false)}} style={{padding:'12px 0',fontSize:15,color:'rgba(245,240,232,.7)',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',textAlign:'left',borderBottom:'1px solid rgba(255,255,255,.06)'}}>+ Add a location</button>
          <button onClick={()=>{requestLocation();setMobileMenuOpen(false)}} style={{padding:'12px 0',fontSize:15,color:'rgba(245,240,232,.7)',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}>📍 Near me</button>
        </div>
      )}

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
        <div style={{padding:'8px 1.5rem',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <button onClick={()=>setShowFilters(p=>!p)} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:20,fontSize:12,fontWeight:500,border:`1px solid ${showFilters||activeFilterCount>0?'var(--gold)':'var(--cream-dark)'}`,background:showFilters||activeFilterCount>0?'rgba(196,146,42,.08)':'white',color:showFilters||activeFilterCount>0?'var(--gold)':'var(--ink-soft)',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',flexShrink:0}}>
            ⚙ Filters & Sort
            {activeFilterCount>0&&<span style={{width:16,height:16,borderRadius:'50%',background:'var(--gold)',color:'var(--ink)',fontSize:10,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>{activeFilterCount}</span>}
          </button>
          <button onClick={()=>setShowPinSearch(p=>!p)} style={{display:'flex',alignItems:'center',gap:5,padding:'7px 14px',borderRadius:20,fontSize:12,fontWeight:500,border:`1px solid ${searchPin?'var(--sky)':'var(--cream-dark)'}`,background:searchPin?'rgba(61,110,140,.08)':'white',color:searchPin?'var(--sky)':'var(--ink-soft)',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',flexShrink:0}}>
            📍 {searchPin?searchPin.label.split(',')[0]:'Find near…'}
            {searchPin&&<span onClick={e=>{e.stopPropagation();setSearchPin(null);setUserLocation(null)}} style={{marginLeft:2}}>✕</span>}
          </button>
          {accessFilter!=='All'&&<span onClick={()=>setAccessFilter('All')} style={{padding:'4px 10px',borderRadius:20,fontSize:11,background:'var(--ink)',color:'var(--cream)',cursor:'pointer',display:'flex',alignItems:'center',gap:5,flexShrink:0}}>{accessFilter} ✕</span>}
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
            <div><div style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--ink-soft)',marginBottom:8}}>Access</div><div className="explore-filter-section">{(['All','Public','Private','My Locations'] as AccessFilter[]).map(opt=><button key={opt} onClick={()=>setAccessFilter(opt)} style={{padding:'6px 12px',borderRadius:20,fontSize:12,fontWeight:500,border:`1px solid ${accessFilter===opt?'var(--gold)':'var(--cream-dark)'}`,background:accessFilter===opt?'rgba(196,146,42,.12)':'white',color:accessFilter===opt?'var(--gold)':'var(--ink-soft)',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>{opt}</button>)}</div></div>
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
              <input type="text" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search locations, tags, cities…"
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
            const isFav=favorites.has(loc.id)||favorites.has(Number(loc.id))
            const thumb=photoMap[loc.id]
            return(
              <div key={String(loc.id)}
                onClick={()=>{ setDetailLoc(loc); setActiveId(loc.id) }}
                style={{display:'flex',gap:10,padding:'10px 1.25rem',borderBottom:'1px solid var(--cream-dark)',cursor:'pointer',background:isActive?'rgba(196,146,42,.06)':'white',borderLeft:`3px solid ${isActive?'var(--gold)':'transparent'}`,transition:'background .12s'}}>
                <div className={loc.bg} style={{width:56,height:56,borderRadius:8,flexShrink:0,position:'relative',overflow:'hidden'}}>
                  {thumb&&<img src={thumb} alt="" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}/>}
                  {loc.rating!=='—'&&<div style={{position:'absolute',bottom:3,right:3,background:'rgba(26,22,18,.75)',borderRadius:4,padding:'1px 5px',fontSize:10,fontWeight:600,color:'var(--gold)',zIndex:1}}>★{loc.rating}</div>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500,color:'var(--ink)',marginBottom:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{loc.name}</div>
                  <div style={{fontSize:11,color:'var(--ink-soft)',marginBottom:4}}>📍 {loc.city}</div>
                  <span style={{padding:'2px 7px',borderRadius:20,fontSize:10,fontWeight:500,background:loc.access==='public'?'rgba(74,103,65,.1)':'rgba(181,75,42,.1)',color:loc.access==='public'?'var(--sage)':'var(--rust)',border:`1px solid ${loc.access==='public'?'rgba(74,103,65,.2)':'rgba(181,75,42,.2)'}`}}>{loc.access==='public'?'● Public':'🔒 Private'}</span>
                </div>
                <button onClick={e=>toggleFavorite(loc.id,e)} style={{width:28,height:28,borderRadius:'50%',border:`1px solid ${isFav?'rgba(196,146,42,.4)':'var(--cream-dark)'}`,background:isFav?'rgba(196,146,42,.1)':'white',cursor:'pointer',fontSize:14,color:isFav?'var(--gold)':'var(--ink-soft)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {isFav?'♥':'♡'}
                </button>
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
          <ExploreMap locations={filtered as ExploreLocation[]} activeId={activeId} userLocation={userLocation} onMarkerClick={handleMarkerClick}/>
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
        <DetailPanel loc={detailLoc} isFav={favorites.has(detailLoc.id)||favorites.has(Number(detailLoc.id))} isInPortfolio={portfolioSources.has(detailLoc.id)} onClose={()=>setDetailLoc(null)} onToggleFavorite={toggleFavorite} onAddToPortfolio={addToPortfolio} user={user}/>
      )}
      {showAddModal&&<AddLocationModal onClose={()=>setShowAddModal(false)} user={user}/>}

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
      `}</style>
    </div>
  )
}