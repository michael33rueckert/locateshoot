import { NextResponse } from 'next/server'

// Diagnostic. Safely reports whether RESEND_API_KEY is visible to this
// serverless function at runtime — exposes only presence + length, never
// the key itself. Can be removed once email is confirmed working.

export async function GET() {
  const key = process.env.RESEND_API_KEY ?? ''
  return NextResponse.json({
    hasKey: key.length > 0,
    keyLength: key.length,
    keyPrefix: key ? key.slice(0, 3) : null, // "re_" if it's a Resend key
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    nodeEnv: process.env.NODE_ENV ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  })
}
