import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getHelpArticle, listHelpSlugs } from '@/lib/help'
import HelpArticleClient from './HelpArticleClient'

// Static-generate every article path at build time. Adding a new
// /content/help/<slug>.md file + redeploying creates a new route
// automatically; no manual route registration.
export function generateStaticParams() {
  return listHelpSlugs().map(slug => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const article = getHelpArticle(slug)
  if (!article) return { title: 'Help · LocateShoot' }
  return {
    title:       `${article.title} · LocateShoot Help`,
    description: article.summary || undefined,
  }
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = getHelpArticle(slug)
  if (!article) notFound()
  return <HelpArticleClient article={article} />
}
