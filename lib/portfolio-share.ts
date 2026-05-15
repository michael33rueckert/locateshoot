import { supabase } from '@/lib/supabase'
import { buildShareUrl } from '@/lib/custom-domain'

// Shared helper for the "Share all as Location Guide" flow off a photographer's
// portfolio. Used from the Dashboard and the dedicated /portfolio page so the
// reuse-or-create behavior stays consistent in both places.

interface ProfileInfo {
  id:                        string
  full_name:                 string | null
  custom_domain:             string | null
  custom_domain_verified:    boolean | null
}

function cleanSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 25)
}

function urlFor(slug: string, profile: ProfileInfo): string {
  return buildShareUrl(slug, {
    customDomain:         profile.custom_domain,
    customDomainVerified: !!profile.custom_domain_verified,
  })
}

/**
 * Reuse the photographer's existing single-pick full-portfolio link if there is
 * one; otherwise create it. Copies the URL to the clipboard on success.
 */
export async function shareFullPortfolio(profile: ProfileInfo): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  // Look for an existing max_picks <= 1 full-portfolio link.
  const { data: existing } = await supabase
    .from('share_links')
    .select('slug,max_picks,is_full_portfolio')
    .eq('user_id', profile.id)
    .eq('is_full_portfolio', true)
    .order('created_at', { ascending: false })
  const match = (existing ?? []).find((l: any) => (l.max_picks ?? 1) <= 1)
  if (match) {
    const url = urlFor(match.slug, profile)
    try { await navigator.clipboard?.writeText(url) } catch { /* clipboard may be blocked */ }
    return { ok: true, url }
  }

  const slug = `${cleanSlug(profile.full_name || 'photographer')}-portfolio-${Date.now().toString(36)}`
  const { data: inserted, error } = await supabase.from('share_links').insert({
    user_id:                profile.id,
    slug,
    session_name:           'My portfolio',
    message:                null,
    photographer_name:      profile.full_name ?? null,
    portfolio_location_ids: null,
    location_ids:           [],
    secret_ids:             [],
    expires_at:             null,
    is_permanent:           true,
    is_full_portfolio:      true,
    max_picks:              1,
  }).select('slug').single()
  if (error || !inserted) return { ok: false, error: error?.message ?? 'Could not create portfolio link' }

  const url = urlFor(inserted.slug, profile)
  try { await navigator.clipboard?.writeText(url) } catch { /* noop */ }
  return { ok: true, url }
}

/**
 * Reuse-or-create a single-location quick-share link. Quick-shares are
 * the "Copy link" button on each portfolio card — they wrap one location
 * in a share_link so a client can open it like any other guide, but
 * quick_share=true keeps them out of the photographer's curated guides
 * list. Stepwise fallback handles the period before
 * 20260505_quick_share_links has run on a given Supabase instance.
 */
export async function shareSingleLocation(
  profile: ProfileInfo,
  location: { id: string; name: string },
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  // Try to find an existing quick-share for this exact location. On
  // schemas that haven't applied the migration yet, the quick_share
  // filter raises a column-missing error — fall back to matching by
  // portfolio_location_ids alone.
  let existingSlug: string | null = null
  {
    const r = await supabase
      .from('share_links')
      .select('slug,portfolio_location_ids')
      .eq('user_id', profile.id)
      .eq('quick_share', true)
      .order('created_at', { ascending: false })
    if (!r.error) {
      const match = (r.data ?? []).find((l: any) =>
        Array.isArray(l.portfolio_location_ids)
          && l.portfolio_location_ids.length === 1
          && l.portfolio_location_ids[0] === location.id,
      )
      if (match) existingSlug = match.slug
    }
  }

  if (existingSlug) {
    const url = urlFor(existingSlug, profile)
    try { await navigator.clipboard?.writeText(url) } catch { /* clipboard may be blocked */ }
    return { ok: true, url }
  }

  const slug = `${cleanSlug(profile.full_name || 'photographer')}-${cleanSlug(location.name)}-${Date.now().toString(36)}`
  const basePayload: Record<string, any> = {
    user_id:                profile.id,
    slug,
    session_name:           location.name,
    message:                null,
    photographer_name:      profile.full_name ?? null,
    portfolio_location_ids: [location.id],
    location_ids:           [],
    secret_ids:             [],
    expires_at:             null,
    is_permanent:           true,
    is_full_portfolio:      false,
    max_picks:              1,
  }
  // Try with quick_share first; fall back without it for pre-migration
  // schemas (the row will then appear in the guides list until the
  // migration runs, but the share still works).
  let { data: inserted, error } = await supabase
    .from('share_links')
    .insert({ ...basePayload, quick_share: true })
    .select('slug')
    .single()
  if (error && /quick_share/.test(error.message ?? '')) {
    const fb = await supabase.from('share_links').insert(basePayload).select('slug').single()
    inserted = fb.data; error = fb.error
  }
  if (error || !inserted) {
    // Surface the trigger error for Free users with a clearer message
    // — the dashboard / portfolio UIs gate the button on hasStarter(),
    // so this should only fire on direct API misuse or a stale profile
    // plan cache.
    if (typeof error?.message === 'string' && error.message.includes('free_plan_link_limit')) {
      return { ok: false, error: 'Upgrade to Starter or Pro to share single locations.' }
    }
    return { ok: false, error: error?.message ?? 'Could not create share link' }
  }

  const url = urlFor(inserted.slug, profile)
  try { await navigator.clipboard?.writeText(url) } catch { /* noop */ }
  return { ok: true, url }
}

