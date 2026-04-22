import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: share, error: shareErr } = await admin
    .from('share_links')
    .select('id,user_id,session_name,message,photographer_name,my_photos_only,expires_at,location_ids,secret_ids,is_permanent')
    .eq('slug', slug)
    .single()

  if (shareErr || !share) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }

  let branding = null
  if (share.user_id) {
    const { data: prof } = await admin
      .from('profiles')
      .select('preferences')
      .eq('id', share.user_id)
      .single()
    branding = prof?.preferences ?? null
  }

  const locIds: any[] = (share.location_ids ?? []).filter((id: any) => id != null)
  let locations: any[] = []
  if (locIds.length > 0) {
    const { data, error } = await admin
      .from('locations')
      .select('id,name,city,state,latitude,longitude,access_type,description,tags,permit_required,permit_notes,quality_score,save_count')
      .in('id', locIds)
    if (error) console.error('locations query error:', error)
    locations = data ?? []
  }

  const secIds: any[] = (share.secret_ids ?? []).filter((id: any) => id != null && id !== '')
  let secrets: any[] = []
  if (secIds.length > 0) {
    const { data, error } = await admin
      .from('secret_locations')
      .select('id,name,area,description,tags,bg,lat,lng')
      .in('id', secIds)
    if (error) console.error('secrets query error:', error)
    secrets = data ?? []
  }

  console.log(`pick-data/${slug}: locIds=${JSON.stringify(locIds)}, found=${locations.length} locations, ${secrets.length} secrets`)

  return NextResponse.json({ share, branding, locations, secrets })
}