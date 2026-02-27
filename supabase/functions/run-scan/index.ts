// ============================================================
// run-scan — Supabase Edge Function (Deno)
//
// Invoked by /api/scans after a scan row is created.
// Phase 7: HTML/JS source code scanner.
//   Fetches main page HTML + up to 10 same-origin JS bundles.
//   Scans all content with 18 regex patterns for leaked secrets.
//   If a login page is detected, Claude analyzes it for auth weaknesses.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OPENROUTER_KEY  = Deno.env.get('OPENROUTER_API_KEY')!
const OPENROUTER_URL  = 'https://openrouter.ai/api/v1/chat/completions'

// ── Types ────────────────────────────────────────────────────
type CheckStatus = 'passed' | 'warning' | 'failed' | 'error'
interface CheckResult { status: CheckStatus; summary: string; [key: string]: unknown }

interface ProbeTarget { url: string; method: string; purpose: string }

interface AgentPlan {
  observations:           string[]
  probe_targets:          ProbeTarget[]
  extra_credential_paths: string[]
}

interface SourceFinding {
  source:      string
  source_type: 'html' | 'inline_script' | 'js_bundle'
  pattern:     string
  severity:    'high' | 'medium' | 'low'
  preview:     string
}

interface LoginFinding {
  issue:    string
  severity: 'high' | 'medium' | 'low'
  detail:   string
}

interface LoginCheckResult {
  login_url: string
  findings:  LoginFinding[]
}

interface SourceScanResult extends CheckResult {
  pages_scanned:        number
  js_files_scanned:     number
  inline_scripts_count: number
  findings:             SourceFinding[]
  login_check:          LoginCheckResult | null
}

// ── Utility ──────────────────────────────────────────────────
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ])
}

const UA = 'Mozilla/5.0 (compatible; SecurityScanner/1.0; +https://sitescan.vercel.app)'

// ── OpenRouter / Claude ───────────────────────────────────────
async function callClaude(
  messages: Array<{ role: string; content: string }>,
  maxTokens = 800,
): Promise<string> {
  const resp = await withTimeout(
    fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://sitescan.vercel.app',
        'X-Title': 'SiteScan Security Scanner',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4-5',
        messages,
        max_tokens: maxTokens,
        temperature: 0.1,
      }),
    }),
    25_000,
    'OpenRouter call',
  )

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`OpenRouter ${resp.status}: ${text.slice(0, 200)}`)
  }

  const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
  return data.choices[0].message.content
}

// ── Claude Call 1: Recon plan ─────────────────────────────────
// Returns targeted probe paths AND tech-stack-specific credential
// paths to supplement the standard hardcoded credential list.
async function claudeRecon(siteUrl: string, hostname: string): Promise<AgentPlan> {
  const FALLBACK: AgentPlan = {
    observations: [
      `Target: ${hostname}`,
      'Recon plan generation failed — running standard probe and credential sets',
    ],
    probe_targets: [
      { url: '/api/users',     method: 'GET', purpose: 'Unauthenticated user listing' },
      { url: '/api/v1/users',  method: 'GET', purpose: 'V1 API user listing' },
      { url: '/admin',         method: 'GET', purpose: 'Admin panel exposure' },
      { url: '/graphql',       method: 'POST', purpose: 'GraphQL endpoint exposure' },
      { url: '/api/config',    method: 'GET', purpose: 'Configuration endpoint exposure' },
      { url: '/metrics',       method: 'GET', purpose: 'Metrics/telemetry exposure' },
      { url: '/api/v1/health', method: 'GET', purpose: 'Health endpoint with internal info' },
      { url: '/debug',         method: 'GET', purpose: 'Debug endpoint exposure' },
    ],
    extra_credential_paths: [],
  }

  const prompt =
    `You are a security reconnaissance agent. Analyze this target and produce a focused recon plan.\n` +
    `Target URL: ${siteUrl}\nHostname: ${hostname}\n\n` +
    `Infer the tech stack and attack surface from the hostname.\n` +
    `Return ONLY valid JSON — no markdown, no code fences:\n` +
    `{"observations":["..."],"probe_targets":[{"url":"/path","method":"GET","purpose":"why"}],"extra_credential_paths":["/path"]}\n\n` +
    `Rules:\n` +
    `observations: 3-5 strings — infer tech stack, hosting, likely frameworks, security posture\n` +
    `probe_targets: 7-10 URL paths (starting with /) tailored to the apparent stack.\n` +
    `  Include: /api/* endpoints, /admin, /graphql, /actuator, /metrics, /debug, /swagger, /.well-known/security.txt\n` +
    `  For Next.js/React: /api/auth, /api/trpc, /_next/data\n` +
    `  For WordPress: /wp-json/wp/v2/users, /xmlrpc.php\n` +
    `  For Rails: /rails/info, /sidekiq\n` +
    `  For Spring: /actuator/env, /actuator/beans, /h2-console\n` +
    `extra_credential_paths: 3-5 tech-stack-specific paths NOT already in standard list.\n` +
    `  Standard list already covers: /.env /.env.local /.env.production /.git/config /wp-config.php /config/database.yml /.htpasswd /phpinfo.php /config.json /.npmrc\n` +
    `  Add stack-specific paths: Next.js→/.next/server/app-paths-manifest.json, Spring→/application.yml, Rails→/config/master.key, Laravel→/bootstrap/cache/config.php, Django→/settings/local.py`

  const parsePlan = (raw: string): AgentPlan | null => {
    try {
      const parsed = JSON.parse(raw) as Partial<AgentPlan>
      if (!Array.isArray(parsed.observations) || !Array.isArray(parsed.probe_targets)) return null
      return {
        observations:           parsed.observations.slice(0, 5) as string[],
        probe_targets:          parsed.probe_targets.slice(0, 10) as ProbeTarget[],
        extra_credential_paths: Array.isArray(parsed.extra_credential_paths)
          ? (parsed.extra_credential_paths as string[]).slice(0, 5)
          : [],
      }
    } catch { return null }
  }

  try {
    const content = await callClaude([{ role: 'user', content: prompt }], 700)
    return parsePlan(content) ?? FALLBACK
  } catch {
    try {
      const retry = await callClaude([
        { role: 'user', content: prompt },
        { role: 'user', content: 'Return ONLY the raw JSON object. No markdown, no code blocks.' },
      ], 700)
      return parsePlan(retry) ?? FALLBACK
    } catch { return FALLBACK }
  }
}

