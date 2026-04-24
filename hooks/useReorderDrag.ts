'use client'

import { useRef, useState } from 'react'

// Cross-device drag-to-reorder. HTML5 drag-and-drop works on desktop mouse
// but is effectively broken on touch, which is why our old pages shipped
// ‹ › arrow fallbacks. This hook uses Pointer Events instead, which cover
// mouse, pen, and touch uniformly.
//
// Interaction model:
//   - Press (pointerdown) on an item starts a ~320ms long-press timer.
//   - Any significant movement before the timer fires = it was a scroll,
//     so we cancel and get out of the way (no reorder, normal scroll).
//   - Timer completes without movement = drag mode on. Subsequent
//     pointermoves do hit-testing via elementFromPoint to find the
//     hovered sibling, preventDefault to block page scrolling, and
//     update the drop target for visual feedback. Pointerup applies the
//     reorder.
//
// Cards using this hook must set `data-reorder-id={id}` (the `bindItem`
// helper below does this automatically) so hit-testing can identify them.
//
// Two subtleties worth preserving if you refactor this:
//   1. `pointer-events:none` on the dragged card is load-bearing. Without
//      it `elementFromPoint` at the finger position would return the
//      dragged card itself (since it sits directly under the pointer),
//      so `overId === draggingId` and no reorder ever fires.
//   2. Drag-phase listeners are attached synchronously from the timer
//      callback — not from a useEffect — so the browser doesn't get a
//      render-cycle window where pointermoves are uncaught and a scroll
//      could start.

export function useReorderDrag(reorder: (fromId: string, toId: string) => void) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overId,     setOverId]     = useState<string | null>(null)
  // Latest values mirrored into refs so window-level listeners (which
  // capture their references once at attach time) see current state.
  const draggingRef = useRef<string | null>(null)
  const overRef     = useRef<string | null>(null)

  function bindItem(id: string) {
    return {
      'data-reorder-id': id,
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        // Only primary button for mouse; any touch/pen counts.
        if (e.pointerType === 'mouse' && e.button !== 0) return

        const startX = e.clientX
        const startY = e.clientY
        let moved = false

        // Phase 1: long-press detection. We watch for pointer movement or
        // release before the timer fires so a scroll gesture doesn't
        // accidentally start a drag.
        const checkMove = (ev: PointerEvent) => {
          if (Math.abs(ev.clientX - startX) > 8 || Math.abs(ev.clientY - startY) > 8) {
            moved = true
          }
        }
        const cancelPress = () => {
          clearTimeout(timerId)
          window.removeEventListener('pointermove', checkMove)
          window.removeEventListener('pointerup', cancelPress)
          window.removeEventListener('pointercancel', cancelPress)
        }

        window.addEventListener('pointermove', checkMove)
        window.addEventListener('pointerup', cancelPress)
        window.addEventListener('pointercancel', cancelPress)

        const timerId = window.setTimeout(() => {
          if (moved) { cancelPress(); return }

          // Phase 2: drag. Swap press-phase listeners for drag-phase
          // listeners synchronously — if we deferred to a useEffect the
          // browser could slip a scroll into the render-cycle gap.
          window.removeEventListener('pointermove', checkMove)
          window.removeEventListener('pointerup', cancelPress)
          window.removeEventListener('pointercancel', cancelPress)

          draggingRef.current = id
          overRef.current = null
          setDraggingId(id)
          setOverId(null)
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try { (navigator as any).vibrate(30) } catch {}
          }

          const handleMove = (ev: PointerEvent) => {
            // Non-passive via addEventListener options below, so this
            // preventDefault actually stops the page from scrolling.
            ev.preventDefault()
            const el = document.elementFromPoint(ev.clientX, ev.clientY)
            const card = el && (el as Element).closest
              ? (el as Element).closest('[data-reorder-id]') as HTMLElement | null
              : null
            const hoverId = card?.getAttribute('data-reorder-id') ?? null
            // Treat hovering over the dragged card itself as "no target"
            // — the `pointer-events:none` applied to the dragged card's
            // style should already prevent this, but this is the belt.
            const next = hoverId && hoverId !== draggingRef.current ? hoverId : null
            if (next !== overRef.current) {
              overRef.current = next
              setOverId(next)
            }
          }

          const handleUp = () => {
            const from = draggingRef.current
            const to   = overRef.current
            if (from && to && from !== to) reorder(from, to)
            draggingRef.current = null
            overRef.current = null
            setDraggingId(null)
            setOverId(null)
            window.removeEventListener('pointermove', handleMove)
            window.removeEventListener('pointerup', handleUp)
            window.removeEventListener('pointercancel', handleUp)
          }

          window.addEventListener('pointermove', handleMove, { passive: false })
          window.addEventListener('pointerup', handleUp)
          window.addEventListener('pointercancel', handleUp)
        }, 320)
      },
    }
  }

  return { draggingId, overId, bindItem }
}
