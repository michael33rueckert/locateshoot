// Customizable Pick page template — Pro-tier feature. The photographer
// edits this in Profile → Pick page template; the Pick page applies it
// when rendering /pick/[slug] for any of their share links.
//
// Stored in profiles.pick_template as JSONB. Every field is optional —
// the Pick page falls back to DEFAULTS for anything missing, so a
// half-configured template still renders correctly.

export type LayoutKind = 'card' | 'list'

export interface PickTemplate {
  layout?:     LayoutKind
  font?:       string             // Display name from FONT_OPTIONS below
  colors?: {
    background?: string           // page background
    text?:       string           // body text
    accent?:     string           // primary brand color (buttons, headers)
    accentText?: string           // text color on top of accent (button labels)
  }
  header?: {
    logoPlacement?: 'left' | 'center' | 'hidden'
    showStudioName?: boolean
    intro?: string                // override the welcome/intro line
  }
  background?: {
    type?:     'none' | 'image'
    imageUrl?: string             // public URL of the bg image
  }
}

// Curated Google Fonts list — chosen to look polished on a Pick page
// without overwhelming the photographer with thousands of options. Mix
// of serif/sans/display so most brand vibes are covered.
export const FONT_OPTIONS = [
  { name: 'Playfair Display', kind: 'serif',   weight: '400;700;900' },
  { name: 'Cormorant Garamond', kind: 'serif', weight: '400;700' },
  { name: 'Lora',             kind: 'serif',   weight: '400;700' },
  { name: 'Cardo',            kind: 'serif',   weight: '400;700' },
  { name: 'Crimson Text',     kind: 'serif',   weight: '400;700' },
  { name: 'Libre Baskerville', kind: 'serif',  weight: '400;700' },
  { name: 'Fraunces',         kind: 'serif',   weight: '400;700;900' },
  { name: 'Inter',            kind: 'sans',    weight: '400;500;700' },
  { name: 'DM Sans',          kind: 'sans',    weight: '400;500;700' },
  { name: 'Manrope',          kind: 'sans',    weight: '400;500;700' },
  { name: 'Work Sans',        kind: 'sans',    weight: '400;500;700' },
  { name: 'Karla',            kind: 'sans',    weight: '400;700' },
  { name: 'Nunito',           kind: 'sans',    weight: '400;600;800' },
] as const

export const DEFAULT_TEMPLATE: Required<{
  layout:     LayoutKind
  font:       string
  colors:     Required<NonNullable<PickTemplate['colors']>>
  header:     Required<NonNullable<PickTemplate['header']>>
  background: Required<NonNullable<PickTemplate['background']>>
}> = {
  layout: 'card',
  font:   'Playfair Display',
  colors: {
    background: '#f9f6f1', // cream
    text:       '#1a1612', // ink
    accent:     '#c4922a', // gold
    accentText: '#1a1612', // dark text on gold buttons
  },
  header: {
    logoPlacement: 'left',
    showStudioName: true,
    intro: '',
  },
  background: {
    type: 'none',
    imageUrl: '',
  },
}

// Merge a partial template with the defaults, returning a fully-resolved
// template ready to render. Each field-group is independently merged so
// a photographer with only colors set still gets default font/header/etc.
export function resolveTemplate(t: PickTemplate | null | undefined): typeof DEFAULT_TEMPLATE {
  return {
    layout: t?.layout ?? DEFAULT_TEMPLATE.layout,
    font:   t?.font   ?? DEFAULT_TEMPLATE.font,
    colors: { ...DEFAULT_TEMPLATE.colors, ...(t?.colors ?? {}) },
    header: { ...DEFAULT_TEMPLATE.header, ...(t?.header ?? {}) },
    background: { ...DEFAULT_TEMPLATE.background, ...(t?.background ?? {}) },
  }
}

// Build the Google Fonts CSS URL for a given font name. Used by the
// Pick page to inject a <link rel="stylesheet"> for the photographer's
// chosen font on render. Returns null for unknown fonts so we don't
// load a 404.
export function googleFontHref(fontName: string): string | null {
  const found = FONT_OPTIONS.find(f => f.name === fontName)
  if (!found) return null
  const family = fontName.replace(/ /g, '+')
  return `https://fonts.googleapis.com/css2?family=${family}:wght@${found.weight}&display=swap`
}

// Convenience: hex color validator. Used by the editor to accept user
// input only when it parses as a hex code (#rgb, #rrggbb, or #rrggbbaa).
export function isValidHex(s: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s.trim())
}

// A user-saved template (row from pick_templates). The Profile editor
// lists/edits these; the Location Guide modal picks one per guide.
export interface SavedTemplate {
  id:         string
  user_id:    string
  name:       string
  config:     PickTemplate
  is_default: boolean
  created_at: string
  updated_at: string
}