// ── SSL Check ────────────────────────────────────────────────
async function checkSSL(hostname: string): Promise<CheckResult> {
  try {
    const conn = await withTimeout(Deno.connectTls({ hostname, port: 443 }), 10_000, 'TLS connect')
    const info = await conn.handshake()
    conn.close()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cert = info.peerCertificate as any
    if (!cert) return { status: 'passed', summary: 'Certificate valid (extended details unavailable)' }

    const validTo       = new Date(cert.validTo as string)
    const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / 86_400_000)
    const issuer        = cert.issuer?.O ?? cert.issuer?.CN ?? 'Unknown CA'

    if (isNaN(daysRemaining)) {
      return { status: 'passed', summary: 'Certificate valid (expiry date not parseable)', issuer }
    }
    if (daysRemaining < 0)  return { status: 'failed',  summary: `Certificate expired ${Math.abs(daysRemaining)} days ago`, issuer, days_remaining: daysRemaining }
    if (daysRemaining < 14) return { status: 'warning', summary: `Certificate expires in ${daysRemaining} days — renew soon`, issuer, days_remaining: daysRemaining }
    return { status: 'passed', summary: `Certificate valid, ${daysRemaining} days remaining`, issuer, days_remaining: daysRemaining }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('refused') || msg.includes('reset') || msg.includes('timed out')) {
      return { status: 'failed', summary: `Cannot reach site on port 443: ${msg}` }
    }
    return { status: 'failed', summary: `SSL/TLS error: ${msg}` }
  }
}

// ── HTTP Security Headers Check ──────────────────────────────
const SEC_HEADERS: Array<{ name: string; severity: 'high' | 'medium' | 'low' }> = [
  { name: 'Strict-Transport-Security', severity: 'high'   },
  { name: 'Content-Security-Policy',   severity: 'high'   },
  { name: 'X-Frame-Options',           severity: 'medium' },
  { name: 'X-Content-Type-Options',    severity: 'medium' },
  { name: 'Referrer-Policy',           severity: 'low'    },
  { name: 'Permissions-Policy',        severity: 'low'    },
]

