'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Plan = {
  id: string
  display_name: string
  description: string | null
  scans_per_day: number | null
  can_schedule: boolean
  features: string[]
}

export default function PlanSwitcher({
  currentPlanId,
  plans,
}: {
  currentPlanId: string
  plans: Plan[]
}) {
  const router = useRouter()
  const [switching, setSwitching] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSwitch(planId: string) {
    if (planId === currentPlanId) return
    setSwitching(planId)
    setError(null)

    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: planId }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Failed to switch plan.')
      setSwitching(null)
      return
    }

    // Refresh page data — brief delay lets the server see the updated row
    setTimeout(() => {
      router.refresh()
      setSwitching(null)
    }, 400)
  }

  function limitText(plan: Plan): string {
    if (plan.scans_per_day === null) return 'Unlimited scans per day'
    return `${plan.scans_per_day} scan${plan.scans_per_day !== 1 ? 's' : ''} per day`
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
      <h2 className="text-base font-medium text-white mb-1.5">Plan</h2>
      <p className="text-sm text-gray-500 mb-5">Choose the plan that fits your needs.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId
          const isSwitching = switching === plan.id

          return (
            <div
              key={plan.id}
              className={[
                'relative flex flex-col rounded-lg border p-5 transition-all',
                isCurrent
                  ? 'border-indigo-600 bg-indigo-950/20 ring-1 ring-indigo-600/50'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600',
              ].join(' ')}
            >
              {/* Plan header */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-semibold text-white">{plan.display_name}</h3>
                  {plan.id === 'max' && (
                    <span className="rounded-full border border-purple-700/60 bg-purple-900/40 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">
                      Best
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">{plan.description}</p>
              </div>

              {/* Scan limit */}
              <p className="text-sm font-medium text-white mb-4">{limitText(plan)}</p>

              {/* Features list */}
              <ul className="space-y-1.5 mb-6 flex-1">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                    <svg
                      className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              {/* Action button */}
              {isCurrent ? (
                <button
                  disabled
                  className="w-full rounded-md border border-gray-700 px-4 py-2 text-sm font-medium text-gray-500 cursor-default"
                >
                  Current plan
                </button>
              ) : (
                <button
                  onClick={() => handleSwitch(plan.id)}
                  disabled={switching !== null}
                  className="w-full rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors"
                >
                  {isSwitching ? 'Switching…' : `Switch to ${plan.display_name}`}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-400">{error}</p>
      )}

      <p className="mt-4 text-xs text-gray-600">
        Plans are free to change during this preview period.
      </p>
    </div>
  )
}
