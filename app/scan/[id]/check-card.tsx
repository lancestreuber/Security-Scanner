'use client'

import { useState, useEffect } from 'react'
import type { CheckResult } from './types'

type Props = {
  label: string
  description: string
  result: CheckResult | null
  scanStatus: string
}

// Visual config keyed by CheckStatus
const STATUS_STYLES = {
  running: {
    border: 'border-l-indigo-500',
    badge: 'bg-indigo-900/40 border-indigo-700/60 text-indigo-300',
    label: 'Running',
    spinner: true,
  },
  passed: {
    border: 'border-l-green-500',
    badge: 'bg-green-900/40 border-green-700/60 text-green-300',
    label: 'Passed',
    spinner: false,
  },
  warning: {
    border: 'border-l-yellow-500',
    badge: 'bg-yellow-900/40 border-yellow-700/60 text-yellow-300',
    label: 'Warning',
    spinner: false,
  },
  failed: {
    border: 'border-l-red-500',
    badge: 'bg-red-900/40 border-red-700/60 text-red-300',
    label: 'Failed',
    spinner: false,
  },
  error: {
    border: 'border-l-orange-500',
    badge: 'bg-orange-900/40 border-orange-700/60 text-orange-300',
    label: 'Error',
    spinner: false,
  },
} as const

function getDefaultSummary(result: CheckResult): string {
  if (result.summary) return result.summary as string
  const count = Array.isArray(result.findings) ? result.findings.length : 0
  switch (result.status) {
    case 'passed':
      return 'No issues found'
    case 'warning':
      return count > 0
        ? `${count} item${count !== 1 ? 's' : ''} to review`
        : 'Minor issues detected'
    case 'failed':
      return count > 0
        ? `${count} critical issue${count !== 1 ? 's' : ''} found`
        : 'Critical issues detected'
    case 'error':
      return (result.error as string) ?? 'Check encountered an error'
    default:
      return 'Processing…'
  }
}

// ── Modal sub-components ─────────────────────────────────────

function SeverityPill({ severity }: { severity: string }) {
  const cls =
    severity === 'high'
      ? 'bg-red-950/60 border-red-800/60 text-red-400'
      : severity === 'medium'
      ? 'bg-yellow-950/60 border-yellow-800/60 text-yellow-400'
      : 'bg-gray-800 border-gray-700 text-gray-400'
  return (
    <span className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}>
      {severity}
    </span>
  )
}

function HttpStatusBadge({ code }: { code: number }) {
  const cls =
    code >= 200 && code < 300 ? 'text-green-400'
    : code >= 300 && code < 400 ? 'text-blue-400'
    : code >= 400 ? 'text-red-400'
    : 'text-gray-400'
  const labels: Record<number, string> = {
    200: 'OK', 201: 'Created', 204: 'No Content',
    301: 'Moved Permanently', 302: 'Found',
    307: 'Temporary Redirect', 308: 'Permanent Redirect',
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
    404: 'Not Found', 405: 'Method Not Allowed', 429: 'Too Many Requests',
    500: 'Internal Server Error', 503: 'Service Unavailable',
  }
  return (
    <span className={`font-mono text-xs font-semibold ${cls}`}>
      {code}
      {labels[code] && <span className="text-gray-500 font-normal ml-1">{labels[code]}</span>}
    </span>
  )
}

// ── Detail body — renders check-specific technical info ───────

