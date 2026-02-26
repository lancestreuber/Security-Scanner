'use client'

import Link from 'next/link'

export default function MarketingFooter() {
  const year = new Date().getFullYear()

  const links = [
    { href: '/', label: 'Home' },
    { href: '/how-it-works', label: 'How It Works' },
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' },
  ]

  return (
    <footer
      className="m-divider"
      style={{ backgroundColor: 'var(--m-bg)' }}
    >
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <span
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 700,
              letterSpacing: '0.15em',
              color: '#00ff94',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
            }}
          >
            SiteScan
          </span>
          <span
            style={{
              color: 'var(--m-subtle)',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-dm-sans)',
            }}
          >
            © {year} Lance Struber
          </span>
        </div>

        <nav className="flex items-center gap-5">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{
                color: 'var(--m-subtle)',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-dm-sans)',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--m-muted)')
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--m-subtle)')
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
