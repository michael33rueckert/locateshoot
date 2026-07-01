'use client'

// Three "example guide" cards shown to new photographers who haven't
// created any custom Location Guides yet. Not real DB rows — pure UI
// placeholders that look like real guide cards but with a "Example"
// pill so they're clearly not shareable. Clicking one opens the
// CreateLocationGuideModal pre-filled with the example's name +
// message so the photographer sees the flow and can save it as their
// first real guide with minimal typing.
//
// Removed automatically once the user creates any real custom guide.

export interface DemoGuideTemplate {
  key:          string
  session_name: string
  message:      string
  emoji:        string
  hint:         string   // one-line "this kind of guide" description shown on the card
}

export const DEMO_GUIDE_TEMPLATES: DemoGuideTemplate[] = [
  {
    key: 'engagement',
    session_name: 'Sarah & Mike — engagement session',
    message: 'Hey! I picked a few spots I think will work great for your engagement shoot. Take a look and let me know which one you love. Excited for the shoot!',
    emoji: '💍',
    hint: 'Per-client guide, name it after them',
  },
  {
    key: 'seasonal',
    session_name: 'Spring 2026 maternity locations',
    message: 'Here are my favorite spring maternity spots — soft light, wildflowers, and cherry blossoms. Pick whichever feels right for your session.',
    emoji: '🌸',
    hint: 'Seasonal or theme-based, sent to multiple clients',
  },
  {
    key: 'golden-hour',
    session_name: 'Downtown golden hour',
    message: 'A curated list of downtown spots that shine at golden hour. Great for engagement, senior, or portrait sessions.',
    emoji: '🌇',
    hint: 'Themed / repeat-use, permanent link for your workflow',
  },
]

interface Props {
  onPickTemplate: (t: DemoGuideTemplate) => void
}

export default function DemoGuideCards({ onPickTemplate }: Props) {
  return (
    <div style={{ marginBottom: 20 }}>
      {/* Intro banner — explains why these cards are here so
          photographers don't confuse them for real guides they can
          share to a client right now. */}
      <div style={{ padding: '12px 14px', background: 'rgba(74,103,65,.06)', border: '1px dashed var(--sage)', borderRadius: 8, marginBottom: 12, fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>👋 Get a feel for it — click any example below</div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300 }}>
          These aren&apos;t live yet. Tap one to open the guide editor pre-filled with a name + intro message you can tweak — pick a few locations from your portfolio, hit save, and you&apos;ll have your first real guide.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 14 }}>
        {DEMO_GUIDE_TEMPLATES.map(t => (
          <div key={t.key} onClick={() => onPickTemplate(t)}
            style={{
              display: 'flex', flexDirection: 'column',
              background: 'white',
              border: '2px dashed var(--sand)',
              borderRadius: 10,
              overflow: 'hidden',
              cursor: 'pointer',
              transition: 'all .15s',
              position: 'relative',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.background = 'rgba(196,146,42,.03)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--sand)'; e.currentTarget.style.background = 'white' }}>
            <div style={{ position: 'absolute', top: 8, left: 8, padding: '3px 8px', borderRadius: 4, background: 'rgba(0,0,0,.55)', color: 'white', fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', zIndex: 2 }}>
              Example
            </div>
            <div style={{ aspectRatio: '4 / 3', background: 'linear-gradient(135deg, var(--cream-dark), var(--cream))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52 }}>
              {t.emoji}
            </div>
            <div style={{ padding: '12px 14px 14px' }}>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {t.session_name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: 12, lineHeight: 1.5 }}>
                {t.hint}
              </div>
              <div style={{ padding: '7px 12px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
                Try this template →
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
