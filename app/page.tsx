import Link from 'next/link'
import MarketingNav from '@/components/marketing-nav'
import MarketingFooter from '@/components/marketing-footer'
import EmailCapture from '@/components/email-capture'

/* ─── Check category card data ───────────────────────────────────────────────── */
const checks = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="4" width="16" height="12" rx="2" stroke="#00ff94" strokeWidth="1.5" />
        <path d="M6 8h8M6 11h5" stroke="#00ff94" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="15" cy="11" r="1" fill="#00ff94" />
      </svg>
    ),
    title: 'SSL & TLS',
    body: 'Expired certificates, weak cipher suites, and misconfigured chains that browsers will flag.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2L3 6v5c0 3.87 2.97 7.5 7 8.5 4.03-1 7-4.63 7-8.5V6l-7-4z" stroke="#00ff94" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M7 10l2 2 4-4" stroke="#00ff94" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Security Headers',
    body: 'CSP, HSTS, X-Frame-Options — the six HTTP headers your app is almost certainly missing.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M4 10h12M12 6l4 4-4 4" stroke="#00ff94" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="4" cy="10" r="1.5" fill="#00ff94" />
      </svg>
    ),
    title: 'Redirect Chains',
    body: 'HTTP to HTTPS should be one clean hop. If it takes more, something is wrong.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke="#00ff94" strokeWidth="1.5" />
        <path d="M8 8a2 2 0 1 1 4 0c0 1-1 1.5-1.5 2S10 11.5 10 12.5" stroke="#00ff94" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="15" r="0.75" fill="#00ff94" />
      </svg>
    ),
    title: 'Exposed Credentials',
    body: '.env files, API keys, database URLs — readable straight from your browser if you know where to look.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 5h14M3 10h10M3 15h6" stroke="#00ff94" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="16" cy="13.5" r="3" stroke="#00ff94" strokeWidth="1.5" />
        <path d="M18.5 16l1.5 1.5" stroke="#00ff94" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'API Attack Surface',
    body: 'Supabase tables with RLS disabled. Endpoints that respond without any authentication.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 3c-3.87 0-7 3.13-7 7s3.13 7 7 7 7-3.13 7-7-3.13-7-7-7z" stroke="#00ff94" strokeWidth="1.5" />
        <path d="M10 6v5l3 2" stroke="#00ff94" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="16" cy="5" r="2.5" fill="#00ff94" />
        <path d="M15 5h2M16 4v2" stroke="#050508" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
    title: 'AI Recon',
    body: 'Claude reads your site the way an attacker would, mapping your tech stack and every exposure it finds.',
  },
]

/* ─── How It Works steps ─────────────────────────────────────────────────────── */
const steps = [
  {
    n: '01',
    title: 'Submit your URL',
    body: "Paste your site's address and confirm you're the owner. That confirmation is required — we only probe sites you've explicitly authorized.",
  },
  {
    n: '02',
    title: 'AI agents get to work',
    body: 'Your SSL certificate, security headers, redirect chain, source code, and API endpoints are probed in parallel. All findings update live.',
  },
  {
    n: '03',
    title: 'Read your report',
    body: 'You get a security score, a prioritized list of issues sorted by severity, and step-by-step fix instructions you can hand straight to an AI.',
  },
]

/* ─── Terminal lines (hero visual) ──────────────────────────────────────────── */
const termLines = [
  { text: '> sitescan --probe https://yoursite.com', color: '#00ff94', delay: 0.1 },
  { text: '  ✓  ssl_check          passed', color: '#4ade80', delay: 0.6 },
  { text: '  ⚠  headers_check      3 missing', color: '#facc15', delay: 1.1 },
  { text: '  ✓  redirect_check     clean', color: '#4ade80', delay: 1.6 },
  { text: '  ✗  credential_scan    .env accessible', color: '#f87171', delay: 2.1 },
  { text: '  ✗  api_probe          unauthenticated endpoint', color: '#f87171', delay: 2.6 },
  { text: '', delay: 3.0 },
  { text: '  score: 41/100  action required', color: '#f87171', delay: 3.1 },
]

