import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import SignOutButton from '@/app/dashboard/sign-out-button'
import SettingsForm from './settings-form'
import PlanSwitcher from './plan-switcher'

// Supabase TS inference breaks on !hint FK joins — cast explicitly
type RawProfile = {
  display_name: string | null
  plan_id: string
  plans: {
    scans_per_day: number | null
    can_schedule: boolean
    display_name: string
  } | null
}

type Plan = {
  id: string
  display_name: string
  description: string | null
  scans_per_day: number | null
  can_schedule: boolean
  features: string[]
}

export default async function SettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  // Parallel fetch: profile with plan join + all available plans
  const [{ data: profileRaw }, { data: plansRaw }] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, plan_id, plans!plan_id(scans_per_day, can_schedule, display_name)')
      .eq('id', user.id)
      .single(),
    supabase
      .from('plans')
      .select('id, display_name, description, scans_per_day, can_schedule, features')
      .order('sort_order', { ascending: true }),
  ])

  const profile = profileRaw as RawProfile | null

  // Normalize features from JSONB (could be string[] or already parsed)
  const plans: Plan[] = (plansRaw ?? []).map((p) => ({
    id: p.id as string,
    display_name: p.display_name as string,
    description: p.description as string | null,
    scans_per_day: p.scans_per_day as number | null,
    can_schedule: p.can_schedule as boolean,
    features: Array.isArray(p.features) ? (p.features as string[]) : [],
  }))

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="font-semibold text-white hover:text-gray-300 transition-colors"
          >
            SiteScan
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-indigo-400">Settings</span>
            <span className="text-gray-700">·</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Settings</h1>
          <p className="text-sm text-gray-400">
            Manage your profile and subscription plan.
          </p>
        </div>

        <SettingsForm
          displayName={profile?.display_name ?? ''}
          email={user.email ?? ''}
        />

        <PlanSwitcher
          currentPlanId={profile?.plan_id ?? 'free'}
          plans={plans}
        />
      </main>
    </div>
  )
}
