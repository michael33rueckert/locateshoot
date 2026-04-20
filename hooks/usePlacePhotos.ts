'use client'

import { useState, useEffect, useRef } from 'react'

declare global {
  interface Window {
    google: any
    _googleMapsLoaded?: boolean
    _googleMapsLoading?: boolean
    _googleMapsCallbacks?: (() => void)[]
  }
}

export interface PlacePhoto {
  url: string
  attribution: string
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise(resolve => {
    if (window._googleMapsLoaded) { resolve(); return }
    if (!window._googleMapsCallbacks) window._googleMapsCallbacks = []
    window._googleMapsCallbacks.push(resolve)
    if (window._googleMapsLoading) return
    window._googleMapsLoading = true
    const existing = document.querySelector('script[src*="maps.googleapis.com"]')
    if (existing) {
      existing.addEventListener('load', () => {
        window._googleMapsLoaded = true
        window._googleMapsCallbacks?.forEach(cb => cb())
        window._googleMapsCallbacks = []
      })
      return
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => {
      window._googleMapsLoaded  = true
      window._googleMapsLoading = false
      window._googleMapsCallbacks?.forEach(cb => cb())
      window._googleMapsCallbacks = []
    }
    document.head.appendChild(script)
  })
}

export function usePlacePhotos(
  locationName: string,
  cityName: string,
  lat: number,
  lng: number
) {
  const [photos,  setPhotos]  = useState<PlacePhoto[]>([])
  const [loading, setLoading] = useState(false)
  const mapDivRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!locationName) return
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY
    if (!apiKey) return

    setPhotos([])
    setLoading(true)

    loadGoogleMaps(apiKey).then(() => {
      if (!window.google) return
      if (!mapDivRef.current) mapDivRef.current = document.createElement('div')

      const service = new window.google.maps.places.PlacesService(mapDivRef.current)

      // Step 1 — text search to find the place_id
      service.textSearch(
        {
          query:    `${locationName} ${cityName}`,
          location: new window.google.maps.LatLng(lat, lng),
          radius:   5000,
        },
        (results: any[], status: string) => {
          if (status !== 'OK' || !results?.[0]) {
            setLoading(false)
            return
          }

          const placeId = results[0].place_id

          // Step 2 — getDetails to get the full photo array (up to 10)
          service.getDetails(
            {
              placeId,
              fields: ['photos', 'name'],
            },
            (place: any, detailStatus: string) => {
              setLoading(false)

              if (detailStatus !== 'OK' || !place?.photos?.length) {
                // Fallback: try photos from the textSearch result directly
                const fallbackPhotos = results[0].photos
                if (fallbackPhotos?.length) {
                  setPhotos(
                    fallbackPhotos.slice(0, 10).map((photo: any) => ({
                      url:         photo.getUrl({ maxWidth: 1200, maxHeight: 900 }),
                      attribution: photo.html_attributions?.[0] ?? '',
                    }))
                  )
                }
                return
              }

              // Use all available photos (Google returns up to 10)
              setPhotos(
                place.photos.slice(0, 10).map((photo: any) => ({
                  url:         photo.getUrl({ maxWidth: 1200, maxHeight: 900 }),
                  attribution: photo.html_attributions?.[0] ?? '',
                }))
              )
            }
          )
        }
      )
    })
  }, [locationName, cityName, lat, lng])

  return { photos, loading }
}