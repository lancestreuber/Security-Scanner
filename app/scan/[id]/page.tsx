import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ScanRealtime from './scan-realtime'
import type { ScanData, SiteData } from './types'

const DEV = process.env.NODE_ENV === 'development'

// Supabase TypeScript inference breaks on the !fk_hint syntax, returning
// GenericStringError. We define the expected shape explicitly and cast.
type RawScan = ScanData & {
  user_id: string
  sites:
    | { url: string; display_name: string | null }
    | Array<{ url: string; display_name: string | null }>
    | null
}

export default async function ScanPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Anon client — auth check only
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (DEV) console.log('[scan page] auth', { id, user: user?.id ?? null, authError })

  if (!user) redirect('/auth/login')

  // Service role + !site_id FK hint avoids PostgREST ambiguity caused by the
  // circular FK (scans.site_id->sites AND sites.last_scan_id->scans).
  // We cast the result because Supabase's TS inference doesn't understand !hint syntax.
  const serviceClient = await createClient(true)
  const { data: scan, error: scanError } = (await serviceClient
    .from('scans')
    .select(
      'id, status, created_at, user_id, error_message, overall_score, report_summary, ' +
        'agent_plan, remediation, check_ssl, check_headers, check_redirects, check_credentials, check_api_probe, check_source_scan, ' +
        'sites!site_id(url, display_name)'
    )
    .eq('id', id)
    .maybeSingle()) as { data: RawScan | null; error: unknown }

  if (DEV) console.log('[scan page] query', { id, userId: user.id, found: !!scan, scanError })

  // Redirect if scan not found or belongs to another user
  if (!scan || scan.user_id !== user.id) {
    if (DEV) console.log('[scan page] redirecting', { found: !!scan })
    redirect('/dashboard')
  }

  // Normalize the sites join (may be array or object depending on PostgREST resolution)
  const rawSite = Array.isArray(scan.sites) ? scan.sites[0] : scan.sites
  const site: SiteData | null = rawSite
    ? { url: rawSite.url, display_name: rawSite.display_name }
    : null

  // Strip server-only fields before passing to the client component
  const scanData: ScanData = {
    id: scan.id,
    status: scan.status,
    created_at: scan.created_at,
    error_message: scan.error_message,
    overall_score: scan.overall_score,
    report_summary: scan.report_summary,
    agent_plan: scan.agent_plan,
    remediation: scan.remediation,
    check_ssl: scan.check_ssl,
    check_headers: scan.check_headers,
    check_redirects: scan.check_redirects,
    check_credentials: scan.check_credentials,
    check_api_probe: scan.check_api_probe,
    check_source_scan: scan.check_source_scan,
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center">
          <Link
            href="/dashboard"
            className="font-semibold text-white hover:text-gray-300 transition-colors"
          >
            SiteScan
          </Link>
        </div>
      </header>

      {/* All interactive / Realtime-driven content lives in the client component */}
      <ScanRealtime initialScan={scanData} site={site} />
    </div>
  )
}
