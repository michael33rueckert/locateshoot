'use client'

import React from 'react'

// Sliding-window pagination buttons — first page, current ± 1, last
// page; everything in between collapses to an ellipsis. Renders the
// flat group of buttons (← + numbers + →) only — the caller wraps
// them in whatever container is appropriate (a <div> next to a
// "Showing X–Y of N" hint, or an <li> inside a <ul>).
//
// Window math: 7 visible slots fits the four shapes — short list, far
// left, far right, deep middle. Examples for totalPages=15:
//   currentPage = 1 →  ← 1 2 3 4 5 … 15 →
//   currentPage = 7 →  ← 1 … 6 7 8 … 15 →
//   currentPage = 14 → ← 1 … 11 12 13 14 15 →
// For totalPages ≤ 7 every number is shown.

interface Props {
  totalPages: number
  currentPage: number
  onPageChange: (page: number) => void
}

export default function PaginationButtons({ totalPages, currentPage, onPageChange }: Props) {
  if (totalPages <= 1) return null

  type Slot = number | 'gap-left' | 'gap-right'
  const slots: Slot[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) slots.push(i)
  } else if (currentPage <= 4) {
    slots.push(1, 2, 3, 4, 5, 'gap-right', totalPages)
  } else if (currentPage >= totalPages - 3) {
    slots.push(1, 'gap-left', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
  } else {
    slots.push(1, 'gap-left', currentPage - 1, currentPage, currentPage + 1, 'gap-right', totalPages)
  }

  const btn = (label: string, target: number, disabled: boolean, isActive = false, key?: React.Key) => (
    <button
      key={key}
      onClick={() => onPageChange(target)}
      disabled={disabled}
      style={{
        minWidth: 28, padding: '4px 8px', borderRadius: 4,
        fontFamily: 'inherit', fontSize: 12, fontWeight: isActive ? 600 : 400,
        color: disabled ? 'var(--ink-soft)' : isActive ? 'var(--ink)' : 'var(--ink-mid)',
        background: isActive ? 'var(--cream)' : 'transparent',
        border: `1px solid ${isActive ? 'var(--cream-dark)' : 'transparent'}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >{label}</button>
  )

  return (
    <>
      {btn('←', Math.max(1, currentPage - 1), currentPage === 1, false, 'prev')}
      {slots.map((s, i) => {
        if (s === 'gap-left' || s === 'gap-right') {
          // Click jumps by 5 in the matching direction so an ellipsis
          // doubles as a fast-forward control. Stays clamped to [1,
          // totalPages].
          const target = s === 'gap-left'
            ? Math.max(1, currentPage - 5)
            : Math.min(totalPages, currentPage + 5)
          return (
            <button
              key={`${s}-${i}`}
              onClick={() => onPageChange(target)}
              title={s === 'gap-left' ? 'Jump back' : 'Jump forward'}
              style={{
                minWidth: 24, padding: '4px 4px', borderRadius: 4,
                fontFamily: 'inherit', fontSize: 12, fontWeight: 400,
                color: 'var(--ink-soft)',
                background: 'transparent',
                border: '1px solid transparent',
                cursor: 'pointer',
              }}
            >…</button>
          )
        }
        return btn(String(s), s, false, currentPage === s, `p-${s}`)
      })}
      {btn('→', Math.min(totalPages, currentPage + 1), currentPage === totalPages, false, 'next')}
    </>
  )
}
