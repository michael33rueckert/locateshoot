import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request, context: any) {
  const { slug } = await context.params

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: share, error: shareErr } = await admin
    .from('share_links')
    .select('id,user_id,session_name,message,photographer_name,my_photos_only,expires_at,portfolio_location_ids,location_ids,secret_ids,is_permanent')
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

  let locations: any[] = []
  let secrets: any[] = []

  const portfolioIds: any[] = (share.portfolio_location_ids ?? []).filter((id: any) => id != null)

  if (portfolioIds.length > 0) {
    // New path — share references portfolio copies
    const { data: portfolioRows, error: portfolioErr } = await admin
      .from('portfolio_locations')
      .select('id,source_location_id,name,description,city,state,latitude,longitude,access_type,tags,permit_required,permit_notes,best_time,parking_info,is_secret')
      .in('id', portfolioIds)
    if (portfolioErr) console.error('portfolio query error:', portfolioErr)

    const sourceIds = (portfolioRows ?? [])
      .map(p => p.source_location_id)
      .filter((x): x is string => !!x)

    // Photos attached directly to the portfolio copy
    const { data: portfolioPhotos } = await admin
      .from('location_photos')
      .select('portfolio_location_id,url,created_at')
      .in('portfolio_location_id', portfolioIds)
      .eq('is_private', false)
      .order('created_at', { ascending: true })

    // Fallback: photos on the source public location (for portfolio rows without their own photos yet)
    let sourcePhotos: any[] = []
    if (sourceIds.length > 0) {
      const { data } = await admin
        .from('location_photos')
        .select('location_id,url,created_at')
        .in('location_id', sourceIds)
        .eq('is_private', false)
        .order('created_at', { ascending: true })
      sourcePhotos = data ?? []
    }

    const ownMap: Record<string, string> = {}
    ;(portfolioPhotos ?? []).forEach((p: any) => {
      if (!ownMap[p.portfolio_location_id]) ownMap[p.portfolio_location_id] = p.url
    })
    const sourceMap: Record<string, string> = {}
    ;(sourcePhotos ?? []).forEach((p: any) => {
      if (!sourceMap[p.location_id]) sourceMap[p.location_id] = p.url
    })

    locations = (portfolioRows ?? []).map((p: any) => ({
      id:               p.id,
      name:             p.name,
      description:      p.description,
      city:             p.city,
      state:            p.state,
      latitude:         p.latitude,
      longitude:        p.longitude,
      access_type:      p.access_type,
      tags:             p.tags,
      permit_required:  p.permit_required,
      permit_notes:     p.permit_notes,
      quality_score:    null,
      save_count:       0,
      photo_url:        ownMap[p.id] ?? (p.source_location_id ? sourceMap[p.source_location_id] : null) ?? null,
    }))
  } else {
    // Legacy path — old share links still reference public locations + secrets directly
    const locIds: any[] = (share.location_ids ?? []).filter((id: any) => id != null)
    if (locIds.length > 0) {
      const { data, error } = await admin
        .from('locations')
        .select('id,name,city,state,latitude,longitude,access_type,description,tags,permit_required,permit_notes,quality_score,save_count')
        .in('id', locIds)
      if (error) console.error('locations query error:', error)
      locations = data ?? []

      const { data: photoData } = await admin
        .from('location_photos')
        .select('location_id,url,created_at')
        .in('location_id', locIds)
        .eq('is_private', false)
        .order('created_at', { ascending: true })
      const photoMap: Record<string, string> = {}
      ;(photoData ?? []).forEach((p: any) => {
        if (!photoMap[p.location_id]) photoMap[p.location_id] = p.url
      })
      locations = locations.map((l: any) => ({ ...l, photo_url: photoMap[l.id] ?? null }))
    }

    const secIds: any[] = (share.secret_ids ?? []).filter((id: any) => id != null && id !== '')
    if (secIds.length > 0) {
      const { data, error } = await admin
        .from('secret_locations')
        .select('id,name,area,description,tags,bg,lat,lng')
        .in('id', secIds)
      if (error) console.error('secrets query error:', error)
      secrets = data ?? []
    }
  }

  return NextResponse.json({ share, branding, locations, secrets })
}
