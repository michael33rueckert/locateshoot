import webpush from 'web-push'

// Server-side Web Push helper. Configures VAPID once on import and sends
// a notification to every stored subscription for a given user. Called
// from /api/submit-pick after a client submits a pick. Invalid / stale
// subscriptions (410 Gone from the push service) are pruned on the fly
// so a dead endpoint stops burning retry budget.

type Admin = {
  from: (table: string) => any
}

let configured = false
function ensureConfigured(): boolean {
  if (configured) return true
  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subj = process.env.VAPID_SUBJECT || 'mailto:hello@locateshoot.com'
  if (!pub || !priv) return false
  webpush.setVapidDetails(subj, pub, priv)
  configured = true
  return true
}

interface PushPayload {
  title: string
  body:  string
  url?:  string  // deep-link target when the notification is tapped
  tag?:  string  // coalesces successive notifications into one on-device
}

export async function sendPushToUser(
  admin: Admin,
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number; subscribed: number; reason?: string }> {
  if (!ensureConfigured()) {
    console.warn('sendPushToUser: VAPID not configured, skipping push', { userId })
    return { sent: 0, failed: 0, subscribed: 0, reason: 'vapid-missing' }
  }

  const { data: rows, error } = await admin
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .eq('user_id', userId)
  if (error) {
    console.error('sendPushToUser: push_subscriptions query failed', { userId, error: error.message })
    return { sent: 0, failed: 0, subscribed: 0, reason: 'query-error' }
  }
  if (!rows || rows.length === 0) {
    return { sent: 0, failed: 0, subscribed: 0, reason: 'no-subscriptions' }
  }

  const body = JSON.stringify(payload)
  let sent = 0
  let failed = 0
  const stale: string[] = []

  await Promise.all(rows.map(async (row: any) => {
    try {
      // urgency: 'high' tells the push service (Android FCM, APNs via
      // Apple's webpush gateway, etc.) to surface the notification
      // immediately instead of queueing it for the device's next wake.
      // Without this, Pixel + iPhone PWAs running in Doze / background-
      // app-refresh deferred mode have been receiving pick alerts
      // several minutes — sometimes hours — late, defeating the
      // "client just picked!" use case the notification exists for.
      // TTL: 60s drops the push from the queue if the device is offline
      // longer than that — a stale pick alert is worse than none.
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        body,
        { urgency: 'high', TTL: 60 },
      )
      sent++
    } catch (err: any) {
      failed++
      // 404/410 mean the push service has dropped this subscription —
      // prune it so we don't keep trying. Other errors (rate limiting,
      // network blips) leave the row intact for a retry next pick.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        stale.push(row.endpoint)
      } else {
        console.error('web-push send failed', err?.statusCode, err?.body ?? err?.message)
      }
    }
  }))

  if (stale.length > 0) {
    try {
      await admin.from('push_subscriptions').delete().eq('user_id', userId).in('endpoint', stale)
      console.warn('sendPushToUser: pruned stale endpoints', { userId, count: stale.length })
    } catch (e) {
      console.error('prune stale push_subscriptions failed', e)
    }
  }

  return { sent, failed, subscribed: rows.length }
}
