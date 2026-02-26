'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Site = {
  id: string
  url: string
  display_name: string | null
}

type Props =
  | { mode: 'add'; sites: Site[]; scheduleId?: never }
  | { mode: 'delete'; scheduleId: string; sites?: never }

export default function ScheduleForm({ mode, sites, scheduleId }: Props) {
  const router = useRouter()
  const [siteId, setSiteId] = useState(sites?.[0]?.id ?? '')
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('weekly')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Delete mode ──────────────────────────────────────────
  if (mode === 'delete') {
    async function handleDelete() {
      setLoading(true)
      try {
        const res = await fetch('/api/scheduled-scans', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: scheduleId }),
        })
        if (!res.ok) {
          const data = await res.json()
          console.error('[schedule-form] delete error:', data.error)
        }
        router.refresh()
      } catch {
        console.error('[schedule-form] delete network error')
      } finally {
        setLoading(false)
      }
    }

    return (
      <button
        onClick={handleDelete}
        disabled={loading}
        className="rounded-md border border-gray-700 px-2.5 py-1 text-xs text-gray-400 hover:text-red-400 hover:border-red-800/60 transition-colors disabled:opacity-50"
      >
        {loading ? '…' : 'Remove'}
      </button>
    )
  }

  // ── Add mode ─────────────────────────────────────────────
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!siteId) return
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/scheduled-scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: siteId, frequency }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to create schedule.')
        setLoading(false)
        return
      }
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleAdd} className="space-y-3">
      <div className="flex flex-wrap gap-3 items-end">
        {/* Site selector */}
        <div className="flex-1 min-w-40">
          <label className="block text-xs text-gray-500 mb-1">Site</label>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {(sites ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name ?? s.url}
              </option>
            ))}
          </select>
        </div>

        {/* Frequency */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Frequency</label>
          <div className="flex rounded-md border border-gray-700 overflow-hidden">
            {(['weekly', 'monthly'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFrequency(f)}
                className={[
                  'px-3 py-2 text-sm capitalize transition-colors',
                  frequency === f
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white',
                ].join(' ')}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !siteId}
          className="rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors whitespace-nowrap"
        >
          {loading ? 'Scheduling…' : 'Schedule'}
        </button>
      </div>

      <p className="text-xs text-gray-600">
        By scheduling, you confirm that you own these sites and consent to automated scans.
      </p>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  )
}
