import Link from 'next/link'

type Scan = {
  id: string
  status: string
  created_at: string
  sites: { url: string; display_name: string | null } | null
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued:   'bg-gray-800 border-gray-600 text-gray-400',
    running:  'bg-indigo-900/50 border-indigo-700 text-indigo-300',
    complete: 'bg-green-900/50 border-green-700 text-green-300',
    failed:   'bg-red-900/50 border-red-700 text-red-300',
  }
  const cls = styles[status] ?? styles.queued
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function ScanList({ scans }: { scans: Scan[] }) {
  if (scans.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 px-6 py-8 text-center text-gray-500 text-sm">
        No scans yet. Submit a URL above to get started.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-medium text-gray-300">Recent scans</h2>
      </div>
      <ul className="divide-y divide-gray-800">
        {scans.map((scan) => {
          const site = scan.sites
          return (
            <li key={scan.id}>
              <Link
                href={`/scan/${scan.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-800/50 transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate group-hover:text-indigo-300 transition-colors">
                    {site?.display_name ?? site?.url ?? 'Unknown site'}
                  </p>
                  <p className="text-xs text-gray-500 font-mono truncate mt-0.5">
                    {site?.url}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={scan.status} />
                  <span className="text-xs text-gray-600 w-16 text-right">
                    {timeAgo(scan.created_at)}
                  </span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
