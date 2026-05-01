import type { Metadata } from 'next'
import { listHelpArticles, HELP_CATEGORY_ORDER } from '@/lib/help'
import HelpIndexClient from './HelpIndexClient'

// Server component — does the filesystem read at build time and
// hands the article metadata off to the client component which
// handles search + interactivity. Articles are statically generated;
// any edit to a /content/help/*.md file rebuilds this page.

export const metadata: Metadata = {
  title:       'Help · LocateShoot',
  description: 'Guides, walkthroughs, and troubleshooting for LocateShoot.',
}

export default function HelpPage() {
  const articles = listHelpArticles()
  return <HelpIndexClient articles={articles} categories={[...HELP_CATEGORY_ORDER]} />
}
