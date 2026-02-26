import Link from 'next/link'

export const metadata = {
  title: 'How It Works — SiteScan',
  description: 'A detailed breakdown of how SiteScan probes your site — from consent to remediation report.',
}

const phases = [
  {
    n: '01',
    title: 'Consent & ownership confirmation',
    label: 'LEGAL & ETHICAL',
    color: '#00ff94',
    body: [
      "Before a single request leaves our servers, you confirm that you own — or have explicit authorization to test — the site you're scanning. This isn't a checkbox we added for legal cover. It's a real gate.",
      "Your confirmation is recorded in the database with a timestamp. The Edge Function that runs the scan checks this record before doing anything. If consent is missing or the scan ID doesn't match, the function stops immediately.",
      "This matters because passive security scans involve making real HTTP requests to a real server. We take that seriously. You should too.",
    ],
  },
  {
    n: '02',
    title: 'SSL & TLS certificate check',
    label: 'NON-AI CHECK',
    color: '#60a5fa',
    body: [
      'We open a raw TLS connection to your server on port 443. No HTTP — just a direct TLS handshake using Deno\'s native TLS APIs, which gives us access to the actual peer certificate data.',
      'From the certificate, we extract the issuer, the expiry date, and calculate the number of days remaining. A certificate with less than 14 days left gets a warning. An expired certificate is a hard failure.',
      'Why does this matter? An expired certificate breaks HTTPS for every user who visits your site — browsers refuse to connect. A mis-issued certificate can be a vector for man-in-the-middle attacks.',
    ],
  },
  {
    n: '03',
    title: 'HTTP security headers',
    label: 'NON-AI CHECK',
    color: '#60a5fa',
    body: [
      "We make a HEAD request to your site and inspect the response headers. We're looking for six specific headers that most browsers respect but most developers never set:",
      "Strict-Transport-Security tells browsers to always use HTTPS. Content-Security-Policy restricts what scripts and resources can run. X-Frame-Options prevents your pages from being embedded in iframes on other sites. X-Content-Type-Options stops browsers from sniffing MIME types. Referrer-Policy controls what URL information leaks when users click links. Permissions-Policy limits access to browser features like the camera or microphone.",
      'Missing any high-severity header (HSTS, CSP, X-Frame-Options) is a hard failure. Missing medium or low severity headers is a warning. All six are fixable with about four lines of configuration.',
    ],
  },
  {
    n: '04',
    title: 'HTTPS redirect chain',
    label: 'NON-AI CHECK',
    color: '#60a5fa',
    body: [
      "We start from http:// (not https://) and manually follow every redirect, recording the full chain. Each hop has an 8-second timeout. We track up to 8 redirects before we give up.",
      'The final destination should be your HTTPS URL. If the redirect chain ends on HTTP, that\'s a failure — users can be served your site over an unencrypted connection. If the chain has more than four hops, that\'s a warning — excessive redirects slow down initial page loads and are usually a sign of misconfigured infrastructure.',
      "If port 80 doesn't respond at all, we note it but don't fail the check — some sites are HTTPS-only at the infrastructure level, which is actually fine. The redirect chain check passes by default in that case.",
    ],
  },
  {
    n: '05',
    title: 'AI recon — tech stack and attack surface',
    label: 'AI CHECK — CLAUDE CALL 1',
    color: '#a78bfa',
    body: [
      "Before probing anything, we give Claude a high-level description of your site — its hostname, any detectable patterns in the URL structure — and ask it to think like an attacker doing passive recon.",
      "Claude returns a list of observations about likely tech stack, framework, and hosting patterns, plus a list of probe targets: specific API endpoints, paths, or routes that are worth testing for unauthorized access. Each probe target includes the URL, HTTP method, and the specific security concern it's testing for.",
      "We cap this list at 10 probes. Claude's recon is a hypothesis, not a guarantee — the actual probing in Step 07 is what finds real issues. This call is about being smart about what we look for, not exhaustive enumeration.",
    ],
  },
  {
    n: '06',
    title: 'Credential exposure scan',
    label: 'AI-GUIDED CHECK',
    color: '#a78bfa',
    body: [
      "We fetch a standard set of paths that are commonly exposed in misconfigured web servers: .env, .env.local, .env.production, .git/config, wp-config.php, config/database.yml, .htpasswd, phpinfo.php, config.json, and .npmrc. If Claude's recon identified additional likely paths for this tech stack, we include those too.",
      "For each response, we first skip anything that looks like HTML — most modern frameworks return index.html for unknown paths, so an HTML response almost never means the file is actually exposed. For non-HTML responses, we scan the content for ten categories of secrets: AWS access keys, GitHub tokens, Stripe keys, private key headers, database connection strings, generic API key patterns, secret tokens, plaintext passwords, bearer tokens, and JWT secrets.",
      "We never store the file contents. We only store the path and the type of secret detected — enough for you to know what to fix, nothing that compounds the exposure.",
    ],
  },
  {
    n: '07',
    title: 'API endpoint probe',
    label: 'AI-GUIDED CHECK',
    color: '#a78bfa',
    body: [
      "Using the probe targets Claude identified in Step 05, we make unauthenticated HTTP requests to each endpoint. Every request has an 8-second timeout. All probes run in parallel via Promise.allSettled — we cap at 10 requests total regardless of what Claude suggested.",
      "We flag three things: a 2xx response on a probed endpoint (high severity if the response is JSON, medium if HTML or other), a 5xx server error (medium — it means we hit something real and it crashed), and missing authentication on any endpoint that returns user or application data.",
      "A 401 or 403 response is what we want to see — it means the endpoint exists but is properly protected. A 404 on a probed path is fine too. We're looking for the cases where there's no gate at all.",
    ],
  },
  {
    n: '08',
    title: 'Interpretation and remediation report',
    label: 'AI CHECK — CLAUDE CALL 2',
    color: '#a78bfa',
    body: [
      "After all five checks complete, we send Claude the full results: every finding, every status, every piece of raw data — and ask it to act as a senior security engineer reviewing the scan.",
      "Claude returns a score from 0 to 100, a 2-3 sentence summary of the overall security posture, and a remediation guide organized into four severity buckets: Critical, High, Medium, and Low. Each item includes a specific description of the issue and concrete steps to fix it.",
      "The remediation guide is written to be actionable. You can copy it directly into a conversation with Claude Code or any other AI coding tool and ask it to implement the fixes. That's by design — the goal isn't to scare you with a list of problems. It's to give you a clear path to a better security posture, today.",
    ],
  },
]