function DetailContent({ result }: { result: CheckResult }) {
  const findings = Array.isArray(result.findings)
    ? (result.findings as Array<Record<string, unknown>>)
    : []
  const present = Array.isArray(result.present)
    ? (result.present as Array<{ header: string; value: string }>)
    : []
  const chain = Array.isArray(result.chain)
    ? (result.chain as Array<{ url: string; status: number }>)
    : []

  // ── SSL certificate details ──────────────────────────────
  if (typeof result.days_remaining === 'number' || typeof result.issuer === 'string') {
    const days = result.days_remaining as number | undefined
    return (
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
          Certificate Details
        </p>
        <table className="w-full text-xs">
          <tbody className="divide-y divide-gray-800">
            {Boolean(result.issuer) && (
              <tr>
                <td className="py-2 pr-4 text-gray-500 w-32 shrink-0">Issuer</td>
                <td className="py-2 text-gray-200">{String(result.issuer)}</td>
              </tr>
            )}
            {days !== undefined && (
              <tr>
                <td className="py-2 pr-4 text-gray-500">Days remaining</td>
                <td className={`py-2 font-medium ${
                  days < 0 ? 'text-red-400' : days < 14 ? 'text-yellow-400' : 'text-green-400'
                }`}>
                  {days < 0 ? `Expired ${Math.abs(days)} days ago` : `${days} days`}
                </td>
              </tr>
            )}
            {Boolean(result.valid_to) && (
              <tr>
                <td className="py-2 pr-4 text-gray-500">Expires</td>
                <td className="py-2 text-gray-200 font-mono">{String(result.valid_to)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )
  }

  // ── HTTP security headers details ────────────────────────
  const headerFindings = findings.filter(f => typeof f.header === 'string' && typeof f.severity === 'string') as Array<{
    header: string; status: string; severity: string
  }>
  if (headerFindings.length > 0 || present.length > 0) {
    return (
      <div className="space-y-5">
        {headerFindings.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Missing headers
            </p>
            <div className="space-y-0">
              {headerFindings.map((f) => (
                <div
                  key={f.header}
                  className="flex items-center justify-between gap-3 py-2 border-b border-gray-800/50 last:border-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-red-500 shrink-0 text-sm">✗</span>
                    <span className="text-xs text-gray-200 font-mono truncate">{f.header}</span>
                  </div>
                  <SeverityPill severity={f.severity} />
                </div>
              ))}
            </div>
          </div>
        )}
        {present.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Present headers
            </p>
            <div className="space-y-0">
              {present.map((p) => (
                <div key={p.header} className="py-2 border-b border-gray-800/50 last:border-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-green-500 shrink-0 text-sm">✓</span>
                    <span className="text-xs text-gray-200 font-mono">{p.header}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 font-mono pl-5 truncate" title={p.value}>
                    {p.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Redirect chain details ───────────────────────────────
  if (chain.length > 0) {
    return (
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Redirect chain
        </p>
        <div>
          {chain.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              {/* Step indicator + connector */}
              <div className="flex flex-col items-center shrink-0 pt-0.5">
                <div className="w-5 h-5 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
                  <span className="text-[10px] text-gray-400 font-medium">{i + 1}</span>
                </div>
                {i < chain.length - 1 && (
                  <div className="w-px flex-1 min-h-[16px] bg-gray-700 mt-1 mb-1" />
                )}
              </div>
              {/* URL + status */}
              <div className="pb-3 min-w-0 flex-1">
                <p className="text-xs font-mono text-gray-300 break-all leading-snug">{step.url}</p>
                <p className="mt-0.5">
                  <HttpStatusBadge code={step.status} />
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Credential file scan details ────────────────────────
  const credFindings = findings.filter(
    f => typeof f.path === 'string' && typeof f.type === 'string'
  ) as Array<{ path: string; type: string; severity: string }>
  const probedPaths = Array.isArray(result.probed_paths)
    ? (result.probed_paths as string[])
    : []
  if (credFindings.length > 0 || probedPaths.length > 0) {
    return (
      <div className="space-y-5">
        {credFindings.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Exposed files
            </p>
            <div className="space-y-2">
              {credFindings.map((f, i) => (
                <div key={i} className="rounded-lg border border-red-900/40 bg-red-950/20 p-3 space-y-1.5">
                  <p className="text-xs font-mono text-red-300">{f.path}</p>
                  <div className="flex items-center gap-2">
                    <SeverityPill severity={f.severity} />
                    <span className="text-xs text-gray-400">{f.type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {probedPaths.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Paths checked
            </p>
            <div className="space-y-0">
              {probedPaths.map((p, i) => {
                const exposed = credFindings.some(f => f.path === p)
                return (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-800/40 last:border-0">
                    <span className={`text-sm shrink-0 ${exposed ? 'text-red-500' : 'text-green-500'}`}>
                      {exposed ? '✗' : '✓'}
                    </span>
                    <span className="text-xs font-mono text-gray-400">{p}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── API probe findings ───────────────────────────────────
  const apiFindings = findings.filter(f => typeof f.endpoint === 'string') as Array<{
    endpoint: string; method: string; status_code?: number; attack?: string; issue: string; severity: string; purpose: string
  }>
  const probedEndpoints = Array.isArray(result.probed)
    ? (result.probed as string[])
    : []
  if (apiFindings.length > 0 || probedEndpoints.length > 0) {
    return (
      <div className="space-y-5">
        {apiFindings.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Findings
            </p>
            <div className="space-y-3">
              {apiFindings.map((f, i) => (
                <div key={i} className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono font-medium text-gray-400 bg-gray-800 rounded px-1.5 py-0.5">
                      {f.method}
                    </span>
                    <span className="text-xs font-mono text-gray-200">{f.endpoint}</span>
                    {Boolean(f.status_code) && <HttpStatusBadge code={f.status_code!} />}
                    {Boolean(f.attack) && (
                      <span className="inline-block rounded border border-indigo-900/50 bg-indigo-950/40 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400">
                        {f.attack}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 leading-snug">{f.issue}</p>
                  {Boolean(f.severity) && <SeverityPill severity={String(f.severity)} />}
                </div>
              ))}
            </div>
          </div>
        )}
        {probedEndpoints.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Endpoints probed
            </p>
            <div className="space-y-0">
              {probedEndpoints.map((ep, i) => {
                const flagged = apiFindings.some(f => f.endpoint === ep)
                return (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-800/40 last:border-0">
                    <span className={`text-sm shrink-0 ${flagged ? 'text-red-500' : 'text-green-500'}`}>
                      {flagged ? '✗' : '✓'}
                    </span>
                    <span className="text-xs font-mono text-gray-400">{ep}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Fallback: no structured detail data ──────────────────
  return null
}

// ── Check detail modal ────────────────────────────────────────

function CheckModal({
  label,
  description,
  result,
  onClose,
}: {
  label: string
  description: string
  result: CheckResult
  onClose: () => void
}) {
  const cfg = STATUS_STYLES[result.status] ?? STATUS_STYLES.error

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, []) // stable: modal mounts once, unmounts on close

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl bg-gray-950 border border-gray-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-5 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.badge}`}>
                {cfg.label}
              </span>
            </div>
            <h2 className="text-sm font-semibold text-white">{label}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 mt-0.5 text-gray-500 hover:text-white transition-colors rounded p-1 hover:bg-gray-800"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-5">
          {/* Summary */}
          <p className="text-sm text-gray-300 leading-relaxed">{result.summary}</p>

          {/* Structured detail */}
          <DetailContent result={result} />
        </div>
      </div>
    </div>
  )
}

// ── CheckCard (exported) ──────────────────────────────────────

export default function CheckCard({ label, description, result, scanStatus }: Props) {
  const [isOpen, setIsOpen] = useState(false)

  const isPending  = result === null
  const isRunning  = result?.status === 'running'
  const isClickable = !isPending && !isRunning
  const cfg = isPending ? null : (STATUS_STYLES[result.status] ?? STATUS_STYLES.error)

  return (
    <>
      <div
        role={isClickable ? 'button' : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onClick={isClickable ? () => setIsOpen(true) : undefined}
        onKeyDown={isClickable ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') setIsOpen(true)
        } : undefined}
        className={[
          'rounded-lg bg-gray-900 border border-gray-800 border-l-4 p-4',
          isPending ? 'border-l-gray-700' : (cfg?.border ?? 'border-l-gray-700'),
          isClickable
            ? 'cursor-pointer hover:bg-gray-800/60 transition-colors group'
            : '',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-white leading-tight">{label}</p>
              {isClickable && (
                <svg
                  className="w-3 h-3 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">{description}</p>
          </div>

          {isPending ? (
            <span className="shrink-0 inline-flex items-center rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-500 whitespace-nowrap">
              {scanStatus === 'queued' ? 'Queued' : 'Pending'}
            </span>
          ) : (
            <span
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cfg?.badge}`}
            >
              {cfg?.spinner && (
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
              {cfg?.label}
            </span>
          )}
        </div>

        {!isPending && (
          <p className="mt-3 text-xs text-gray-400 leading-relaxed">
            {getDefaultSummary(result)}
          </p>
        )}
      </div>

      {isOpen && result && (
        <CheckModal
          label={label}
          description={description}
          result={result}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
