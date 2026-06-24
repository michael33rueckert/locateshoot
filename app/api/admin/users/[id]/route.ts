import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/admin'

// Read-only fetch of a single user's profile, scoped to admin. Used by
// the /admin/users/[id] management page so it knows the target user's
// name + plan (the latter gates which UI features the existing
// CreateLocationGuideModal etc. render). Returns 404 if no row exists
// for the id; the admin UI handles that as "user not found."
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: { user } } = await admin.auth.getUser(auth.slice(7))
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await context.params
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id,email,full_name,plan,custom_domain,custom_domain_verified,preferences,created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!profile) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({ user: profile })
}
