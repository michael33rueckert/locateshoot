import { createBrowserClient } from '@supabase/auth-helpers-nextjs'

// Browser-side Supabase client
// Import this in any client component that needs to talk to Supabase
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Singleton for use in client components
// Usage: import { supabase } from '@/lib/supabase'
export const supabase = createClient()