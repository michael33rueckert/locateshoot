'use client'

import { useEffect, useState } from 'react'

export interface PlacePhoto {
  url: string
}

// Variant of usePlacePhotos that hits our own /api/place-photos proxy instead
// of loading the Google Maps JS SDK in the browser. Chosen for the /pick/[slug]
// page because the server key isn't referrer-restricted, so it works on every
// photographer's custom domain without per-host whitelisting.
export function useServerPlacePhotos(
  locationName: string,
  cityLabel: string,
  lat: number,
  lng: number,
) {
  const [photos,  setPhotos]  = useState<PlacePhoto[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!locationName) { setPhotos([]); return }
    let cancelled = false

    // cityLabel comes in as "City, ST" for favorites — split so the server can
    // bias the search to the right place.
    const commaIdx = cityLabel.indexOf(',')
    const city  = commaIdx >= 0 ? cityLabel.slice(0, commaIdx).trim() : cityLabel.trim()
    const state = commaIdx >= 0 ? cityLabel.slice(commaIdx + 1).trim() : ''

    setLoading(true)
    fetch('/api/place-photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: locationName, city, state, lat, lng }),
    })
      .then(r => r.ok ? r.json() : { photos: [] })
      .then((j: { photos?: PlacePhoto[] }) => {
        if (cancelled) return
        setPhotos(j.photos ?? [])
      })
      .catch(() => { if (!cancelled) setPhotos([]) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [locationName, cityLabel, lat, lng])

  return { photos, loading }
}
