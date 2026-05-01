import { readFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import matter from 'gray-matter'

// Help-center article loader. Reads markdown files out of
// /content/help/*.md, parses frontmatter, returns sorted article
// metadata + body. Server-only — the filesystem reads happen at
// build time when the help pages are statically generated.
//
// Article frontmatter shape:
//   ---
//   title:    Setting up your portfolio
//   category: Getting started
//   summary:  How to add your first locations and what fields matter most.
//   order:    2          # within the category, lower = earlier
//   updated:  2026-04-30 # ISO date, shown at the top of the article
//   ---
//   markdown body...

export const HELP_CATEGORY_ORDER = [
  'Getting started',
  'Location Guides',
  'Branding',
  'Billing',
  'Troubleshooting',
] as const

export type HelpCategory = (typeof HELP_CATEGORY_ORDER)[number]

export interface HelpArticleMeta {
  slug:     string
  title:    string
  category: HelpCategory | string
  summary:  string
  order:    number
  updated:  string | null
}

export interface HelpArticle extends HelpArticleMeta {
  body: string
}

const HELP_DIR = join(process.cwd(), 'content', 'help')

function loadAllRaw(): HelpArticle[] {
  let files: string[]
  try {
    files = readdirSync(HELP_DIR).filter(f => f.endsWith('.md'))
  } catch {
    // Folder doesn't exist yet — return empty so the help index
    // renders an empty-state instead of 500-ing.
    return []
  }
  return files.map(f => {
    const slug = basename(f, '.md')
    const raw = readFileSync(join(HELP_DIR, f), 'utf8')
    const { data, content } = matter(raw)
    return {
      slug,
      title:    typeof data.title    === 'string' ? data.title    : slug,
      category: typeof data.category === 'string' ? data.category : 'Uncategorized',
      summary:  typeof data.summary  === 'string' ? data.summary  : '',
      order:    typeof data.order    === 'number' ? data.order    : 999,
      updated:  data.updated instanceof Date ? data.updated.toISOString().slice(0, 10)
              : typeof data.updated === 'string' ? data.updated
              : null,
      body:     content,
    }
  })
}

export function listHelpArticles(): HelpArticleMeta[] {
  return loadAllRaw()
    .map(({ body, ...meta }) => meta) // eslint-disable-line @typescript-eslint/no-unused-vars
    .sort((a, b) => {
      const ai = HELP_CATEGORY_ORDER.indexOf(a.category as HelpCategory)
      const bi = HELP_CATEGORY_ORDER.indexOf(b.category as HelpCategory)
      // Categories listed in HELP_CATEGORY_ORDER come first, in that
      // order. Anything else (typo / new category) lands at the end
      // alphabetically. Within a category, `order` controls sequence.
      const aRank = ai === -1 ? 999 : ai
      const bRank = bi === -1 ? 999 : bi
      if (aRank !== bRank) return aRank - bRank
      if (a.category !== b.category) return a.category.localeCompare(b.category)
      if (a.order !== b.order) return a.order - b.order
      return a.title.localeCompare(b.title)
    })
}

export function getHelpArticle(slug: string): HelpArticle | null {
  const all = loadAllRaw()
  return all.find(a => a.slug === slug) ?? null
}

export function listHelpSlugs(): string[] {
  return loadAllRaw().map(a => a.slug)
}
