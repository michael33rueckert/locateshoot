'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface Template {
  id: number
  name: string
  body: string
}

const INITIAL_TEMPLATES: Template[] = [
  { id:1, name:'Standard session',    body:"Hi! Here are my top picks for our session. Each one has a different vibe — take a look and let me know which speaks to you. Happy to answer any questions! 📷" },
  { id:2, name:'Wedding / engagement',body:"Hi! I'm so excited for your session! I've picked out some beautiful locations that I think would be perfect for you two. Browse through and choose the one that feels most like you. Can't wait! 💍" },
  { id:3, name:'Family session',      body:"Hi! Here are a few great spots I think your family will love. I've picked locations that are easy to get to with kids and have beautiful light. Take a look and let me know your favorite! 🌿" },
  { id:4, name:'Unfamiliar area',     body:"Hi! I've been scouting locations near you and put together some great options. A few of these are spots I personally love, and some are highly-rated community recommendations in your area. Pick the one that excites you most!" },
]

const NAV_ITEMS = [
  { id:'profile',     icon:'👤', label:'Profile'                },
  { id:'branding',    icon:'🎨', label:'Branding'               },
  { id:'templates',   icon:'✉️',  label:'Message Templates'      },
  { id:'preferences', icon:'⚙',  label:'Preferences'            },
  { id:'billing',     icon:'💳', label:'Subscription & Billing' },
  { id:'password',    icon:'🔒', label:'Password & Security'    },
]

