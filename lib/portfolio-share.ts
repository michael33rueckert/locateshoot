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

