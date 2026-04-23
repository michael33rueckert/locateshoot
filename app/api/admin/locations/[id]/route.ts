import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/admin'

async function requireAdmin(request: Request) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }), admin: null }
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: { user } } = await admin.auth.getUser(auth.slice(7))
  if (!user || !isAdminEmail(user.email)) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }), admin: null }
  }
  return { error: null, admin }
}

const EDITABLE_FIELDS = new Set([
  'name', 'description', 'city', 'state', 'latitude', 'longitude',
  'category', 'access_type', 'tags', 'permit_required', 'permit_fee',
  'permit_notes', 'permit_website', 'permit_certainty',
  'best_time', 'parking_info', 'status', 'rating', 'quality_score',
])

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { error, admin } = await requireAdmin(request)
  if (error) return error
  const { id } = await ctx.params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const patch: Record<string, any> = {}
  for (const k of Object.keys(body)) {
    if (EDITABLE_FIELDS.has(k)) patch[k] = body[k]
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const { data, error: e } = await admin!.from('locations').update(patch).eq('id', id).select().single()
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ location: data })
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { error, admin } = await requireAdmin(request)
  if (error) return error
  const { id } = await ctx.params

  // Clean up dependent rows first — photos + any portfolio rows that reference this location.
  await admin!.from('location_photos').delete().eq('location_id', id)
  await admin!.from('portfolio_locations').update({ source_location_id: null }).eq('source_location_id', id)
  const { error: e } = await admin!.from('locations').delete().eq('id', id)
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