export default function ProfilePage() {
  const [active,        setActive]        = useState('profile')
  const [templates,     setTemplates]     = useState<Template[]>(INITIAL_TEMPLATES)
  const [editingId,     setEditingId]     = useState<number | null>(null)
  const [editName,      setEditName]      = useState('')
  const [editBody,      setEditBody]      = useState('')
  const [showNewForm,   setShowNewForm]   = useState(false)
  const [newName,       setNewName]       = useState('')
  const [newBody,       setNewBody]       = useState('')
  const [toast,         setToast]         = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  // Profile fields
  const [fullName,   setFullName]   = useState('Sydney Lane')
  const [studioName, setStudioName] = useState('Sydney Lane Photography')
  const [email,      setEmail]      = useState('sydney@slphotography.com')
  const [instagram,  setInstagram]  = useState('@sydneylane.photo')
  const [website,    setWebsite]    = useState('www.sydneylane.photography')

  // Branding fields
  const [logoPreview,    setLogoPreview]    = useState<string | null>(null)
  const [brandAccent,    setBrandAccent]    = useState('#c4922a')
  const [showStudioName, setShowStudioName] = useState(true)
  const [shareTagline,   setShareTagline]   = useState('Let\'s find your perfect spot together.')
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const hash = window.location.hash.replace('#','')
    if (hash && NAV_ITEMS.find(n => n.id === hash)) setActive(hash)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(id)
  }, [toast])

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function startEdit(t: Template) {
    setEditingId(t.id); setEditName(t.name); setEditBody(t.body); setShowNewForm(false)
  }

  function saveEdit() {
    if (!editName.trim() || !editBody.trim()) return
    setTemplates(prev => prev.map(t => t.id === editingId ? {...t,name:editName.trim(),body:editBody.trim()} : t))
    setEditingId(null); setToast('✓ Template saved!')
  }

  function cancelEdit() { setEditingId(null); setEditName(''); setEditBody('') }

  function addTemplate() {
    if (!newName.trim() || !newBody.trim()) return
    const newId = Math.max(...templates.map(t=>t.id),0)+1
    setTemplates(prev => [...prev,{id:newId,name:newName.trim(),body:newBody.trim()}])
    setNewName(''); setNewBody(''); setShowNewForm(false); setToast('✓ Template created!')
  }

  function deleteTemplate(id: number) {
    if (deleteConfirm !== id) { setDeleteConfirm(id); return }
    setTemplates(prev => prev.filter(t=>t.id!==id)); setDeleteConfirm(null); setToast('Template deleted')
  }

  const inputStyle: React.CSSProperties = {
    width:'100%', padding:'9px 12px',
    border:'1px solid var(--cream-dark)', borderRadius:4,
    fontFamily:'var(--font-dm-sans),sans-serif',
    fontSize:14, color:'var(--ink)', background:'white', outline:'none',
  }

  const labelStyle: React.CSSProperties = {
    display:'block', fontSize:11, fontWeight:500,
    textTransform:'uppercase', letterSpacing:'.07em',
    color:'var(--ink-soft)', marginBottom:5,
  }

  const sectionTitle = (title: string, sub?: string) => (
    <div style={{ marginBottom:'2rem',paddingBottom:'1.25rem',borderBottom:'1px solid var(--cream-dark)' }}>
      <h2 style={{ fontFamily:'var(--font-playfair),serif',fontSize:24,fontWeight:700,color:'var(--ink)',marginBottom:sub?4:0 }}>{title}</h2>
      {sub && <p style={{ fontSize:14,color:'var(--ink-soft)',fontWeight:300 }}>{sub}</p>}
    </div>
  )

  const ACCENT_COLORS = ['#c4922a','#4a6741','#3d6e8c','#b54b2a','#7c5cbf','#1a1612','#d4626a','#4a7a9b']

  return (
    <div style={{ display:'grid',gridTemplateColumns:'240px 1fr',minHeight:'100vh',background:'#f0ece4' }}>

      {/* SIDEBAR */}
      <div style={{ background:'white',borderRight:'1px solid var(--cream-dark)',display:'flex',flexDirection:'column',position:'sticky',top:0,height:'100vh' }}>
        <div style={{ padding:'1.25rem 1.5rem',borderBottom:'1px solid var(--cream-dark)' }}>
          <Link href="/" style={{ fontFamily:'var(--font-playfair),serif',fontSize:17,fontWeight:900,color:'var(--ink)',display:'flex',alignItems:'center',gap:6,textDecoration:'none' }}>
            <span style={{ width:7,height:7,borderRadius:'50%',background:'var(--gold)',display:'inline-block' }} />LocateShoot
          </Link>
        </div>
        <div style={{ padding:'1rem 1.5rem 0.5rem' }}>
          <Link href="/dashboard" style={{ fontSize:12,color:'var(--ink-soft)',textDecoration:'none',display:'flex',alignItems:'center',gap:4 }}>← Back to dashboard</Link>
        </div>
        <div style={{ padding:'0.5rem 0.75rem',flex:1 }}>
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => setActive(item.id)} style={{ display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 12px',borderRadius:4,border:'none',cursor:'pointer',textAlign:'left',fontFamily:'var(--font-dm-sans),sans-serif',fontSize:13,fontWeight:active===item.id?500:400,color:active===item.id?'var(--gold)':'var(--ink-soft)',background:active===item.id?'rgba(196,146,42,.08)':'transparent',marginBottom:2,transition:'all .15s' }}>
              <span style={{ fontSize:15,width:18,textAlign:'center' }}>{item.icon}</span>{item.label}
            </button>
          ))}
        </div>
        <div style={{ padding:'1rem 1.25rem',borderTop:'1px solid var(--cream-dark)' }}>
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            {logoPreview
              ? <img src={logoPreview} alt="Logo" style={{ width:34,height:34,borderRadius:'50%',objectFit:'cover',flexShrink:0 }} />
              : <div style={{ width:34,height:34,borderRadius:'50%',background:'rgba(196,146,42,.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:600,color:'var(--gold)',flexShrink:0 }}>SL</div>
            }
            <div>
              <div style={{ fontSize:13,fontWeight:500,color:'var(--ink)' }}>Sydney Lane</div>
              <div style={{ fontSize:11,color:'var(--ink-soft)' }}>Pro member</div>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ padding:'2.5rem 3rem',maxWidth:760 }}>

        {/* PROFILE */}
        {active==='profile' && (
          <div>
            {sectionTitle('Profile','Your public information shown to clients and the community.')}
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginBottom:'1rem' }}>
              <div><label style={labelStyle}>Full name</label><input value={fullName} onChange={e=>setFullName(e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Studio / business name</label><input value={studioName} onChange={e=>setStudioName(e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Email address</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Instagram handle</label><input value={instagram} onChange={e=>setInstagram(e.target.value)} style={inputStyle} /></div>
              <div style={{ gridColumn:'1 / -1' }}><label style={labelStyle}>Website</label><input value={website} onChange={e=>setWebsite(e.target.value)} style={inputStyle} /></div>
            </div>
            <button onClick={() => setToast('✓ Profile saved!')} style={{ background:'var(--gold)',color:'var(--ink)',padding:'10px 24px',borderRadius:4,border:'none',fontSize:14,fontWeight:500,cursor:'pointer',fontFamily:'inherit' }}>Save profile</button>
          </div>
        )}

        {/* ── BRANDING ── */}
        {active==='branding' && (
          <div>
            {sectionTitle('Branding','Your logo and colors appear on client share pages, making the experience feel like it\'s from you.')}

            {/* Logo upload */}
            <div style={{ background:'white',border:'1px solid var(--cream-dark)',borderRadius:10,padding:'1.25rem',marginBottom:'1.25rem' }}>
              <div style={{ fontSize:14,fontWeight:500,color:'var(--ink)',marginBottom:'1rem' }}>Studio logo</div>

              <div style={{ display:'flex',alignItems:'center',gap:'1.5rem',marginBottom:'1rem' }}>
                {/* Preview circle */}
                <div style={{ width:80,height:80,borderRadius:'50%',border:'2px dashed var(--sand)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,overflow:'hidden',background:'var(--cream)' }}>
                  {logoPreview
                    ? <img src={logoPreview} alt="Logo preview" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
                    : <div style={{ textAlign:'center' }}>
                        <div style={{ fontSize:22,marginBottom:2 }}>📷</div>
                        <div style={{ fontSize:10,color:'var(--ink-soft)' }}>No logo</div>
                      </div>
                  }
                </div>

                <div>
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display:'none' }} />
                  <button onClick={() => logoInputRef.current?.click()} style={{ display:'block',padding:'9px 18px',borderRadius:4,border:'1.5px solid var(--sand)',background:'white',fontSize:13,fontWeight:500,color:'var(--ink-soft)',cursor:'pointer',fontFamily:'inherit',marginBottom:8,transition:'all .15s' }}>
                    Upload logo
                  </button>
                  {logoPreview && (
                    <button onClick={() => setLogoPreview(null)} style={{ display:'block',padding:'6px 12px',borderRadius:4,border:'none',background:'transparent',fontSize:12,color:'var(--rust)',cursor:'pointer',fontFamily:'inherit' }}>
                      Remove logo
                    </button>
                  )}
                  <div style={{ fontSize:11,color:'var(--ink-soft)',fontWeight:300,marginTop:4,lineHeight:1.5 }}>
                    PNG or JPG · Recommended: square, at least 200×200px
                  </div>
                </div>
              </div>

              <div style={{ padding:'10px 14px',background:'rgba(196,146,42,.05)',border:'1px solid rgba(196,146,42,.15)',borderRadius:6,fontSize:12,color:'var(--ink-soft)',lineHeight:1.55,fontWeight:300 }}>
                Your logo appears in the top-left corner of client share pages and in the confirmation email they receive after choosing a location.
              </div>
            </div>

            {/* Accent color */}
            <div style={{ background:'white',border:'1px solid var(--cream-dark)',borderRadius:10,padding:'1.25rem',marginBottom:'1.25rem' }}>
              <div style={{ fontSize:14,fontWeight:500,color:'var(--ink)',marginBottom:4 }}>Accent color</div>
              <div style={{ fontSize:13,color:'var(--ink-soft)',fontWeight:300,marginBottom:'1rem' }}>Used for buttons and highlights on your client share pages.</div>

              <div style={{ display:'flex',gap:8,marginBottom:'1rem',flexWrap:'wrap' }}>
                {ACCENT_COLORS.map(color => (
                  <div
                    key={color}
                    onClick={() => setBrandAccent(color)}
                    style={{ width:36,height:36,borderRadius:'50%',background:color,cursor:'pointer',border:`3px solid ${brandAccent===color?'var(--ink)':'transparent'}`,boxSizing:'border-box',transition:'all .15s' }}
                  />
                ))}
                {/* Custom color input */}
                <div style={{ position:'relative',width:36,height:36 }}>
                  <input type="color" value={brandAccent} onChange={e=>setBrandAccent(e.target.value)} style={{ opacity:0,position:'absolute',inset:0,width:'100%',height:'100%',cursor:'pointer',border:'none' }} />
                  <div style={{ width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,#ff6b6b,#ffd93d,#6bcb77,#4d96ff)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14 }}>+</div>
                </div>
              </div>

              <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                <div style={{ width:24,height:24,borderRadius:'50%',background:brandAccent,border:'2px solid var(--cream-dark)',flexShrink:0 }} />
                <span style={{ fontSize:13,color:'var(--ink-soft)' }}>Current: <strong style={{ fontWeight:500,color:'var(--ink)',fontFamily:'monospace' }}>{brandAccent}</strong></span>
              </div>
            </div>

            {/* Share page options */}
            <div style={{ background:'white',border:'1px solid var(--cream-dark)',borderRadius:10,padding:'1.25rem',marginBottom:'1.25rem' }}>
              <div style={{ fontSize:14,fontWeight:500,color:'var(--ink)',marginBottom:'1rem' }}>Share page display</div>

              <label onClick={() => setShowStudioName(p=>!p)} style={{ display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:'1rem' }}>
                <div style={{ width:18,height:18,borderRadius:4,flexShrink:0,border:`1.5px solid ${showStudioName?'var(--gold)':'var(--sand)'}`,background:showStudioName?'var(--gold)':'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'var(--ink)',transition:'all .15s' }}>
                  {showStudioName?'✓':''}
                </div>
                <div>
                  <div style={{ fontSize:13,fontWeight:500,color:'var(--ink)' }}>Show studio name on client share pages</div>
                  <div style={{ fontSize:12,color:'var(--ink-soft)',fontWeight:300 }}>Displays &quot;{studioName}&quot; in the share page header</div>
                </div>
              </label>

              <div>
                <label style={labelStyle}>Tagline shown on share pages</label>
                <input value={shareTagline} onChange={e=>setShareTagline(e.target.value)} style={inputStyle} placeholder="e.g. Let's find your perfect spot together." />
                <div style={{ fontSize:11,color:'var(--ink-soft)',marginTop:4,fontWeight:300 }}>Short tagline shown beneath your studio name on client pages.</div>
              </div>
            </div>

            {/* Preview */}
            <div style={{ background:'white',border:'1px solid var(--cream-dark)',borderRadius:10,overflow:'hidden',marginBottom:'1.5rem' }}>
              <div style={{ padding:'.9rem 1.25rem',borderBottom:'1px solid var(--cream-dark)',fontSize:12,fontWeight:500,color:'var(--ink-soft)',textTransform:'uppercase',letterSpacing:'.07em' }}>
                Preview — client share page header
              </div>
              <div style={{ background:'var(--ink)',padding:'1.5rem' }}>
                <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:'0.75rem' }}>
                  {logoPreview
                    ? <img src={logoPreview} alt="Logo" style={{ width:32,height:32,borderRadius:'50%',objectFit:'cover' }} />
                    : <div style={{ width:32,height:32,borderRadius:'50%',background:'rgba(255,255,255,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:'rgba(245,240,232,.5)' }}>SL</div>
                  }
                  {showStudioName && <div style={{ fontSize:14,fontWeight:500,color:'rgba(245,240,232,.8)' }}>{studioName}</div>}
                </div>
                <div style={{ fontSize:'clamp(22px,3vw,36px)',fontFamily:'var(--font-playfair),serif',fontWeight:900,color:'var(--cream)',marginBottom:4 }}>
                  Choose your <em style={{ fontStyle:'italic',color:brandAccent }}>perfect</em> spot
                </div>
                <div style={{ fontSize:13,color:'rgba(245,240,232,.5)',fontWeight:300 }}>{shareTagline}</div>
              </div>
            </div>

            <button onClick={() => setToast('✓ Branding saved!')} style={{ background:'var(--gold)',color:'var(--ink)',padding:'10px 24px',borderRadius:4,border:'none',fontSize:14,fontWeight:500,cursor:'pointer',fontFamily:'inherit' }}>
              Save branding
            </button>
          </div>
        )}

        {/* TEMPLATES */}
        {active==='templates' && (
          <div>
            {sectionTitle('Message Templates','Reusable messages for your client share links. Pick one on the share page and edit before sending.')}
            <div style={{ display:'flex',flexDirection:'column',gap:'1rem',marginBottom:'1.5rem' }}>
              {templates.map(t => (
                <div key={t.id} style={{ background:'white',border:`1px solid ${editingId===t.id?'var(--gold)':'var(--cream-dark)'}`,borderRadius:10,overflow:'hidden',transition:'border-color .15s' }}>
                  {editingId===t.id ? (
                    <div style={{ padding:'1.25rem' }}>
                      <div style={{ marginBottom:'.75rem' }}><label style={labelStyle}>Template name</label><input value={editName} onChange={e=>setEditName(e.target.value)} style={inputStyle} autoFocus /></div>
                      <div style={{ marginBottom:'1rem' }}><label style={labelStyle}>Message body</label><textarea value={editBody} onChange={e=>setEditBody(e.target.value)} rows={5} style={{ ...inputStyle,resize:'vertical' }} /><div style={{ fontSize:11,color:'var(--ink-soft)',marginTop:4 }}>{editBody.length} characters</div></div>
                      <div style={{ display:'flex',gap:8 }}>
                        <button onClick={saveEdit} disabled={!editName.trim()||!editBody.trim()} style={{ background:'var(--gold)',color:'var(--ink)',padding:'8px 20px',borderRadius:4,border:'none',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit',opacity:!editName.trim()||!editBody.trim()?0.5:1 }}>Save template</button>
                        <button onClick={cancelEdit} style={{ background:'transparent',color:'var(--ink-soft)',padding:'8px 16px',borderRadius:4,border:'1px solid var(--sand)',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding:'1.1rem 1.25rem' }}>
                      <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:8 }}>
                        <div style={{ fontSize:14,fontWeight:500,color:'var(--ink)' }}>{t.name}</div>
                        <div style={{ display:'flex',gap:6,flexShrink:0 }}>
                          <button onClick={() => startEdit(t)} style={{ padding:'4px 12px',borderRadius:4,border:'1px solid var(--cream-dark)',background:'white',fontSize:12,color:'var(--ink-soft)',cursor:'pointer',fontFamily:'inherit',fontWeight:500 }}>Edit</button>
                          <button onClick={() => deleteTemplate(t.id)} style={{ padding:'4px 12px',borderRadius:4,border:'none',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:deleteConfirm===t.id?'var(--rust)':'rgba(181,75,42,.08)',color:deleteConfirm===t.id?'white':'var(--rust)',transition:'all .15s' }}>
                            {deleteConfirm===t.id?'Confirm delete':'Delete'}
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize:13,color:'var(--ink-soft)',fontWeight:300,lineHeight:1.65 }}>{t.body}</div>
                      <div style={{ marginTop:8,fontSize:11,color:'var(--sand)' }}>{t.body.length} characters</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {showNewForm ? (
              <div style={{ background:'white',border:'1.5px solid var(--gold)',borderRadius:10,padding:'1.25rem' }}>
                <div style={{ fontSize:14,fontWeight:500,color:'var(--ink)',marginBottom:'1rem' }}>New template</div>
                <div style={{ marginBottom:'.75rem' }}><label style={labelStyle}>Template name</label><input value={newName} onChange={e=>setNewName(e.target.value)} style={inputStyle} autoFocus /></div>
                <div style={{ marginBottom:'1rem' }}><label style={labelStyle}>Message body</label><textarea value={newBody} onChange={e=>setNewBody(e.target.value)} rows={5} style={{ ...inputStyle,resize:'vertical' }} /><div style={{ fontSize:11,color:'var(--ink-soft)',marginTop:4 }}>{newBody.length} characters</div></div>
                <div style={{ display:'flex',gap:8 }}>
                  <button onClick={addTemplate} disabled={!newName.trim()||!newBody.trim()} style={{ background:'var(--gold)',color:'var(--ink)',padding:'8px 20px',borderRadius:4,border:'none',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit',opacity:!newName.trim()||!newBody.trim()?0.5:1 }}>Add template</button>
                  <button onClick={() => {setShowNewForm(false);setNewName('');setNewBody('')}} style={{ background:'transparent',color:'var(--ink-soft)',padding:'8px 16px',borderRadius:4,border:'1px solid var(--sand)',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => {setShowNewForm(true);setEditingId(null)}} style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 20px',borderRadius:4,border:'1.5px dashed var(--sand)',background:'transparent',fontSize:13,fontWeight:500,color:'var(--ink-soft)',cursor:'pointer',fontFamily:'inherit',width:'100%',justifyContent:'center',transition:'all .15s' }}>
                + Add new template
              </button>
            )}
            <div style={{ marginTop:'1.5rem',padding:'12px 16px',background:'rgba(196,146,42,.06)',border:'1px solid rgba(196,146,42,.2)',borderRadius:8,display:'flex',gap:10 }}>
              <span style={{ fontSize:16,flexShrink:0 }}>💡</span>
              <div style={{ fontSize:13,color:'var(--ink-soft)',lineHeight:1.6,fontWeight:300 }}>
                Templates appear in the dropdown on the share page. You can always edit the message further before sending — templates are just starting points.
              </div>
            </div>
          </div>
        )}

        {/* PREFERENCES */}
        {active==='preferences' && (
          <div>
            {sectionTitle('Preferences','Customize how LocateShoot works for you.')}
            <div style={{ background:'white',border:'1px solid var(--cream-dark)',borderRadius:10,padding:'1.25rem',marginBottom:'1rem' }}>
              <div style={{ fontSize:14,fontWeight:500,color:'var(--ink)',marginBottom:'1rem' }}>Share page defaults</div>
              <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
                {[
                  {label:'Default to "only show my photos" when creating a share'},
                  {label:'Always include nearby recommended locations in shares'},
                  {label:'Email me when a client views my share link'},
                  {label:'Email me when a client makes a selection',checked:true},
                ].map((pref,i) => (
                  <label key={i} style={{ display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:14,color:'var(--ink)' }}>
                    <input type="checkbox" defaultChecked={pref.checked} style={{ accentColor:'var(--gold)',width:16,height:16 }} />
                    {pref.label}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ background:'white',border:'1px solid var(--cream-dark)',borderRadius:10,padding:'1.25rem',marginBottom:'1.5rem' }}>
              <div style={{ fontSize:14,fontWeight:500,color:'var(--ink)',marginBottom:'1rem' }}>Default share link expiry</div>
              <select defaultValue="14" style={{ ...inputStyle,width:200,cursor:'pointer',appearance:'none' }}>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="0">Never expires</option>
              </select>
            </div>
            <button onClick={() => setToast('✓ Preferences saved!')} style={{ background:'var(--gold)',color:'var(--ink)',padding:'10px 24px',borderRadius:4,border:'none',fontSize:14,fontWeight:500,cursor:'pointer',fontFamily:'inherit' }}>Save preferences</button>
          </div>
        )}

        {/* BILLING */}
        {active==='billing' && (
          <div>
            {sectionTitle('Subscription & Billing','Manage your Pro plan.')}
            <div style={{ background:'var(--ink)',borderRadius:10,padding:'1.25rem',display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem' }}>
              <div>
                <div style={{ fontFamily:'var(--font-playfair),serif',fontSize:18,fontWeight:700,color:'var(--cream)',marginBottom:3 }}>Pro Plan</div>
                <div style={{ fontSize:12,color:'rgba(245,240,232,.45)' }}>Active · Next billing Dec 15, 2024</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontFamily:'var(--font-playfair),serif',fontSize:28,fontWeight:700,color:'var(--gold)' }}>$12</div>
                <div style={{ fontSize:12,color:'rgba(245,240,232,.4)' }}>/month</div>
              </div>
            </div>
            <div style={{ background:'white',border:'1px solid var(--cream-dark)',borderRadius:10,overflow:'hidden',marginBottom:'1rem' }}>
              <div style={{ padding:'1rem 1.25rem',borderBottom:'1px solid var(--cream-dark)',fontSize:13,fontWeight:500,color:'var(--ink)' }}>Billing history</div>
              {[{date:'Nov 15, 2024',desc:'Pro Plan',amount:'$12.00'},{date:'Oct 15, 2024',desc:'Pro Plan',amount:'$12.00'},{date:'Sep 15, 2024',desc:'Pro Plan',amount:'$12.00'}].map((row,i) => (
                <div key={i} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 1.25rem',borderBottom:i<2?'1px solid var(--cream-dark)':'none' }}>
                  <div>
                    <div style={{ fontSize:13,color:'var(--ink)' }}>{row.desc}</div>
                    <div style={{ fontSize:11,color:'var(--ink-soft)' }}>{row.date}</div>
                  </div>
                  <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                    <span style={{ fontSize:13,fontWeight:500,color:'var(--ink)' }}>{row.amount}</span>
                    <button style={{ padding:'4px 10px',borderRadius:4,border:'1px solid var(--cream-dark)',background:'white',fontSize:12,color:'var(--ink-soft)',cursor:'pointer',fontFamily:'inherit' }}>Receipt</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setToast('⚠ Cancellation confirmation would appear here')} style={{ background:'rgba(181,75,42,.08)',color:'var(--rust)',border:'1px solid rgba(181,75,42,.25)',padding:'8px 18px',borderRadius:4,fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit' }}>
              Cancel subscription
            </button>
          </div>
        )}

        {/* PASSWORD */}
        {active==='password' && (
          <div>
            {sectionTitle('Password & Security')}
            <div style={{ background:'white',border:'1px solid var(--cream-dark)',borderRadius:10,padding:'1.25rem',maxWidth:420 }}>
              {[{label:'Current password'},{label:'New password'},{label:'Confirm new password'}].map(f => (
                <div key={f.label} style={{ marginBottom:'.75rem' }}>
                  <label style={labelStyle}>{f.label}</label>
                  <input type="password" style={inputStyle} placeholder="••••••••" />
                </div>
              ))}
              <button onClick={() => setToast('✓ Password updated!')} style={{ background:'var(--gold)',color:'var(--ink)',padding:'10px 24px',borderRadius:4,border:'none',fontSize:14,fontWeight:500,cursor:'pointer',fontFamily:'inherit',marginTop:'.5rem' }}>
                Update password
              </button>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position:'fixed',bottom:'1.5rem',right:'1.5rem',background:'var(--ink)',color:'var(--cream)',padding:'10px 18px',borderRadius:10,fontSize:13,border:'1px solid rgba(255,255,255,.1)',zIndex:9999,boxShadow:'0 8px 32px rgba(0,0,0,.3)',animation:'toast-in .25s ease' }}>
          {toast}
        </div>
      )}
    </div>
  )
}