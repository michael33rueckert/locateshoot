import { redirect } from 'next/navigation'

// The old /share wizard has been retired. Its features (pick locations, name
// the link, optional message, optional expiration) are now handled inside the
// unified "Location Guide" modal on /location-guides. The original source is
// preserved at app/_archive/share-page.tsx.bak if we ever need to reference it.

export default function SharePage() {
  redirect('/location-guides')
}
