import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/admin'
import { SCAN_CATEGORIES, scanCityCategory, sanitizeLocation } from '@/lib/scan-locations'

// Phase 1 of the two-endpoint scanner (Vercel Hobby forces the split; 60s
// serverless-function cap doesn't fit Claude + geocode + DB in one call).
// This endpoint does exactly one Claude call with web search and returns
// the raw candidates. The client posts those candidates to /commit next,
// which does the fast DB work under a second HTTP budget.

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const { data: { user } } = await supabase.auth.getUser(auth.slice(7))
    if (!user || !isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const city:     string = typeof body.city === 'string' ? body.city.trim() : ''
    const category: string = typeof body.category === 'string' ? body.category : ''
    if (!city)     return NextResponse.json({ error: 'city_required' }, { status: 400 })
    if (!category) return NextResponse.json({ error: 'category_required' }, { status: 400 })

    const categoryDef = SCAN_CATEGORIES.find(c => c.name === category)
    if (!categoryDef) return NextResponse.json({ error: 'unknown_category', message: `No category named "${category}"` }, { status: 400 })

    let candidates
    try {
      const raw = await scanCityCategory(city, categoryDef.prompt(city))
      // Sanitize server-side so /commit can trust the shape of what it
      // receives back from the client. The commit endpoint is admin-gated
      // but this keeps a well-formed contract either way.
      candidates = raw.map(sanitizeLocation)
    } catch (err: any) {
      const msg = err?.message ?? 'scan_failed'
      const status = /429/.test(msg) ? 429 : 500
      return NextResponse.json({ error: 'scan_failed', message: msg }, { status })
    }

    return NextResponse.json({ ok: true, city, category, candidates })
  } catch (err: any) {
    console.error('scan-locations/query error:', err)
    return NextResponse.json({ error: 'internal', message: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
