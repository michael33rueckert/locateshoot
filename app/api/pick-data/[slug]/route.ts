import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request, context: any) {
  const { slug } = await context.params

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Try with all the optional columns from later migrations
  // (highlighted_location_ids + pick_template_id). Each falls back
  // independently so a Supabase missing-column error on one doesn't
  // block the rest of the page from loading. Both shapes are passed
  // through to the client, so widen to `any` instead of fighting the
  // inferred union type.
  const baseShareCols = 'id,user_id,session_name,message,photographer_name,my_photos_only,expires_at,portfolio_location_ids,location_ids,secret_ids,is_permanent,is_full_portfolio,max_picks,max_pick_distance_miles,expire_on_submit'
  let share: any = null
  let shareErr: any = null
  // 1: try the full select (both optional columns)
  {
    const r = await admin.from('share_links').select(`${baseShareCols},highlighted_location_ids,pick_template_id`).eq('slug', slug).single()
    share = r.data; shareErr = r.error
  }
  // 2: try without pick_template_id (newer migration)
  if (shareErr && /pick_template_id/.test(shareErr.message ?? '')) {
    const r = await admin.from('share_links').select(`${baseShareCols},highlighted_location_ids`).eq('slug', slug).single()
    share = r.data; shareErr = r.error
  }
  // 3: try without either optional column
  if (shareErr && /highlighted_location_ids/.test(shareErr.message ?? '')) {
    const r = await admin.from('share_links').select(baseShareCols).eq('slug', slug).single()
    share = r.data; shareErr = r.error
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
    // host is lowercased above; stored profiles.custom_domain is
    // normalized to lowercase by validateCustomDomain on save, so eq
    // is sufficient — no need for case-insensitive ilike.
    const { data: owner } = await admin.from('profiles').select('id').eq('custom_domain', host).maybeSingle()
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

  // Pull plan + branding. Plan gates permit info below (Starter+);
  // branding drives white-label rendering. The Pick page template is
  // resolved separately (multi-template world) — see below.
  let branding: any = null
  let photographerPlan: string | null = null
  if (share.user_id) {
    const { data: prof } = await admin.from('profiles').select('plan,preferences,full_name').eq('id', share.user_id).single()
    branding         = prof?.preferences ?? null
    photographerPlan = prof?.plan ?? null
    // Override the snapshotted share_links.photographer_name with the
    // photographer's CURRENT name — otherwise updating the name in
    // Profile doesn't propagate to existing guides (the pick page
    // would keep showing the old name forever). The snapshot is kept
    // for stability if the profile is later deleted, but the live
    // value wins whenever it's available.
    if (prof?.full_name) (share as any).photographer_name = prof.full_name
  }

  // Pick page template resolution (Pro-only feature):
  //   1. share_links.pick_template_id explicit per-guide selection
  //   2. else: photographer's default pick_templates row
  //   3. else: legacy profiles.pick_template (single-template world)
  //   4. else: null → unbranded default render
  // Falls back gracefully on each step when the relevant migration
  // hasn't been applied to this Supabase instance yet.
  let pickTemplate: any = null
  const isProTemplate = photographerPlan === 'pro' || photographerPlan === 'Pro'
  if (isProTemplate && share.user_id) {
    // Step 1: explicit pick_template_id on the guide
    const explicitId = (share as any).pick_template_id as string | null | undefined
    if (explicitId) {
      const { data: row } = await admin.from('pick_templates').select('config').eq('id', explicitId).maybeSingle()
      if (row?.config) pickTemplate = row.config
    }
    // Step 2: photographer's default template
    if (!pickTemplate) {
      const { data: defRow } = await admin
        .from('pick_templates')
        .select('config')
        .eq('user_id', share.user_id)
        .eq('is_default', true)
        .maybeSingle()
      if (defRow?.config) pickTemplate = defRow.config
    }
    // Step 3: legacy single-template column
    if (!pickTemplate) {
      const { data: legacy } = await admin.from('profiles').select('pick_template').eq('id', share.user_id).maybeSingle()
      if ((legacy as any)?.pick_template) pickTemplate = (legacy as any).pick_template
    }
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
      // Try the newest column set first (includes show_seasons from
      // 20260428_seasonal_photos). Each fallback drops one migration
      // worth of columns so the page still renders on older schemas.
      const { data, error } = await admin
        .from('portfolio_locations')
        .select(`${baseCols},pinterest_url,blog_url,permit_fee,permit_website,session_links,show_seasons`)
        .in('id', portfolioIds)
      if (error) {
        const noSeasons = await admin
          .from('portfolio_locations')
          .select(`${baseCols},pinterest_url,blog_url,permit_fee,permit_website,session_links`)
          .in('id', portfolioIds)
        if (noSeasons.error) {
          // Stepwise fallback: drop session_links next, then drop the
          // older link/permit cols if those are also missing.
          const noSession = await admin
            .from('portfolio_locations')
            .select(`${baseCols},pinterest_url,blog_url,permit_fee,permit_website`)
            .in('id', portfolioIds)
          if (noSession.error) {
            console.warn('portfolio query w/ link cols failed (likely pre-migration):', noSession.error.message)
            const fb = await admin
              .from('portfolio_locations')
              .select(baseCols)
              .in('id', portfolioIds)
            if (fb.error) console.error('portfolio query error:', fb.error)
            portfolioRows = fb.data ?? []
          } else {
            portfolioRows = noSession.data ?? []
          }
        } else {
          portfolioRows = noSeasons.data ?? []
        }
      } else {
        portfolioRows = data ?? []
      }
    }

    const sourceIds = (portfolioRows ?? [])
      .map(p => p.source_location_id)
      .filter((x): x is string => !!x)

    // Photos attached directly to the portfolio copy — honor photographer's
    // custom ordering (sort_order), fall back to created_at. Pull
    // season too (migration 20260428_seasonal_photos) so the Pick
    // page can render per-season tabs; falls back without it on
    // older schemas.
    let portfolioPhotos: any[] = []
    {
      const r1 = await admin
        .from('location_photos')
        .select('portfolio_location_id,url,created_at,sort_order,season')
        .in('portfolio_location_id', portfolioIds)
        .eq('is_private', false)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (r1.error) {
        const r2 = await admin
          .from('location_photos')
          .select('portfolio_location_id,url,created_at,sort_order')
          .in('portfolio_location_id', portfolioIds)
          .eq('is_private', false)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true })
        portfolioPhotos = r2.data ?? []
      } else {
        portfolioPhotos = r1.data ?? []
      }
    }

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
    // Per-photo season tags, parallel to ownMap by index. Only set
    // when the row carried a `season` column from the query above
    // (older schemas without the column produce undefined here, which
    // we coerce to null below so the client always sees an array of
    // the same length as photo_urls).
    const ownSeasons: Record<string, (string | null)[]> = {}
    ;(portfolioPhotos ?? []).forEach((p: any) => {
      (ownMap[p.portfolio_location_id] ??= []).push(p.url)
      ;(ownSeasons[p.portfolio_location_id] ??= []).push(p.season ?? null)
    })
    const sourceMap: Record<string, string[]> = {}
    ;(sourcePhotos ?? []).forEach((p: any) => {
      (sourceMap[p.location_id] ??= []).push(p.url)
    })

    // Restore the photographer's manual order. Postgres' `WHERE id IN
    // (...)` returns rows in unspecified order (effectively primary-
    // key order), losing whatever sequence the photographer set on
    // share_links.portfolio_location_ids via the reorder UI. Map rows
    // by id and iterate `portfolioIds` in order to rebuild the
    // intended sequence. Drop ids that didn't return a row (deleted
    // since the share link was saved).
    const rowById = new Map<string, any>()
    ;(portfolioRows ?? []).forEach((r: any) => rowById.set(String(r.id), r))
    const orderedRows = portfolioIds
      .map(id => rowById.get(String(id)))
      .filter((r): r is any => !!r)

    locations = orderedRows.map((p: any) => {
      const ownUrls    = ownMap[p.id]
      const urls       = ownUrls ?? (p.source_location_id ? sourceMap[p.source_location_id] : null) ?? []
      // Per-photo season tags only apply when the photos came from
      // the photographer's portfolio copy (ownMap). Source-location
      // photos are public and have no season tag — null-fill so the
      // array length matches photo_urls regardless.
      const photoSeasons: (string | null)[] = ownUrls
        ? (ownSeasons[p.id] ?? new Array(ownUrls.length).fill(null))
        : new Array(urls.length).fill(null)
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
        // permit_fee + permit_website are now photographer-editable on
        // the portfolio copy (migration 20260427_portfolio_permit_fields).
        // preferOwn returns the photographer's value when set, falls back
        // to the curated source location's value otherwise.
        permit_fee:       isProPhotographer ? preferOwn('permit_fee')           : null,
        permit_website:   isProPhotographer ? preferOwn('permit_website')       : null,
        permit_certainty: isProPhotographer ? (src?.permit_certainty ?? 'unknown') : null,
        // Pinterest + blog links are a Starter+ feature (same gate as
        // permit info). Free guides return null so the client UI hides
        // the row instead of leaking a paid feature for free.
        pinterest_url:    isProPhotographer ? (p.pinterest_url ?? null) : null,
        blog_url:         isProPhotographer ? (p.blog_url      ?? null) : null,
        // Multiple labeled session links (e.g. "Family session" → URL).
        // Same Starter+ gate as the other supplemental links — Free
        // guides drop them on the floor so we don't leak a paid feature.
        session_links:    isProPhotographer ? (Array.isArray(p.session_links) ? p.session_links : []) : [],
        rating:             src?.rating           ?? null,
        quality_score:      src?.quality_score    ?? null,
        save_count:         src?.save_count       ?? 0,
        photo_url:          urls[0] ?? null,
        photo_urls:         urls,
        // Per-photo season tags, aligned by index with photo_urls.
        // Pick page filters this to render per-season tabs. Always
        // an array of the same length as photo_urls.
        photo_seasons:      photoSeasons,
        // Per-location opt-in toggle from migration 20260428_seasonal_photos.
        // When true the Pick page renders Spring/Summer/Fall/Winter
        // tabs above the gallery; false keeps the existing flat grid.
        show_seasons:       !!p.show_seasons,
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
      // Restore manual order — see the portfolio path above for the
      // same pattern. .in() drops the input order, so map by id and
      // walk locIds to rebuild the intended sequence.
      const locById = new Map<string, any>()
      ;(data ?? []).forEach((r: any) => locById.set(String(r.id), r))
      const orderedLocs = locIds
        .map(id => locById.get(String(id)))
        .filter((r): r is any => !!r)
      locations = orderedLocs.map((l: any) => isProPhotographer ? l : ({
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

  return NextResponse.json({ share, branding, locations, secrets, pickTemplate })
}