export default function HowItWorksPage() {
  return (
    <div className="px-6 pt-28 pb-24">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-16">
          <div
            className="text-xs tracking-widest uppercase mb-4"
            style={{ color: '#00ff94', fontFamily: 'var(--font-syne)' }}
          >
            Technical Breakdown
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 800,
              fontSize: 'clamp(2.2rem, 5vw, 3.8rem)',
              lineHeight: 1.08,
              letterSpacing: '-0.025em',
              color: '#ebebf5',
            }}
          >
            How SiteScan works
          </h1>
          <p
            className="mt-5 max-w-2xl"
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '1.05rem',
              color: '#8080a0',
              lineHeight: 1.7,
            }}
          >
            Eight steps, two AI calls, and zero stored secrets. Here&apos;s exactly
            what happens from the moment you submit a URL to the moment you get
            your report.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-16 pb-6" style={{ borderBottom: '1px solid var(--m-border)' }}>
          {[
            { color: '#60a5fa', label: 'Automated check (no AI)' },
            { color: '#a78bfa', label: 'AI-guided check (Claude)' },
            { color: '#00ff94', label: 'Required gate' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: 'var(--m-muted)' }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Phases */}
        <div className="flex flex-col gap-16">
          {phases.map(({ n, title, label, color, body }) => (
            <div key={n} className="flex gap-8">
              {/* Left column */}
              <div className="flex flex-col items-center gap-3 shrink-0 w-14">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: `${color}10`,
                    border: `1px solid ${color}30`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-syne)',
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      color: color,
                    }}
                  >
                    {n}
                  </span>
                </div>
                {/* Connector */}
                <div
                  className="flex-1 w-px min-h-8"
                  style={{ background: `linear-gradient(180deg, ${color}30, transparent)` }}
                />
              </div>

              {/* Right column */}
              <div className="flex-1 pb-2">
                <div
                  className="text-xs tracking-widest uppercase mb-2"
                  style={{ color: color, fontFamily: 'var(--font-syne)', opacity: 0.85 }}
                >
                  {label}
                </div>
                <h2
                  style={{
                    fontFamily: 'var(--font-syne)',
                    fontWeight: 700,
                    fontSize: '1.25rem',
                    color: '#ebebf5',
                    marginBottom: '1rem',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {title}
                </h2>
                <div className="flex flex-col gap-3">
                  {body.map((para, i) => (
                    <p
                      key={i}
                      style={{
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: '0.925rem',
                        color: '#8080a0',
                        lineHeight: 1.75,
                      }}
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div
          className="mt-20 rounded-2xl p-8 text-center"
          style={{
            background: 'var(--m-surface)',
            border: '1px solid var(--m-border)',
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 700,
              fontSize: '1.5rem',
              color: '#ebebf5',
              marginBottom: '0.75rem',
              letterSpacing: '-0.015em',
            }}
          >
            Ready to run your first scan?
          </h3>
          <p
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.9rem',
              color: 'var(--m-muted)',
              marginBottom: '1.5rem',
            }}
          >
            Create an account and scan your site in under two minutes.
          </p>
          <Link href="/auth/signup" className="btn-primary inline-block px-8 py-3 rounded-lg text-sm">
            Get Started →
          </Link>
        </div>
      </div>
    </div>
  )
}
