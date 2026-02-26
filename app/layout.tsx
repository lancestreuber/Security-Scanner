import type { Metadata } from 'next'
import { Geist, Geist_Mono, Syne, DM_Sans } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const syne = Syne({
  variable: '--font-syne',
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
})

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'SiteScan — AI Security Scanning',
  description:
    'SiteScan sends AI security agents into your site and tells you exactly what\'s exposed — before someone else finds it first.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} ${dmSans.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  )
}
