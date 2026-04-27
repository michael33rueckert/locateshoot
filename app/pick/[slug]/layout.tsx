import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { optimizedImage } from '@/lib/image'

// Server-rendered metadata for /pick/[slug]. The page itself is a client
// component, but Next.js lets a sibling layout supply OG/Twitter tags that
// iMessage, WhatsApp, email clients, and social scrapers consume. Uses the
// guide's cover_photo_url when set so link previews show a meaningful image
// instead of a generic favicon.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { title: 'Location picker' }

  const admin = createClient(url, key)
  const { data } = await admin
    .from('share_links')
    .select('session_name,message,photographer_name,cover_photo_url,user_id')
    .eq('slug', slug)
    .maybeSingle()

  if (!data) return { title: 'Location picker' }

  // Prefer the photographer's CURRENT name over the snapshot stored on
  // share_links — keeps OG/Twitter previews fresh when the photographer
  // updates their profile. Falls back to the snapshot if the live read
  // fails for any reason.
  let liveName: string | null = null
  if (data.user_id) {
    const { data: prof } = await admin.from('profiles').select('full_name').eq('id', data.user_id).maybeSingle()
    liveName = prof?.full_name ?? null
  }

  const title       = data.session_name || 'Location picker'
  const photog      = liveName || data.photographer_name || 'Your photographer'
  const description = data.message?.trim()
    || `${photog} picked a few spots for your session. Tap to choose your favorite.`

  // OG images want ~1200x630. Supabase Storage's on-the-fly resize gives us
  // a right-sized JPEG without needing to pre-render anything.
  const ogImage = data.cover_photo_url
    ? (optimizedImage(data.cover_photo_url, { width: 1200, height: 630 }) ?? data.cover_photo_url)
    : null

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type:   'website',
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630, alt: title }] : undefined,
    },
    twitter: {
      card:   ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  }
}

export default function PickLayout({ children }: { children: React.ReactNode }) {
  return children
}
