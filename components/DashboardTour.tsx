'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

// Anchored product tour for the dashboard. Runs after the first-time
// user finishes /onboarding/how-it-works and lands on /dashboard, and
// also on demand via ?tour=1 (surfaced from the Help page + nav for
// replay). Points at real UI with a dark spotlight cutout + a floating
// card so the user sees where each feature actually LIVES — the
// walkthrough teaches vocabulary, this teaches location.
//
// Steps target elements via `data-tour="<slug>"` attributes so a CSS
// refactor / layout swap won't silently break the anchors — you have
// to explicitly remove the data attribute for a step to fail. Any step
// whose target is missing (feature-flagged off, hidden on the current
// viewport, etc.) is skipped rather than pinning the tour open on a
// blank page.

export interface TourStep {
  id:      string
  target:  string | null   // CSS selector (typically `[data-tour="…"]`) or null for a centered welcome/outro card
  title:   string
  body:    React.ReactNode
  // Preferred placement of the card relative to the target. Falls back
  // to whichever side has room if the preferred side would overflow.
  prefer?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
}

const STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: null,
    title: 'Quick tour — 60 seconds',
    body: (
      <>
        <p style={{ margin: '0 0 8px' }}>Now that you&apos;ve seen how LocateShoot works, here&apos;s <strong>where</strong> everything lives on your dashboard.</p>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(0,0,0,.55)' }}>Skip anytime. Replay from Help → Take the dashboard tour.</p>
      </>
    ),
  },
  {
    id: 'my-portfolio',
    target: '[data-tour="my-portfolio"]',
    title: 'Your Portfolio',
    body: (
      <>
        <p style={{ margin: '0 0 8px' }}>These are the locations you offer to clients. The <strong>Free plan includes your first 5</strong>; upgrade to Starter or Pro for unlimited.</p>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(0,0,0,.55)' }}>Manage the full list on the <strong>Portfolio</strong> page.</p>
      </>
    ),
    prefer: 'bottom',
  },
  {
    id: 'add-location',
    target: '[data-tour="add-location"]',
    title: 'Add a new location',
    body: (
      <>
        <p style={{ margin: '0 0 8px' }}>Tap here to add a spot you love shooting at. Give it a name, address, and a few photos.</p>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(0,0,0,.55)' }}>Prefer to browse? Explore Map suggests popular spots near you.</p>
      </>
    ),
    prefer: 'bottom',
  },
  {
    id: 'share-portfolio',
    target: '[data-tour="share-portfolio"]',
    title: 'Share your whole portfolio',
    body: (
      <>
        <p style={{ margin: '0 0 8px' }}>One-click share of your entire portfolio as a single guide. <strong>Free plan</strong> — the shared guide includes your first 5 locations.</p>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(0,0,0,.55)' }}>Great as a permanent link in your email signature or HoneyBook template.</p>
      </>
    ),
    prefer: 'bottom',
  },
  {
    id: 'custom-guides',
    target: '[data-tour="custom-guides"]',
    title: 'Custom Location Guides',
    body: (
      <>
        <p style={{ margin: '0 0 8px' }}>Curated guides for a specific client or session — hand-pick 3–6 spots and send one link. <strong>Needs a paid plan (Starter or Pro).</strong></p>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(0,0,0,.55)' }}>Full editor lives on the <strong>Location Guides</strong> page.</p>
      </>
    ),
    prefer: 'top',
  },
  {
    id: 'client-selections',
    target: '[data-tour="client-selections"]',
    title: 'Client Selections',
    body: (
      <>
        <p style={{ margin: 0 }}>Every pick your client submits shows up here — most recent first. You&apos;ll also get an email and (if enabled) a push notification the moment it lands.</p>
      </>
    ),
    prefer: 'top',
  },
  {
    id: 'notification-bell',
    target: '[data-tour="notification-bell"]',
    title: 'Turn on push notifications',
    body: (
      <>
        <p style={{ margin: 0 }}>Tap the 🔔 to enable push notifications so a client&apos;s pick reaches you instantly — no email refresh required.</p>
      </>
    ),
    prefer: 'auto',
  },
  {
    id: 'outro',
    target: null,
    title: "You're set",
    body: (
      <>
        <p style={{ margin: '0 0 8px' }}>Add a couple of locations, share the link, watch the picks roll in.</p>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(0,0,0,.55)' }}>Two other pages worth knowing: <strong>Explore</strong> (browse and add popular spots) and <strong>Profile → Branding</strong> (colors, logo, layout — Pro).</p>
      </>
    ),
  },
]

