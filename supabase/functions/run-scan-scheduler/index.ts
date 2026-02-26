// run-scan-scheduler — Cron Edge Function
// Fires any due scheduled scans (next_run_at <= now) for Max-tier users.
// Deploy: npx supabase functions deploy run-scan-scheduler --project-ref <ref> --no-verify-jwt
// Schedule: Dashboard → Edge Functions → run-scan-scheduler → Schedule → "0 * * * *" (hourly)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

type RawSchedule = {
  id: string
  user_id: string
  site_id: string
  frequency: 'weekly' | 'monthly'
  sites: { url: string; display_name: string | null } | null
  profiles: { plan_id: string } | null
}

Deno.serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // Fetch all schedules due now, joined with site URL and user plan
  // !site_id hint avoids PostgREST ambiguity (sites has multiple FKs)
  // !user_id hint for profiles join
  const { data: dueRaw, error: fetchError } = await supabase
    .from('scheduled_scans')
    .select(
      'id, user_id, site_id, frequency, ' +
      'sites!site_id(url, display_name), ' +
      'profiles!user_id(plan_id)'
    )
    .lte('next_run_at', new Date().toISOString())

  if (fetchError) {
    console.error('[scheduler] fetch error:', fetchError.message)
    return new Response(
      JSON.stringify({ error: fetchError.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const schedules = (dueRaw ?? []) as RawSchedule[]

  // Only fire scans for users who are still on the Max plan
  // This prevents scans from triggering if a user has downgraded without deleting schedules
  const eligible = schedules.filter(
    (s) => (s.profiles as { plan_id: string } | null)?.plan_id === 'max'
  )

  let triggered = 0
  const errors: string[] = []

  for (const schedule of eligible) {
    if (!schedule.sites?.url) continue

    try {
      // Create the scan row (consent is implicit — granted when schedule was created)
      const { data: scan, error: scanError } = await supabase
        .from('scans')
        .insert({
          site_id: schedule.site_id,
          user_id: schedule.user_id,
          status: 'queued',
          consent_given: true,
          consent_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (scanError || !scan) {
        errors.push(`schedule ${schedule.id}: scan insert failed — ${scanError?.message}`)
        continue
      }

      // Update site.last_scan_id (best-effort)
      await supabase
        .from('sites')
        .update({ last_scan_id: scan.id })
        .eq('id', schedule.site_id)

      // Advance next_run_at based on frequency
      const next = new Date()
      if (schedule.frequency === 'weekly') {
        next.setDate(next.getDate() + 7)
      } else {
        next.setDate(next.getDate() + 30)
      }

      await supabase
        .from('scheduled_scans')
        .update({
          last_run_at: new Date().toISOString(),
          next_run_at: next.toISOString(),
        })
        .eq('id', schedule.id)

      // Invoke the scan runner — fire and forget
      supabase.functions
        .invoke('run-scan', { body: { scanId: scan.id } })
        .catch((err: unknown) =>
          console.error('[scheduler] run-scan invoke error:', err)
        )

      triggered++
      console.log(`[scheduler] triggered scan ${scan.id} for schedule ${schedule.id} (${schedule.frequency})`)
    } catch (err) {
      errors.push(`schedule ${schedule.id}: unexpected error — ${String(err)}`)
      console.error('[scheduler] error processing schedule:', schedule.id, err)
    }
  }

  const result = {
    ok: true,
    due: schedules.length,
    eligible: eligible.length,
    triggered,
    errors: errors.length > 0 ? errors : undefined,
  }

  console.log('[scheduler] complete:', result)

  return new Response(
    JSON.stringify(result),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
