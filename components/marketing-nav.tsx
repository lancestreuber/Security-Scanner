'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function MarketingNav() {
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const links = [
    { href: '/how-it-works', label: 'How It Works' },
    { href: '/about', label: 'About' },
  ]

  return (
    <header
      className="m-nav fixed top-0 left-0 right-0 z-50"
      style={{
        backgroundColor: scrolled ? 'rgba(5, 5, 8, 0.88)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled
          ? '1px solid rgba(0, 255, 148, 0.12)'
          : '1px solid transparent',
      }}
    >
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Wordmark */}
        <Link
          href="/"
          className="m-display text-sm font-700 tracking-widest uppercase"
          style={{
            color: '#00ff94',
            fontFamily: 'var(--font-syne)',
            fontWeight: 700,
            letterSpacing: '0.15em',
          }}
        >
          SiteScan
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-6">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-sm transition-colors duration-150"
              style={{
                fontFamily: 'var(--font-dm-sans)',
                color: pathname === href ? '#00ff94' : '#8080a0',
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLAnchorElement).style.color = '#ebebf5')
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLAnchorElement).style.color =
                  pathname === href ? '#00ff94' : '#8080a0')
              }
            >
              {label}
            </Link>
          ))}

          <Link
            href="/auth/login"
            className="btn-ghost text-sm px-4 py-1.5 rounded-md"
            style={{ fontFamily: 'var(--font-dm-sans)' }}
          >
            Sign In
          </Link>
        </nav>
      </div>
    </header>
  )
}
