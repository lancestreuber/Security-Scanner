import { createClient } from '@/lib/supabase/server'
import ScheduleForm from './schedule-form'

type ScheduledScan = {
  id: string
  site_id: string
  frequency: 'weekly' | 'monthly'
  next_run_at: string
  last_run_at: string | null
  sites: { url: string; display_name: string | null } | null
}

type Site = {
  id: string
  url: string
  display_name: string | null
}

function relativeDate(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  const days = Math.round(diff / (1000 * 60 * 60 * 24))
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days === 1) return 'in 1 day'
  return `in ${days} days`
}

export default async function ScheduledSection({ userId }: { userId: string }) {
  const supabase = await createClient()

  // Fetch schedules and the user's sites in parallel
  const [{ data: schedulesRaw }, { data: sitesRaw }] = await Promise.all([
    supabase
      .from('scheduled_scans')
      .select('id, site_id, frequency, next_run_at, last_run_at, sites!site_id(url, display_name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    supabase
      .from('sites')
      .select('id, url, display_name')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ])

  // Supabase TS infers sites join as array due to !hint — cast via unknown (same pattern as scan page)
  const schedules = (schedulesRaw ?? []) as unknown as ScheduledScan[]
  const sites = (sitesRaw ?? []) as unknown as Site[]

  // Sites that don't already have a schedule
  const scheduledSiteIds = new Set(schedules.map((s) => s.site_id))
  const availableSites = sites.filter((s) => !scheduledSiteIds.has(s.id))

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium text-white">Scheduled scans</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Automatically scan your sites on a recurring basis.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full border border-purple-700/60 bg-purple-900/40 px-2 py-0.5 text-xs font-medium text-purple-300">
          Max
        </span>
      </div>

      {schedules.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-gray-500">No scheduled scans yet.</p>
          <p className="text-xs text-gray-600 mt-1">Add one below to scan your sites automatically.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-800">
          {schedules.map((sched) => {
            const siteName = sched.sites?.display_name ?? sched.sites?.url ?? 'Unknown site'
            return (
              <div
                key={sched.id}
                className="flex items-center justify-between gap-4 px-6 py-4"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{siteName}</p>
                  {sched.sites?.display_name && (
                    <p className="text-xs text-gray-500 font-mono truncate mt-0.5">
                      {sched.sites.url}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="rounded-full border border-indigo-800/60 bg-indigo-950/40 px-2 py-0.5 text-xs font-medium text-indigo-400 capitalize">
                    {sched.frequency}
                  </span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    Next: {relativeDate(sched.next_run_at)}
                  </span>
                  <ScheduleForm scheduleId={sched.id} mode="delete" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {availableSites.length > 0 && (
        <div className="px-6 py-5 border-t border-gray-800">
          <p className="text-xs font-medium text-gray-400 mb-3">Add a schedule</p>
          <ScheduleForm mode="add" sites={availableSites} />
        </div>
      )}

      {availableSites.length === 0 && sites.length > 0 && (
        <div className="px-6 py-4 border-t border-gray-800">
          <p className="text-xs text-gray-600">All of your sites are already scheduled.</p>
        </div>
      )}

      {sites.length === 0 && (
        <div className="px-6 py-4 border-t border-gray-800">
          <p className="text-xs text-gray-600">Submit your first scan to add scheduling.</p>
        </div>
      )}
    </div>
  )
}
