import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/admin'

// Reactivate a previously deactivated user: lifts the auth ban so they
// can sign in again. Does NOT re-open share_links that /deactivate took
// offline — those are individually editable by the photographer or the
// admin now that the account is live again.

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: { user: caller } } = await admin.auth.getUser(auth.slice(7))
  if (!caller || !isAdminEmail(caller.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: targetId } = await context.params
  const { error } = await admin.auth.admin.updateUserById(targetId, {
    ban_duration: 'none',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, banned: false })
}
