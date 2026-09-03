// Category → { icon, background color } lookup used by the Explore
// map at close zoom to render Google-Maps-style rich pin icons
// instead of plain colored dots. Kept out of ExploreMap.tsx so the
// admin's dropdown / any downstream UI can share the same source
// of truth for category visuals.
//
// Emojis (not SVG) because they render on all platforms without
// bundling any icon set, and because a pin at 32 px is too small
// to gain from vector fidelity anyway. Colors are muted to match
// the earth-tone brand palette so the map doesn't turn into a
// carnival at close zoom.

export interface CategoryVisual {
  emoji: string
  color: string   // background circle color
}

const CATEGORY_VISUAL: Record<string, CategoryVisual> = {
  'Parks & Nature':                 { emoji: '🌳', color: '#4a6741' },
  'Urban & Architecture':           { emoji: '🏛', color: '#5c7796' },
  'Historic & Cultural':            { emoji: '🏛', color: '#8b6d3d' },
  'Waterfront & Water Features':    { emoji: '🌊', color: '#5c8ba8' },
  'Fields, Meadows & Open Spaces':  { emoji: '🌾', color: '#a8955c' },
  'Private Venues & Hidden Gems':   { emoji: '✨', color: '#7d5c8b' },
  'Golden Hour & Sunrise Spots':    { emoji: '🌅', color: '#c4922a' },
  'Neighborhoods & Street Life':    { emoji: '🏙', color: '#5c5c8b' },
}

const DEFAULT_VISUAL: CategoryVisual = { emoji: '📍', color: '#4a6741' }

// Private-access spots override the category color so at-a-glance
// the access restriction is obvious (matches the rust color the
// DetailPanel already uses for the "🔒 Private" badge).
const PRIVATE_ACCESS_COLOR = '#b54b2a'

export function getCategoryVisual(category: string | null | undefined, access: string | null | undefined): CategoryVisual {
  const base = (category && CATEGORY_VISUAL[category]) || DEFAULT_VISUAL
  if (access === 'private') return { ...base, color: PRIVATE_ACCESS_COLOR }
  return base
}
