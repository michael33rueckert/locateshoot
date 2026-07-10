'use client'

import { validatePassword, PASSWORD_MIN_LENGTH } from '@/lib/password'

// Live checklist rendered under a password input. Each rule flips from
// muted grey to sage-green with a ✓ as it's satisfied — gives users
// a running signal that they're on track instead of a single "invalid
// password" error after they hit submit.
//
// `theme='dark'` swaps the palette for use on the dark AuthModal.
// Everywhere else (Profile page's cream surface) uses the default.

export default function PasswordRequirements({
  value,
  theme = 'light',
}: {
  value: string
  theme?: 'light' | 'dark'
}) {
  const { checks } = validatePassword(value)

  const items: { label: string; ok: boolean }[] = [
    { label: `At least ${PASSWORD_MIN_LENGTH} characters`, ok: checks.length },
    { label: 'A lowercase letter',                          ok: checks.lower  },
    { label: 'An uppercase letter',                         ok: checks.upper  },
    { label: 'A number',                                    ok: checks.digit  },
    { label: 'A symbol',                                    ok: checks.symbol },
  ]

  const okColor  = theme === 'dark' ? '#8fbf8a' : 'var(--sage)'
  const dimColor = theme === 'dark' ? 'rgba(245,240,232,.4)' : 'var(--ink-soft)'

  return (
    <ul style={{
      listStyle: 'none',
      margin: '4px 0 0',
      padding: 0,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
      rowGap: 2,
      columnGap: 10,
    }}>
      {items.map(item => (
        <li
          key={item.label}
          style={{
            fontSize: 11,
            color: item.ok ? okColor : dimColor,
            fontWeight: item.ok ? 500 : 300,
            transition: 'color .15s',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <span style={{ width: 10, display: 'inline-block' }}>{item.ok ? '✓' : '•'}</span>
          {item.label}
        </li>
      ))}
    </ul>
  )
}
