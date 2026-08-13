import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/admin'
import { SCAN_CATEGORY_NAMES } from '@/lib/scan-locations'

// Admin-side read/write for the daily-scanner config that lives in
// admin_settings under the 'scanner_config' key. GET returns the row
// (with defaults filled in), PUT patches whitelisted keys. The cron
// endpoint reads the same row on every fire.

async function requireAdmin(request: Request) {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return { err: NextResponse.json({ error: 'unauthorized' }, { status: 401 }), admin: null, userId: null as string | null, email: null as string | null }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: { user } } = await admin.auth.getUser(token)
  if (!user || !isAdminEmail(user.email)) {
    return { err: NextResponse.json({ error: 'forbidden' }, { status: 403 }), admin: null, userId: null, email: null }
  }
  return { err: null, admin, userId: user.id, email: user.email ?? null }
}

const DEFAULT_CONFIG = {
  enabled:        false,
  cities:         [] as string[],
  categories:     [] as string[],
  queue_index:    0,
  last_run_at:    null as string | null,
  notify_email:   null as string | null,
  notify_user_id: null as string | null,
}

export async function GET(request: Request) {
  const { err, admin } = await requireAdmin(request)
  if (err) return err
  const { data } = await admin!.from('admin_settings').select('value,updated_at').eq('key', 'scanner_config').single()
  const cfg = { ...DEFAULT_CONFIG, ...(data?.value ?? {}) }
  return NextResponse.json({
    config: cfg,
    updated_at: data?.updated_at ?? null,
    available_categories: SCAN_CATEGORY_NAMES,
  })
}

export async function PUT(request: Request) {
  const { err, admin, userId, email } = await requireAdmin(request)
  if (err) return err

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const { data: existing } = await admin!.from('admin_settings').select('value').eq('key', 'scanner_config').single()
  const prev = { ...DEFAULT_CONFIG, ...(existing?.value ?? {}) }
  const next: typeof DEFAULT_CONFIG = { ...prev }

  if (typeof body.enabled === 'boolean') next.enabled = body.enabled
  if (Array.isArray(body.cities))     next.cities = body.cities.filter((c: any) => typeof c === 'string' && c.trim().length > 0).map((c: string) => c.trim()).slice(0, 30)
  if (Array.isArray(body.categories)) {
    // Only accept known category names — a typo in the admin UI
    // wouldn't produce any candidates, and would silently jam the
    // queue on a bad row every cycle.
    const known = new Set(SCAN_CATEGORY_NAMES)
    next.categories = body.categories.filter((c: any) => typeof c === 'string' && known.has(c))
  }
  // If the target set shrinks below the current queue index, wrap so
  // we don't skip past the whole new list.
  const comboCount = next.cities.length * next.categories.length
  if (comboCount > 0 && next.queue_index >= comboCount) next.queue_index = 0

  // Notification target — always stamp the admin who just saved as
  // the push recipient. Email is opt-in.
  next.notify_user_id = userId
  if (typeof body.notify_email === 'string') {
    const em = body.notify_email.trim()
    next.notify_email = em ? em : null
  } else if (body.notify_email === null) {
    next.notify_email = null
  } else if (next.notify_email == null) {
    // First save with no email: default to the admin's own auth email
    // so notifications actually go somewhere.
    next.notify_email = email
  }

  const { error: upErr } = await admin!.from('admin_settings')
    .upsert({ key: 'scanner_config', value: next, updated_at: new Date().toISOString() })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  return NextResponse.json({ config: next })
}
