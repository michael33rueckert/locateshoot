'use client'

import { thumbUrl } from '@/lib/image'

// Card rendering for a single Location Guide. Used in the Dashboard's
// Location Guides preview section and on the full /location-guides page.

export interface GuideCardData {
  id:                     string
  session_name:           string
  slug:                   string
  created_at:             string
  is_full_portfolio:      boolean
  expires_at:             string | null
  expire_on_submit:       boolean
  pick_count:             number
  location_count:         number
  cover_photo_url:        string | null
}

function timeAgo(d: string) {
  const diff  = Date.now() - new Date(d).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 2)   return 'just now'
  if (mins < 60)  return `${mins} min ago`
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  return `${days} day${days !== 1 ? 's' : ''} ago`
}

function expirationSummary(g: GuideCardData): { label: string; color: string; bg: string } {
  if (g.expire_on_submit) {
    if (g.pick_count > 0) return { label: '⏱ Used — expired', color: 'var(--ink-soft)', bg: 'var(--cream-dark)' }
    return { label: '🔂 Single-use', color: 'var(--sky)', bg: 'rgba(61,110,140,.1)' }
  }
  if (g.expires_at) {
    const past = new Date(g.expires_at) < new Date()
    if (past) return { label: '⏱ Expired', color: 'var(--ink-soft)', bg: 'var(--cream-dark)' }
    return { label: `Expires ${new Date(g.expires_at).toLocaleDateString()}`, color: 'var(--rust)', bg: 'rgba(181,75,42,.08)' }
  }
  return { label: '♾ Saved for reuse', color: 'var(--sage)', bg: 'rgba(74,103,65,.1)' }
}

