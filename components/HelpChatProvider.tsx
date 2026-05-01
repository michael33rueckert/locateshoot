'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

// Shared conversation state for the in-app help assistant. Mounted
// at the root layout so the messages array survives Next.js
// navigations — moving from /dashboard to /portfolio doesn't unmount
// the provider, so the chat state stays put. Backed by localStorage
// so it ALSO survives tab closes and full reloads.
//
// Storage is keyed per-user-id so the same browser used by two
// different photographers (rare in practice but possible) doesn't
// leak one's conversation into the other's session.

const STORAGE_KEY_PREFIX = 'locateshoot_help_chat_v1_'
const MAX_STORED_MESSAGES = 30  // cap so localStorage doesn't grow unbounded

export interface ChatSource {
  slug:     string
  title:    string
  category: string
}

export interface ChatMessage {
  id:       number
  role:     'user' | 'model' | 'error'
  content:  string
  sources?: ChatSource[]
}

interface HelpChatContextValue {
  messages:       ChatMessage[]
  setMessages:    React.Dispatch<React.SetStateAction<ChatMessage[]>>
  clearMessages:  () => void
  // Once true, the provider has finished its initial localStorage
  // read for the current user. Components can use this to wait
  // before treating "messages.length === 0" as "fresh start" rather
  // than "still loading".
  hydrated:       boolean
}

const Ctx = createContext<HelpChatContextValue | null>(null)

export function HelpChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // Track the current Supabase user. When it changes (sign in, sign
  // out, switch accounts) we re-key localStorage and re-hydrate.
  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      setUserId(session?.user?.id ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (cancelled) return
      setUserId(s?.user?.id ?? null)
    })
    return () => { cancelled = true; sub.subscription.unsubscribe() }
  }, [])

  // Hydrate from localStorage whenever the user changes (including
  // first auth resolution after page load). When the user is null
  // (signed out), clear messages without touching storage.
  useEffect(() => {
    if (!userId) {
      setMessages([])
      setHydrated(true)
      return
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PREFIX + userId)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          // Validate enough to avoid React choking on malformed
          // data (e.g. an older format from a future schema change).
          const valid = parsed.filter((m: any): m is ChatMessage =>
            m && typeof m === 'object'
            && typeof m.id === 'number'
            && (m.role === 'user' || m.role === 'model' || m.role === 'error')
            && typeof m.content === 'string',
          )
          setMessages(valid)
        } else {
          setMessages([])
        }
      } else {
        setMessages([])
      }
    } catch {
      // Bad JSON / storage disabled / quota exceeded — start fresh.
      setMessages([])
    }
    setHydrated(true)
  }, [userId])

  // Save to localStorage whenever messages change. Skipped until
  // hydration completes so we don't overwrite a stored thread with
  // the empty initial state during boot.
  useEffect(() => {
    if (!hydrated || !userId) return
    const key = STORAGE_KEY_PREFIX + userId
    try {
      if (messages.length === 0) {
        localStorage.removeItem(key)
      } else {
        localStorage.setItem(key, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)))
      }
    } catch {
      // Quota exceeded or disabled — best-effort, ignore.
    }
  }, [messages, userId, hydrated])

  function clearMessages() {
    setMessages([])
  }

  return (
    <Ctx.Provider value={{ messages, setMessages, clearMessages, hydrated }}>
      {children}
    </Ctx.Provider>
  )
}

export function useHelpChat(): HelpChatContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) {
    // Defensive — if the provider isn't mounted (forgotten in a new
    // route group, etc.) fall back to a no-op shape so the panel
    // renders normally without crashing the page.
    return {
      messages: [],
      setMessages: () => {},
      clearMessages: () => {},
      hydrated: true,
    }
  }
  return ctx
}
