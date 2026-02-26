export const metadata = {
  title: 'Contact — SiteScan',
  description: 'Get in touch with the SiteScan team.',
}

export default function ContactPage() {
  return (
    <div className="px-6 pt-28 pb-24">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="mb-12">
          <div
            className="text-xs tracking-widest uppercase mb-4"
            style={{ color: '#00ff94', fontFamily: 'var(--font-syne)' }}
          >
            Contact
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 800,
              fontSize: 'clamp(2rem, 5vw, 3.2rem)',
              lineHeight: 1.1,
              letterSpacing: '-0.025em',
              color: '#ebebf5',
            }}
          >
            Get in touch
          </h1>
        </div>

        {/* Content card */}
        <div
          className="rounded-2xl p-8 mb-8"
          style={{
            background: 'var(--m-surface)',
            border: '1px solid var(--m-border)',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.95rem',
              color: '#8080a0',
              lineHeight: 1.75,
              marginBottom: '1.5rem',
            }}
          >
            SiteScan is a private tool shared with trusted users. If you&apos;re interested
            in getting access, have feedback, or want to talk about the project, email is the
            best way to reach me.
          </p>

          <p
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.95rem',
              color: '#8080a0',
              lineHeight: 1.75,
            }}
          >
            If you&apos;re a Penn State student working on a project and want your site checked
            before it goes live, say so — I&apos;ll prioritize getting you access.
          </p>
        </div>

        {/* Email display */}
        <div
          className="rounded-xl p-6 flex items-center justify-between gap-4"
          style={{
            background: 'rgba(0,255,148,0.05)',
            border: '1px solid rgba(0,255,148,0.18)',
          }}
        >
          <div>
            <div
              className="text-xs tracking-widest uppercase mb-1.5"
              style={{ color: '#00ff94', fontFamily: 'var(--font-syne)', opacity: 0.8 }}
            >
              Email
            </div>
            <a
              href="mailto:sitescan@example.com"
              className="m-link-hover"
              style={{
                fontFamily: 'var(--font-geist-mono)',
                fontSize: '1rem',
                color: '#ebebf5',
                textDecoration: 'none',
              }}
            >
              sitescan@example.com
            </a>
          </div>

          <a
            href="mailto:sitescan@example.com"
            className="shrink-0 btn-primary px-4 py-2 rounded-lg text-xs"
          >
            Open →
          </a>
        </div>

        {/* Closing note */}
        <p
          className="mt-10"
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.8rem',
            color: 'var(--m-subtle)',
            lineHeight: 1.7,
          }}
        >
          Response times vary. I&apos;m a student with a full course load — I read every email,
          but I can&apos;t always respond immediately. I appreciate the patience.
        </p>
      </div>
    </div>
  )
}
