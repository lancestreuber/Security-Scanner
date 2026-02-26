import Link from 'next/link'

export const metadata = {
  title: 'About — SiteScan',
  description: 'SiteScan was built by Lance Struber, a Penn State student who wanted builders to know what they were shipping.',
}

export default function AboutPage() {
  return (
    <div className="px-6 pt-28 pb-24">
      <div className="max-w-2xl mx-auto">

        {/* Header block */}
        <div className="mb-16">
          <div
            className="text-xs tracking-widest uppercase mb-4"
            style={{ color: '#00ff94', fontFamily: 'var(--font-syne)' }}
          >
            About
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 800,
              fontSize: 'clamp(2.2rem, 5vw, 3.5rem)',
              lineHeight: 1.1,
              letterSpacing: '-0.025em',
              color: '#ebebf5',
            }}
          >
            Built by a builder,
            <br />
            <span style={{ color: '#00ff94' }}>for builders.</span>
          </h1>
        </div>

        {/* Typographic identity mark */}
        <div
          className="rounded-2xl p-8 mb-14 flex items-center justify-center"
          style={{
            background: 'var(--m-surface)',
            border: '1px solid var(--m-border)',
            minHeight: '160px',
          }}
        >
          <div className="text-center">
            <div
              style={{
                fontFamily: 'var(--font-syne)',
                fontWeight: 800,
                fontSize: 'clamp(3rem, 8vw, 5.5rem)',
                color: '#00ff94',
                letterSpacing: '-0.04em',
                lineHeight: 1,
                opacity: 0.9,
              }}
            >
              LS
            </div>
            <div
              className="mt-2"
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.8rem',
                color: 'var(--m-subtle)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Lance Struber · Penn State
            </div>
          </div>
        </div>

        {/* Body copy */}
        <div className="flex flex-col gap-8" style={{ fontFamily: 'var(--font-dm-sans)', lineHeight: 1.75 }}>

          <div>
            <h2
              style={{
                fontFamily: 'var(--font-syne)',
                fontWeight: 700,
                fontSize: '1.1rem',
                color: '#ebebf5',
                marginBottom: '0.75rem',
                letterSpacing: '-0.01em',
              }}
            >
              Why I built this
            </h2>
            <p style={{ color: '#8080a0', fontSize: '0.95rem' }}>
              I built SiteScan because I kept seeing the same thing: someone ships a project they&apos;re
              genuinely proud of — a real app, solving a real problem — and they have no idea what they&apos;re
              leaving exposed. Not because they don&apos;t care about security. Because they were heads-down
              building, and security checks weren&apos;t part of the workflow.
            </p>
          </div>

          <div>
            <h2
              style={{
                fontFamily: 'var(--font-syne)',
                fontWeight: 700,
                fontSize: '1.1rem',
                color: '#ebebf5',
                marginBottom: '0.75rem',
                letterSpacing: '-0.01em',
              }}
            >
              The connection to ENGR 310
            </h2>
            <p style={{ color: '#8080a0', fontSize: '0.95rem' }}>
              I&apos;m a student at Penn State and a Learning Assistant for ENGR 310 — Entrepreneurial
              Leadership in Engineering. The students in that class are building real products. Many of them
              are launching apps for the first time and learning full-stack development as they go. The tools
              they&apos;re using — Cursor, Bolt, Claude — let them move incredibly fast. But speed without
              awareness creates exposure.
            </p>
            <p className="mt-3" style={{ color: '#8080a0', fontSize: '0.95rem' }}>
              I wanted them to have a tool that could check their work before those projects went live. One
              that doesn&apos;t require a security background to understand. One that tells you specifically
              what&apos;s wrong and specifically how to fix it — in plain terms, with instructions you can
              hand to an AI.
            </p>
          </div>

          <div>
            <h2
              style={{
                fontFamily: 'var(--font-syne)',
                fontWeight: 700,
                fontSize: '1.1rem',
                color: '#ebebf5',
                marginBottom: '0.75rem',
                letterSpacing: '-0.01em',
              }}
            >
              What SiteScan is meant to be
            </h2>
            <p style={{ color: '#8080a0', fontSize: '0.95rem' }}>
              SiteScan isn&apos;t a security suite. It&apos;s not trying to replace a full penetration test
              or compete with enterprise tools. It&apos;s a fast, AI-augmented check that catches the things
              that actually get developers in trouble — exposed credentials, missing headers, RLS disabled on
              the wrong table, an API endpoint that responds to anyone who asks.
            </p>
            <p className="mt-3" style={{ color: '#8080a0', fontSize: '0.95rem' }}>
              It&apos;s also meant to be an example of the kind of project engineering students should be
              building: a real tool, solving a real problem, with a real user in mind. Not a demo. Not a
              tutorial clone. Something that actually works.
            </p>
          </div>

          <div>
            <h2
              style={{
                fontFamily: 'var(--font-syne)',
                fontWeight: 700,
                fontSize: '1.1rem',
                color: '#ebebf5',
                marginBottom: '0.75rem',
                letterSpacing: '-0.01em',
              }}
            >
              Who can access it
            </h2>
            <p style={{ color: '#8080a0', fontSize: '0.95rem' }}>
              Right now, SiteScan is private — shared with a small group of trusted users while I continue
              building it out. If you want access, reach out. If you&apos;re an ENGR 310 student or someone
              building a project you want checked, I especially want to hear from you.
            </p>
          </div>
        </div>

        {/* CTA row */}
        <div className="mt-14 flex flex-wrap gap-4">
          <Link href="/auth/signup" className="btn-primary px-6 py-2.5 rounded-lg text-sm">
            Request Access →
          </Link>
          <Link
            href="/contact"
            className="btn-ghost px-6 py-2.5 rounded-lg text-sm"
            style={{ fontFamily: 'var(--font-dm-sans)' }}
          >
            Get in touch
          </Link>
        </div>

        {/* Divider + acknowledgment */}
        <div className="mt-16 pt-8" style={{ borderTop: '1px solid var(--m-border)' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: 'var(--m-subtle)', lineHeight: 1.7 }}>
            SiteScan is a student project built at Penn State. All probe activity is authorized
            by users before scanning begins. No scan data is sold or shared. This tool is for
            defensive security — understanding what you&apos;re shipping, not attacking what others have built.
          </p>
        </div>
      </div>
    </div>
  )
}
