'use client'

import { supabase } from '@/lib/supabase'

// Client-side helpers for enabling/disabling Web Push. The photographer
// only needs to do this once per device/browser — after that the Push
// service remembers the subscription and `navigator.serviceWorker.ready`
// resolves synchronously on every subsequent load.

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function pushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator
      && 'PushManager'     in window
      && 'Notification'    in window
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

// Web Push's application server key must be a Uint8Array, not a base64
// string. The server hands out the key as URL-safe base64 which we decode
// here.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function subscribeToPush(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pushSupported()) return { ok: false, error: 'Push notifications aren’t supported on this browser.' }
  if (!PUBLIC_KEY) return { ok: false, error: 'Push is not configured — missing VAPID public key.' }

  try {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return { ok: false, error: perm === 'denied' ? 'Notification permission was blocked. Enable it in your browser settings.' : 'Permission was dismissed.' }

    const reg = await navigator.serviceWorker.ready
    // Reuse any existing subscription — a second subscribe call would
    // no-op in most browsers but some report errors, so check first.
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // TS types PushSubscriptionOptionsInit.applicationServerKey as
        // BufferSource — our helper returns Uint8Array which is runtime-
        // compatible but varies in type width across TS versions.
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) as BufferSource,
      })
    }

    const payload = sub.toJSON()
    const res = await fetch('/api/push/subscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body:    JSON.stringify({
        endpoint: payload.endpoint,
        keys:     payload.keys,
        userAgent: navigator.userAgent,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `Server rejected subscription (${res.status}): ${body}` }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Subscribe failed.' }
  }
}

export async function unsubscribeFromPush(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pushSupported()) return { ok: false, error: 'Push notifications aren’t supported on this browser.' }
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return { ok: true }
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    await fetch('/api/push/unsubscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body:    JSON.stringify({ endpoint }),
    })
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unsubscribe failed.' }
  }
}

export async function isCurrentlySubscribed(): Promise<boolean> {
  if (!pushSupported()) return false
  if (Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch { return false }
}
