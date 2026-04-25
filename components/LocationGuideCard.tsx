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
}) {
  const exp = expirationSummary(guide)
  const idleBorder     = featured ? '2px solid var(--gold)'    : '1px solid var(--cream-dark)'
  const idleShadow     = featured ? '0 4px 14px rgba(196,146,42,.18)' : '0 1px 3px rgba(26,22,18,.03)'
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
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(26,22,18,.08)' }}
    onMouseLeave={e => { e.currentTarget.style.border = idleBorder; e.currentTarget.style.boxShadow = idleShadow }}>
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
              loading="lazy"
              decoding="async"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {/* Subtle bottom-to-top scrim so overlaid badges stay readable on bright photos */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,.18) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0) 100%)' }} />
          </>
        ) : (
          <span style={{ fontSize: 38, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.12))' }}>📚</span>
        )}
        <span style={{
          position: 'absolute',
          top: 8,
          left: 8,
          padding: '3px 10px',
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 500,
          background: guide.cover_photo_url ? 'rgba(255,255,255,.92)' : exp.bg,
          color: exp.color,
          backdropFilter: 'blur(4px)',
          whiteSpace: 'nowrap',
          zIndex: 1,
        }}>{exp.label}</span>
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
            onClick={onCopy}
            style={{
              flex: 1,
              minWidth: 110,
              padding: '8px 12px',
              borderRadius: 4,
              background: copyState === 'copied' ? 'var(--sage)' : 'var(--gold)',
              color: copyState === 'copied' ? 'white' : 'var(--ink)',
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              transition: 'all .15s',
            }}
          >
            {copyState === 'copied' ? '✓ Copied!' : '📋 Copy URL'}
          </button>
          {onPreview && (
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