export default function LocationGuideCard({
  guide,
  bgClass,
  copyState,
  deleteState,
  onCopy,
  onEdit,
  onDelete,
  onPreview,
  featured,
  inactive,
}: {
  guide:       GuideCardData
  bgClass:     string
  copyState:   'idle' | 'copied'
  deleteState: 'idle' | 'confirming'
  onCopy:      () => void
  onEdit?:     () => void
  onDelete?:   () => void
  /** Open the share URL in a new tab so the photographer can see what
   *  their client will see. Parents that need lazy-create (e.g. the
   *  full-portfolio card before the row exists) handle the open + create
   *  themselves to avoid popup-blocker issues. */
  onPreview?:  () => void
  /** Highlight this card as the headline of the list (used for the
   *  pinned "Entire Portfolio" guide). Adds a thin gold border so it
   *  visually anchors above the custom-guide cards in the same grid. */
  featured?:   boolean
  /** True when this guide exists but cannot serve clients on the
   *  photographer's current plan (e.g. a custom guide that's still in
   *  the database after a Pro→Free downgrade). Renders the card grayed
   *  out with an "Inactive" badge, disables Copy URL + Preview, and
   *  keeps Edit + Delete so the photographer can still manage the row.
   *  Re-subscribing flips this back off automatically. */
  inactive?:   boolean
}) {
  const exp = expirationSummary(guide)
  // Every guide card gets the gold border + soft gold shadow so the
  // grid reads visually distinct from the white-tile portfolio location
  // cards on the same page. featured (the full-Portfolio card) bumps
  // the border thicker for additional anchoring.
  const idleBorder     = featured ? '2px solid var(--gold)'    : '1px solid var(--gold)'
  const idleShadow     = featured ? '0 4px 14px rgba(196,146,42,.18)' : '0 2px 8px rgba(196,146,42,.08)'
  return (
    <div style={{
      background: 'white',
      borderRadius: 10,
      border: idleBorder,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      transition: 'all .15s',
      boxShadow: idleShadow,
      opacity: inactive ? 0.55 : 1,
      filter: inactive ? 'saturate(0.6)' : undefined,
      position: 'relative',
    }}
    onMouseEnter={e => { if (inactive) return; e.currentTarget.style.boxShadow = '0 4px 14px rgba(196,146,42,.25)' }}
    onMouseLeave={e => { if (inactive) return; e.currentTarget.style.boxShadow = idleShadow }}>
      {/* Solid gold accent strip across the top of every guide card.
          The single strongest visual cue that "this is a guide" vs.
          "this is a location" — clients of the portfolio + dashboard
          pages render LocationGuideCard alongside flat location cards,
          and the strip + uppercase tag below pop out at a glance. */}
      <div style={{ height: 4, background: 'var(--gold)', flexShrink: 0 }} />
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 2, padding: '3px 9px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', fontSize: 9, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', boxShadow: '0 1px 4px rgba(26,22,18,.18)' }}>
        📚 Guide
      </div>
      {/* Header band — cover photo if set, otherwise a colored gradient + emoji */}
      <div
        className={guide.cover_photo_url ? undefined : bgClass}
        style={{
          position: 'relative',
          aspectRatio: '4 / 3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          background: guide.cover_photo_url ? 'var(--cream-dark)' : undefined,
        }}
      >
        {guide.cover_photo_url ? (
          <>
            <img
              src={thumbUrl(guide.cover_photo_url) ?? guide.cover_photo_url}
              alt=""
              decoding="async"
              // Fall back to the original URL when Supabase's render endpoint
              // hiccups — see PortfolioEditModal/portfolio page for the same
              // pattern. Without this the card silently shows the bg-* gradient
              // even though the cover photo exists.
              onError={e => {
                if (e.currentTarget.src !== guide.cover_photo_url) {
                  e.currentTarget.src = guide.cover_photo_url!
                }
              }}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {/* Top + bottom scrims so overlaid badges (📚 GUIDE tag at
                top, expiration badge at bottom) stay readable on bright
                photos without darkening the photo as a whole. */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,.18) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,.22) 100%)' }} />
          </>
        ) : (
          <span style={{ fontSize: 38, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.12))' }}>📚</span>
        )}
        {/* Expiration badge — moved to the bottom-left of the cover
            photo so the 📚 GUIDE tag (top-left) doesn't overlap it. The
            bottom scrim added below the photo keeps this readable on
            bright images. */}
        <span style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          padding: '3px 10px',
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 500,
          background: inactive
            ? 'rgba(181,75,42,.92)'
            : (guide.cover_photo_url ? 'rgba(255,255,255,.92)' : exp.bg),
          color: inactive ? 'white' : exp.color,
          backdropFilter: 'blur(4px)',
          whiteSpace: 'nowrap',
          zIndex: 1,
        }}>{inactive ? '⏸ Inactive — needs Starter+' : exp.label}</span>
        {guide.is_full_portfolio && (
          <span style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '3px 10px',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 500,
            background: guide.cover_photo_url ? 'rgba(255,255,255,.92)' : 'rgba(74,103,65,.15)',
            color: 'var(--sage)',
            backdropFilter: 'blur(4px)',
            zIndex: 1,
          }} title="Auto-syncs with your whole portfolio as you add or remove locations">📚 Entire Portfolio</span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 17, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.25, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {guide.session_name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300 }}>
            {guide.location_count} location{guide.location_count !== 1 ? 's' : ''} · {guide.pick_count} pick{guide.pick_count !== 1 ? 's' : ''} · {timeAgo(guide.created_at)}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, marginTop: 'auto', flexWrap: 'wrap' }}>
          <button
            onClick={inactive ? undefined : onCopy}
            disabled={inactive}
            title={inactive ? 'Re-subscribe to share this guide' : undefined}
            style={{
              flex: 1,
              minWidth: 110,
              padding: '8px 12px',
              borderRadius: 4,
              background: inactive ? 'var(--cream-dark)' : (copyState === 'copied' ? 'var(--sage)' : 'var(--gold)'),
              color: inactive ? 'var(--ink-soft)' : (copyState === 'copied' ? 'white' : 'var(--ink)'),
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: inactive ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              transition: 'all .15s',
            }}
          >
            {inactive ? '🔒 Paused' : (copyState === 'copied' ? '✓ Copied!' : '📋 Copy URL')}
          </button>
          {onPreview && !inactive && (
            <button onClick={onPreview} style={{ padding: '8px 12px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'white', color: 'var(--ink)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              👁 Preview
            </button>
          )}
          {onEdit && (
            <button onClick={onEdit} style={{ padding: '8px 12px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'white', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
              Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              style={{
                padding: '8px 12px',
                borderRadius: 4,
                border: 'none',
                background: deleteState === 'confirming' ? 'var(--rust)' : 'rgba(181,75,42,.08)',
                color: deleteState === 'confirming' ? 'white' : 'var(--rust)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {deleteState === 'confirming' ? 'Confirm' : 'Delete'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