export default function HomePage() {
  return (
    <div className="m-page noise-overlay" style={{ backgroundColor: 'var(--m-bg)' }}>
      <MarketingNav />

      {/* ─── Hero ──────────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-6 pt-14 grid-bg hero-glow overflow-hidden">
        {/* Scan line sweep */}
        <div
          className="scan-sweep absolute left-0 right-0 pointer-events-none"
          style={{
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(0,255,148,0.4), transparent)',
          }}
        />

        <div className="relative z-10 max-w-4xl w-full text-center flex flex-col items-center gap-8">
          {/* Eyebrow */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs tracking-widest uppercase"
            style={{
              background: 'rgba(0,255,148,0.08)',
              border: '1px solid rgba(0,255,148,0.2)',
              color: '#00ff94',
              fontFamily: 'var(--font-syne)',
            }}
          >
            <span className="cursor-blink inline-block w-1.5 h-1.5 rounded-full bg-current" />
            AI Security Scanning
          </div>

          {/* Headline */}
          <h1
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 800,
              fontSize: 'clamp(2.8rem, 7vw, 5.5rem)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: '#ebebf5',
            }}
          >
            You shipped it.
            <br />
            <span style={{ color: '#00ff94' }} className="accent-text-glow">
              Is it safe?
            </span>
          </h1>

          {/* Subheadline */}
          <p
            className="max-w-xl"
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 'clamp(1rem, 2vw, 1.2rem)',
              color: '#8080a0',
              lineHeight: 1.7,
            }}
          >
            SiteScan sends AI security agents into your project and comes back
            with a full report — exposed credentials, unprotected APIs, missing
            headers, and exactly how to fix everything.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/auth/signup" className="btn-primary px-7 py-3 rounded-lg text-sm">
              Scan Your Site →
            </Link>
            <Link
              href="/how-it-works"
              className="btn-ghost px-6 py-3 rounded-lg text-sm"
              style={{ fontFamily: 'var(--font-dm-sans)' }}
            >
              See How It Works
            </Link>
          </div>

          {/* Terminal visual */}
          <div
            className="w-full max-w-2xl mt-4 text-left rounded-xl overflow-hidden"
            style={{
              background: 'var(--m-surface)',
              border: '1px solid var(--m-border)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
            }}
          >
            {/* Terminal chrome */}
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ borderBottom: '1px solid var(--m-border)' }}
            >
              <span className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
              <span className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
              <span className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
              <span
                className="ml-4 text-xs"
                style={{ color: 'var(--m-subtle)', fontFamily: 'var(--font-geist-mono)' }}
              >
                sitescan — terminal
              </span>
            </div>

            {/* Terminal body */}
            <div className="px-5 py-5 space-y-1.5">
              {termLines.map((line, i) => (
                <div
                  key={i}
                  className="term-line"
                  style={{
                    animationDelay: `${line.delay}s`,
                    fontFamily: 'var(--font-geist-mono)',
                    fontSize: '0.8rem',
                    color: line.color ?? 'var(--m-muted)',
                    minHeight: '1.2em',
                  }}
                >
                  {line.text}
                </div>
              ))}
              <div
                className="flex items-center gap-0.5 pt-1"
                style={{ color: '#00ff94', fontFamily: 'var(--font-geist-mono)', fontSize: '0.8rem' }}
              >
                <span>{'> '}</span>
                <span
                  className="cursor-blink inline-block w-2 h-4 ml-0.5"
                  style={{ background: '#00ff94' }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── What It Catches ───────────────────────────────────────────────────── */}
      <section className="m-divider px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14 text-center">
            <h2
              style={{
                fontFamily: 'var(--font-syne)',
                fontWeight: 700,
                fontSize: 'clamp(1.6rem, 3.5vw, 2.5rem)',
                color: '#ebebf5',
                letterSpacing: '-0.02em',
              }}
            >
              What it catches
            </h2>
            <p
              className="mt-3 max-w-lg mx-auto"
              style={{ color: 'var(--m-muted)', fontFamily: 'var(--font-dm-sans)', lineHeight: 1.65 }}
            >
              Six categories of checks — some automated, some AI-guided, all
              things that real attackers actually look for.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {checks.map(({ icon, title, body }) => (
              <div
                key={title}
                className="m-card rounded-xl p-6 flex flex-col gap-4"
                style={{ background: 'var(--m-surface)', border: '1px solid var(--m-border)' }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(0,255,148,0.07)' }}
                >
                  {icon}
                </div>
                <div>
                  <h3
                    style={{
                      fontFamily: 'var(--font-syne)',
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      color: '#ebebf5',
                      marginBottom: '0.4rem',
                    }}
                  >
                    {title}
                  </h3>
                  <p
                    style={{
                      fontFamily: 'var(--font-dm-sans)',
                      fontSize: '0.85rem',
                      color: 'var(--m-muted)',
                      lineHeight: 1.65,
                    }}
                  >
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works (summary) ────────────────────────────────────────────── */}
      <section className="m-divider px-6 py-24" style={{ background: 'var(--m-surface)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="mb-14 text-center">
            <h2
              style={{
                fontFamily: 'var(--font-syne)',
                fontWeight: 700,
                fontSize: 'clamp(1.6rem, 3.5vw, 2.5rem)',
                color: '#ebebf5',
                letterSpacing: '-0.02em',
              }}
            >
              How it works
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 relative">
            {steps.map(({ n, title, body }) => (
              <div key={n} className="flex flex-col gap-4">
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: 'rgba(0,255,148,0.06)',
                    border: '1px solid rgba(0,255,148,0.18)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-syne)',
                      fontWeight: 800,
                      fontSize: '1.1rem',
                      color: '#00ff94',
                    }}
                  >
                    {n}
                  </span>
                </div>
                <div>
                  <h3
                    style={{
                      fontFamily: 'var(--font-syne)',
                      fontWeight: 700,
                      fontSize: '1rem',
                      color: '#ebebf5',
                      marginBottom: '0.5rem',
                    }}
                  >
                    {title}
                  </h3>
                  <p
                    style={{
                      fontFamily: 'var(--font-dm-sans)',
                      fontSize: '0.875rem',
                      color: 'var(--m-muted)',
                      lineHeight: 1.65,
                    }}
                  >
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/how-it-works"
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.875rem', color: '#00ff94' }}
            >
              Full technical breakdown →
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Vibe Coder Truth Bomb ─────────────────────────────────────────────── */}
      <section className="m-divider px-6 py-28 relative overflow-hidden" style={{ background: 'var(--m-bg)' }}>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 50% 60% at 50% 50%, rgba(0,255,148,0.04) 0%, transparent 70%)',
          }}
        />
        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="w-px h-12 mb-8 mx-auto quote-bar" />

          <blockquote
            className="text-center mb-12"
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 800,
              fontSize: 'clamp(1.8rem, 4.5vw, 3.2rem)',
              lineHeight: 1.15,
              color: '#ebebf5',
              letterSpacing: '-0.025em',
            }}
          >
            &ldquo;AI helps you build fast.
            <br />
            <span style={{ color: '#00ff94' }}>
              It doesn&apos;t make your database private.
            </span>
            &rdquo;
          </blockquote>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                label: 'Supabase',
                text: 'Tables default to public access. Did you actually enable RLS on every table that holds user data?',
              },
              {
                label: 'Environment',
                text: "Your .env file doesn't protect secrets that were already bundled into your JavaScript.",
              },
              {
                label: 'Deployment',
                text: 'Clicking "Deploy" is not a security audit. Knowing what you shipped is.',
              },
            ].map(({ label, text }) => (
              <div
                key={label}
                className="rounded-lg p-5"
                style={{ background: 'var(--m-surface)', border: '1px solid var(--m-border)' }}
              >
                <div
                  className="text-xs font-medium mb-2 tracking-widest uppercase"
                  style={{ color: '#00ff94', fontFamily: 'var(--font-syne)' }}
                >
                  {label}
                </div>
                <p
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.85rem',
                    color: 'var(--m-muted)',
                    lineHeight: 1.65,
                  }}
                >
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Email capture ─────────────────────────────────────────────────────── */}
      <section className="m-divider px-6 py-24" style={{ background: 'var(--m-surface)' }}>
        <div className="max-w-xl mx-auto text-center flex flex-col items-center gap-6">
          <h2
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 700,
              fontSize: 'clamp(1.5rem, 3vw, 2.2rem)',
              color: '#ebebf5',
              letterSpacing: '-0.02em',
            }}
          >
            Stay in the loop
          </h2>
          <p
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.95rem',
              color: 'var(--m-muted)',
              lineHeight: 1.65,
            }}
          >
            SiteScan is a private tool right now, shared with a small group of
            trusted users. Drop your email and I&apos;ll reach out when more
            spots open up.
          </p>
          <EmailCapture />
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}
