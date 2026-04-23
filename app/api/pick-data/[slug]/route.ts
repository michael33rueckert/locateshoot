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
    .select('id,user_id,session_name,message,photographer_name,my_photos_only,expires_at,portfolio_location_ids,location_ids,secret_ids,is_permanent,is_full_portfolio')
    .eq('slug', slug)
    .single()

  if (shareErr || !share) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // If the request comes in on a custom domain, require that the share link
  // belongs to the photographer who owns that domain. Keeps one photographer's
  // custom domain from serving another photographer's links.
  const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0]
  const apex = (process.env.NEXT_PUBLIC_APEX_DOMAIN ?? 'locateshoot.com').toLowerCase()
  const isPrimary = !host || host === apex || host === `www.${apex}` || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')
  if (!isPrimary) {
    const { data: owner } = await admin.from('profiles').select('id').ilike('custom_domain', host).maybeSingle()
    if (!owner || owner.id !== share.user_id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
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

  // When is_full_portfolio is true, the link auto-syncs with the photographer's
  // current portfolio rather than a static stored list — so resolve it live.
  let portfolioIds: any[] = (share.portfolio_location_ids ?? []).filter((id: any) => id != null)
  if (share.is_full_portfolio && share.user_id) {
    const { data: livePortfolio } = await admin
      .from('portfolio_locations')
      .select('id')
      .eq('user_id', share.user_id)
      .order('created_at', { ascending: false })
    portfolioIds = (livePortfolio ?? []).map((r: any) => r.id)
  }

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

    const ownMap: Record<string, string[]> = {}
    ;(portfolioPhotos ?? []).forEach((p: any) => {
      (ownMap[p.portfolio_location_id] ??= []).push(p.url)
    })
    const sourceMap: Record<string, string[]> = {}
    ;(sourcePhotos ?? []).forEach((p: any) => {
      (sourceMap[p.location_id] ??= []).push(p.url)
    })

    locations = (portfolioRows ?? []).map((p: any) => {
      const urls = ownMap[p.id] ?? (p.source_location_id ? sourceMap[p.source_location_id] : null) ?? []
      return {
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
        photo_url:        urls[0] ?? null,
        photo_urls:       urls,
      }
    })
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
      const photoMap: Record<string, string[]> = {}
      ;(photoData ?? []).forEach((p: any) => {
        (photoMap[p.location_id] ??= []).push(p.url)
      })
      locations = locations.map((l: any) => {
        const urls = photoMap[l.id] ?? []
        return { ...l, photo_url: urls[0] ?? null, photo_urls: urls }
      })
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