interface Placement {
  cardTop:  number
  cardLeft: number
  spotlight: { x: number; y: number; w: number; h: number } | null
  arrow: null | { top: number; left: number; rotation: number }
}

const CARD_WIDTH = 340
const CARD_MAX_H = 300
const CARD_GAP   = 14   // px between card edge and target edge
const PADDING    = 12   // spotlight inflation
const SCREEN_PAD = 12   // min distance between card and viewport edge

interface Props {
  enabled: boolean
  onFinish: (opts: { skipped: boolean }) => void
}

export default function DashboardTour({ enabled, onFinish }: Props) {
  const [idx,       setIdx]       = useState(0)
  const [placement, setPlacement] = useState<Placement | null>(null)
  // Bump on window resize / scroll / DOM change so useLayoutEffect
  // re-measures the target. Cheaper than tracking size deltas.
  const [tick,      setTick]      = useState(0)

  // Reset when the tour is (re)opened so a replay starts from step 0.
  useEffect(() => {
    if (enabled) setIdx(0)
  }, [enabled])

  const step = STEPS[Math.min(idx, STEPS.length - 1)]

  // Advance past steps whose target isn't in the DOM on this viewport.
  // Runs after each idx change so the tour never lingers on a step
  // that would render a floating card with no anchor.
  useEffect(() => {
    if (!enabled) return
    if (!step.target) return
    const el = document.querySelector<HTMLElement>(step.target)
    if (el && el.getBoundingClientRect().width > 0) return
    // Skip forward. If we're already at the last step, finish.
    if (idx < STEPS.length - 1) setIdx(i => i + 1)
    else onFinish({ skipped: false })
  }, [enabled, idx, step.target, tick, onFinish])

  // Trigger recomputation when the viewport or DOM shifts. Runs while
  // enabled so scroll + resize + subtree mutations (e.g. a section
  // finishing its load) keep the card and spotlight aligned.
  useEffect(() => {
    if (!enabled) return
    const bump = () => setTick(t => t + 1)
    window.addEventListener('resize', bump)
    window.addEventListener('scroll', bump, true)
    const mo = new MutationObserver(bump)
    mo.observe(document.body, { childList: true, subtree: true, attributes: false })
    // Kick once on mount to catch elements that hydrate late.
    const initial = setTimeout(bump, 60)
    return () => {
      window.removeEventListener('resize', bump)
      window.removeEventListener('scroll', bump, true)
      mo.disconnect()
      clearTimeout(initial)
    }
  }, [enabled])

  // Lock body scroll while the tour is open. Doesn't touch scroll
  // programmatically — the target-scroll helper below uses smooth
  // scrolling on a per-step basis.
  useEffect(() => {
    if (!enabled) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [enabled])

  // Escape = skip (fast escape hatch); arrow keys = navigate.
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      onFinish({ skipped: true })
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      else if (e.key === 'ArrowLeft')                       prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, idx])

  // Scroll target into view when the step changes so we're not
  // placing a card over an off-screen anchor.
  useEffect(() => {
    if (!enabled || !step.target) return
    const el = document.querySelector<HTMLElement>(step.target)
    if (!el) return
    const rect = el.getBoundingClientRect()
    const outOfView = rect.top < 80 || rect.bottom > window.innerHeight - 80
    if (outOfView) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [enabled, step.target])

  // Compute spotlight rect + card position each frame that matters.
  // useLayoutEffect (not useEffect) so we run before the browser
  // paints the DOM change from setPlacement, preventing a visible
  // jitter as the card moves.
  useLayoutEffect(() => {
    if (!enabled) return

    const vw = window.innerWidth
    const vh = window.innerHeight

    // Centered steps (welcome / outro) — no spotlight, card at center.
    if (!step.target) {
      setPlacement({
        cardTop:   vh / 2 - CARD_MAX_H / 2,
        cardLeft:  vw / 2 - CARD_WIDTH / 2,
        spotlight: null,
        arrow:     null,
      })
      return
    }

    const el = document.querySelector<HTMLElement>(step.target)
    if (!el) { setPlacement(null); return }

    const r = el.getBoundingClientRect()
    const spot = {
      x: Math.max(0, r.left - PADDING),
      y: Math.max(0, r.top  - PADDING),
      w: Math.min(vw, r.width  + PADDING * 2),
      h: Math.min(vh, r.height + PADDING * 2),
    }

    // Pick a side that has room. On small viewports the target often
    // fills the width; we drop into "bottom or top, whichever fits."
    const wants = step.prefer ?? 'auto'
    const spaceBelow = vh - (spot.y + spot.h)
    const spaceAbove = spot.y
    const spaceRight = vw - (spot.x + spot.w)
    const spaceLeft  = spot.x

    // Card size estimate — we can't measure the card yet since it
    // hasn't rendered. Height is a rough upper bound; refine when we
    // actually know it if this shows up as a bug in practice.
    const estCardH = 220
    const estCardW = Math.min(CARD_WIDTH, vw - SCREEN_PAD * 2)

    // Decide side.
    let side: 'top' | 'bottom' | 'left' | 'right'
    if (wants === 'bottom' && spaceBelow >= estCardH + CARD_GAP + SCREEN_PAD) side = 'bottom'
    else if (wants === 'top' && spaceAbove >= estCardH + CARD_GAP + SCREEN_PAD) side = 'top'
    else if (wants === 'left' && spaceLeft >= estCardW + CARD_GAP + SCREEN_PAD) side = 'left'
    else if (wants === 'right' && spaceRight >= estCardW + CARD_GAP + SCREEN_PAD) side = 'right'
    else {
      // auto: pick whichever axis has more room. On narrow viewports
      // we typically end up with top or bottom.
      const options = [
        { s: 'bottom' as const, room: spaceBelow, need: estCardH + CARD_GAP + SCREEN_PAD },
        { s: 'top'    as const, room: spaceAbove, need: estCardH + CARD_GAP + SCREEN_PAD },
        { s: 'right'  as const, room: spaceRight, need: estCardW + CARD_GAP + SCREEN_PAD },
        { s: 'left'   as const, room: spaceLeft,  need: estCardW + CARD_GAP + SCREEN_PAD },
      ]
      // Prefer any that fit; among those, pick the one with the most
      // headroom. If none fit, fall back to bottom (will be clamped
      // to the viewport by the min/max logic below).
      const fits = options.filter(o => o.room >= o.need).sort((a, b) => b.room - a.room)
      side = (fits[0]?.s) ?? 'bottom'
    }

    // Anchor coords for each side, then clamp to viewport with SCREEN_PAD.
    let top:  number, left: number
    if (side === 'bottom') {
      top  = spot.y + spot.h + CARD_GAP
      left = spot.x + spot.w / 2 - estCardW / 2
    } else if (side === 'top') {
      top  = spot.y - CARD_GAP - estCardH
      left = spot.x + spot.w / 2 - estCardW / 2
    } else if (side === 'right') {
      top  = spot.y + spot.h / 2 - estCardH / 2
      left = spot.x + spot.w + CARD_GAP
    } else /* left */ {
      top  = spot.y + spot.h / 2 - estCardH / 2
      left = spot.x - CARD_GAP - estCardW
    }
    left = Math.max(SCREEN_PAD, Math.min(vw - estCardW - SCREEN_PAD, left))
    top  = Math.max(SCREEN_PAD, Math.min(vh - estCardH - SCREEN_PAD, top))

    // Arrow: small triangle pointing FROM the card TO the spotlight
    // center on the axis of the card->target relationship.
    let arrow: Placement['arrow']
    const spotCx = spot.x + spot.w / 2
    const spotCy = spot.y + spot.h / 2
    if (side === 'bottom') {
      arrow = { top: top - 8, left: Math.max(left + 20, Math.min(left + estCardW - 20, spotCx)) - 8, rotation: 180 }
    } else if (side === 'top') {
      arrow = { top: top + estCardH - 8, left: Math.max(left + 20, Math.min(left + estCardW - 20, spotCx)) - 8, rotation: 0 }
    } else if (side === 'right') {
      arrow = { top: Math.max(top + 20, Math.min(top + estCardH - 20, spotCy)) - 8, left: left - 8, rotation: 90 }
    } else {
      arrow = { top: Math.max(top + 20, Math.min(top + estCardH - 20, spotCy)) - 8, left: left + estCardW - 8, rotation: 270 }
    }

    setPlacement({ cardTop: top, cardLeft: left, spotlight: spot, arrow })
  }, [enabled, step.target, tick])

  const next = useCallback(() => {
    setIdx(i => {
      const n = i + 1
      if (n >= STEPS.length) { onFinish({ skipped: false }); return i }
      return n
    })
  }, [onFinish])
  const prev = useCallback(() => setIdx(i => Math.max(0, i - 1)), [])
  const skip = useCallback(() => onFinish({ skipped: true }), [onFinish])

  // Build the SVG mask path — outer rect + inner rounded-rect hole
  // via even-odd fill.
  const maskPath = useMemo(() => {
    if (!placement) return ''
    const vw = typeof window !== 'undefined' ? window.innerWidth  : 1000
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    const outer = `M0 0 H${vw} V${vh} H0 Z`
    if (!placement.spotlight) return outer
    const s = placement.spotlight
    const rad = 10
    // Rounded rectangle path counter-clockwise so even-odd carves it out.
    const x = s.x, y = s.y, w = s.w, h = s.h
    const inner =
      `M${x + rad} ${y}` +
      `H${x + w - rad}` +
      `Q${x + w} ${y}, ${x + w} ${y + rad}` +
      `V${y + h - rad}` +
      `Q${x + w} ${y + h}, ${x + w - rad} ${y + h}` +
      `H${x + rad}` +
      `Q${x} ${y + h}, ${x} ${y + h - rad}` +
      `V${y + rad}` +
      `Q${x} ${y}, ${x + rad} ${y} Z`
    return `${outer} ${inner}`
  }, [placement, tick])

  if (!enabled || !placement) return null

  const isLast  = idx >= STEPS.length - 1
  const isFirst = idx === 0
  // Progress dots + skip button live in the card footer.

  return (
    <>
      {/* Backdrop — SVG so we can carve a hole around the target with
          even-odd fill. Pointer-events: none inside the hole via a
          transparent overlay lets the user still interact with the
          spotlighted control if they want (we don't require it). */}
      <svg
        style={{ position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'none' }}
        width="100%" height="100%"
        aria-hidden
      >
        <path d={maskPath} fillRule="evenodd" fill="rgba(10,8,6,.68)" />
      </svg>

      {/* Arrow — small triangle bridging card to spotlight. */}
      {placement.arrow && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            top:  placement.arrow.top,
            left: placement.arrow.left,
            width: 0, height: 0,
            borderLeft:   '8px solid transparent',
            borderRight:  '8px solid transparent',
            borderBottom: '8px solid white',
            transform: `rotate(${placement.arrow.rotation}deg)`,
            transformOrigin: '8px 4px',
            zIndex: 10000,
            filter: 'drop-shadow(0 -1px 0 rgba(0,0,0,.08))',
          }}
        />
      )}

      {/* Card */}
      <div
        role="dialog"
        aria-live="polite"
        aria-label={step.title}
        style={{
          position: 'fixed',
          top:  placement.cardTop,
          left: placement.cardLeft,
          width: Math.min(CARD_WIDTH, typeof window !== 'undefined' ? window.innerWidth - SCREEN_PAD * 2 : CARD_WIDTH),
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'white',
          borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0,0,0,.35), 0 0 0 1px rgba(0,0,0,.06)',
          padding: '1.1rem 1.15rem 0.95rem',
          zIndex: 10001,
          fontFamily: 'inherit',
          color: 'var(--ink, #1a1612)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(0,0,0,.45)', fontWeight: 600 }}>
            {idx + 1} / {STEPS.length}
          </div>
          <button
            onClick={skip}
            style={{ background: 'none', border: 'none', color: 'rgba(0,0,0,.5)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
          >
            Skip tour
          </button>
        </div>
        <div style={{ fontFamily: 'var(--font-playfair, Georgia), serif', fontSize: 19, fontWeight: 700, marginBottom: 8, lineHeight: 1.2 }}>
          {step.title}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: 'rgba(0,0,0,.78)' }}>
          {step.body}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: '1rem' }}>
          <button
            onClick={prev}
            disabled={isFirst}
            style={{
              padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(0,0,0,.15)',
              background: 'white', color: 'rgba(0,0,0,.65)', fontSize: 13, cursor: isFirst ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: isFirst ? 0.35 : 1,
            }}
          >
            ← Back
          </button>
          <div style={{ display: 'flex', gap: 4 }} aria-hidden>
            {STEPS.map((_, i) => (
              <span key={i} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: i === idx ? 'var(--gold, #c4922a)' : 'rgba(0,0,0,.15)',
              }} />
            ))}
          </div>
          <button
            onClick={next}
            style={{
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: 'var(--gold, #c4922a)', color: 'var(--ink, #1a1612)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {isLast ? 'Done' : 'Next →'}
          </button>
        </div>
      </div>
    </>
  )
}
