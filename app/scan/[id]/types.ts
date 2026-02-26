export type CheckStatus = 'running' | 'passed' | 'warning' | 'failed' | 'error'

export type CheckResult = {
  status: CheckStatus
  /** One-line human-readable summary (optional — check-card falls back to defaults) */
  summary?: string
  /** Array of individual findings (optional) */
  findings?: unknown[]
  [key: string]: unknown
}

export type AgentPlan = {
  observations?: string[]
  probe_targets?: Array<{ url: string; method: string; purpose: string }>
  extra_credential_paths?: string[]
  [key: string]: unknown
}

export type RemediationItem = {
  issue: string
  fix: string
}

export type Remediation = {
  critical?: RemediationItem[]
  high?: RemediationItem[]
  medium?: RemediationItem[]
  low?: RemediationItem[]
}

export type ScanData = {
  id: string
  status: string
  created_at: string
  error_message: string | null
  overall_score: number | null
  report_summary: string | null
  agent_plan: AgentPlan | null
  remediation: Remediation | null
  check_ssl: CheckResult | null
  check_headers: CheckResult | null
  check_redirects: CheckResult | null
  check_credentials: CheckResult | null
  check_api_probe: CheckResult | null
}

export type SiteData = {
  url: string
  display_name: string | null
}