async function checkHeaders(url: string): Promise<CheckResult> {
  try {
    const resp = await withTimeout(fetch(url, { redirect: 'follow', method: 'HEAD' }), 10_000, 'HEAD fetch')
    const missing: Array<{ header: string; status: 'missing'; severity: string }> = []
    const present: Array<{ header: string; value: string }> = []

    for (const { name, severity } of SEC_HEADERS) {
      const value = resp.headers.get(name)
      if (value) present.push({ header: name, value })
      else        missing.push({ header: name, status: 'missing', severity })
    }

    if (missing.length === 0) return { status: 'passed', summary: 'All 6 security headers present', present }
    const hasHigh = missing.some(f => f.severity === 'high')
    return { status: hasHigh ? 'failed' : 'warning', summary: `${missing.length} of 6 security headers missing`, findings: missing, present }
  } catch (err) {
    return { status: 'error', summary: `Headers check failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ── HTTPS Redirect Check ─────────────────────────────────────
async function checkRedirects(url: string): Promise<CheckResult> {
  try {
    const parsed    = new URL(url)
    const httpStart = `http://${parsed.host}${parsed.pathname}${parsed.search}`
    const chain: Array<{ url: string; status: number }> = []
    let current = httpStart

    for (let hop = 0; hop < 8; hop++) {
      let resp: Response
      try {
        resp = await withTimeout(fetch(current, { redirect: 'manual' }), 8_000, `redirect hop ${hop + 1}`)
      } catch {
        if (hop === 0) return { status: 'warning', summary: 'HTTP port not responding — no HTTP-to-HTTPS redirect configured', chain }
        break
      }
      chain.push({ url: current, status: resp.status })
      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get('location')
        if (!loc) break
        current = loc.startsWith('http') ? loc : new URL(loc, current).toString()
      } else { break }
    }

    const finalUrl = chain.at(-1)?.url ?? ''
    if (!finalUrl.startsWith('https://')) return { status: 'failed', summary: 'HTTP traffic is not redirected to HTTPS', chain }
    if (chain.length > 4)                  return { status: 'warning', summary: `Redirect chain has ${chain.length} hops — may slow page load`, chain }
    return { status: 'passed', summary: chain.length > 1 ? 'HTTP correctly redirects to HTTPS' : 'Site served over HTTPS', chain }
  } catch (err) {
    return { status: 'error', summary: `Redirect check failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ── Credential File Scan ──────────────────────────────────────
// Fetches a combined list of standard + Claude-suggested paths.
// Scans content for 10 secret patterns. Never stores credential values.

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'AWS Access Key',      pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub Token',        pattern: /gh[pousr]_[A-Za-z0-9_]{36}/ },
  { name: 'Stripe Secret Key',   pattern: /sk_(test|live)_[a-zA-Z0-9]{24,}/ },
  { name: 'Private Key Header',  pattern: /-----BEGIN\s+(?:RSA |EC |OPENSSH )?PRIVATE KEY/ },
  { name: 'Database URL',        pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@\s"']{3,}@/ },
  { name: 'API Key',             pattern: /api[_-]?key\s*[=:"'`]+\s*[a-zA-Z0-9_\-]{16,}/i },
  { name: 'Secret Token',        pattern: /secret[_-]?(?:key|token)\s*[=:"'`]+\s*[a-zA-Z0-9_\-]{16,}/i },
  { name: 'Password Field',      pattern: /(?:^|\s|[,{])(?:db_)?password\s*[=:"'`]+\s*[^\s"'`]{8,}/im },
  { name: 'Bearer Token',        pattern: /Authorization:\s*Bearer\s+[a-zA-Z0-9_\-\.]{20,}/i },
  { name: 'JWT Secret',          pattern: /jwt[_-]?secret\s*[=:"'`]+\s*\S{8,}/i },
]

// Always-sensitive paths (flagged even without a secret pattern match)
const ALWAYS_SENSITIVE = new Set([
  '/.env', '/.env.local', '/.env.production', '/.git/config',
  '/wp-config.php', '/.htpasswd', '/.npmrc', '/config/database.yml',
])

const STANDARD_CREDENTIAL_PATHS = [
  '/.env', '/.env.local', '/.env.production', '/.git/config',
  '/wp-config.php', '/config/database.yml', '/.htpasswd',
  '/phpinfo.php', '/config.json', '/.npmrc',
]

async function checkCredentials(baseUrl: string, extraPaths: string[]): Promise<CheckResult> {
  const origin = new URL(baseUrl).origin

  // Deduplicate standard + Claude-suggested paths (cap at 15 total)
  const allPaths = [...new Set([...STANDARD_CREDENTIAL_PATHS, ...extraPaths])].slice(0, 15)

  const results = await Promise.allSettled(
    allPaths.map(path =>
      withTimeout(
        fetch(`${origin}${path}`, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': UA } }),
        3_000, `credential ${path}`
      )
    )
  )

  const findings: Array<{ path: string; type: string; severity: string }> = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const path   = allPaths[i]
    if (result.status !== 'fulfilled') continue

    const resp = result.value
    if (resp.status !== 200) continue

    // Skip HTML — SPAs serve index.html for missing routes
    const ct = resp.headers.get('content-type') ?? ''
    if (ct.includes('text/html')) continue

    let text = ''
    try { text = (await resp.text()).slice(0, 2000) } catch { continue }

    let matched = false
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(text)) {
        findings.push({ path, type: name, severity: 'high' })
        matched = true
        break
      }
    }

    // Known-sensitive file accessible even without matching a specific pattern
    if (!matched && ALWAYS_SENSITIVE.has(path)) {
      findings.push({ path, type: 'Sensitive file accessible', severity: 'medium' })
    }
  }

  if (findings.length === 0) {
    return {
      status: 'passed',
      summary: `${allPaths.length} credential paths checked — no exposed files found`,
      probed_paths: allPaths,
    }
  }

  const hasHigh = findings.some(f => f.severity === 'high')
  return {
    status:   hasHigh ? 'failed' : 'warning',
    summary:  `${findings.length} exposed file${findings.length !== 1 ? 's' : ''} detected`,
    findings,
    probed_paths: allPaths,
  }
}

// ── Active Attack Battery ─────────────────────────────────────
// Runs a battery of read-only offensive probes against a single
// endpoint. All tests are non-destructive — no writes or mutations.
// Anomaly detection looks for response signatures that indicate
// the attack succeeded (error messages, leaked content, schema data).

interface AttackFinding { attack: string; detail: string; severity: string }

// JWT with alg:none — standard test for libraries that skip signature
// validation when the algorithm field claims "none".
const JWT_NONE = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0' +
                 '.eyJzdWIiOiIxIiwicm9sZSI6ImFkbWluIiwiaWF0IjowfQ.'

async function runAttackBattery(
  origin: string,
  target: ProbeTarget,
): Promise<AttackFinding[]> {
  const path = target.url.startsWith('/') ? target.url : `/${target.url}`

  type AttackSpec = {
    name:    string
    request: () => Promise<Response>
    // location: the raw Location header value (may be empty string if none)
    detect:  (status: number, body: string, location: string) => AttackFinding | null
  }

  const attacks: AttackSpec[] = [
    // ── SQL Injection ────────────────────────────────────────
    // Appends common SQLi payloads to query parameters.
    // Detects: error messages from MySQL, PostgreSQL, SQLite, MSSQL, Oracle.
    {
      name:    'SQL Injection',
      request: () => fetch(
        `${origin}${path}?id=1'--&q=%27+OR+%271%27%3D%271&search=1+UNION+SELECT+NULL--`,
        { method: 'GET', headers: { 'User-Agent': UA }, redirect: 'follow' }
      ),
      detect: (_status, body, _location) => {
        const SQL_ERR = /You have an error in your SQL syntax|ORA-\d{5}|PostgreSQL.*ERROR|SQLSTATE\[|pg_query\(\)|SQL syntax.*near|Unclosed quotation mark|Microsoft OLE DB Provider for SQL|SQLITE_ERROR|com\.mysql\.jdbc\.exceptions|ERROR 1064/i
        if (SQL_ERR.test(body)) {
          return { attack: 'SQL Injection', detail: 'SQL error message exposed — database injection likely exploitable', severity: 'high' }
        }
        return null
      },
    },

    // ── Path Traversal ───────────────────────────────────────
    // Appends directory traversal sequences to the URL path.
    // Detects: Unix /etc/passwd content in the response.
    {
      name:    'Path Traversal',
      request: () => fetch(
        `${origin}${path}/../../../../../etc/passwd`,
        { method: 'GET', headers: { 'User-Agent': UA }, redirect: 'follow' }
      ),
      detect: (_status, body, _location) => {
        if (/root:x:0:0|daemon:x:\d+|nobody:x:\d+|\/bin\/(?:bash|sh|nologin)/.test(body)) {
          return { attack: 'Path Traversal', detail: 'Directory traversal succeeded — /etc/passwd content exposed in response', severity: 'high' }
        }
        return null
      },
    },

    // ── Debug Parameter Injection ────────────────────────────
    // Appends common debug/verbose parameters.
    // Detects: stack traces, internal paths, environment variable leaks.
    {
      name:    'Debug Parameter Injection',
      request: () => fetch(
        `${origin}${path}?debug=true&verbose=1&trace=1&admin=true&_debug=1`,
        { method: 'GET', headers: { 'User-Agent': UA }, redirect: 'follow' }
      ),
      detect: (_status, body, _location) => {
        const TRACE = /at\s+\w[\w\$\.]+\s*\(.*:\d+\)|Traceback \(most recent call last\)|at com\.\w+\.\w+\(|Exception in thread main|System\.Exception:|stack trace:/i
        const ENV   = /(?:APP_KEY|DB_PASSWORD|SECRET_KEY|AWS_SECRET_ACCESS_KEY|DATABASE_URL)\s*[=:]\s*\S+/i
        if (TRACE.test(body)) return { attack: 'Debug Parameter Injection', detail: 'Stack trace exposed via debug parameters — disable debug mode in production', severity: 'medium' }
        if (ENV.test(body))   return { attack: 'Debug Parameter Injection', detail: 'Environment variables leaked via debug parameters', severity: 'high' }
        return null
      },
    },

    // ── SSRF (Cloud Metadata) ────────────────────────────────
    // Tests if URL-accepting parameters can be abused to fetch the
    // cloud provider's internal metadata endpoint (169.254.169.254).
    {
      name:    'SSRF (Cloud Metadata)',
      request: () => fetch(
        `${origin}${path}?url=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data%2F&proxy=http%3A%2F%2F169.254.169.254%2F&fetch=http%3A%2F%2F169.254.169.254%2F&redirect=http%3A%2F%2F169.254.169.254%2F`,
        { method: 'GET', headers: { 'User-Agent': UA }, redirect: 'follow' }
      ),
      detect: (_status, body, _location) => {
        const META = /ami-id|instance-type|local-ipv4|iam\/info|security-credentials|EC2 IMDS|placement\/region|public-hostname/i
        if (META.test(body)) {
          return { attack: 'SSRF (Cloud Metadata)', detail: 'Server-Side Request Forgery — cloud instance metadata retrieved via URL parameter', severity: 'high' }
        }
        return null
      },
    },

    // ── JWT None Algorithm ───────────────────────────────────
    // Sends a JWT with alg:none and role:admin.
    // A vulnerable library will accept it without validating the signature.
    {
      name:    'JWT None Algorithm',
      request: () => fetch(
        `${origin}${path}`,
        { method: 'GET', headers: { 'User-Agent': UA, 'Authorization': `Bearer ${JWT_NONE}` }, redirect: 'follow' }
      ),
      detect: (status, body, _location) => {
        // If endpoint returns 200 with data using an unsigned JWT → no signature validation
        const hasData = body.trim().length > 20
        if (status >= 200 && status < 300 && hasData) {
          // Only flag if the response looks like actual data (not just a health check)
          const looksLikeData = /"(?:id|user|email|name|role|token|data|result)"/.test(body)
          if (looksLikeData) {
            return { attack: 'JWT None Algorithm', detail: 'Endpoint accepted unsigned JWT — signature verification is not enforced', severity: 'high' }
          }
        }
        return null
      },
    },

    // ── Open Redirect / Parameter Injection ──────────────────
    // Tests whether common redirect parameters accept arbitrary URLs.
    // Checks the actual Location header to confirm the redirect goes to an
    // external domain — internal redirects (e.g. to /auth/login) are NOT flagged.
    {
      name:    'Open Redirect',
      request: () => fetch(
        `${origin}${path}?redirect=https%3A%2F%2Fevil.example.com&next=https%3A%2F%2Fevil.example.com&return_to=https%3A%2F%2Fevil.example.com`,
        { method: 'GET', headers: { 'User-Agent': UA }, redirect: 'manual' }
      ),
      detect: (status, _body, location) => {
        if (status >= 300 && status < 400) {
          // Only flag if the Location header points to a different origin.
          // Redirects to /auth/login, /login, or the same origin are expected behavior.
          const isAbsoluteExternal =
            (location.startsWith('http://') || location.startsWith('https://')) &&
            !location.startsWith(origin)
          if (isAbsoluteExternal) {
            return { attack: 'Open Redirect', detail: `Endpoint redirected to external origin (${new URL(location).origin}) via redirect parameter — validate and whitelist allowed destinations`, severity: 'high' }
          }
        }
        return null
      },
    },
  ]

  // GraphQL introspection — only relevant for graphql endpoints
  if (path.toLowerCase().includes('graphql') || path.toLowerCase().includes('query')) {
    attacks.push({
      name:    'GraphQL Introspection',
      request: () => fetch(
        `${origin}${path}`,
        {
          method:  'POST',
          headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
          body:    '{"query":"{__schema{queryType{name}types{name kind}}}"}',
          redirect: 'follow',
        }
      ),
      detect: (_status, body, _location) => {
        if (body.includes('"__schema"') || (body.includes('"queryType"') && body.includes('"types"'))) {
          return { attack: 'GraphQL Introspection', detail: 'GraphQL introspection is enabled — the full API schema is publicly discoverable', severity: 'medium' }
        }
        return null
      },
    })
  }

  // Run all attacks in parallel with per-request timeout
  // Extract Location header before reading body (response stream can only be read once)
  const results = await Promise.allSettled(
    attacks.map(a =>
      withTimeout(a.request(), 4_000, `${a.name} on ${path}`)
        .then(async resp => {
          const location = resp.headers.get('location') ?? ''
          let body = ''
          try { body = (await resp.text()).slice(0, 1000) } catch { /* timeout or read error */ }
          return { name: a.name, status: resp.status, body, location, detect: a.detect }
        })
    )
  )

  const findings: AttackFinding[] = []
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    const { name: _n, status, body, location, detect } = r.value
    const found = detect(status, body, location)
    if (found) findings.push(found)
  }

  return findings
}

// ── API Endpoint Probe ────────────────────────────────────────
// For each probe target from Claude's plan:
//   1. Baseline request — flag unauthenticated 200s with data
//   2. Full attack battery — SQLi, path traversal, SSRF, JWT none, etc.
// Both run in parallel across all targets. Total requests:
//   10 targets × (1 baseline + 6 attacks) = ~70 parallel requests

async function checkApiProbe(
  baseUrl: string,
  probeTargets: ProbeTarget[],
): Promise<CheckResult> {
  const origin  = new URL(baseUrl).origin
  const targets = probeTargets.slice(0, 10)

  if (targets.length === 0) {
    return { status: 'passed', summary: 'No API endpoints identified for probing', probed: [] }
  }

  // For each target: run baseline + attack battery, all in parallel across targets
  const allResults = await Promise.allSettled(
    targets.map(async target => {
      const path = target.url.startsWith('/') ? target.url : `/${target.url}`

      const [baselineResult, attackFindings] = await Promise.all([
        // Baseline: normal request
        withTimeout(
          fetch(`${origin}${path}`, {
            method:   target.method ?? 'GET',
            headers:  { 'User-Agent': UA },
            redirect: 'follow',
          }),
          5_000, `baseline ${path}`
        ).then(async resp => {
          const ct     = resp.headers.get('content-type') ?? ''
          const isJson = ct.includes('application/json')
          // HTML responses are almost always login-page redirects, not real data exposure
          const isHtml = ct.includes('text/html')
          let preview = ''
          try { preview = (await resp.text()).slice(0, 500) } catch { /* ok */ }
          return { status: resp.status, isJson, isHtml, hasData: preview.trim().length > 10 }
        }).catch(() => null),

        // Attack battery
        runAttackBattery(origin, target).catch(() => [] as AttackFinding[]),
      ])

      return { target, baseline: baselineResult, attacks: attackFindings }
    })
  )

  type Finding = {
    endpoint: string; method: string; status_code?: number
    attack: string; issue: string; severity: string; purpose: string
  }

  const findings: Finding[] = []

  for (const r of allResults) {
    if (r.status !== 'fulfilled') continue
    const { target, baseline, attacks } = r.value

    // Baseline: unauthenticated 200 with data.
    // Skip HTML responses — those are login-page redirects that the fetch followed,
    // not actual unauthenticated data exposure.
    if (baseline && baseline.status >= 200 && baseline.status < 300 && baseline.hasData && !baseline.isHtml) {
      findings.push({
        endpoint:    target.url,
        method:      target.method ?? 'GET',
        status_code: baseline.status,
        attack:      'Unauthenticated Access',
        issue: baseline.isJson
          ? 'Returns JSON data without authentication — verify this is intentional'
          : `Returned ${baseline.status} — confirm authorization is enforced`,
        severity: baseline.isJson ? 'high' : 'medium',
        purpose:  target.purpose,
      })
    }

    // Baseline: 5xx error
    if (baseline && baseline.status >= 500) {
      findings.push({
        endpoint:    target.url,
        method:      target.method ?? 'GET',
        status_code: baseline.status,
        attack:      'Server Error',
        issue:       'Server error on baseline request — possible misconfiguration',
        severity:    'medium',
        purpose:     target.purpose,
      })
    }

    // Attack battery findings
    for (const af of attacks) {
      findings.push({
        endpoint:  target.url,
        method:    target.method ?? 'GET',
        attack:    af.attack,
        issue:     af.detail,
        severity:  af.severity,
        purpose:   target.purpose,
      })
    }
  }

  const probed = targets.map(t => t.url)

  if (findings.length === 0) {
    return {
      status:  'passed',
      summary: `${targets.length} endpoint${targets.length !== 1 ? 's' : ''} probed with ${attacks_count()} attack vectors — no vulnerabilities detected`,
      probed,
    }
  }

  const hasHigh = findings.some(f => f.severity === 'high')
  const uniqueEndpoints = new Set(findings.map(f => f.endpoint)).size
  return {
    status:   hasHigh ? 'failed' : 'warning',
    summary:  `${findings.length} issue${findings.length !== 1 ? 's' : ''} found across ${uniqueEndpoints} endpoint${uniqueEndpoints !== 1 ? 's' : ''}`,
    findings,
    probed,
  }
}

// Returns the total number of distinct attack vectors run per endpoint
function attacks_count(): string {
  return '7' // Baseline + 6 active attacks (SQLi, path traversal, debug injection, SSRF, JWT none, open redirect)
}

// ── Source Code Secret Scanner ────────────────────────────────
// Fetches main page HTML, extracts + fetches same-origin JS bundles,
// and scans all content for 18 known secret patterns using regex.
// No AI involved — fully deterministic. Secret values are redacted
// to the first 6 chars before storage.

const SOURCE_SCAN_PATTERNS: Array<{
  name: string
  pattern: RegExp
  severity: 'high' | 'medium' | 'low'
}> = [
  { name: 'AWS Access Key',               severity: 'high',   pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub Token',                 severity: 'high',   pattern: /gh[pousr]_[A-Za-z0-9_]{36}/ },
  { name: 'Stripe Secret Key',            severity: 'high',   pattern: /sk_(test|live)_[a-zA-Z0-9]{24,}/ },
  { name: 'Private Key Header',           severity: 'high',   pattern: /-----BEGIN\s+(?:RSA |EC |OPENSSH )?PRIVATE KEY/ },
  { name: 'Database URL',                 severity: 'high',   pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@\s"']{3,}@/ },
  { name: 'API Key Assignment',           severity: 'medium', pattern: /api[_-]?key\s*[:=>"'`]+\s*[a-zA-Z0-9_\-]{16,}/i },
  { name: 'Secret Token Assignment',      severity: 'high',   pattern: /secret[_-]?(?:key|token)\s*[:=>"'`]+\s*[a-zA-Z0-9_\-]{16,}/i },
  { name: 'Password Assignment',          severity: 'high',   pattern: /(?:^|\s|[,{(])(?:db_)?password\s*[:=>"'`]+\s*[^\s"'`]{8,}/im },
  { name: 'Bearer Token',                 severity: 'medium', pattern: /Authorization:\s*Bearer\s+[a-zA-Z0-9_\-\.]{20,}/i },
  { name: 'JWT Secret',                   severity: 'high',   pattern: /jwt[_-]?secret\s*[:=>"'`]+\s*\S{8,}/i },
  { name: 'OpenAI API Key',               severity: 'high',   pattern: /sk-[a-zA-Z0-9]{48}/ },
  { name: 'Anthropic API Key',            severity: 'high',   pattern: /sk-ant-[a-zA-Z0-9_\-]{90,}/ },
  { name: 'Supabase JWT',                 severity: 'high',   pattern: /eyJ[a-zA-Z0-9_\-]{60,}\.[a-zA-Z0-9_\-]{60,}\.[a-zA-Z0-9_\-]{10,}/ },
  { name: 'Firebase API Key',             severity: 'high',   pattern: /AIza[0-9A-Za-z_\-]{35}/ },
  { name: 'Bundled Env Var with Secret',  severity: 'high',   pattern: /(?:NEXT_PUBLIC_|VITE_|REACT_APP_)\w+\s*[:=]+\s*["'`]?[a-zA-Z0-9_\-\.\/+]{16,}["'`]?/ },
  { name: 'Hardcoded Password in JS',     severity: 'high',   pattern: /\bpassword\s*[:=]+\s*["'`][^"'`\s]{8,}["'`]/i },
  { name: 'Slack Webhook URL',            severity: 'medium', pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[a-zA-Z0-9]+/ },
]

// Scans content line-by-line against SOURCE_SCAN_PATTERNS.
// Redacts secret values (keeps first 6 chars). One finding per line.
function scanContentForSecrets(
  content: string,
  sourceType: 'html' | 'inline_script' | 'js_bundle',
  source: string,
): SourceFinding[] {
  const findings: SourceFinding[] = []
  const lines = content.split('\n')

  for (const line of lines) {
    for (const { name, pattern, severity } of SOURCE_SCAN_PATTERNS) {
      // 'Password Assignment' is a broad pattern designed for config files / env files.
      // In minified JS bundles the pattern generates many false positives because
      // minified code has very long lines where 'password' can appear anywhere.
      // 'Hardcoded Password in JS' (stricter — requires quoted value) already covers
      // real secrets in JS, so skip 'Password Assignment' for js_bundle sources.
      if (sourceType === 'js_bundle' && name === 'Password Assignment') continue

      const m = pattern.exec(line)
      if (m) {
        const matched  = m[0]
        const redacted = matched.length > 6 ? matched.slice(0, 6) + '[REDACTED]' : matched
        const preview  = line.replace(matched, redacted).trim().slice(0, 80)
        findings.push({ source, source_type: sourceType, pattern: name, severity, preview })
        break // one finding per line
      }
    }
  }

  return findings
}

// Checks for email+password proximity: an email address within 200 chars
// of a password assignment is a hardcoded credential pair.
function checkEmailPasswordProximity(
  content: string,
  sourceType: 'html' | 'inline_script' | 'js_bundle',
  source: string,
): SourceFinding[] {
  const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
  const passRe  = /\bpassword\s*[:=>"'`]+\s*["'`][^"'`\s]{8,}["'`]/i
  const findings: SourceFinding[] = []

  let m: RegExpExecArray | null
  while ((m = emailRe.exec(content)) !== null) {
    const start  = Math.max(0, m.index - 100)
    const end    = Math.min(content.length, m.index + m[0].length + 100)
    const window = content.slice(start, end)
    if (passRe.test(window)) {
      findings.push({
        source,
        source_type: sourceType,
        pattern:     'Hardcoded Email + Password Combo',
        severity:    'high',
        preview:     `${m[0].slice(0, 6)}[REDACTED] (email+password pair detected)`,
      })
      break // one finding per content block
    }
  }

  return findings
}

// Uses Claude to analyze a login page's HTML for authentication weaknesses.
// Returns null on any error — the scan continues without login analysis.
async function loginClaudeCheck(loginUrl: string): Promise<LoginCheckResult | null> {
  try {
    const resp = await withTimeout(
      fetch(loginUrl, { redirect: 'follow', headers: { 'User-Agent': UA } }),
      5_000, 'login page fetch'
    )
    if (!resp.ok) return null
    const html = (await resp.text()).slice(0, 8_000)

    const prompt =
      `You are a security analyst reviewing a login page for authentication weaknesses.\n` +
      `Login page URL: ${loginUrl}\n\n` +
      `HTML (truncated to 8000 chars):\n${html}\n\n` +
      `Analyze for these specific issues:\n` +
      `1. Hardcoded credentials (username/password in HTML or JavaScript)\n` +
      `2. HTTP form actions (form submitting over HTTP instead of HTTPS)\n` +
      `3. Missing CSRF tokens (no hidden input with csrf/token/nonce in forms)\n` +
      `4. Exposed OAuth secrets (client_secret, app_secret in source)\n` +
      `5. Hardcoded test/demo accounts (test@example.com, admin/admin, etc.)\n` +
      `6. Client-side-only auth (auth logic that can be bypassed in browser)\n\n` +
      `Return ONLY valid JSON — no markdown:\n` +
      `{"findings":[{"issue":"<title>","severity":"high|medium|low","detail":"<specific finding>"}]}\n` +
      `If no issues found, return: {"findings":[]}`

    const content = await callClaude([{ role: 'user', content: prompt }], 600)

    try {
      const parsed = JSON.parse(content) as { findings?: Array<{ issue: string; severity: string; detail: string }> }
      if (!Array.isArray(parsed.findings)) return null
      return {
        login_url: loginUrl,
        findings: parsed.findings.slice(0, 10).map(f => ({
          issue:    String(f.issue),
          severity: (['high', 'medium', 'low'] as const).includes(f.severity as 'high' | 'medium' | 'low')
            ? f.severity as 'high' | 'medium' | 'low'
            : 'medium',
          detail: String(f.detail),
        })),
      }
    } catch { return null }
  } catch { return null }
}

// Main source scan function. Returns { result, loginPromise }.
// The loginPromise starts immediately when a login page is detected and runs
// in parallel with the rest of the scan pipeline — zero added latency.
async function checkSourceScan(baseUrl: string): Promise<{
  result: SourceScanResult
  loginPromise: Promise<LoginCheckResult | null>
}> {
  const ERROR_RESULT = (msg: string): { result: SourceScanResult; loginPromise: Promise<null> } => ({
    result: {
      status: 'error',
      summary: msg,
      pages_scanned: 0,
      js_files_scanned: 0,
      inline_scripts_count: 0,
      findings: [],
      login_check: null,
    },
    loginPromise: Promise.resolve(null),
  })

  const origin = new URL(baseUrl).origin

  // ── Fetch main page HTML ─────────────────────────────────
  let html = ''
  try {
    const resp = await withTimeout(
      fetch(baseUrl, { redirect: 'follow', headers: { 'User-Agent': UA } }),
      8_000, 'source scan HTML fetch'
    )
    const ct = resp.headers.get('content-type') ?? ''
    if (!resp.ok || (!ct.includes('text/html') && !ct.includes('application/xhtml'))) {
      return ERROR_RESULT('Failed to fetch main page HTML')
    }
    html = (await resp.text()).slice(0, 500_000)
  } catch (err) {
    return ERROR_RESULT(`HTML fetch failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── Extract <script src="..."> URLs (same-origin only, cap 10) ───
  const scriptSrcRe = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi
  const scriptUrls: string[] = []
  const seenUrls   = new Set<string>()
  let srMatch: RegExpExecArray | null
  while ((srMatch = scriptSrcRe.exec(html)) !== null && scriptUrls.length < 10) {
    try {
      const abs = new URL(srMatch[1], baseUrl).toString()
      if (new URL(abs).origin === origin && !seenUrls.has(abs)) {
        seenUrls.add(abs)
        scriptUrls.push(abs)
      }
    } catch { /* skip invalid URLs */ }
  }

  // ── Extract inline scripts (no src attr) ─────────────────
  const inlineRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi
  const inlineScripts: string[] = []
  let inMatch: RegExpExecArray | null
  while ((inMatch = inlineRe.exec(html)) !== null) {
    const text = inMatch[1].trim()
    if (text.length > 0) inlineScripts.push(text)
  }

  // ── Fetch JS bundles in parallel ─────────────────────────
  const jsResults = await Promise.allSettled(
    scriptUrls.map(url =>
      withTimeout(
        fetch(url, { headers: { 'User-Agent': UA } }),
        5_000, `JS fetch ${url}`
      ).then(async resp => {
        if (!resp.ok) return null
        const text = (await resp.text()).slice(0, 200_000)
        return { url, text }
      }).catch(() => null)
    )
  )

  // ── Scan all content ──────────────────────────────────────
  const allFindings: SourceFinding[] = []

  // HTML content
  allFindings.push(...scanContentForSecrets(html, 'html', 'html'))
  allFindings.push(...checkEmailPasswordProximity(html, 'html', 'html'))

  // Inline scripts
  inlineScripts.forEach((content, i) => {
    allFindings.push(...scanContentForSecrets(content, 'inline_script', `inline[${i}]`))
    allFindings.push(...checkEmailPasswordProximity(content, 'inline_script', `inline[${i}]`))
  })

  // JS bundles
  let jsFilesScanned = 0
  for (const r of jsResults) {
    if (r.status !== 'fulfilled' || !r.value) continue
    jsFilesScanned++
    const { url, text } = r.value
    allFindings.push(...scanContentForSecrets(text, 'js_bundle', url))
    allFindings.push(...checkEmailPasswordProximity(text, 'js_bundle', url))
  }

  // ── Detect login page ─────────────────────────────────────
  let loginUrl: string | null = null
  const loginHrefRe = /href=["']([^"']*(?:\/login|\/signin|\/sign-in|\/auth(?:\/login)?|\/account\/login)[^"']*)["']/gi
  let hrefMatch: RegExpExecArray | null
  if ((hrefMatch = loginHrefRe.exec(html)) !== null) {
    try { loginUrl = new URL(hrefMatch[1], baseUrl).toString() } catch { /* skip */ }
  }
  // Also treat the page itself as a login page if it has a password input
  if (!loginUrl && /<input[^>]+type=["']?password/i.test(html)) {
    loginUrl = baseUrl
  }

  // Fire login check as a floating Promise (no await — runs in parallel)
  const loginPromise: Promise<LoginCheckResult | null> = loginUrl
    ? loginClaudeCheck(loginUrl).catch(() => null)
    : Promise.resolve(null)

  // ── Deduplicate findings ──────────────────────────────────
  const unique = new Map<string, SourceFinding>()
  for (const f of allFindings) {
    const key = `${f.source}::${f.pattern}::${f.preview.slice(0, 20)}`
    if (!unique.has(key)) unique.set(key, f)
  }
  const findings = Array.from(unique.values())

  // ── Build result ──────────────────────────────────────────
  const status: CheckStatus =
    findings.some(f => f.severity === 'high')   ? 'failed'  :
    findings.some(f => f.severity === 'medium') ? 'warning' : 'passed'

  const summary = findings.length === 0
    ? `Scanned ${inlineScripts.length} inline script${inlineScripts.length !== 1 ? 's' : ''} and ${jsFilesScanned} JS file${jsFilesScanned !== 1 ? 's' : ''} — no secrets found`
    : `${findings.length} potential secret${findings.length !== 1 ? 's' : ''} found in source code`

  return {
    result: {
      status,
      summary,
      pages_scanned:        1,
      js_files_scanned:     jsFilesScanned,
      inline_scripts_count: inlineScripts.length,
      findings,
      login_check: null, // filled in after loginPromise settles
    },
    loginPromise,
  }
}

// ── Claude Call 2: Remediation report ─────────────────────────
async function claudeRemediation(
  siteUrl: string,
  ssl: CheckResult,
  headers: CheckResult,
  redirects: CheckResult,
  credentials: CheckResult,
  apiProbe: CheckResult,
  sourceScan: SourceScanResult,
): Promise<{ score: number; summary: string; remediation: unknown }> {
  const sourceFindings = sourceScan.findings ?? []
  const loginCheck = sourceScan.login_check

  const checksPayload = JSON.stringify({
    ssl: { status: ssl.status, summary: ssl.summary, issuer: ssl.issuer, days_remaining: ssl.days_remaining },
    headers: {
      status:  headers.status,
      summary: headers.summary,
      missing: (headers.findings as Array<{ header: string; severity: string }> | undefined) ?? [],
      present: (headers.present  as Array<{ header: string }> | undefined)?.map(p => p.header) ?? [],
    },
    redirects: { status: redirects.status, summary: redirects.summary, hops: Array.isArray(redirects.chain) ? (redirects.chain as unknown[]).length : 0 },
    credentials: { status: credentials.status, summary: credentials.summary, findings: credentials.findings ?? [] },
    api_probe: {
      status:   apiProbe.status,
      summary:  apiProbe.summary,
      findings: (apiProbe.findings as Array<{ endpoint: string; attack: string; severity: string; issue: string }> | undefined)
        ?.map(f => ({ endpoint: f.endpoint, attack: f.attack, severity: f.severity, issue: f.issue })) ?? [],
    },
    source_scan: {
      status:   sourceScan.status,
      summary:  sourceScan.summary,
      findings: sourceFindings.map(f => ({ pattern: f.pattern, severity: f.severity, source: f.source })),
      login_check: loginCheck ? {
        login_url: loginCheck.login_url,
        findings:  loginCheck.findings.map(f => ({ issue: f.issue, severity: f.severity })),
      } : null,
    },
  })

  const prompt =
    `You are a security analyst reviewing a web security scan for ${siteUrl}.\n\n` +
    `Scan results:\n${checksPayload}\n\n` +
    `Return ONLY valid JSON — no markdown, no fences:\n` +
    `{"score":<0-100>,"summary":"<2-3 sentence executive summary>","remediation":{"critical":[{"issue":"<title>","fix":"<1-3 sentence technical fix>"}],"high":[],"medium":[],"low":[]}}\n\n` +
    `Scoring (start 100, deduct):\n` +
    `SSL expired -40 | SSL expiring <14d -10\n` +
    `HSTS missing -15 | CSP missing -15 | X-Frame-Options missing -5 | X-Content-Type-Options missing -5 | Referrer-Policy missing -3 | Permissions-Policy missing -3\n` +
    `No HTTPS redirect -20 | Redirect chain >4 hops -5\n` +
    `Credential exposure high -25/file | medium -10/file\n` +
    `API: SQL injection or path traversal -30 | SSRF or JWT none-alg -25 | unauthenticated JSON -15 | open redirect or debug leak -10 | server error -5\n` +
    `Source code secrets: high severity finding -20 (max -40) | medium severity finding -10 (max -20)\n` +
    `Login page: hardcoded cred -25 | HTTP form action -15 | missing CSRF token -10\n` +
    `Minimum score 0. Only include non-empty severity buckets. Keep fixes technical and concise.`

  const parseReport = (raw: string) => {
    try {
      const r = JSON.parse(raw) as { score?: unknown; summary?: unknown; remediation?: unknown }
      return {
        score:       Math.max(0, Math.min(100, Math.round(Number(r.score)))),
        summary:     String(r.summary ?? ''),
        remediation: r.remediation ?? null,
      }
    } catch { return null }
  }

  const fallbackScore = (): { score: number; summary: string; remediation: unknown } => {
    const pts = (r: CheckResult) => ({ passed: 20, warning: 12, failed: 0, error: 5 }[r.status] ?? 5)
    const basePts = pts(ssl) + pts(headers) + pts(redirects) + pts(credentials) + pts(apiProbe)

    // Deduct for source scan findings
    const sourcePenalty = Math.min(40,
      sourceFindings.filter(f => f.severity === 'high').length   * 8 +
      sourceFindings.filter(f => f.severity === 'medium').length * 4
    )

    const score = Math.max(0, basePts - sourcePenalty)
    const problems = [ssl, headers, redirects, credentials, apiProbe]
      .filter(r => r.status !== 'passed')
      .map(r => r.summary)
    if (sourceFindings.length > 0) problems.push(sourceScan.summary)

    return {
      score,
      summary: problems.length === 0
        ? 'All security checks passed. The site appears well-configured.'
        : `Security issues detected: ${problems.join(' | ')}`,
      remediation: null,
    }
  }

  try {
    const content = await callClaude([{ role: 'user', content: prompt }], 1400)
    return parseReport(content) ?? fallbackScore()
  } catch {
    try {
      const retry = await callClaude([
        { role: 'user', content: prompt },
        { role: 'user', content: 'Return ONLY the raw JSON object. No markdown.' },
      ], 1400)
      return parseReport(retry) ?? fallbackScore()
    } catch { return fallbackScore() }
  }
}

// ── Main handler ─────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // ── Parse request ─────────────────────────────────────────
  let scanId: string
  try {
    const body = await req.json()
    scanId = body.scanId
    if (!scanId || typeof scanId !== 'string') throw new Error('missing scanId')
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // FK hint resolves circular FK between scans↔sites
  const { data: rawScan, error: fetchError } = await supabase
    .from('scans')
    .select('id, status, consent_given, sites!site_id(url)')
    .eq('id', scanId)
    .single()

  const scan = rawScan as { id: string; status: string; consent_given: boolean; sites: { url: string } | null } | null

  if (fetchError || !scan)         return new Response(JSON.stringify({ error: 'Scan not found' }),           { status: 404 })
  if (!scan.consent_given)         return new Response(JSON.stringify({ error: 'Consent not recorded' }),      { status: 400 })
  if (scan.status !== 'queued')    return new Response(JSON.stringify({ error: `Not queued: ${scan.status}` }), { status: 400 })
  if (!scan.sites?.url)            return new Response(JSON.stringify({ error: 'Site URL not found' }),         { status: 400 })

  const siteUrl  = scan.sites.url
  const hostname = new URL(siteUrl).hostname

  try {
    // ── Step 1: Mark running ──────────────────────────────────
    await supabase.from('scans').update({ status: 'running' }).eq('id', scanId)

    // ── Step 2: Claude Call 1 — Recon plan ───────────────────
    // Returns: tech stack observations, probe targets, extra credential paths
    const plan = await claudeRecon(siteUrl, hostname)
    await supabase.from('scans').update({ agent_plan: plan }).eq('id', scanId)

    // ── Step 3: All 6 checks in parallel ─────────────────────
    // Each check writes to DB immediately on completion (incremental UI).
    // Credential scan uses both standard + Claude-suggested paths.
    // API probe runs full attack battery (7 vectors) per endpoint.
    // Source scan fetches HTML + JS bundles + runs pattern matching;
    //   login Claude call fires as a floating Promise inside checkSourceScan.
    const [sslResult, headersResult, redirectsResult, credentialsResult, apiProbeResult, sourceScanReturn] =
      await Promise.all([
        checkSSL(hostname).then(async r => {
          await supabase.from('scans').update({ check_ssl: r }).eq('id', scanId)
          return r
        }),
        checkHeaders(siteUrl).then(async r => {
          await supabase.from('scans').update({ check_headers: r }).eq('id', scanId)
          return r
        }),
        checkRedirects(siteUrl).then(async r => {
          await supabase.from('scans').update({ check_redirects: r }).eq('id', scanId)
          return r
        }),
        checkCredentials(siteUrl, plan.extra_credential_paths).then(async r => {
          await supabase.from('scans').update({ check_credentials: r }).eq('id', scanId)
          return r
        }),
        checkApiProbe(siteUrl, plan.probe_targets).then(async r => {
          await supabase.from('scans').update({ check_api_probe: r }).eq('id', scanId)
          return r
        }),
        // checkSourceScan returns { result, loginPromise }.
        // We write the initial result (no login_check) to DB immediately.
        checkSourceScan(siteUrl).then(async ({ result, loginPromise }) => {
          await supabase.from('scans').update({ check_source_scan: result }).eq('id', scanId)
          return { result, loginPromise }
        }),
      ])

    // ── Step 3.5: Collect login analysis result ───────────────
    // The login Claude call has been running since inside checkSourceScan.
    // Race it against a 4s safety timeout — in practice it's already done.
    const loginCheck = await Promise.race([
      sourceScanReturn.loginPromise,
      new Promise<null>(resolve => setTimeout(() => resolve(null), 4_000)),
    ])

    // Merge login result into source scan and re-write to DB
    const sourceScanFinal: SourceScanResult = {
      ...sourceScanReturn.result,
      login_check: loginCheck,
      // Escalate status if login analysis found high-severity issues
      status: (loginCheck?.findings.some(f => f.severity === 'high') &&
               sourceScanReturn.result.status !== 'failed')
        ? 'warning'
        : sourceScanReturn.result.status,
    }
    await supabase.from('scans').update({ check_source_scan: sourceScanFinal }).eq('id', scanId)

    // ── Step 4: Claude Call 2 — Interpret + remediate ─────────
    const report = await claudeRemediation(
      siteUrl,
      sslResult, headersResult, redirectsResult, credentialsResult, apiProbeResult,
      sourceScanFinal,
    )

    // ── Step 5: Mark complete ─────────────────────────────────
    await supabase.from('scans').update({
      status:         'complete',
      overall_score:  report.score,
      report_summary: report.summary,
      remediation:    report.remediation,
      completed_at:   new Date().toISOString(),
    }).eq('id', scanId)

    return new Response(JSON.stringify({ ok: true, scanId }), { status: 200 })

  } catch (err) {
    console.error('[run-scan] pipeline error:', err)
    await supabase.from('scans').update({
      status:        'failed',
      error_message: 'Unexpected error: ' + String(err),
    }).eq('id', scanId).catch(() => { /* ignore secondary failure */ })
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
