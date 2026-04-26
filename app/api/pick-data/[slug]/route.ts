import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request, context: any) {
  const { slug } = await context.params

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Try with highlighted_location_ids (migration 20260425_share_link_highlights);
  // fall back to the pre-migration shape so pick pages still load when that
  // column doesn't exist yet. Both shapes are passed through to the client
  // as-is, so widen to `any` instead of fighting the inferred union type.
  const baseShareCols = 'id,user_id,session_name,message,photographer_name,my_photos_only,expires_at,portfolio_location_ids,location_ids,secret_ids,is_permanent,is_full_portfolio,max_picks,max_pick_distance_miles,expire_on_submit'
  const initial = await admin
    .from('share_links')
    .select(`${baseShareCols},highlighted_location_ids`)
    .eq('slug', slug)
    .single()
  let share: any = initial.data
  let shareErr = initial.error
  if (shareErr && /highlighted_location_ids/.test(shareErr.message ?? '')) {
    const fb = await admin.from('share_links').select(baseShareCols).eq('slug', slug).single()
    share = fb.data; shareErr = fb.error
  }

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
  // Single-use guides burn out after the first client submission.
  if (share.expire_on_submit) {
    const { count } = await admin
      .from('client_picks')
      .select('id', { count: 'exact', head: true })
      .eq('share_link_id', share.id)
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: 'expired' }, { status: 410 })
    }
  }

  // Pull plan + branding in a single query — plan is what gates whether
  // permit info is included in the response below (Pro feature), branding
  // drives white-label rendering on the share page itself.
  let branding = null
  let photographerPlan: string | null = null
  if (share.user_id) {
    const { data: prof } = await admin
      .from('profiles')
      .select('plan,preferences')
      .eq('id', share.user_id)
      .single()
    branding = prof?.preferences ?? null
    photographerPlan = (prof as any)?.plan ?? null
  }
  // Permit info ("Permit verified", fee, notes, website) is a Starter+
  // feature — photographers on Free can't surface it to clients on
  // share pages. For Free shares we strip those fields from every
  // location in the response so the client UI hides the permit row
  // entirely (no "Ask your photographer" placeholder shown either).
  const isProPhotographer = photographerPlan === 'starter' || photographerPlan === 'pro' || photographerPlan === 'Pro'

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
    // New path — share references portfolio copies. Try the full select first
    // (incl. pinterest_url + blog_url). When the migration hasn't been
    // applied yet, those two columns don't exist and the whole query fails
    // — fall back to the pre-link column set so picks still render. Once
    // the migration is in, the first attempt succeeds and the fallback
    // never runs.
    const baseCols = 'id,source_location_id,name,description,city,state,latitude,longitude,access_type,tags,permit_required,permit_notes,best_time,parking_info,is_secret,hide_google_photos'
    let portfolioRows: any[] | null = null
    {
      const { data, error } = await admin
        .from('portfolio_locations')
        .select(`${baseCols},pinterest_url,blog_url`)
        .in('id', portfolioIds)
      if (error) {
        console.warn('portfolio query w/ link cols failed (likely pre-migration):', error.message)
        const fb = await admin
          .from('portfolio_locations')
          .select(baseCols)
          .in('id', portfolioIds)
        if (fb.error) console.error('portfolio query error:', fb.error)
        portfolioRows = fb.data ?? []
      } else {
        portfolioRows = data ?? []
      }
    }

    const sourceIds = (portfolioRows ?? [])
      .map(p => p.source_location_id)
      .filter((x): x is string => !!x)

    // Photos attached directly to the portfolio copy — honor photographer's
    // custom ordering (sort_order), fall back to created_at.
    const { data: portfolioPhotos } = await admin
      .from('location_photos')
      .select('portfolio_location_id,url,created_at,sort_order')
      .in('portfolio_location_id', portfolioIds)
      .eq('is_private', false)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    // Fallback: photos + real rating/permit data on the source public location
    // (portfolio copies only store a subset of the fields, so we merge anything
    // the portfolio row doesn't have its own value for).
    let sourcePhotos: any[] = []
    let sourceLookup: Record<string, any> = {}
    if (sourceIds.length > 0) {
      const { data } = await admin
        .from('location_photos')
        .select('location_id,url,created_at')
        .in('location_id', sourceIds)
        .eq('is_private', false)
        .order('created_at', { ascending: true })
      sourcePhotos = data ?? []
      const { data: sourceRows } = await admin
        .from('locations')
        .select('id,access_type,rating,quality_score,save_count,permit_required,permit_notes,permit_fee,permit_website,permit_certainty')
        .in('id', sourceIds)
      ;(sourceRows ?? []).forEach((s: any) => { sourceLookup[s.id] = s })
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
      const src  = p.source_location_id ? sourceLookup[p.source_location_id] : null
      // Prefer the portfolio row's value when the photographer set it; fall back
      // to the public source location's value otherwise.
      const preferOwn = <K extends keyof typeof p>(k: K) => (p[k] != null ? p[k] : src?.[k] ?? null)
      return {
        id:               p.id,
        name:             p.name,
        description:      p.description,
        city:             p.city,
        state:            p.state,
        latitude:         p.latitude,
        longitude:        p.longitude,
        access_type:      preferOwn('access_type'),
        tags:             p.tags,
        // Permit fields are gated to Pro photographers. Free shares get
        // null across the board so the client UI hides the permit row.
        permit_required:  isProPhotographer ? preferOwn('permit_required')      : null,
        permit_notes:     isProPhotographer ? preferOwn('permit_notes')         : null,
        permit_fee:       isProPhotographer ? (src?.permit_fee       ?? null)   : null,
        permit_website:   isProPhotographer ? (src?.permit_website   ?? null)   : null,
        permit_certainty: isProPhotographer ? (src?.permit_certainty ?? 'unknown') : null,
        pinterest_url:    p.pinterest_url       ?? null,
        blog_url:         p.blog_url            ?? null,
        rating:             src?.rating           ?? null,
        quality_score:      src?.quality_score    ?? null,
        save_count:         src?.save_count       ?? 0,
        photo_url:          urls[0] ?? null,
        photo_urls:         urls,
        hide_google_photos: !!p.hide_google_photos,
      }
    })
  } else {
    // Legacy path — old share links still reference public locations + secrets directly
    const locIds: any[] = (share.location_ids ?? []).filter((id: any) => id != null)
    if (locIds.length > 0) {
      const { data, error } = await admin
        .from('locations')
        .select('id,name,city,state,latitude,longitude,access_type,description,tags,permit_required,permit_notes,permit_fee,permit_website,permit_certainty,rating,quality_score,save_count')
        .in('id', locIds)
      if (error) console.error('locations query error:', error)
      locations = (data ?? []).map((l: any) => isProPhotographer ? l : ({
        ...l,
        permit_required: null,
        permit_notes:    null,
        permit_fee:      null,
        permit_website:  null,
        permit_certainty: null,
      }))

      const { data: photoData } = await admin
        .from('location_photos')
        .select('location_id,url,created_at,sort_order')
        .in('location_id', locIds)
        .eq('is_private', false)
        .order('sort_order', { ascending: true })
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
