'use client'

import { useEffect, useRef, useState } from 'react'

// Cross-device drag-to-reorder. HTML5 drag-and-drop works on desktop mouse
// but is effectively broken on touch, which is why our old pages shipped
// ‹ › arrow fallbacks. This hook uses Pointer Events instead, which cover
// mouse, pen, and touch uniformly.
//
// Interaction model:
//   - Press (pointerdown) on an item starts a ~320ms long-press timer.
//   - Any significant movement before the timer fires = it was a scroll,
//     so we cancel and get out of the way.
//   - Timer completes without movement = drag mode on. Subsequent
//     pointermoves do hit-testing via elementFromPoint to find the hovered
//     sibling, preventDefault to block page scrolling, and update the
//     drop target for visual feedback. Pointerup applies the reorder.
//
// Cards using this hook must set `data-reorder-id={id}` so hit-testing
// can identify them.

export function useReorderDrag(reorder: (fromId: string, toId: string) => void) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overId,     setOverId]     = useState<string | null>(null)
  // Latest values mirrored into refs so the window-level listeners see
  // current state without needing the effect to re-subscribe.
  const draggingRef = useRef<string | null>(null)
  const overRef     = useRef<string | null>(null)

  useEffect(() => {
    if (!draggingId) return

    function handleMove(e: PointerEvent) {
      e.preventDefault()
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const card = el && (el as Element).closest ? (el as Element).closest('[data-reorder-id]') as HTMLElement | null : null
      const id = card?.getAttribute('data-reorder-id') ?? null
      if (id !== overRef.current) {
        overRef.current = id
        setOverId(id)
      }
    }

    function handleUp() {
      const from = draggingRef.current
      const to   = overRef.current
      if (from && to && from !== to) reorder(from, to)
      draggingRef.current = null
      overRef.current = null
      setDraggingId(null)
      setOverId(null)
    }

    window.addEventListener('pointermove', handleMove, { passive: false })
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [draggingId, reorder])

  function bindItem(id: string) {
    return {
      'data-reorder-id': id,
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        // Only primary button for mouse; any touch/pen counts.
        if (e.pointerType === 'mouse' && e.button !== 0) return

        const startX = e.clientX
        const startY = e.clientY
        let moved = false

        const checkMove = (ev: PointerEvent) => {
          if (Math.abs(ev.clientX - startX) > 8 || Math.abs(ev.clientY - startY) > 8) {
            moved = true
          }
        }
        const cleanup = () => {
          if (timerId) clearTimeout(timerId)
          window.removeEventListener('pointermove', checkMove)
          window.removeEventListener('pointerup', cleanup)
          window.removeEventListener('pointercancel', cleanup)
        }

        window.addEventListener('pointermove', checkMove)
        window.addEventListener('pointerup', cleanup)
        window.addEventListener('pointercancel', cleanup)

        const timerId = setTimeout(() => {
          if (moved) { cleanup(); return }
          // Stop listening for "was this just a scroll?" now that we've
          // committed to a drag — the effect above takes over.
          window.removeEventListener('pointermove', checkMove)
          window.removeEventListener('pointerup', cleanup)
          window.removeEventListener('pointercancel', cleanup)
          draggingRef.current = id
          setDraggingId(id)
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try { (navigator as any).vibrate(30) } catch {}
          }
        }, 320)
      },
    }
  }

  return { draggingId, overId, bindItem }
}
