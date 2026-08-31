import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/admin'

// Admin-only endpoint for creating a new public-map location manually.
// The AI scanner (via /api/scan-locations/*) is still the bulk-seed
// path; this is for the one-offs the admin comes across in the field
// that the scanner missed. Same authorization + admin gate as the
// PATCH/DELETE handlers in the [id] route.

async function requireAdmin(request: Request) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }), admin: null, userId: null as string | null }
  }
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: { user } } = await admin.auth.getUser(auth.slice(7))
  if (!user || !isAdminEmail(user.email)) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }), admin: null, userId: null }
  }
  return { error: null, admin, userId: user.id }
}

// Only these keys can be set via the create endpoint. Explicit
// allowlist keeps a mistyped column name from silently overwriting
// something like `id` or `created_at`.
const INSERTABLE_FIELDS = new Set([
  'name', 'description', 'city', 'state', 'latitude', 'longitude',
  'category', 'access_type', 'tags', 'permit_required', 'permit_fee',
  'permit_notes', 'permit_website', 'permit_certainty',
  'best_time', 'parking_info', 'parking_type', 'parking_latitude', 'parking_longitude',
  'status', 'rating', 'quality_score',
])

// Service-role list of every locations row for the admin table. The
// `locations` table's public SELECT policy is scoped to
// status='published', so a plain client-side query from /admin hid
// pending + draft rows — that's why searching for something you
// know is in the DB was returning fewer results than expected.
// Going through service role here removes RLS as a variable.
export async function GET(request: Request) {
  const { error, admin } = await requireAdmin(request)
  if (error) return error
  const { data, error: e } = await admin!
    .from('locations')
    .select('id,name,description,city,state,latitude,longitude,category,access_type,tags,permit_required,permit_fee,permit_notes,permit_website,permit_certainty,best_time,parking_info,parking_type,parking_latitude,parking_longitude,status,rating,quality_score,source,created_at')
    .order('created_at', { ascending: false })
    .limit(2000)
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ rows: data ?? [] })
}

export async function POST(request: Request) {
  const { error, admin, userId } = await requireAdmin(request)
  if (error) return error

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  // Name + coords are the minimum shape the map can render. Everything
  // else gets a sensible default.
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const lat  = Number(body.latitude)
  const lng  = Number(body.longitude)
  if (!name)                       return NextResponse.json({ error: 'name_required' }, { status: 400 })
  if (!Number.isFinite(lat))       return NextResponse.json({ error: 'latitude_required' }, { status: 400 })
  if (!Number.isFinite(lng))       return NextResponse.json({ error: 'longitude_required' }, { status: 400 })

  const row: Record<string, any> = {
    name,
    latitude:  lat,
    longitude: lng,
    status:    'published',
    source:    'admin_manual',
    added_by:  userId,
  }
  for (const k of Object.keys(body)) {
    if (INSERTABLE_FIELDS.has(k) && k !== 'name' && k !== 'latitude' && k !== 'longitude') {
      row[k] = body[k]
    }
  }

  const { data, error: e } = await admin!.from('locations').insert(row).select().single()
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ location: data })
}
