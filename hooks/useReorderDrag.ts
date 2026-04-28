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
//   - Timer completes without movement = drag mode on:
//       • setPointerCapture(pointerId) — routes all subsequent events for
//         this pointer to our element, and (critically on Android) blocks
//         the browser from firing a gratuitous pointercancel when its own
//         long-press heuristic decides the gesture should become a
//         context-menu.
//       • element.style.touchAction = 'none' — flips the element out of
//         pan-y mode so pointermoves no longer scroll the page.
//       • haptic buzz, visual state.
//     Pointerup applies the reorder; pointercancel aborts cleanly.
//
// Cards using this hook must set `data-reorder-id={id}` (the `bindItem`
// helper below does this automatically) so hit-testing can identify them.
//
// Load-bearing details worth preserving if you refactor:
//   1. We use `document.elementsFromPoint` (plural) and skip the dragged
//      card in the results — `elementFromPoint` (singular) would always
//      return the dragged card itself. An earlier iteration tried to
//      fix this by setting `pointer-events:none` on the dragged card,
//      but that silently broke setPointerCapture on Android (events to
//      a captured element with pointer-events:none get dropped).
//   2. Drag-phase listeners are attached synchronously from the timer
//      callback — not from a useEffect — so the browser doesn't get a
//      render-cycle window where pointermoves are uncaught.
//   3. Consumers style the card with `touch-action: pan-y` up front;
//      this hook flips it to `none` on pickup. Starting at pan-y is what
//      lets the user scroll the page normally before a long-press.

export function useReorderDrag(reorder: (fromId: string, toId: string) => void) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overId,     setOverId]     = useState<string | null>(null)
  // Latest values mirrored into refs so window-level listeners (which
  // capture their references once at attach time) see current state.
  const draggingRef = useRef<string | null>(null)
  const overRef     = useRef<string | null>(null)

  // Long-press + pointer-capture handler shared by bindItem (whole-row
  // drag) and bindHandle (drag-by-grip). When `fromHandle` is true the
  // long-press wait is skipped — grabbing a dedicated handle is
  // unambiguous intent, no need to disambiguate from a scroll. The
  // handle owns the gesture from the first touch.
  function buildOnPointerDown(id: string, opts: { fromHandle: boolean }) {
    return (e: React.PointerEvent<HTMLElement>) => {
      // Only primary button for mouse; any touch/pen counts.
      if (e.pointerType === 'mouse' && e.button !== 0) return

      const pointerId = e.pointerId
      const target    = e.currentTarget as HTMLElement
      const origTouchAction = target.style.touchAction

      // Drag-mode entry. Pulled out so we can call it either after the
      // long-press timer (whole-row mode) or immediately on touch
      // (handle mode).
      function enterDragMode() {
        try { target.setPointerCapture(pointerId) } catch {}
        target.style.touchAction = 'none'

        draggingRef.current = id
        overRef.current = null
        setDraggingId(id)
        setOverId(null)
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try { (navigator as any).vibrate(30) } catch {}
        }

        // Cap pointermove work at one frame. Without this, every move
        // event (60–120/sec on a high-refresh trackpad) ran a DOM
        // hit-test + a setOverId state change + a full re-render of
        // the consumer's grid — Safari in particular doesn't batch
        // pointer events, and a 60-photo portfolio felt visibly laggy
        // during drag. rAF coalesces to at most one hit-test per
        // frame and reuses the latest event coords.
        let rafId: number | null = null
        let pendingEv: PointerEvent | null = null

        const runHitTest = () => {
          rafId = null
          const ev = pendingEv
          pendingEv = null
          if (!ev) return
          // elementsFromPoint returns every element at the point in
          // z-order. The dragged card sits on top (finger is on it), so
          // skip past it and look for the first sibling card beneath.
          const stack = document.elementsFromPoint
            ? document.elementsFromPoint(ev.clientX, ev.clientY)
            : []
          let hoverId: string | null = null
          for (const el of stack) {
            const card = (el as Element).closest?.('[data-reorder-id]') as HTMLElement | null
            if (!card) continue
            const candidate = card.getAttribute('data-reorder-id')
            if (candidate && candidate !== draggingRef.current) { hoverId = candidate; break }
          }
          if (hoverId !== overRef.current) {
            overRef.current = hoverId
            setOverId(hoverId)
          }
        }

        const handleMove = (ev: PointerEvent) => {
          ev.preventDefault()
          pendingEv = ev
          if (rafId !== null) return
          rafId = requestAnimationFrame(runHitTest)
        }

        const finish = (commit: boolean) => {
          if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
          pendingEv = null
          const from = draggingRef.current
          const to   = overRef.current
          if (commit && from && to && from !== to) reorder(from, to)
          draggingRef.current = null
          overRef.current = null
          setDraggingId(null)
          setOverId(null)
          target.style.touchAction = origTouchAction
          try { target.releasePointerCapture(pointerId) } catch {}
          window.removeEventListener('pointermove', handleMove)
          window.removeEventListener('pointerup', handleUp)
          window.removeEventListener('pointercancel', handleCancel)
        }
        const handleUp     = () => finish(true)
        const handleCancel = () => finish(false)

        window.addEventListener('pointermove', handleMove, { passive: false })
        window.addEventListener('pointerup', handleUp)
        window.addEventListener('pointercancel', handleCancel)
      }

      // Handle mode: skip the long-press wait. The user grabbed a
      // dedicated drag handle, so go straight into drag.
      if (opts.fromHandle) {
        e.preventDefault()
        e.stopPropagation()
        enterDragMode()
        return
      }

      // Whole-row mode: long-press detection. We watch for pointer
      // movement or release before the timer fires so a scroll gesture
      // doesn't accidentally start a drag.
      const startX = e.clientX
      const startY = e.clientY
      let moved = false
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
        window.removeEventListener('pointermove', checkMove)
        window.removeEventListener('pointerup', cancelPress)
        window.removeEventListener('pointercancel', cancelPress)
        enterDragMode()
      }, 320)
    }
  }

  function bindItem(id: string) {
    return {
      'data-reorder-id': id,
      // Swallow native long-press / drag behaviors.
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      onDragStart:   (e: React.DragEvent)  => e.preventDefault(),
      onPointerDown: buildOnPointerDown(id, { fromHandle: false }),
    }
  }

  // Optional dedicated drag-handle binding. Use this on a small grip
  // element inside the row when the row also needs to be vertically
  // scrollable — touching the body scrolls naturally; touching the
  // handle drags immediately. The row should still get bindItem so
  // hit-testing can identify it as a drop target.
  function bindHandle(id: string) {
    return {
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      onDragStart:   (e: React.DragEvent)  => e.preventDefault(),
      onPointerDown: buildOnPointerDown(id, { fromHandle: true }),
      style: { touchAction: 'none' as const },
    }
  }

  return { draggingId, overId, bindItem, bindHandle }
}
