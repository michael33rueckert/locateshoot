import type { Metadata } from 'next'
import { Playfair_Display, DM_Sans } from 'next/font/google'
import './globals.css'
import 'leaflet/dist/leaflet.css'
import MfaGate from '@/components/MfaGate'
import InstallPrompt from '@/components/InstallPrompt'
import FeedbackButton from '@/components/FeedbackButton'
import SiteFooter from '@/components/SiteFooter'

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'LocateShoot — Location Guides photographers send to clients',
  description: 'Curate your favorite photoshoot spots into a branded Location Guide, drop one link in your workflow, and your clients pick the perfect location for their session in 30 seconds. Built for photographers.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LocateShoot',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${playfair.variable} ${dmSans.variable}`}>
      <head>
        <meta name="theme-color" content="#c4922a" />
        {/* Favicon: SVG for modern browsers (sharp at any size, themed via
            the source file), PNG fallback for older. apple-touch-icon is
            required for the iOS home screen. All assets generated from
            public/icon.svg via `node scripts/generate-icons.mjs`. */}
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body>
        {children}
        <SiteFooter />
        <MfaGate />
        <InstallPrompt />
        <FeedbackButton />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').catch(function(err) {
                console.log('SW registration failed:', err);
              });
            });
          }
        `}} />
      </body>
    </html>
  )
}