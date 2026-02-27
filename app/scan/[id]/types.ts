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

export type SourceFinding = {
  source: string        // JS file URL, 'html', or 'inline[N]'
  source_type: 'html' | 'inline_script' | 'js_bundle'
  pattern: string       // e.g. "OpenAI API Key"
  severity: 'high' | 'medium' | 'low'
  preview: string       // 80-char line excerpt, secret redacted after 6 chars
}

export type LoginFinding = {
  issue: string
  severity: 'high' | 'medium' | 'low'
  detail: string
}

export type LoginCheckResult = {
  login_url: string
  findings: LoginFinding[]
}

export type SourceScanResult = CheckResult & {
  pages_scanned: number
  js_files_scanned: number
  inline_scripts_count: number
  findings: SourceFinding[]
  login_check: LoginCheckResult | null
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
  check_source_scan: SourceScanResult | null
}

export type SiteData = {
  url: string
  display_name: string | null
}
