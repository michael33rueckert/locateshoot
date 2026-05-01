'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import HelpChatPanel from '@/app/help/HelpChatPanel'

// Floating "Help" button — sits just above the FeedbackButton in the
// bottom-right corner, mounted globally in the root layout. Click
// opens a popover with the same HelpChatPanel that the /help page
// uses inline, so the chat history / starter questions / source-
// citation behavior is identical regardless of where the
// photographer launches it from.
//
// Visibility rules mirror FeedbackButton:
//   - Only signed-in photographers see it.
//   - Hidden on /pick/* (the client-facing share flow).
//   - Hidden on /help itself — the panel is already on that page
//     in line, so a floating button would just open a duplicate.

export default function HelpChatLauncher() {
  const pathname = usePathname() ?? ''
  const [open, setOpen] = useState(false)
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session?.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s?.user))
    return () => subscription.unsubscribe()
  }, [])

  // Esc closes the popover. Bound only while open so we don't add
  // and tear down on every keystroke for closed-state pages.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (pathname.startsWith('/pick')) return null
  if (pathname.startsWith('/help'))  return null
  if (signedIn !== true) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open help assistant"
        style={{
          position: 'fixed',
          // Stack right above the FeedbackButton (which sits at
          // bottom: env+14px and is ~32px tall) with a small gap.
          right:  'calc(env(safe-area-inset-right, 0) + 14px)',
          bottom: 'calc(env(safe-area-inset-bottom, 0) + 60px)',
          zIndex: 9000,
          padding: '9px 14px',
          borderRadius: 999,
          background: 'rgba(196,146,42,.92)',
          color: 'var(--ink)',
          border: '1px solid rgba(196,146,42,.6)',
          boxShadow: '0 8px 24px rgba(0,0,0,.25)',
          backdropFilter: 'blur(8px)',
          fontFamily: 'inherit',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        ✨ Help
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            aria-hidden
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(10,8,6,.5)', backdropFilter: 'blur(6px)',
              zIndex: 9500,
            }}
          />
          <div
            role="dialog"
            aria-label="Help assistant"
            style={{
              position: 'fixed',
              bottom: 'calc(env(safe-area-inset-bottom, 0) + 14px)',
              right:  'calc(env(safe-area-inset-right, 0) + 14px)',
              maxWidth: 'min(440px, calc(100vw - 28px))',
              maxHeight: 'min(720px, calc(100dvh - 80px))',
              overflowY: 'auto',
              zIndex: 9600,
              borderRadius: 14,
              boxShadow: '0 24px 64px rgba(0,0,0,.45)',
            }}
          >
            {/* Close pill anchored to the popover so it follows the
                scroll. Placed top-right inside the panel padding so
                it doesn't overlap the header text. */}
            <button
              onClick={() => setOpen(false)}
              aria-label="Close help"
              style={{
                position: 'absolute',
                top: 14, right: 14,
                width: 26, height: 26, borderRadius: '50%',
                background: 'rgba(255,255,255,.08)',
                color: 'rgba(245,240,232,.75)',
                border: '1px solid rgba(255,255,255,.12)',
                fontSize: 13,
                cursor: 'pointer',
                zIndex: 2,
                fontFamily: 'inherit',
              }}
            >✕</button>
            <HelpChatPanel />
          </div>
        </>
      )}
    </>
  )
}
