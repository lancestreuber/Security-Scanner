import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import SignOutButton from './sign-out-button'
import ScanForm from './scan-form'
import ScanList from './scan-list'
import ScheduledSection from './scheduled-section'

const DEV = process.env.NODE_ENV === 'development'

// Supabase TS inference breaks on !hint FK joins — cast to a typed interface
type RawProfile = {
  display_name: string | null
  plan_id: string
  plans: { scans_per_day: number | null; can_schedule: boolean; display_name: string } | null
}

function PlanBadge({ planId }: { planId: string }) {
  const styles: Record<string, string> = {
    free: 'bg-gray-800 border-gray-700 text-gray-400',
    pro:  'bg-indigo-900/40 border-indigo-700/60 text-indigo-300',
    max:  'bg-purple-900/40 border-purple-700/60 text-purple-300',
  }
  const labels: Record<string, string> = { free: 'Free', pro: 'Pro', max: 'Max' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles[planId] ?? styles.free}`}>
      {labels[planId] ?? planId}
    </span>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Three parallel queries: rate limit count, scan list, and profile with plan
  // !site_id hint avoids PostgREST ambiguity from the circular FK (scans↔sites)
  // !plan_id hint required for the profiles→plans join
  const [
    { count: scansUsedToday },
    { data: scans, error: scansError },
    { data: profileRaw },
  ] = await Promise.all([
    supabase
      .from('scans')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', windowStart),
    supabase
      .from('scans')
      .select('id, status, created_at, sites!site_id(url, display_name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('profiles')
      .select('display_name, plan_id, plans!plan_id(scans_per_day, can_schedule, display_name)')
      .eq('id', user.id)
      .single(),
  ])

  if (DEV) console.log('[dashboard] scans query', { count: scans?.length ?? 0, scansError })

  const profile = profileRaw as RawProfile | null
  // null = unlimited (Max tier); fall back to Free (2) if profile lookup fails
  const dailyLimit: number | null = profile?.plans?.scans_per_day ?? 2
  const canSchedule = profile?.plans?.can_schedule ?? false

  // Normalize sites join result — PostgREST may return object or array
  const normalizedScans = (scans ?? []).map((s) => ({
    id: s.id as string,
    status: s.status as string,
    created_at: s.created_at as string,
    sites: Array.isArray(s.sites)
      ? (s.sites[0] as { url: string; display_name: string | null } | undefined) ?? null
      : (s.sites as { url: string; display_name: string | null } | null),
  }))

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <span className="font-semibold text-white">SiteScan</span>
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="text-gray-400 hover:text-white transition-colors"
              title="Settings"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Dashboard</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-gray-400 text-sm">
              Signed in as <span className="text-gray-200">{user.email}</span>
            </p>
            <PlanBadge planId={profile?.plan_id ?? 'free'} />
          </div>
        </div>

        <ScanForm scansUsedToday={scansUsedToday ?? 0} dailyLimit={dailyLimit} />

        <ScanList scans={normalizedScans} />

        {canSchedule && <ScheduledSection userId={user.id} />}
      </main>
    </div>
  )
}
