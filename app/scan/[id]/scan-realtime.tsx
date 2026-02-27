'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import CheckCard from './check-card'
import type { ScanData, SiteData, Remediation, RemediationItem, SourceFinding, LoginFinding } from './types'

// ─── Check definitions ────────────────────────────────────────────────────────

const CHECKS: Array<{
  key: keyof Pick<
    ScanData,
    'check_ssl' | 'check_headers' | 'check_redirects' | 'check_credentials' | 'check_api_probe' | 'check_source_scan'
  >
  label: string
  description: string
}> = [
  {
    key: 'check_ssl',
    label: 'SSL Certificate',
    description: 'Validates certificate validity, expiry, and TLS configuration',
  },
  {
    key: 'check_headers',
    label: 'HTTP Security Headers',
    description: 'Checks for CSP, HSTS, X-Frame-Options, and other protective headers',
  },
  {
    key: 'check_redirects',
    label: 'Redirect Chain',
    description: 'Inspects redirect behavior and HTTP → HTTPS enforcement',
  },
  {
    key: 'check_credentials',
    label: 'Exposed Credentials',
    description: 'Scans public files for API keys, tokens, and secrets',
  },
  {
    key: 'check_api_probe',
    label: 'API Endpoint Exposure',
    description: 'Probes common API paths for unintended data disclosure',
  },
  {
    key: 'check_source_scan',
    label: 'Source Code Secrets',
    description: 'Scans HTML, inline scripts, and JS bundles for leaked API keys and credentials',
  },
]

