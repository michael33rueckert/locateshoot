'use client'

// Wide horizontal banner that surfaces the photographer's auto-generated
// "Entire Portfolio" guide as a distinct thing from their custom
// Location Guides. Sits above the guides grid on both /location-guides
// and the dashboard so the two concepts read as separate at a glance —
// one always-available portfolio link vs. a collection of curated
// per-session guides. Full guide features (share URL, cover photo,
// analytics, per-guide template override, etc.) are preserved; only
// the visual treatment differs.

import Link from 'next/link'
import { thumbUrl } from '@/lib/image'

interface Props {
  photographerName?:  string
  locationCount:      number
  coverPhotoUrl?:     string | null
  // Existing shareLink for the full-portfolio guide, if one has been
  // materialized. Null when the photographer hasn't triggered
  // creation yet — the banner still renders and clicking Share /
  // Preview lazy-creates via the callbacks.
  hasLink:            boolean
  onShare:            () => void
  onEdit:             () => void
  onPreview:          () => void
  // Optional stats — shown as a small metric row when provided.
  viewCount?:         number
  pickCount?:         number
  // Whether the guide is currently blocked (e.g. Free user with
  // downgraded guides — full portfolio still serves though).
  inactive?:          boolean
  // Copy state so the Share button can flash a "Link copied" flag
  // when native share falls back to clipboard.
  copyState?:         'idle' | 'copied'
}

export default function PortfolioGuideBanner({
  photographerName,
  locationCount,
  coverPhotoUrl,
  hasLink,
  onShare,
  onEdit,
  onPreview,
  viewCount,
  pickCount,
  inactive,
  copyState = 'idle',
}: Props) {
  const thumb = thumbUrl(coverPhotoUrl ?? null) ?? coverPhotoUrl ?? null
  const displayName = photographerName?.trim()

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      alignItems: 'stretch',
      gap: 16,
      padding: 16,
      background: 'linear-gradient(135deg, rgba(196,146,42,.08), rgba(196,146,42,.02))',
      border: '2px solid var(--gold)',
      borderRadius: 12,
      boxShadow: '0 4px 16px rgba(196,146,42,.12)',
      marginBottom: 20,
      opacity: inactive ? 0.55 : 1,
      overflow: 'hidden',
    }}>
      {/* Cover photo / gradient placeholder — square-ish tile on the
          left. Falls back to a gold gradient with 📚 icon when no
          cover photo has been picked yet, so the banner never looks
          broken on a brand-new account. */}
      <div style={{ width: 92, height: 92, flexShrink: 0, borderRadius: 8, background: thumb ? 'var(--cream-dark)' : 'linear-gradient(135deg, var(--gold), rgba(196,146,42,.6))', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {thumb
          ? <img src={thumb} alt="" loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 34, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.15))' }}>📚</span>
        }
      </div>

      {/* Middle — copy + metrics. flex:1 so it grows and pushes the
          action buttons to the right. min-width:0 lets long
          photographer names truncate instead of blowing out the row. */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--ink)', background: 'var(--gold)', padding: '3px 9px', borderRadius: 4 }}>
            📚 Portfolio Guide
          </span>
          <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300 }}>
            auto-syncs with your portfolio
          </span>
        </div>
        <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {displayName ? `${displayName}'s Portfolio` : 'My Portfolio'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>📍 {locationCount} location{locationCount === 1 ? '' : 's'}</span>
          {typeof viewCount === 'number' && viewCount > 0 && <span>· 👁 {viewCount} view{viewCount === 1 ? '' : 's'}</span>}
          {typeof pickCount === 'number' && pickCount > 0 && <span>· ✓ {pickCount} pick{pickCount === 1 ? '' : 's'}</span>}
          {!hasLink && <span style={{ color: 'var(--sage)', fontWeight: 500 }}>· Ready to share</span>}
        </div>
      </div>

      {/* Action buttons — Share (primary), Preview, Edit. Stacked on
          narrow viewports so they don't spill under the banner text. */}
      <div className="portfolio-guide-banner-actions" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button
          onClick={onShare}
          disabled={inactive}
          title="Share — opens the OS share sheet, or copies the URL"
          style={{
            padding: '9px 16px',
            borderRadius: 6,
            background: inactive ? 'var(--cream-dark)' : (copyState === 'copied' ? 'var(--sage)' : 'var(--gold)'),
            color: inactive ? 'var(--ink-soft)' : (copyState === 'copied' ? 'white' : 'var(--ink)'),
            border: 'none',
            fontSize: 13,
            fontWeight: 700,
            cursor: inactive ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}
        >
          {copyState === 'copied' ? '✓ Link copied!' : '📤 Share'}
        </button>
        <button
          onClick={onPreview}
          disabled={inactive}
          title="Preview what your client sees"
          style={{ padding: '9px 12px', borderRadius: 6, background: 'white', color: 'var(--ink)', border: '1px solid var(--cream-dark)', fontSize: 12, fontWeight: 500, cursor: inactive ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
        >
          👁 Preview
        </button>
        <button
          onClick={onEdit}
          title="Rename, change cover photo, template, etc."
          style={{ padding: '9px 12px', borderRadius: 6, background: 'white', color: 'var(--ink-soft)', border: '1px solid var(--cream-dark)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
        >
          Edit
        </button>
      </div>

      <style>{`
        /* On phones, wrap the actions to a second row under the copy
           so they don't crowd out the photographer's name. Banner
           becomes column layout — cover on top, copy middle, actions
           bottom — for the narrowest viewports. */
        @media (max-width: 620px) {
          .portfolio-guide-banner-actions { flex-wrap: wrap; justify-content: flex-start; gap: 6px; width: 100%; }
        }
      `}</style>
    </div>
  )
}

// Also export a lightweight link-only variant used on the dashboard
// when the guides section is very compact — a single row of just
// "your portfolio guide" + one Share button, no metrics.
export function PortfolioGuideCompactLink({
  href,
  onShare,
  copyState = 'idle',
  inactive,
}: {
  href:      string
  onShare:   () => void
  copyState?: 'idle' | 'copied'
  inactive?:  boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '2px solid var(--gold)', borderRadius: 8, background: 'rgba(196,146,42,.05)', marginBottom: 12 }}>
      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--ink)', background: 'var(--gold)', padding: '3px 8px', borderRadius: 4 }}>📚 Portfolio</span>
      <Link href={href} style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--ink)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Manage your portfolio guide →</Link>
      <button onClick={onShare} disabled={inactive} style={{ padding: '6px 12px', borderRadius: 4, background: copyState === 'copied' ? 'var(--sage)' : 'var(--gold)', color: copyState === 'copied' ? 'white' : 'var(--ink)', border: 'none', fontSize: 11, fontWeight: 700, cursor: inactive ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
        {copyState === 'copied' ? '✓' : '📤 Share'}
      </button>
    </div>
  )
}