const TERMINAL = new Set(['complete', 'failed'])

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: 'bg-gray-800 border-gray-600 text-gray-300',
    running: 'bg-indigo-900/50 border-indigo-700 text-indigo-300',
    complete: 'bg-green-900/50 border-green-700 text-green-300',
    failed: 'bg-red-900/50 border-red-700 text-red-300',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        map[status] ?? map.queued
      }`}
    >
      {status === 'running' && (
        <svg
          className="animate-spin h-3 w-3 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {status}
    </span>
  )
}

// ─── Remediation guide ────────────────────────────────────────────────────────

const REMEDIATION_BUCKETS: Array<{
  key: keyof Remediation
  label: string
  color: string
  border: string
  bg: string
}> = [
  { key: 'critical', label: 'Critical', color: 'text-red-400',    border: 'border-red-900/50',    bg: 'bg-red-950/20'    },
  { key: 'high',     label: 'High',     color: 'text-orange-400', border: 'border-orange-900/50', bg: 'bg-orange-950/20' },
  { key: 'medium',   label: 'Medium',   color: 'text-yellow-400', border: 'border-yellow-900/50', bg: 'bg-yellow-950/20' },
  { key: 'low',      label: 'Low',      color: 'text-blue-400',   border: 'border-blue-900/50',   bg: 'bg-blue-950/20'   },
]

function RemediationGuide({ remediation }: { remediation: Remediation }) {
  const populated = REMEDIATION_BUCKETS.filter(
    b => Array.isArray(remediation[b.key]) && (remediation[b.key] as RemediationItem[]).length > 0
  )
  if (populated.length === 0) return null

  return (
    <div className="mb-6 rounded-lg border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-sm font-semibold text-white mb-4">Remediation Guide</h2>
      <div className="space-y-5">
        {populated.map(({ key, label, color, border, bg }) => (
          <div key={key}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-semibold uppercase tracking-wider ${color}`}>
                {label}
              </span>
              <span className="text-xs text-gray-600">
                ({(remediation[key] as RemediationItem[]).length})
              </span>
            </div>
            <div className="space-y-2">
              {(remediation[key] as RemediationItem[]).map((item, i) => (
                <div key={i} className={`rounded-lg border ${border} ${bg} p-3`}>
                  <p className="text-xs font-medium text-gray-200 mb-1">{item.issue}</p>
                  <p className="text-xs text-gray-400 leading-relaxed">{item.fix}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Fix-with-Claude prompt ───────────────────────────────────────────────────

function buildFixPrompt(scan: ScanData, siteUrl: string | undefined): string {
  const lines: string[] = []
  const url = siteUrl ?? 'my web application'

  lines.push(`I need you to fix security vulnerabilities in my web application (${url}).`)
  lines.push(``)
  lines.push(`A security scanner found the following issues. Please provide exact code changes for each one, starting with Critical and working down to Low severity.`)

  // Tech stack context
  if (scan.agent_plan?.observations && scan.agent_plan.observations.length > 0) {
    lines.push(``)
    lines.push(`## Tech Stack Context`)
    for (const obs of scan.agent_plan.observations) {
      lines.push(`- ${obs}`)
    }
  }

  // Remediation items by severity
  const severities = ['critical', 'high', 'medium', 'low'] as const
  for (const sev of severities) {
    const items = scan.remediation?.[sev]
    if (items && items.length > 0) {
      lines.push(``)
      lines.push(`## ${sev.charAt(0).toUpperCase() + sev.slice(1)} Issues`)
      for (const item of items) {
        lines.push(``)
        lines.push(`### ${item.issue}`)
        lines.push(item.fix)
      }
    }
  }

  // Missing security headers
  const headerFindings = Array.isArray(scan.check_headers?.findings)
    ? (scan.check_headers!.findings as Array<Record<string, unknown>>).filter(
        f => typeof f.header === 'string'
      )
    : []
  if (headerFindings.length > 0) {
    lines.push(``)
    lines.push(`## Missing HTTP Security Headers`)
    lines.push(`Add these response headers in your web server config or application middleware:`)
    for (const f of headerFindings) {
      lines.push(`- ${f.header}${f.severity ? ` (${String(f.severity)} severity)` : ''}`)
    }
  }

  // Exposed credential files
  const credFindings = Array.isArray(scan.check_credentials?.findings)
    ? (scan.check_credentials!.findings as Array<Record<string, unknown>>).filter(
        f => typeof f.path === 'string'
      )
    : []
  if (credFindings.length > 0) {
    lines.push(``)
    lines.push(`## Exposed Sensitive Files`)
    lines.push(`The following paths are publicly accessible and must be blocked immediately:`)
    for (const f of credFindings) {
      lines.push(
        `- ${f.path}${f.type ? ` — ${String(f.type)}` : ''}${f.severity ? ` (${String(f.severity)})` : ''}`
      )
    }
    lines.push(`Block these paths in your web server config (nginx location block, Apache .htaccess, or hosting platform rules).`)
  }

  // API / endpoint vulnerabilities
  const apiFindings = Array.isArray(scan.check_api_probe?.findings)
    ? (scan.check_api_probe!.findings as Array<Record<string, unknown>>).filter(
        f => typeof f.endpoint === 'string'
      )
    : []
  if (apiFindings.length > 0) {
    lines.push(``)
    lines.push(`## API / Endpoint Vulnerabilities`)
    for (const f of apiFindings) {
      lines.push(``)
      lines.push(
        `**${String(f.method ?? 'GET')} ${f.endpoint}**${f.attack ? ` — Attack vector: ${String(f.attack)}` : ''}`
      )
      lines.push(`Issue: ${String(f.issue)}`)
      if (f.purpose) lines.push(`Context: ${String(f.purpose)}`)
    }
  }

  // Source code secrets
  const sourceFindings = Array.isArray(scan.check_source_scan?.findings)
    ? (scan.check_source_scan!.findings as SourceFinding[])
    : []
  if (sourceFindings.length > 0) {
    lines.push(``)
    lines.push(`## Leaked Secrets in Source Code`)
    lines.push(`The following secrets were found in your frontend HTML, inline scripts, or JavaScript bundles. Rotate all affected keys immediately, then remove them from source.`)
    for (const f of sourceFindings) {
      lines.push(`- **${f.pattern}** (${f.severity}) in \`${f.source}\`: ${f.preview}`)
    }
  }

  // Login page analysis
  const loginCheck = scan.check_source_scan?.login_check
  if (loginCheck && Array.isArray(loginCheck.findings) && loginCheck.findings.length > 0) {
    lines.push(``)
    lines.push(`## Login Page Security Issues`)
    lines.push(`Login page: ${loginCheck.login_url}`)
    for (const f of loginCheck.findings as LoginFinding[]) {
      lines.push(`- **${f.issue}** (${f.severity}): ${f.detail}`)
    }
  }

  // SSL issues (only if not passed)
  if (scan.check_ssl && scan.check_ssl.status !== 'passed') {
    const days = scan.check_ssl.days_remaining
    lines.push(``)
    lines.push(`## SSL Certificate`)
    if (typeof days === 'number') {
      lines.push(
        days < 0
          ? `SSL certificate expired ${Math.abs(days as number)} days ago. Renew it immediately.`
          : `SSL certificate expires in ${days} days. Renew before expiry.`
      )
    } else {
      lines.push(scan.check_ssl.summary ?? 'Fix SSL certificate issues.')
    }
  }

  lines.push(``)
  lines.push(`Please provide:`)
  lines.push(`1. Exact code or config changes for each fix`)
  lines.push(`2. The file path or config location for each change`)
  lines.push(`3. Any environment variables or secrets that need to be rotated`)
  lines.push(`4. How to verify each fix is working`)

  return lines.join('\n')
}

function FixPromptBox({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable — user can manually select the text
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-indigo-900/50 bg-indigo-950/10 p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Fix with Claude</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Copy this prompt into Claude to get exact code fixes for every issue found above.
          </p>
        </div>
        <button
          onClick={handleCopy}
          className="shrink-0 flex items-center gap-1.5 rounded-md border border-indigo-800/60 bg-indigo-900/30 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-900/60 transition-colors"
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy prompt
            </>
          )}
        </button>
      </div>
      <pre className="text-xs text-gray-400 font-mono leading-relaxed whitespace-pre-wrap max-h-52 overflow-y-auto rounded-lg bg-gray-950/60 border border-gray-800/60 p-4 select-all">
        {prompt}
      </pre>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScanRealtime({
  initialScan,
  site,
}: {
  initialScan: ScanData
  site: SiteData | null
}) {
  const [scan, setScan] = useState<ScanData>(initialScan)

  useEffect(() => {
    // Don't poll if the scan was already in a terminal state when the page loaded
    if (TERMINAL.has(initialScan.status)) return

    const supabase = createClient()
    let active = true

    const poll = async () => {
      if (!active) return
      const { data } = (await supabase
        .from('scans')
        .select(
          'status, error_message, overall_score, report_summary, agent_plan, remediation, ' +
          'check_ssl, check_headers, check_redirects, check_credentials, check_api_probe, check_source_scan'
        )
        .eq('id', initialScan.id)
        .single()) as { data: Partial<ScanData> | null; error: unknown }
      if (!active || !data) return
      setScan((prev) => ({ ...prev, ...data }))
      if (TERMINAL.has(data.status ?? '')) {
        active = false
      }
    }

    // Poll immediately on mount, then every 3 seconds
    poll()
    const intervalId = setInterval(poll, 3000)

    // Safety timeout: stop polling after 3 minutes regardless of scan status
    const timeoutId = setTimeout(() => { active = false }, 3 * 60 * 1000)

    return () => {
      active = false
      clearInterval(intervalId)
      clearTimeout(timeoutId)
    }
  // initialScan.id and initialScan.status are stable props — effect runs once on mount
  }, [initialScan.id, initialScan.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const isTerminal = TERMINAL.has(scan.status)
  const checksHaveStarted = CHECKS.some(({ key }) => scan[key] !== null)

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12">

      {/* Back link */}
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          ← Back to dashboard
        </Link>
      </div>

      {/* Scan header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-white truncate">
            {site?.display_name ?? site?.url ?? 'Security Scan'}
          </h1>
          <p className="text-sm text-gray-500 font-mono mt-0.5 truncate">{site?.url}</p>
          <p className="text-xs text-gray-600 mt-1">
            Started {new Date(scan.created_at).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={scan.status} />
      </div>

      {/* Agent recon plan — shown once the first Claude call populates it */}
      {scan.agent_plan && (
        <div className="mb-6 rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
            Recon plan
          </h2>

          {Array.isArray(scan.agent_plan.observations) &&
            scan.agent_plan.observations.length > 0 && (
              <ul className="space-y-1.5 mb-4">
                {(scan.agent_plan.observations as string[]).map((obs, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-400">
                    <span className="text-gray-600 shrink-0 mt-0.5">—</span>
                    <span>{obs}</span>
                  </li>
                ))}
              </ul>
            )}

          {Array.isArray(scan.agent_plan.probe_targets) &&
            scan.agent_plan.probe_targets.length > 0 && (
              <p className="text-xs text-gray-600">
                {scan.agent_plan.probe_targets.length} endpoint
                {scan.agent_plan.probe_targets.length !== 1 ? 's' : ''} queued for probing
              </p>
            )}
        </div>
      )}

      {/* Check cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {CHECKS.map(({ key, label, description }) => (
          <CheckCard
            key={key}
            label={label}
            description={description}
            result={scan[key]}
            scanStatus={scan.status}
          />
        ))}
      </div>

      {/* Placeholder shown while waiting for checks to start */}
      {!isTerminal && !checksHaveStarted && (
        <div className="rounded-lg border border-dashed border-gray-700 px-6 py-8 text-center">
          <p className="text-sm text-gray-500">
            {scan.status === 'queued'
              ? 'Scan is queued — waiting for the security agent to start.'
              : 'Running recon and security checks… results will appear above as each check completes.'}
          </p>
        </div>
      )}

      {/* Overall security score — shown when scan completes */}
      {isTerminal && scan.overall_score !== null && (
        <div className="mb-6 rounded-lg border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Overall security score</h2>
              <p className="text-xs text-gray-500 mt-0.5">Based on all checks performed</p>
            </div>
            <div className="text-right">
              <span
                className={`text-3xl font-bold tabular-nums ${
                  scan.overall_score >= 80
                    ? 'text-green-400'
                    : scan.overall_score >= 50
                    ? 'text-yellow-400'
                    : 'text-red-400'
                }`}
              >
                {scan.overall_score}
              </span>
              <span className="text-sm text-gray-500">/100</span>
            </div>
          </div>
        </div>
      )}

      {/* Report summary — shown when scan completes */}
      {isTerminal && scan.report_summary && (
        <div className="mb-6 rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Summary</h2>
          <p className="text-sm text-gray-400 leading-relaxed">{scan.report_summary}</p>
        </div>
      )}

      {/* Fix-with-Claude prompt — shown when scan completes and there are actionable findings */}
      {isTerminal && scan.report_summary && (
        <FixPromptBox prompt={buildFixPrompt(scan, site?.url)} />
      )}

      {/* Remediation guide — shown when scan completes and Claude generated one */}
      {isTerminal && scan.remediation && (
        <RemediationGuide remediation={scan.remediation} />
      )}

      {/* Error message — shown when scan fails */}
      {scan.status === 'failed' && scan.error_message && (
        <div className="rounded-lg border border-red-800/60 bg-red-950/20 p-5">
          <h2 className="text-sm font-semibold text-red-300 mb-1">Scan failed</h2>
          <p className="text-sm text-red-400/80">{scan.error_message}</p>
        </div>
      )}

    </main>
  )
}
